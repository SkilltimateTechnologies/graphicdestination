/* Render smoke test: bundle the app's pages with rolldown and server-render
   each new/changed route tree (SSR runs no effects, so this exercises the
   pure render path and catches crashes a build can't). */
import { createRequire } from "node:module";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const require = createRequire(import.meta.url);
const { rolldown } = require("rolldown");

const entry = "./.smoke-entry.jsx";
writeFileSync(
  entry,
  `export { default as App } from "./src/App.jsx";
   export { default as Dashboard } from "./src/pages/Dashboard.jsx";
   export { default as Templates } from "./src/pages/Templates.jsx";
   export { default as Editor } from "./src/pages/Editor.jsx";
   export { default as Landing } from "./src/pages/Landing.jsx";
   export { AuthProvider } from "./src/AuthContext.jsx";
  `
);

const bundle = await rolldown({ input: entry, external: [/^react/, /^react-dom/], platform: "node" });
const { output } = await bundle.generate({ format: "esm" });
/* rolldown code-splits a shared runtime chunk (rolldown-runtime-*.js) that
   the entry imports relatively — write EVERY chunk to a scratch dir and
   import the entry chunk, neutralizing vite env access for node in each. */
const tmpDir = "./.app-smoke.out";
mkdirSync(tmpDir, { recursive: true });
for (const c of output) writeFileSync(`${tmpDir}/${c.fileName}`, c.code.replaceAll("import.meta.env.VITE_API_BASE", '""'));
const tmp = `${tmpDir}/${output.find((o) => o.isEntry).fileName}`;

let failures = 0;
const h = React.createElement;
try {
  const mod = await import(pathToFileURL(process.cwd() + "/" + tmp).href);
  const { App, Dashboard, Templates, Editor, Landing, AuthProvider } = mod;
  globalThis.fetch = () => Promise.reject(new Error("offline")); // api calls in effects only

  /* node has no DOM, but App brings its OWN BrowserRouter (nesting it inside
     a MemoryRouter throws "router inside router"), and react-router's
     getUrlBasedHistory reads document.defaultView + window.history/location
     at render. Shim the tiny surface it needs — same spirit as the fetch
     shim above — and render App UNWRAPPED with the per-case path set on the
     fake location just before renderToString. */
  const fakeWindow = {
    history: { state: null, replaceState() {}, pushState() {}, go() {}, back() {}, forward() {} },
    location: { pathname: "/", search: "", hash: "", state: null, key: "default", origin: "http://localhost", href: "http://localhost/" },
    addEventListener() {}, removeEventListener() {},
  };
  globalThis.window = fakeWindow;
  globalThis.document = { defaultView: fakeWindow, querySelector: () => null };

  const cases = [
    ["App at /", h(App), "/"],
    ["App at /login", h(App), "/login"],
    ["App at /dashboard (guard loading)", h(App), "/dashboard"],
    ["Landing", h(MemoryRouter, null, h(Landing))],
    ["Dashboard page", h(MemoryRouter, null, h(AuthProvider, null, h(Dashboard)))],
    ["Templates page", h(MemoryRouter, null, h(AuthProvider, null, h(Templates)))],
    ["Editor blank (/editor)", h(MemoryRouter, null, h(AuthProvider, null, h(Editor)))],
    ["Editor with id (/editor/7)", h(MemoryRouter, { initialEntries: ["/editor/7"] }, h(AuthProvider, null, h(Routes, null, h(Route, { path: "/editor/:id", element: h(Editor) }))))],
  ];
  for (const [label, el, path] of cases) {
    try {
      if (path) fakeWindow.location = { ...fakeWindow.location, pathname: path };
      const html = renderToString(el);
      if (!html || html.length < 10) { failures += 1; console.error(`  ✗ ${label}: empty render`); }
      else console.log(`  ✓ ${label} (${html.length} bytes)`);
    } catch (e) {
      failures += 1;
      console.error(`  ✗ ${label}: ${e.message}`);
    }
  }
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(entry, { force: true });
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nRender smoke test passed.");
