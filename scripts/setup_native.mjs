#!/usr/bin/env node
/**
 * Native setup helper.
 *
 * Why this exists:
 * - The repo ships with `.npmrc` setting `ignore-scripts=true` to reduce OOM kills
 *   during `npm install`.
 * - That means Electron's postinstall (binary download) won't run automatically.
 * - We then need to (1) fetch Electron and (2) rebuild native modules (better-sqlite3)
 *   against the Electron ABI.
 *
 * This wrapper adds:
 * - Clear progress output (so "Killed: 9" is attributable to a step)
 * - Basic prerequisite check on macOS (Xcode CLT path)
 * - Conservative parallelism defaults to reduce peak memory usage
 */

import { spawnSync } from "node:child_process";
import os from "node:os";
import process from "node:process";

function run(cmd, args, opts = {}) {
  const pretty = [cmd, ...(args || [])].join(" ");
  console.log(`\n[cowork] $ ${pretty}`);
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    env: opts.env || process.env,
    cwd: opts.cwd || process.cwd(),
  });
  if (res.status !== 0) {
    // If the process was killed, status can be null. Use signal if present.
    const sig = res.signal ? ` (signal ${res.signal})` : "";
    console.error(`\n[cowork] Command failed${sig}.`);
    process.exit(res.status ?? 1);
  }
}

function computeJobs() {
  // Prefer explicit overrides. Default to 2 to reduce peak memory.
  const raw =
    process.env.COWORK_SETUP_JOBS ||
    process.env.npm_config_jobs ||
    process.env.JOBS ||
    "2";
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return 2;
  return Math.min(n, Math.max(1, os.cpus()?.length || 2));
}

function baseEnvWithJobs(jobs) {
  // These influence node-gyp/make parallelism on macOS/Linux.
  // If the user already set them, keep their values.
  const env = { ...process.env };
  if (!env.npm_config_jobs) env.npm_config_jobs = String(jobs);
  if (!env.MAKEFLAGS) env.MAKEFLAGS = `-j${jobs}`;
  return env;
}

function checkPrereqs() {
  if (process.platform === "darwin") {
    const res = spawnSync("xcode-select", ["-p"], { encoding: "utf8" });
    if (res.status !== 0) {
      console.error(
        "\n[cowork] Xcode Command Line Tools not found.\n" +
          "Install them with:\n" +
          "  xcode-select --install\n"
      );
      process.exit(1);
    }
  }
}

function main() {
  console.log(
    `[cowork] Native setup (${process.platform}/${process.arch}) using Node ${process.version}`
  );

  checkPrereqs();

  const jobs = computeJobs();
  const env = baseEnvWithJobs(jobs);
  console.log(`[cowork] Using jobs=${jobs} (override via COWORK_SETUP_JOBS=1)`);

  // 1) Download/unpack Electron binary (postinstall is skipped due to ignore-scripts=true).
  run(process.execPath, ["node_modules/electron/install.js"], { env });

  // 2) Rebuild better-sqlite3 against Electron.
  // Call the CLI entrypoint directly to avoid platform-specific .bin shims.
  run(
    process.execPath,
    [
      "node_modules/@electron/rebuild/lib/cli.js",
      "-f",
      "-w",
      "better-sqlite3",
      "--sequential",
    ],
    { env }
  );

  console.log("\n[cowork] Native setup complete.");
}

main();
