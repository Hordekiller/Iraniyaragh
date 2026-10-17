import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { classifyResult, main, runAudit } from "./audit-prod.mjs";

const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
const report = (changes = {}) => JSON.stringify({ metadata: { vulnerabilities: { ...counts, ...changes } } });

test("only a valid completed audit can report clean", () => {
  assert.equal(classifyResult(report(), "", 0).kind, "clean");
  assert.equal(classifyResult(report({ low: 2 }), "", 0).kind, "clean");
});

for (const output of ["", "not JSON", "{}", "null", "[]", '{"error":{"code":"REGISTRY_ERROR"}}', '{"metadata":{"vulnerabilities":{"high":0}}}']) {
  test(`invalid/incomplete audit cannot pass: ${output || "empty"}`, () => {
    assert.equal(classifyResult(output, "", 0).kind, "operational-error");
  });
}

for (const count of [-1, 0.5, "0", null, Number.MAX_SAFE_INTEGER + 1]) {
  test(`invalid vulnerability count cannot pass: ${String(count)}`, () => {
    assert.equal(classifyResult(report({ high: count }), "", 0).kind, "operational-error");
  });
}

test("moderate and higher findings fail even if the process incorrectly exits zero", () => {
  for (const level of ["moderate", "high", "critical"]) {
    for (const exitCode of [0, 1]) {
      assert.equal(classifyResult(report({ [level]: 1 }), "", exitCode).kind, "vulnerabilities");
    }
  }
});

test("failed/interrupted processes cannot pass even with clean JSON", () => {
  for (const exitCode of [1, 2, null]) assert.equal(classifyResult(report(), "", exitCode).kind, "operational-error");
  const errorReport = JSON.stringify({ metadata: { vulnerabilities: counts }, error: { code: "REGISTRY_ERROR" } });
  assert.equal(classifyResult(errorReport, "", 0).kind, "operational-error");
});

test("untrusted registry output never appears in diagnostics", () => {
  const canary = "TEST_ONLY_PRIVATE_CANARY";
  for (const [stdout, stderr, exitCode] of [[canary, canary, 1], [JSON.stringify({ error: { summary: canary } }), "", 1], [report(), canary, 0]]) {
    assert.equal(JSON.stringify(classifyResult(stdout, stderr, exitCode)).includes(canary), false);
  }
});

test("workflow propagates the audit result instead of converting uncertainty to success", () => {
  const workflow = readFileSync(new URL("../workflows/production-audit.yml", import.meta.url), "utf8");
  assert.match(workflow, /run: node \.github\/scripts\/audit-prod\.mjs/u);
  assert.doesNotMatch(workflow, /continue-on-error|exit 0|set \+e/u);
});

const output = (stdout, exitCode = 0) => ({ stdout, stderr: "", exitCode });

async function attemptSequence(sequence) {
  const messages = [];
  const waits = [];
  let attempts = 0;
  const logger = Object.fromEntries(["log", "warn", "error"].map((level) => [level, (message) => messages.push(message)]));
  const code = await main({
    audit: async () => {
      const next = sequence[attempts++];
      assert.ok(next, "unexpected audit retry");
      if (next instanceof Error) throw next;
      return next;
    },
    wait: async (ms) => { waits.push(ms); },
    logger,
  });
  return { code, attempts, waits, messages };
}

test("known vulnerabilities block immediately without retry", async () => {
  const result = await attemptSequence([output(report({ high: 2 }), 1)]);
  assert.equal(result.code, 1);
  assert.equal(result.attempts, 1);
  assert.deepEqual(result.waits, []);
  assert.ok(result.messages.some((message) => message.includes("high: 2")));
});

test("an operational failure can recover only through a subsequent valid audit", async () => {
  const result = await attemptSequence([output("", 1), output(report())]);
  assert.equal(result.code, 0);
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.waits, [15000]);
});

test("three failures remain unknown and block, without leaking process errors", async () => {
  const canary = "TEST_ONLY_PROCESS_ERROR_CANARY";
  const result = await attemptSequence([new Error(canary), output(canary, 1), output(JSON.stringify({ error: { summary: canary } }), 1)]);
  assert.equal(result.code, 2);
  assert.equal(result.attempts, 3);
  assert.deepEqual(result.waits, [15000, 15000]);
  assert.equal(result.messages.join("\n").includes(canary), false);
  assert.equal(result.messages.some((message) => message.includes("no vulnerabilities")), false);
});

function fakeProcessRun(drive) {
  let timerCallback;
  let cancelled = 0;
  const signals = [];
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = (signal) => { signals.push(signal); return true; };
  const result = runAudit({
    spawnProcess: (command, args, options) => {
      assert.equal(command, "pnpm");
      assert.deepEqual(args, ["audit", "--prod", "--audit-level=moderate", "--json"]);
      assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe"]);
      queueMicrotask(() => drive(child, () => timerCallback()));
      return child;
    },
    schedule: (callback, ms) => {
      assert.equal(ms, 60000);
      timerCallback = callback;
      return "test-timer";
    },
    cancel: (timer) => { assert.equal(timer, "test-timer"); cancelled++; },
  });
  return result.then((value) => {
    assert.equal(cancelled, 1);
    return { value, signals };
  });
}

test("runner accepts a completed JSON report without retaining stderr", async () => {
  const { value, signals } = await fakeProcessRun((child) => {
    child.stderr.write("TEST_ONLY_STDERR_CANARY");
    child.stdout.write(report());
    child.emit("close", 0);
  });
  assert.deepEqual(signals, []);
  assert.equal(value.stderr, "");
  assert.equal(classifyResult(value.stdout, value.stderr, value.exitCode).kind, "clean");
});

test("timeout cannot pass even if clean JSON arrived before the process stalled", async () => {
  const { value, signals } = await fakeProcessRun((child, timeout) => {
    child.stdout.write(report());
    timeout();
    child.emit("close", 0);
  });
  assert.deepEqual(signals, ["SIGKILL"]);
  assert.deepEqual(value, { stdout: "", stderr: "", exitCode: null });
});

test("oversized stdout or stderr stops the process and cannot pass", async () => {
  for (const stream of ["stdout", "stderr"]) {
    const { value, signals } = await fakeProcessRun((child) => {
      child.stdout.write(report());
      child[stream].write(Buffer.alloc(8 * 1024 * 1024, 120));
      child[stream].write("discard remaining output");
      child.emit("close", 0);
    });
    assert.deepEqual(signals, ["SIGKILL"]);
    assert.deepEqual(value, { stdout: "", stderr: "", exitCode: null });
  }
});

test("spawn error remains unavailable and cannot disclose the exception", async () => {
  const { value } = await fakeProcessRun((child) => {
    child.emit("error", new Error("TEST_ONLY_SPAWN_ERROR_CANARY"));
    child.emit("close", 0);
  });
  assert.deepEqual(value, { stdout: "", stderr: "", exitCode: null });
});
