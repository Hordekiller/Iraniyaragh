#!/usr/bin/env node
/*
 * Production dependency audit with surgical retry.
 *
 * Real vulnerabilities (moderate+) fail immediately and loudly. Only
 * transient network/registry failures are retried (up to MAX_ATTEMPTS).
 * After retries are exhausted the job fails with an explicit
 * "manual review needed" message -- it never silently passes.
 *
 * Separating classifyResult() from the process runner keeps the decision
 * logic pure and unit-testable against fixture JSON.
 */

import { spawn } from "node:child_process";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 15000;

export function classifyResult(stdout, stderr, exitCode) {
  const raw = stdout.trim();

  if (exitCode === 0) {
    return { kind: "clean", detail: raw };
  }

  const parsed = tryParseAuditJson(raw);

  if (!parsed) {
    return {
      kind: "operational-error",
      detail: summarize(stderr, raw),
    };
  }

  const moderatePlus =
    (parsed.metadata?.vulnerabilities?.moderate ?? 0) +
    (parsed.metadata?.vulnerabilities?.high ?? 0) +
    (parsed.metadata?.vulnerabilities?.critical ?? 0);

  if (moderatePlus > 0) {
    return {
      kind: "vulnerabilities",
      detail: summarizeVulnerabilities(parsed),
    };
  }

  if (parsed.error?.code || parsed.error?.summary) {
    return {
      kind: "operational-error",
      detail: summarize(stderr, JSON.stringify(parsed.error)),
    };
  }

  return {
    kind: "operational-error",
    detail: summarize(stderr, raw),
  };
}

function tryParseAuditJson(output) {
  if (!output) return null;
  try {
    const start = output.indexOf("{");
    if (start === -1) return null;
    return JSON.parse(output.slice(start));
  } catch {
    return null;
  }
}

function summarizeVulnerabilities(parsed) {
  const v = parsed.metadata?.vulnerabilities ?? {};
  const parts = [];
  for (const level of ["critical", "high", "moderate", "low", "info"]) {
    if (v[level]) parts.push(`${level}: ${v[level]}`);
  }
  return `Vulnerabilities found => ${parts.join(", ") || "unknown"}`;
}

function summarize(stderr, stdout) {
  const err = stderr.trim();
  if (err) return err.split("\n").slice(0, 8).join("\n");
  return stdout.split("\n").slice(0, 8).join("\n");
}

function runAudit() {
  return new Promise((resolve) => {
    const child = spawn(
      "pnpm",
      ["audit", "--prod", "--audit-level=moderate", "--json"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ stdout, stderr, exitCode: code }));
    child.on("error", (err) =>
      resolve({
        stdout,
        stderr: stderr + "\n" + err.message,
        exitCode: 1,
      }),
    );
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function main() {
  let last;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { stdout, stderr, exitCode } = await runAudit();
    const result = classifyResult(stdout, stderr, exitCode);
    last = result;

    if (result.kind === "clean") {
      console.log("pnpm audit: no vulnerabilities at or above moderate level.");
      return 0;
    }

    if (result.kind === "vulnerabilities") {
      console.error(`::error::${result.detail}`);
      console.error("::error::Audit failed due to known production vulnerabilities; fix them before merging.");
      return 1;
    }

    console.log(result.detail);
    console.warn(
      `::warning::pnpm audit attempt ${attempt}/${MAX_ATTEMPTS} hit a transient/registry error; retrying...`,
    );

    if (attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  console.error(`::error::${last?.detail ?? "unknown error"}`);
  console.error(
    "::warning::Registry remained unreachable after " +
      `${MAX_ATTEMPTS} attempts. Network-only failure — no vulnerability data available. ` +
      "Manual review of production dependencies is required before merge.",
  );
  return 2;
}

if (process.argv[1]?.endsWith("audit-prod.mjs")) {
  process.exit(await main());
}
