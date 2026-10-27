import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const rollback = fileURLToPath(new URL("./rollback.sh", import.meta.url));

// Run the real rollback shell script in an isolated Git repository. Docker is a
// non-mutating command recorder so no images, live host or database are touched.
for (const renderer of [false, true]) {
  test(`rollback restores the target ${renderer ? "Next renderer" : "legacy static"} topology`, () => {
    const directory = mkdtempSync(join(tmpdir(), "iranyaragh-rollback-"));
    try {
      const infrastructure = join(directory, "infrastructure/docker");
      const scripts = join(directory, "scripts/deploy");
      const bin = join(directory, "bin");
      mkdirSync(infrastructure, { recursive: true });
      mkdirSync(scripts, { recursive: true });
      mkdirSync(bin);
      copyFileSync(rollback, join(scripts, "rollback.sh"));
      const git = (args) =>
        execFileSync("git", args, {
          cwd: directory,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }).trim();
      git(["init", "--quiet"]);
      git(["config", "user.name", "Isolated Runtime Test"]);
      git(["config", "user.email", "runtime-test@example.invalid"]);
      const composeFile = join(infrastructure, "compose.staging.yml");
      const topology = (includeRenderer) =>
        `services:\n${["api", "media-worker", "pdf-render-worker", "admin", ...(includeRenderer ? ["storefront"] : []), "web"].map((name) => `  ${name}:\n    image: synthetic/${name}:test\n`).join("")}`;
      writeFileSync(composeFile, topology(renderer));
      git(["add", "."]);
      git(["commit", "--quiet", "-m", "Synthetic target release"]);
      const target = git(["rev-parse", "HEAD"]);
      // The current topology deliberately differs. It must never select images
      // that did not exist at the target commit or omit the target renderer.
      writeFileSync(composeFile, topology(!renderer));
      const environmentFile = join(infrastructure, ".env.staging");
      writeFileSync(
        environmentFile,
        `COMPOSE_PROJECT_NAME=isolated\nIMAGE_TAG=${"f".repeat(40)}\n`,
      );
      const recorder = join(directory, "commands.jsonl");
      writeFileSync(
        join(bin, "docker"),
        `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const file = args[args.indexOf('-f') + 1];
const services = [...fs.readFileSync(file, 'utf8').matchAll(/^  ([a-z-]+):$/gm)].map(match => match[1]);
fs.appendFileSync(process.env.RUNTIME_RECORDER, JSON.stringify({args, services, tag: process.env.IMAGE_TAG}) + '\\n');
if(args.includes('config')) process.stdout.write(services.join('\\n')+'\\n');
if(args.includes('ps')) process.stdout.write('{"Health":"healthy","State":"running"}\\n');
`,
      );
      chmodSync(join(bin, "docker"), 0o755);
      execFileSync("bash", [join(scripts, "rollback.sh"), target], {
        cwd: directory,
        timeout: 10000,
        encoding: "utf8",
        env: {
          ...process.env,
          ENV_FILE: environmentFile,
          PATH: `${bin}:${process.env.PATH}`,
          RUNTIME_RECORDER: recorder,
        },
      });
      const calls = readFileSync(recorder, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      assert.ok(calls.length > 3);
      for (const call of calls) {
        assert.equal(call.tag, target);
        assert.equal(
          call.services.includes("storefront"),
          renderer,
          "every command uses target topology",
        );
        assert.ok(
          !call.args.includes("migrate"),
          "rollback must never run a schema migration",
        );
      }
      const up = calls.find((call) => call.args.includes("up"));
      assert.ok(up.args.includes("--no-deps"));
      assert.ok(up.args.includes("--remove-orphans"));
      assert.equal(up.args.includes("storefront"), renderer);
      assert.ok(up.args.includes("pdf-render-worker"));
      const probes = calls
        .filter((call) => call.args.includes("ps"))
        .map((call) => call.args.at(-1));
      for (const service of [
        "api",
        "admin",
        "web",
        "media-worker",
        "pdf-render-worker",
        ...(renderer ? ["storefront"] : []),
      ])
        assert.ok(probes.includes(service));
      assert.match(
        readFileSync(environmentFile, "utf8"),
        new RegExp(`IMAGE_TAG=${target}`),
      );
      assert.ok(
        !readdirSync(infrastructure).some((name) =>
          name.startsWith(".compose.rollback."),
        ),
        "temporary topology removed",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
