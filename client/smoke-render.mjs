/* Render smoke test: bundle the app's pages with rolldown and server-render
   each new/changed route tree (SSR runs no effects, so this exercises the
   pure render path and catches crashes a build can't). */
import { createRequire } from "node:module";
import { writeFileSync, rmSync } from "node:fs";
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
const tmp = "./.app-smoke.bundle.mjs";
writeFileSync(tmp, output[0].code.replaceAll("import.meta.env.VITE_API_BASE", '""'));

let failures = 0;
const h = React.createElement;
try {
  const mod = await import(pathToFileURL(process.cwd() + "/" + tmp).href);
  const { App, Dashboard, Templates, Editor, Landing, AuthProvider } = mod;
  globalThis.fetch = () => Promise.reject(new Error("offline")); // api calls in effects only

  const cases = [
    ["App at /", h(MemoryRouter, { initialEntries: ["/"] }, h(App))],
    ["App at /login", h(MemoryRouter, { initialEntries: ["/login"] }, h(App))],
    ["App at /dashboard (guard loading)", h(MemoryRouter, { initialEntries: ["/dashboard"] }, h(App))],
    ["Landing", h(MemoryRouter, null, h(Landing))],
    ["Dashboard page", h(MemoryRouter, null, h(AuthProvider, null, h(Dashboard)))],
    ["Templates page", h(MemoryRouter, null, h(AuthProvider, null, h(Templates)))],
    ["Editor blank (/editor)", h(MemoryRouter, null, h(AuthProvider, null, h(Editor)))],
    ["Editor with id (/editor/7)", h(MemoryRouter, { initialEntries: ["/editor/7"] }, h(AuthProvider, null, h(Routes, null, h(Route, { path: "/editor/:id", element: h(Editor) }))))],
  ];
  for (const [label, el] of cases) {
    try {
      const html = renderToString(el);
      if (!html || html.length < 10) { failures += 1; console.error(`  ✗ ${label}: empty render`); }
      else console.log(`  ✓ ${label} (${html.length} bytes)`);
    } catch (e) {
      failures += 1;
      console.error(`  ✗ ${label}: ${e.message}`);
    }
  }
} finally {
  rmSync(tmp, { force: true });
  rmSync(entry, { force: true });
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nRender smoke test passed.");
