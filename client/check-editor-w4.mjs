/**
 * check-editor-w4.mjs — UI smoke for the layer filters + depth quick-view
 * (the 2.5D widgets panel was removed — this pack's surviving surface).
 * Mounts the REAL editor (GraphicDestinationMotion) in headless Chromium
 * and drives it with Playwright, reading project state through the
 * onChange seam:
 *
 *   B · every first card shows the Filters row: blur slider (0–20, mono
 *       readout) + 4 blend chips; blur 8 / blend screen land in the project
 *       JSON AND in the stage DOM; back to 0 / normal REMOVES the keys.
 *   C · the Depth row shows the live hint (mid → foreground / far background).
 *
 * Run:  node check-editor-w4.mjs        (from client/)
 * Requires: client deps + a Chromium (Playwright's or /usr/bin/chromium).
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const harnessDir = path.join(here, ".editor-w4-smoke");
const distDir = path.join(harnessDir, "dist");

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`  ok   ${name}${detail !== "" ? ` (${detail})` : ""}`);
  else { failures++; console.log(`  FAIL ${name}${detail !== "" ? ` — ${detail}` : ""}`); }
}

const HARNESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>html,body,#root{height:100%;margin:0}</style></head>
<body><div id="root"></div><script type="module" src="./main.js"></script></body></html>`;

const HARNESS_MAIN = `
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import GraphicDestinationMotion from "../src/components/GraphicDestinationMotion.jsx";
localStorage.setItem("gd:snapping", "0");
createRoot(document.getElementById("root")).render(h(GraphicDestinationMotion, {
  onChange: (json) => { window.__lastProject = json; },
}));
window.__ready = true;
`;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".map": "application/json" };
function serve(dir) {
  const server = http.createServer((req, res) => {
    const p = path.join(dir, req.url === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]));
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); res.end("nf"); return; }
      res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const candidates = [path.join(here, "node_modules"), "/home/kimi/.npm-global/lib/node_modules", "/usr/lib/node_modules"];
  for (const base of candidates) {
    try { return req(req.resolve("playwright", { paths: [base] })); } catch { /* next */ }
  }
  throw new Error("playwright not found in " + candidates.join(", "));
}
const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  "/usr/bin/chromium",
  `${process.env.HOME}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`,
  null,
].filter((p, i, a) => p !== undefined && a.indexOf(p) === i);

/* set a React-controlled input's value the native way */
const setRange = async (page, ariaLabel, value) => page.evaluate(([label, v]) => {
  const el = document.querySelector(`input[aria-label="${label}"]`);
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}, [ariaLabel, value]);

async function main() {
  fs.rmSync(harnessDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(harnessDir, "index.html"), HARNESS_HTML);
  fs.writeFileSync(path.join(harnessDir, "main.js"), HARNESS_MAIN);

  console.log("== bundling harness with vite ==");
  await build({
    configFile: false,
    logLevel: "silent",
    root: harnessDir,
    plugins: [react()],
    resolve: { alias: { ebml: path.join(here, "node_modules/ebml/lib/ebml.esm.js") } },
    build: { outDir: distDir, emptyOutDir: true },
  });

  const server = await serve(distDir);
  const port = server.address().port;
  const playwright = await loadPlaywright();
  let browser = null;
  for (const executablePath of CHROMIUM_CANDIDATES) {
    try { browser = await playwright.chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--no-sandbox", "--disable-dev-shm-usage"] }); break; }
    catch { /* next */ }
  }
  if (!browser) throw new Error("no usable chromium found");

  const proj = async (page) => JSON.parse(await page.evaluate(() => window.__lastProject || "{}"));

  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.log("[pageerror]", e.message));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
    await page.waitForFunction("window.__ready === true", null, { timeout: 30_000 });
    await page.waitForTimeout(600);

    /* ---------- B · filters row ---------- */
    console.log("\nB · filters row (blur + blend) in the first card");
    let p;
    /* R9w3: the Text rail button opens the presets/effects drawer — the
       "Normal text" preset performs the plain insert this pack drives */
    await page.locator('button:has(span:text-is("Text"))').first().click();
    await page.waitForTimeout(300);
    await page.locator('[data-text-panel] button[data-preset="body"]').first().click();
    await page.waitForTimeout(300);
    check("blur slider present (0–20)", await page.evaluate(() => { const el = document.querySelector('input[aria-label="Blur radius"]'); return !!el && el.min === "0" && el.max === "20"; }));
    check("4 blend chips present", await page.evaluate(() => ["normal", "screen", "multiply", "overlay"].every((m) => [...document.querySelectorAll("button")].some((b) => b.textContent === m))));
    p = await proj(page);
    const txtName = p.objects[p.objects.length - 1].name;
    check("fresh layer has NO blur/blend keys (inert defaults)", (() => { const t = p.objects[p.objects.length - 1]; return !("blur" in t.props) && !("blend" in t.props); })());

    await setRange(page, "Blur radius", "8");
    await page.waitForTimeout(200);
    p = await proj(page);
    check("blur 8 lands in the project JSON", p.objects.find((o) => o.name === txtName)?.props.blur === 8);
    check("stage DOM renders blur(8px)", await page.evaluate(() => document.body.innerHTML.includes("blur(8px)")));
    check("blur readout is mono + shows px", await page.evaluate(() => {
      const el = document.querySelector('input[aria-label="Blur radius"]');
      const s = el.parentElement.querySelector("span:last-child");
      return s.textContent === "8.0px" && s.style.fontFamily.includes("JetBrains Mono");
    }));
    await page.locator('button:text-is("screen")').first().click();
    await page.waitForTimeout(200);
    p = await proj(page);
    check("blend screen lands in the project JSON", p.objects.find((o) => o.name === txtName)?.props.blend === "screen");
    check("stage DOM renders mix-blend-mode:screen", await page.evaluate(() => /mix-blend-mode:\s*screen/.test(document.body.innerHTML)));
    await setRange(page, "Blur radius", "0");
    await page.locator('button:text-is("normal")').first().click();
    await page.waitForTimeout(200);
    p = await proj(page);
    check("back to 0/normal REMOVES the keys (byte-identical)", (() => { const t = p.objects.find((o) => o.name === txtName); return t && !("blur" in t.props) && !("blend" in t.props); })());

    /* ---------- C · depth quick-view hint ---------- */
    console.log("\nC · depth quick-view hint");
    check("hint starts at mid (depth 0)", await page.evaluate(() => {
      const row = document.querySelector('input[aria-label="Parallax depth"]').parentElement;
      return row.querySelector("em")?.textContent === "mid";
    }));
    await setRange(page, "Parallax depth", "1");
    await page.waitForTimeout(200);
    check("depth 1.0 → foreground", await page.evaluate(() => document.querySelector('input[aria-label="Parallax depth"]').parentElement.querySelector("em")?.textContent === "foreground"));
    await setRange(page, "Parallax depth", "-0.5");
    await page.waitForTimeout(200);
    check("depth −0.5 → far background", await page.evaluate(() => document.querySelector('input[aria-label="Parallax depth"]').parentElement.querySelector("em")?.textContent === "far background"));
    await setRange(page, "Parallax depth", "0");
    await page.waitForTimeout(200);

    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${failures ? failures + " FAILURE(S)" : "all w4 editor UI checks passed"}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
