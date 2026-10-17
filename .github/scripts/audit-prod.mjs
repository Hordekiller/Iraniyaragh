#!/usr/bin/env node
/*
 * A valid production audit is required to pass. Moderate+ findings fail
 * immediately; incomplete/failed audits get bounded retries and then block CI.
 * Registry/process output is untrusted and is never copied into diagnostics.
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 15000;
const AUDIT_TIMEOUT_MS = 60000;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const LEVELS = ["critical", "high", "moderate", "low", "info"];
const incomplete = () => ({
  kind: "operational-error",
  detail: "Production dependency audit did not produce a valid completed report.",
});

export function classifyResult(stdout, _stderr, exitCode) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return incomplete();
  }
  const counts = parsed?.metadata?.vulnerabilities;
  if (!counts || !LEVELS.every((level) => Number.isSafeInteger(counts[level]) && counts[level] >= 0)) {
    return incomplete();
  }
  if (counts.moderate > 0 || counts.high > 0 || counts.critical > 0) {
    return {
      kind: "vulnerabilities",
      detail: `Vulnerabilities found => ${LEVELS.filter((level) => counts[level] > 0).map((level) => `${level}: ${counts[level]}`).join(", ")}`,
    };
  }
  if (exitCode !== 0 || parsed.error != null) return incomplete();
  return { kind: "clean", detail: "No vulnerabilities at or above moderate level." };
}

export function runAudit({ spawnProcess = spawn, schedule = setTimeout, cancel = clearTimeout } = {}) {
  return new Promise((done) => {
    const child = spawnProcess(
      "pnpm",
      ["audit", "--prod", "--audit-level=moderate", "--json"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let outputBytes = 0;
    let interrupted = false;
    let settled = false;
    const timer = schedule(() => {
      interrupted = true;
      child.kill("SIGKILL");
    }, AUDIT_TIMEOUT_MS);
    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      cancel(timer);
      done({ stdout: interrupted ? "" : stdout, stderr: "", exitCode: interrupted ? null : exitCode });
    };
    child.stdout.setEncoding("utf8");
    const consume = (data, retain) => {
      outputBytes += Buffer.byteLength(data);
      if (outputBytes > MAX_OUTPUT_BYTES) {
        if (!interrupted) {
          interrupted = true;
          stdout = "";
          child.kill("SIGKILL");
        }
        return;
      }
      if (retain && !interrupted) stdout += data;
    };
    child.stdout.on("data", (data) => consume(data, true));
    child.stderr.on("data", (data) => consume(data, false));
    child.on("close", finish);
    child.on("error", () => finish(null));
  });
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export async function main({ audit = runAudit, wait = sleep, logger = console } = {}) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let result;
    try {
      const { stdout, stderr, exitCode } = await audit();
      result = classifyResult(stdout, stderr, exitCode);
    } catch {
      result = incomplete();
    }
    if (result.kind === "clean") {
      logger.log("pnpm audit: no vulnerabilities at or above moderate level.");
      return 0;
    }
    if (result.kind === "vulnerabilities") {
      logger.error(`::error::${result.detail}`);
      logger.error("::error::Fix known production vulnerabilities before merging.");
      return 1;
    }
    logger.warn(`::warning::Production audit attempt ${attempt}/${MAX_ATTEMPTS} was unavailable or incomplete.`);
    if (attempt < MAX_ATTEMPTS) await wait(RETRY_DELAY_MS);
  }
  logger.error("::error::Production audit unavailable after bounded retries. Security status is unknown; merge remains blocked. Rerun after resolving the audit failure.");
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
