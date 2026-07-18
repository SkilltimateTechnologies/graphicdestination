/**
 * check-landing-w1.mjs — fix #4: the landing nav is PERMANENTLY fixed with the
 * scrolled-bg treatment at every scroll position (it used to start transparent
 * and only gain bg/border/blur after scrolling). Serves the production build
 * (dist/) and inspects the header at scroll 0 / 400 / 1200.
 * Run: npm run build && node check-landing-w1.mjs
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "dist");
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("run npm run build first"); process.exit(1); }

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok   ${name}${detail ? ` (${detail})` : ""}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".map": "application/json" };
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split("?")[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dist, "index.html"); /* SPA fallback */
  res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const req = createRequire(import.meta.url);
let playwright = null;
for (const base of [path.join(here, "node_modules"), "/home/kimi/.npm-global/lib/node_modules", "/usr/lib/node_modules"]) {
  try { playwright = req(req.resolve("playwright", { paths: [base] })); break; } catch { /* next */ }
}
let browser = null;
for (const executablePath of [process.env.CHROMIUM_PATH, "/usr/bin/chromium", null].filter((p, i, a) => p !== undefined && a.indexOf(p) === i)) {
  try { browser = await playwright.chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--no-sandbox", "--disable-dev-shm-usage"] }); break; } catch { /* next */ }
}

try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector("header");
  await page.waitForTimeout(400);
  const probe = () => page.evaluate(() => {
    const h = document.querySelector("header");
    const cs = getComputedStyle(h);
    const hero = [...document.querySelectorAll("section")].find((s) => s.style.textAlign === "center");
    return { position: cs.position, top: cs.top, bg: cs.backgroundColor, blur: cs.backdropFilter, border: cs.borderBottomColor, heroPad: hero ? hero.style.padding : "" };
  });
  const s0 = await probe();
  check("nav is fixed top-0", s0.position === "fixed" && s0.top === "0px", JSON.stringify({ position: s0.position, top: s0.top }));
  check("nav has the scrolled-bg treatment at scroll 0", s0.bg === "rgba(10, 12, 16, 0.9)" && s0.blur === "blur(12px)" && s0.border === "rgb(35, 41, 54)", `${s0.bg} · ${s0.blur} · ${s0.border}`);
  check("hero top padding clears the fixed nav", /^(1[2-6]\d|9\d)px/.test(s0.heroPad), s0.heroPad);
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(200);
  const s1 = await probe();
  check("nav identical at scroll 400 (no hide/change)", JSON.stringify(s1) === JSON.stringify(s0), "same fixed treatment");
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(200);
  const s2 = await probe();
  check("nav identical at scroll 1200 (still visible)", JSON.stringify(s2) === JSON.stringify(s0), "same fixed treatment");
  await page.close();
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${failures ? failures + " FAILURE(S)" : "all landing header checks passed"}`);
process.exit(failures ? 1 : 0);
