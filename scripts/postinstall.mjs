#!/usr/bin/env node
/**
 * Best-effort postinstall hook.
 *
 * Why this exists:
 * - npm installs of this package can run in environments where some build tools
 *   are unavailable.
 * - Postinstall must never hard-fail the whole install for end users.
 *
 * Behavior:
 * - If Electron + better-sqlite3 are present, try native setup.
 * - If setup fails, log a warning and continue (exit 0).
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function exists(relPath) {
  return fs.existsSync(path.join(process.cwd(), relPath));
}

function log(msg) {
  console.log(`[cowork] ${msg}`);
}

function warn(msg) {
  console.warn(`[cowork] ${msg}`);
}

function main() {
  const hasElectron = exists("node_modules/electron/package.json");
  const hasBetterSqlite3 = exists("node_modules/better-sqlite3/package.json");

  if (!hasElectron || !hasBetterSqlite3) {
    log(
      "postinstall: skipping native setup (electron or better-sqlite3 not present in this install context)."
    );
    process.exit(0);
  }

  const setupDriver = path.join(process.cwd(), "scripts", "setup_native_driver.mjs");
  if (!fs.existsSync(setupDriver)) {
    warn("postinstall: setup driver not found; skipping native setup.");
    process.exit(0);
  }

  log("postinstall: running native setup (best effort)...");
  const res = spawnSync(process.execPath, [setupDriver], {
    stdio: "inherit",
    env: process.env,
    cwd: process.cwd(),
  });

  if (res.status === 0) {
    log("postinstall: native setup complete.");
    process.exit(0);
  }

  const detail = res.signal ? `signal ${res.signal}` : `exit ${res.status ?? 1}`;
  warn(
    `postinstall: native setup failed (${detail}). Install continues. ` +
      "If needed, run `npm run setup` in the CoWork OS project."
  );
  process.exit(0);
}

main();
