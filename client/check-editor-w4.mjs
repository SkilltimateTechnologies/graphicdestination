/**
 * check-editor-w4.mjs — UI smoke for the w4 pack (3D widgets + layer
 * filters + depth quick-view). Mounts the REAL editor
 * (GraphicDestinationMotion) in headless Chromium and drives it with
 * Playwright, reading project state through the onChange seam:
 *
 *   A · the 3D rail button opens a panel listing all 4 widgets; each widget
 *       inserts ONE enter-editable clip with the expected children (JSON);
 *       double-clicking the inserted clip opens its timeline (breadcrumb).
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

    /* ---------- A · 3D rail + panel + widget inserts ---------- */
    console.log("\nA · 3D rail panel + widget clips");
    await page.locator('button:has(span:text-is("3D"))').first().click();
    await page.waitForTimeout(250);
    const panelText = await page.evaluate(() => document.body.textContent);
    check("panel lists all 4 widgets with blurbs", ["Photo Depth Stack", "Tilted Card", "Isometric Cube", "Extruded 3D Text"].every((n) => panelText.includes(n)));

    const stageBox = await page.evaluate(() => {
      const el = [...document.querySelectorAll("div")].find((d) => d.style.width === "1280px" && d.style.height === "720px");
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height, scale: r.width / 1280 };
    });
    const toScreen = (x, y) => ({ x: stageBox.left + x * stageBox.scale, y: stageBox.top + y * stageBox.scale });

    /* panel verified above is still open — close it, then per widget:
       open the panel → click the widget (insert closes the panel) */
    await page.locator('button:has(span:text-is("3D"))').first().click();
    await page.waitForTimeout(150);
    const WIDGETS = [
      ["Photo Depth Stack", "3D · Photo Depth Stack", 5],
      ["Tilted Card", "3D · Tilted Card", 4],
      ["Isometric Cube", "3D · Isometric Cube", 3],
      ["Extruded 3D Text", "3D · Extruded Text", 6],
    ];
    for (const [btn, clipName, kids] of WIDGETS) {
      await page.locator('button:has(span:text-is("3D"))').first().click();
      await page.waitForTimeout(200);
      await page.locator(`button:has-text("${btn}")`).first().click();
      await page.waitForTimeout(250);
      const p = await proj(page);
      const clip = p.objects.find((o) => o.type === "clip" && o.name === clipName);
      check(`${btn}: inserted as one clip with ${kids} children`, !!clip && (clip.children || []).length === kids, clip ? `${clip.children.length} children` : "clip missing");
    }
    let p = await proj(page);
    const stack = p.objects.find((o) => o.name === "3D · Photo Depth Stack");
    check("photo stack clip opts into camInside + preset depths", stack.props.camInside === true && stack.children[0].props.depth === -0.6 && stack.children[2].props.depth === 0.6 && stack.children[4].props.depth === 1.2);
    check("photo stack SUBJECT note layer present, world-locked", stack.children[3].name === "SUBJECT (replace + mask)" && !("depth" in stack.children[3].props));
    const cube = p.objects.find((o) => o.name === "3D · Isometric Cube");
    check("iso cube: 3 diamond faces rotated 0/+60/−60", cube.children.every((c) => c.props.shape === "diamond") && cube.children.map((c) => c.props.rotation).join(",") === "0,60,-60");
    const card = p.objects.find((o) => o.name === "3D · Tilted Card");
    check("tilt card: blurred shadow + tilted rounded card + badge", card.children[0].props.blur === 14 && card.children[1].props.cornerR === 24 && card.children[3].props.bg === "#F5A524");
    const ext = p.objects.find((o) => o.name === "3D · Extruded Text");
    check("extruded text: 5 copies + face, same word", ext.children.filter((c) => c.props.text === "DEPTH").length === 6);

    /* enter-editable: the last inserted clip is selected + on top — double-click
       the stage center opens its timeline */
    await page.mouse.dblclick(toScreen(640, 360).x, toScreen(640, 360).y);
    await page.waitForTimeout(300);
    check("double-click enters the widget clip", await page.evaluate(() => document.body.textContent.includes("Editing clip") && document.body.textContent.includes("Extruded Text")));
    for (let i = 0; i < 4; i++) {
      if (!(await page.evaluate(() => document.body.textContent.includes("Editing clip")))) break;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
    }
    check("escaped back to the root", !(await page.evaluate(() => document.body.textContent.includes("Editing clip"))));

    /* ---------- B · filters row ---------- */
    console.log("\nB · filters row (blur + blend) in the first card");
    await page.locator('button:has(span:text-is("Text"))').first().click();
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
