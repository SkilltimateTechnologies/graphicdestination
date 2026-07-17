import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { compileProject } from "./compile.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Looks for an already-installed Chromium/Chrome binary in common cache
 *  locations and points hyperframes at it via PRODUCER_HEADLESS_SHELL_PATH
 *  (the real env var it checks -- found by reading its source, not
 *  guessed). This matters because hyperframes' own default behavior is to
 *  download a `chrome-headless-shell` build on first render, which fails in
 *  network-restricted environments (confirmed during development: blocked
 *  at storage.googleapis.com). Many environments -- including the sandbox
 *  this project was built and tested in -- already have a Playwright- or
 *  Puppeteer-installed Chromium sitting on disk that works fine as a
 *  substitute; this makes rendering succeed there without any extra setup,
 *  while still falling back cleanly to the "please install Chrome" hint
 *  when nothing is found. */
function findExistingChromium() {
  if (process.env.PRODUCER_HEADLESS_SHELL_PATH && fs.existsSync(process.env.PRODUCER_HEADLESS_SHELL_PATH)) {
    return process.env.PRODUCER_HEADLESS_SHELL_PATH; // explicit operator override wins
  }
  const listDir = (dir) => {
    if (!fs.existsSync(dir)) return [];
    try {
      return fs.readdirSync(dir).map((n) => path.join(dir, n));
    } catch {
      return [];
    }
  };
  const home = os.homedir();
  const candidateDirs = [
    "/opt/pw-browsers", // Playwright system-wide install (confirmed present in dev sandbox)
    path.join(home, ".cache", "ms-playwright"),
    path.join(home, ".cache", "puppeteer", "chrome"),
    path.join(home, ".cache", "puppeteer", "chrome-headless-shell"),
  ];
  const binNames = ["chrome", "chromium", "chrome-headless-shell", "headless_shell"];
  for (const dir of candidateDirs) {
    for (const versionDir of listDir(dir)) {
      for (const sub of ["chrome-linux", "chrome-linux64", ".", "chrome-headless-shell-linux64"]) {
        for (const bin of binNames) {
          const p = path.join(versionDir, sub, bin);
          if (fs.existsSync(p)) return p;
        }
      }
    }
  }
  return null;
}

/** Resolves the hyperframes CLI script directly rather than going through
 *  `npx` (which was found during testing to sometimes serve a stale/broken
 *  cached resolution silently -- invoking the installed package's own file
 *  directly is more predictable). Requires `hyperframes` to be installed in
 *  server/node_modules (see package.json optionalDependencies + README for
 *  the `--ignore-scripts` install workaround this project needs). */
function resolveCli() {
  const p = path.join(__dirname, "..", "node_modules", "hyperframes", "dist", "cli.js");
  return fs.existsSync(p) ? p : null;
}

/**
 * Compiles a project and attempts to render it to MP4 via the real
 * `hyperframes` CLI (must be installed — see package.json / README).
 *
 * Returns one of:
 *   { ok: true, path, warnings }                 -- MP4 written to `path`
 *   { ok: false, reason: "chrome-unavailable",
 *     html, warnings, hint }                     -- compiled fine, but this
 *                                                    machine has no headless
 *                                                    Chrome and couldn't
 *                                                    download one (confirmed
 *                                                    failure mode in a
 *                                                    network-restricted
 *                                                    environment -- see
 *                                                    RENDERING.md). `html`
 *                                                    is still returned so
 *                                                    the caller can render
 *                                                    it elsewhere.
 *   { ok: false, reason: "render-error",
 *     html, warnings, error }                    -- hyperframes ran but
 *                                                    failed for some other
 *                                                    reason (raw stderr in
 *                                                    `error`)
 */
export async function renderProjectToMp4(project, { fps = 30, quality = "standard" } = {}) {
  const { html, warnings } = compileProject(project);

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "gd-render-"));
  fs.writeFileSync(path.join(workDir, "index.html"), html);
  const outPath = path.join(workDir, "out.mp4");

  const cli = resolveCli();
  if (!cli) {
    return {
      ok: false,
      reason: "hyperframes-unavailable",
      html,
      warnings,
      hint:
        "The `hyperframes` package isn't installed in server/node_modules. Its default `npm install` " +
        "postinstall can fail in network-restricted environments (an unrelated optional feature -- " +
        "transcription -- tries to reach api.nuget.org). Run: `npm install hyperframes --ignore-scripts` " +
        "in server/ -- this genuinely works even without that network access, since it just skips the " +
        "unrelated postinstall step. Confirmed during development.",
    };
  }

  try {
    const chromePath = findExistingChromium();
    const { stdout, stderr } = await execFileAsync(
      "node",
      [cli, "render", workDir, "-o", outPath, "-f", String(fps), "-q", quality, "--quiet"],
      {
        timeout: 5 * 60 * 1000,
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, ...(chromePath ? { PRODUCER_HEADLESS_SHELL_PATH: chromePath } : {}) },
      }
    );
    if (!fs.existsSync(outPath)) {
      return { ok: false, reason: "render-error", html, warnings, error: `hyperframes exited cleanly but produced no output file.\nstdout: ${stdout}\nstderr: ${stderr}` };
    }
    return { ok: true, path: outPath, warnings, chromeSource: chromePath || "hyperframes default (auto-download)" };
  } catch (err) {
    const combined = `${err.stdout || ""}\n${err.stderr || ""}\n${err.message || ""}`;
    if (/chrome-headless-shell|Failed to download chrome|storage\.googleapis\.com\/chrome-for-testing/i.test(combined)) {
      return {
        ok: false,
        reason: "chrome-unavailable",
        html,
        warnings,
        hint:
          "hyperframes needs headless Chrome to render. This build auto-detects common Chromium " +
          "install locations (Playwright/Puppeteer caches, /opt/pw-browsers) before falling back to " +
          "hyperframes' own downloader -- none were found here, and the downloader itself was blocked " +
          "(network policy blocks storage.googleapis.com in restricted environments -- confirmed during " +
          "development). Fix options, in order of effort: (1) `npx playwright install chromium` -- " +
          "populates ~/.cache/ms-playwright, which this code already checks; (2) if this machine has " +
          "open network access, just retry -- `npx hyperframes browser ensure` downloads Chrome " +
          "automatically; (3) `npx hyperframes cloud` (HeyGen's hosted renderer, needs an API key, no " +
          "local Chrome at all). See RENDERING.md for the full picture -- this exact pipeline was " +
          "verified end-to-end with a real MP4 output during development once a Chromium was available.",
      };
    }
    if (/ENOTFOUND|ETIMEDOUT|404 Not Found - GET https:\/\/registry|command not found|not recognized/i.test(combined)) {
      return {
        ok: false,
        reason: "hyperframes-unavailable",
        html,
        warnings,
        hint:
          "Couldn't run the `hyperframes` CLI at all -- most likely it isn't installed and `npx` " +
          "couldn't fetch it (blocked network, or it's an optionalDependency that failed to install -- " +
          "see server/package.json). Try `npm install hyperframes --ignore-scripts` in server/ (this " +
          "genuinely works even in restricted-network environments -- confirmed during development; " +
          "the plain postinstall fails on an unrelated optional feature, transcription/TTS, that this " +
          "app never uses). Raw error: " + combined.slice(0, 300),
      };
    }
    return { ok: false, reason: "render-error", html, warnings, error: combined.trim() };
  }
}
