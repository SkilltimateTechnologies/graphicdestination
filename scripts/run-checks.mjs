#!/usr/bin/env node
/*
 * Master test runner — the single command that runs the ENTIRE verification
 * battery this repo relies on (AGENTS.md golden rule #2).
 *
 *   node scripts/run-checks.mjs            # run everything, sequentially
 *   node scripts/run-checks.mjs --filter timeline   # only suites matching "timeline"
 *   node scripts/run-checks.mjs --group client      # client | server | export | lib
 *   node scripts/run-checks.mjs --bail              # stop at the first failure
 *   node scripts/run-checks.mjs --list              # print the discovered suites and exit
 *
 * Suites are DISCOVERED dynamically (glob), so a newly added `check-*.mjs` or
 * `test-*.mjs` is picked up automatically — no central list to forget to update.
 * Every suite is a self-contained Node script that prints PASS/FAIL lines and
 * exits non-zero on any failure; this runner just orchestrates and aggregates.
 *
 * Server suites each boot their own server on a distinct port (8790-8795) and
 * are run one-at-a-time so they never contend for a port or the local DB file.
 */
import { spawn } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT = path.join(ROOT, "client");
const SERVER = path.join(ROOT, "server");

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const FILTER = valOf("--filter");
const GROUP = valOf("--group");
const BAIL = has("--bail");
const LIST_ONLY = has("--list");

/* ---- discovery -------------------------------------------------------- */

const listMjs = (dir, matcher) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".mjs") && matcher(f))
        .sort()
        .map((f) => path.join(dir, f))
    : [];

/** One suite = { name, group, cwd, file }. `file` is relative to `cwd`. */
function discover() {
  const suites = [];
  const add = (group, cwd, files) => {
    for (const abs of files) {
      suites.push({ name: path.relative(ROOT, abs).replace(/\\/g, "/"), group, cwd, file: path.relative(cwd, abs) });
    }
  };

  // client/check-*.mjs — the engine + editor unit battery
  add("client", CLIENT, listMjs(CLIENT, (f) => f.startsWith("check-")));
  // client/src/export/*.mjs — export/render fidelity (excludes non-runnable helpers if any)
  add("export", CLIENT, listMjs(path.join(CLIENT, "src", "export"), (f) => f.startsWith("test-") || f === "validateFrameMath.mjs"));
  // client/src/lib/*.check.mjs — small library checks
  add("lib", CLIENT, listMjs(path.join(CLIENT, "src", "lib"), (f) => f.endsWith(".check.mjs")));
  // server/test-*.mjs — API/auth/assets/share/settings integration
  add("server", SERVER, listMjs(SERVER, (f) => f.startsWith("test-")));
  // server/hyperframes/test-*.mjs — HyperFrames compiler
  add("server", SERVER, listMjs(path.join(SERVER, "hyperframes"), (f) => f.startsWith("test-")));

  return suites;
}

/* ---- run one suite ---------------------------------------------------- */

function runSuite(suite) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [suite.file], {
      cwd: suite.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", (err) => resolve({ suite, code: 1, ms: Date.now() - started, out: String(err?.stack || err) }));
    child.on("exit", (code) => resolve({ suite, code: code ?? 1, ms: Date.now() - started, out }));
  });
}

/* ---- main ------------------------------------------------------------- */

let suites = discover();
if (GROUP) suites = suites.filter((s) => s.group === GROUP);
if (FILTER) suites = suites.filter((s) => s.name.includes(FILTER));

if (!suites.length) {
  console.error(`No suites matched (group=${GROUP ?? "*"} filter=${FILTER ?? "*"}).`);
  process.exit(1);
}

if (LIST_ONLY) {
  console.log(`${suites.length} suites discovered:\n`);
  for (const s of suites) console.log(`  [${s.group.padEnd(6)}] ${s.name}`);
  process.exit(0);
}

console.log(`Running ${suites.length} suites${GROUP ? ` (group=${GROUP})` : ""}${FILTER ? ` (filter=${FILTER})` : ""}...\n`);

const results = [];
for (const suite of suites) {
  process.stdout.write(`  · ${suite.name} … `);
  const r = await runSuite(suite);
  results.push(r);
  const ok = r.code === 0;
  console.log(`${ok ? "PASS" : "FAIL"} (${r.ms} ms)`);
  if (!ok) {
    // Surface the failing suite's tail so CI logs show *why* without re-running.
    const tail = r.out.trim().split("\n").slice(-25).join("\n");
    console.log("\n--- output ".padEnd(72, "-"));
    console.log(tail);
    console.log("-".repeat(72) + "\n");
    if (BAIL) break;
  }
}

const failed = results.filter((r) => r.code !== 0);
const totalMs = results.reduce((a, r) => a + r.ms, 0);
console.log("\n" + "=".repeat(60));
console.log(`${results.length - failed.length}/${results.length} suites passed in ${(totalMs / 1000).toFixed(1)}s`);
if (failed.length) {
  console.log(`\nFAILED (${failed.length}):`);
  for (const r of failed) console.log(`  ✗ ${r.suite.name}`);
  process.exit(1);
}
console.log("All suites green. ✓");
