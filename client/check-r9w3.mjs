/**
 * check-r9w3.mjs — node proof for the R9w3 milestone:
 *
 *   A. SETTINGS LIB (client/src/lib/settings.js, bundled with Vite) —
 *      document normalize (repair/defaults/clamps), brand-kit → project-brand
 *      mapping (kitToBrand/upsertBrand — the switcher application mechanism),
 *      text-style resolution over the active brand, default stage bg
 *      (none selected → BLACK) and fresh-project bg adoption.
 *
 *   B. TEXT PRESETS (TextPanel) — 4 style presets honor the settings
 *      text-style config + brand text color. R10: the ten drop-in effect
 *      cards are GONE from the panel; every LEGAL engine textFx id (the
 *      exact TEXTFX_IDS list from check-templates.mjs) is still offered
 *      per-layer in the Inspector's Text card.
 *
 *   C. SSR of the REAL components (Vite bundle, react-dom/server) — the
 *      TextPanel renders the 4 preset cards and NO effect cards (R10),
 *      and the TopBar BrandSwitcher lists saved kits with the active-kit
 *      marker + a "Manage brand kits…" item.
 *
 *   D. WIRING (source level, like check-r9w1) — the Brand modal is gone from
 *      the editor, the switcher is wired in GDM/TopBar, the Text rail button
 *      toggles the panel, /settings is routed, the Settings page has the
 *      brand-kits / text-styles / default-bg sections.
 *
 * Run: node check-r9w3.mjs   (from client/)
 */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TEXTFX_LIST } from "./src/components/editor/model.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(here, ".r9w3-check-tmp");

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");

/* the canonical legal textFx ids — read straight out of check-templates.mjs
   so this check can never drift from the exporter's own validator */
const TEXTFX_IDS = (() => {
  const src = read("check-templates.mjs");
  const m = src.match(/TEXTFX_IDS = \[([^\]]+)\]/);
  return m ? m[1].split(",").map((s) => s.trim().replace(/["']/g, "")) : [];
})();

async function main() {
  console.log("Bundling settings lib + TextPanel + TopBar with Vite…");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const entry = path.join(tmpDir, "entry.js");
  fs.writeFileSync(entry, [
    `export * as S from ${JSON.stringify(path.join(here, "src", "lib", "settings.js"))};`,
    `export { default as TextPanel, TEXT_TIER_PRESETS, presetInsertProps } from ${JSON.stringify(path.join(here, "src", "components", "editor", "panels", "TextPanel.jsx"))};`,
    `export { BrandSwitcher } from ${JSON.stringify(path.join(here, "src", "components", "editor", "TopBar.jsx"))};`,
    `export { createElement } from "react";`,
    `export { renderToStaticMarkup } from "react-dom/server";`,
    "",
  ].join("\n"));
  await build({
    configFile: false,
    logLevel: "silent",
    plugins: [react()],
    build: { outDir: tmpDir, lib: { entry, formats: ["es"], fileName: () => "engine.mjs" } },
  });
  const M = await import(pathToFileURL(path.join(tmpDir, "engine.mjs")).href);
  const { S, TextPanel, TEXT_TIER_PRESETS, presetInsertProps, BrandSwitcher, createElement: h, renderToStaticMarkup } = M;

  /* ================= A · settings lib (pure) ================= */
  console.log("\nA · settings lib — normalize / mapping / defaults");
  {
    check("legal textFx ids recovered from check-templates.mjs", TEXTFX_IDS.length === 7 && TEXTFX_IDS.includes("typewriter") && TEXTFX_IDS.includes("wave"), TEXTFX_IDS.join(","));
    const d = S.normalizeSettings(null);
    check("normalize(null) → the default document", d.v === 1 && Array.isArray(d.brandKits) && d.brandKits.length === 0 && d.textStyles === null && d.defaultBg === null);
    const messy = S.normalizeSettings({
      v: 99, hacker: true,
      brandKits: [
        { id: "a", name: "  Acme  ", primary: "red", accent: "#123456", textColor: "#FFFFFF", headingFont: "NotAFont", bodyFont: "Inter", extra: 1 },
        { id: "a", name: "x".repeat(80), primary: "#000000", accent: "#111111", textColor: "#EEEEEE", headingFont: "Inter", bodyFont: "Inter" },
      ],
      textStyles: { heading: { fontFamily: "Oswald", fontSize: 500, fontWeight: 450 }, footer: { fontFamily: "Inter", fontSize: 9, fontWeight: 400 } },
      defaultBg: "blue",
    });
    check("unknown top-level keys stripped + v coerced", !("hacker" in messy) && messy.v === 1);
    check("kit repaired: bad hex → default color, unknown font → default font, unknown keys dropped",
      messy.brandKits[0].primary === "#F5A524" && messy.brandKits[0].headingFont === "Space Grotesk" && !("extra" in messy.brandKits[0]));
    check("kit name trimmed + capped at 60", messy.brandKits[0].name === "Acme" && messy.brandKits[1].name.length === 60);
    check("duplicate kit ids de-duped", messy.brandKits[0].id !== messy.brandKits[1].id);
    check("tier clamps: fontSize 500→400, weight 450→tier default", messy.textStyles.heading.fontSize === 400 && messy.textStyles.heading.fontWeight === 700);
    check("unknown text-style tier dropped, known kept", !("footer" in messy.textStyles) && messy.textStyles.heading.fontFamily === "Oswald");
    check("invalid defaultBg → null (none selected)", messy.defaultBg === null);
    check("logo string survives normalize", S.normalizeSettings({ brandKits: [{ name: "L", primary: "#111111", accent: "#222222", textColor: "#EEEEEE", headingFont: "Inter", bodyFont: "Inter", logo: "data:image/png;base64,AA==" }] }).brandKits[0].logo === "data:image/png;base64,AA==");

    check("mixHex half-way is the midpoint", S.mixHex("#000000", "#FFFFFF", 0.5) === "#808080");
    check("mixHex t=0 returns A (uppercase)", S.mixHex("#f5a524", "#000000", 0) === "#F5A524");

    const kit = { id: "acme", name: "Acme", primary: "#FF6B6B", accent: "#5B8CFF", textColor: "#F9F9F9", headingFont: "Bebas Neue", bodyFont: "Montserrat" };
    const brand = S.kitToBrand(kit);
    check("kitToBrand keeps the project brand shape (id/name/colors[5]/headFont/bodyFont)",
      brand.id === "kit-acme" && brand.name === "Acme" && Array.isArray(brand.colors) && brand.colors.length === 5 && brand.headFont === "Bebas Neue" && brand.bodyFont === "Montserrat");
    check("brand palette leads with primary + accent", brand.colors[0] === "#FF6B6B" && brand.colors[1] === "#5B8CFF");
    check("colors[4] is the kit text color (new-text fill channel)", brand.colors[4] === "#F9F9F9");
    check("bridge + tint tones are derived hex colors", /^#[0-9A-F]{6}$/.test(brand.colors[2]) && /^#[0-9A-F]{6}$/.test(brand.colors[3]) && brand.colors[2] === S.mixHex(kit.primary, kit.accent, 0.5));

    const up1 = S.upsertBrand([{ id: "b1", name: "Zwoosh" }], brand);
    check("switcher apply: new brand appended + made active", up1.brands.length === 2 && up1.brandId === "kit-acme");
    const up2 = S.upsertBrand(up1.brands, { ...brand, name: "Acme v2" });
    check("switcher re-apply updates in place (no duplicate)", up2.brands.length === 2 && up2.brands[1].name === "Acme v2" && up2.brandId === "kit-acme");

    const styles = S.resolveTextStyles(S.emptySettings(), { headFont: "Oswald", bodyFont: "Caveat" });
    check("text styles fall back to brand fonts (head → heading tiers)", styles.heading.fontFamily === "Oswald" && styles.subheading.fontFamily === "Oswald");
    check("text styles fall back to brand fonts (body → body tiers)", styles.body.fontFamily === "Caveat" && styles.caption.fontFamily === "Caveat");
    check("text styles default sizes/weights", styles.heading.fontSize === 72 && styles.body.fontSize === 24 && styles.heading.fontWeight === 700);
    const custom = S.resolveTextStyles({ textStyles: { heading: { fontFamily: "Pacifico", fontSize: 96, fontWeight: 400 } } }, { headFont: "Oswald", bodyFont: "Inter" });
    check("user config wins per tier, others keep brand fallback", custom.heading.fontFamily === "Pacifico" && custom.heading.fontSize === 96 && custom.body.fontFamily === "Inter");

    check("defaultStageBg: none selected → BLACK (the requested fallback)", S.defaultStageBg(null) === "#000000" && S.defaultStageBg(S.emptySettings()) === "#000000");
    check("defaultStageBg: a selected color is used", S.defaultStageBg({ defaultBg: "#101218" }) === "#101218");
    check("defaultStageBg: invalid value falls back to black", S.defaultStageBg({ defaultBg: "red" }) === "#000000");
    check("fresh blank project (factory bg) adopts the user default", S.resolveLoadedStageBg({ objects: [], stage: { bg: "#101218" } }, { defaultBg: "#123456" }, "#101218") === "#123456");
    check("fresh blank project without a user default → black", S.resolveLoadedStageBg({ objects: [], stage: { bg: "#101218" } }, null, "#101218") === "#000000");
    check("a project with content keeps its own saved bg", S.resolveLoadedStageBg({ objects: [{ id: "ob1" }], stage: { bg: "#101218" } }, { defaultBg: "#123456" }, "#000000") === "#101218");
    check("a blank project with a CUSTOM bg keeps it", S.resolveLoadedStageBg({ objects: [], stage: { bg: "#222222" } }, { defaultBg: "#123456" }, "#000000") === "#222222");
    check("missing bg keeps the current value (legacy projects)", S.resolveLoadedStageBg({ objects: [{ id: "ob1" }], stage: {} }, { defaultBg: "#123456" }, "#0B0E13") === "#0B0E13");
  }

  /* ================= B · text presets (pure) ================= */
  console.log("\nB · text presets (panel effects removed in R10)");
  {
    check("four style presets, one per tier", TEXT_TIER_PRESETS.length === 4 && TEXT_TIER_PRESETS.map((p) => p.id).join(",") === "heading,subheading,body,caption");
    /* R10: the ten drop-in effect cards are gone from TextPanel — the panel
       exports no TEXT_EFFECTS/effectInsertProps anymore… */
    const tpSrc = read("src/components/editor/panels/TextPanel.jsx");
    check("TextPanel no longer exports/renders the effect cards", !tpSrc.includes("TEXT_EFFECTS") && !tpSrc.includes("effectInsertProps") && !tpSrc.includes("data-fx"));
    /* …and textFx is still fully reachable per-layer in the Inspector's
       Text card, which offers every legal engine textFx id. */
    check("model TEXTFX_LIST covers every legal textFx id", TEXTFX_IDS.every((id) => TEXTFX_LIST.some((fx) => fx.id === id)), TEXTFX_IDS.join(","));
    const insp = read("src/components/editor/Inspector.jsx");
    check("Inspector Text card offers the textFx chips (every legal id)", insp.includes("TEXTFX_LIST.map") && insp.includes("textFx"));

    const styles = { heading: { fontFamily: "Oswald", fontSize: 84, fontWeight: 700 }, body: { fontFamily: "Caveat", fontSize: 30, fontWeight: 400 } };
    const brand = { colors: ["#111111", "#222222", "#333333", "#444444", "#DDDDDD"] };
    const hp = presetInsertProps(TEXT_TIER_PRESETS[0], styles, brand);
    check("preset insert honors the settings config (font/size/weight)", hp.fontFamily === "Oswald" && hp.fontSize === 84 && hp.fontWeight === 700);
    check("preset insert uses the brand text color as fill", hp.fill === "#DDDDDD");
    const bp = presetInsertProps(TEXT_TIER_PRESETS[2], styles, brand);
    check("normal-text preset uses the body tier", bp.fontFamily === "Caveat" && bp.fontSize === 30 && bp.text === "Normal text");
    check("preset insert survives a missing brand", presetInsertProps(TEXT_TIER_PRESETS[0], styles, null).fill === "#F9F9F9");
  }

  /* ================= C · SSR of the real components ================= */
  console.log("\nC · SSR — TextPanel + BrandSwitcher");
  {
    const settingsStyles = S.resolveTextStyles({ textStyles: { heading: { fontFamily: "Oswald", fontSize: 84, fontWeight: 700 }, caption: { fontFamily: "JetBrains Mono", fontSize: 13, fontWeight: 500 } } }, { headFont: "Space Grotesk", bodyFont: "Inter" });
    const brand = { id: "b1", name: "Zwoosh", colors: ["#FFB224", "#FF6B6B", "#5B8CFF", "#6EE7B7", "#F9F9F9"], headFont: "Space Grotesk", bodyFont: "Inter" };
    const tp = renderToStaticMarkup(h(TextPanel, { addObject: () => {}, setTextOpen: () => {}, textStyles: settingsStyles, brand }));
    check("TextPanel renders the drawer", tp.includes("data-text-panel"));
    check("TextPanel shows all four style preset cards", ["heading", "subheading", "body", "caption"].every((id) => tp.includes(`data-preset="${id}"`)));
    check("preset cards name the tiers (Heading / Subheading / Normal text / Caption)", tp.includes("Heading") && tp.includes("Subheading") && tp.includes("Normal text") && tp.includes("Caption"));
    check("preset cards show the configured settings font (Oswald heading)", tp.includes("Oswald") && tp.includes("84px"));
    check("preset cards show the settings caption config", tp.includes("JetBrains Mono") && tp.includes("13px"));
    /* R10: the effects shelf is gone — no data-fx cards, no hover-play hint */
    check("TextPanel renders NO effect cards (R10)", !tp.includes("data-fx") && !tp.includes("data-thumb-still") && !/hover a card to play/i.test(tp));

    const kits = [
      { id: "acme", name: "Acme Corp", primary: "#FF6B6B", accent: "#5B8CFF", textColor: "#F9F9F9", headingFont: "Space Grotesk", bodyFont: "Inter" },
      { id: "neon", name: "Neon Nights", primary: "#C084FC", accent: "#6EE7B7", textColor: "#FFFFFF", headingFont: "Bebas Neue", bodyFont: "Montserrat" },
    ];
    const applied = S.kitToBrand(kits[1]);
    const sw = renderToStaticMarkup(h(BrandSwitcher, { brand: applied, kits, onApplyKit: () => {}, onManage: () => {}, defaultOpen: true }));
    check("switcher button carries the gd-brandswitch class + Brand aria label", sw.includes("gd-brandswitch") && sw.includes("Brand kit switcher"));
    check("open switcher lists every saved kit", sw.includes("Acme Corp") && sw.includes("Neon Nights"));
    check("the applied kit shows the active marker", sw.includes("data-active-kit"));
    check("switcher offers the Manage… jump to settings", sw.includes("Manage brand kits…"));
    const swEmpty = renderToStaticMarkup(h(BrandSwitcher, { brand, kits: [], onApplyKit: () => {}, onManage: () => {}, defaultOpen: true }));
    check("empty switcher explains the flow + still offers Manage", swEmpty.includes("No saved brand kits yet") && swEmpty.includes("Manage brand kits…"));
    const swClosed = renderToStaticMarkup(h(BrandSwitcher, { brand, kits, onApplyKit: () => {}, onManage: () => {} }));
    check("closed switcher shows the active brand name + palette dots", swClosed.includes("Zwoosh") && !swClosed.includes("gd-brandswitch-menu"));
  }

  /* ================= D · wiring (source level) ================= */
  console.log("\nD · wiring (sources)");
  {
    const gdm = read("src/components/GraphicDestinationMotion.jsx");
    const tb = read("src/components/editor/TopBar.jsx");
    const rail = read("src/components/editor/IconRail.jsx");
    const app = read("src/App.jsx");
    const settingsPage = read("src/pages/Settings.jsx");
    check("GDM no longer imports/renders the BrandModal", !gdm.includes("BrandModal"));
    check("GDM has no brandOpen state left", !gdm.includes("brandOpen") && !gdm.includes("setBrandOpen"));
    check("GDM wires the switcher (brandKits + onApplyKit + onManageBrand)", gdm.includes("brandKits={userSettings.brandKits}") && gdm.includes("onApplyKit={applyBrandKit}") && gdm.includes("onManageBrand"));
    check("GDM applies kits through kitToBrand + upsertBrand (the old dialog's mechanism)", gdm.includes("kitToBrand(kit)") && gdm.includes("upsertBrand"));
    check("GDM mounts the TextPanel with resolved text styles + brand", gdm.includes("<TextPanel") && gdm.includes("textStyles={resolvedTextStyles}") && gdm.includes("resolveTextStyles(userSettings, brand)"));
    check("GDM default stage bg comes from the settings (none → black)", gdm.includes("resolveLoadedStageBg(null, readCachedSettings()"));
    check("TopBar renders the BrandSwitcher (Brand button gone)", tb.includes("<BrandSwitcher") && !tb.includes("setBrandOpen"));
    check("IconRail Text button toggles the panel when wired", rail.includes("setTextOpen(!textOpen)"));
    check("/settings route registered + page imported", app.includes('path="/settings"') && app.includes('import Settings from "./pages/Settings"'));
    check("Settings page has the three sections", settingsPage.includes('data-section="brand-kits"') && settingsPage.includes('data-section="text-styles"') && settingsPage.includes('data-section="default-bg"'));
    check("Settings page renders all four text-style tiers", settingsPage.includes("TEXT_TIERS.map") || TEXT_TIERS_SRC(settingsPage));
    check("Settings page saves through lib/settings persistSettings (useUserSettings.save)", settingsPage.includes("useUserSettings") && settingsPage.includes("data-action=\"save-settings\""));
  }

  function TEXT_TIERS_SRC(src) { return ["heading", "subheading", "body", "caption"].every((t) => src.includes(t)); }

  console.log(`\n${passed + failed} checks · ${failed} failed`);
  console.log(failed === 0 ? "ALL CHECKS PASSED" : "CHECKS FAILED");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
