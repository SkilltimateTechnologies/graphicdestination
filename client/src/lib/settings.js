/* ============================================================
   USER SETTINGS (R9w3) — brand kits, text styles, default stage bg.
   One JSON document per user, persisted server-side at
   GET/PUT /api/settings (user_settings table) and mirrored into
   localStorage so the editor can read it SYNCHRONOUSLY at mount
   (default stage bg, brand switcher) and guests/offline sessions
   keep a working local copy.

   Pure helpers are exported for the node checks; the React hook at
   the bottom is the only stateful part.
   ============================================================ */
import { useCallback, useEffect, useState } from "react";
import { FONTS } from "../components/editor/model.js";

const BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) || "";

export const SETTINGS_KEY = "gd:settings";
export const SETTINGS_MAX_KITS = 24;
export const TEXT_TIERS = ["heading", "subheading", "body", "caption"];
export const TEXT_TIER_LABELS = { heading: "Heading", subheading: "Subheading", body: "Normal text", caption: "Caption" };

/* engine defaults — the current makeObject("text") look */
export const DEFAULT_TEXT_STYLES = {
  heading: { fontFamily: "Space Grotesk", fontSize: 72, fontWeight: 700 },
  subheading: { fontFamily: "Space Grotesk", fontSize: 40, fontWeight: 600 },
  body: { fontFamily: "Inter", fontSize: 24, fontWeight: 400 },
  caption: { fontFamily: "Inter", fontSize: 16, fontWeight: 500 },
};

export const DEFAULT_KIT_COLORS = { primary: "#F5A524", accent: "#5B8CFF", textColor: "#F9F9F9" };

/* the requested fallback: "in setting default background can be selected.
   if none is selected it will be black" */
export const FALLBACK_STAGE_BG = "#000000";
/* the engine's factory stage background (templates.js STAGE_BG) — a NEW
   blank project still carries it, which is how we tell "fresh project"
   apart from "user explicitly picked this bg" */
export const ENGINE_STAGE_BG = "#101218";

export const emptySettings = () => ({ v: 1, brandKits: [], textStyles: null, defaultBg: null });

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export const isHex = (v) => typeof v === "string" && HEX_RE.test(v);
const clampNum = (n, lo, hi, fallback) => (Number.isFinite(Number(n)) ? Math.max(lo, Math.min(hi, Math.round(Number(n)))) : fallback);
const cleanFont = (v, fallback) => (typeof v === "string" && FONTS.includes(v) ? v : fallback);
const cleanWeight = (v, fallback) => {
  const w = Number(v);
  return Number.isFinite(w) && w >= 100 && w <= 900 && w % 100 === 0 ? w : fallback;
};

/* ---------------- pure: color mixing ---------------- */
function parseHex(v) {
  if (!isHex(v)) return null;
  let h = v.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
/* mix two hex colors t∈[0,1] → uppercase #rrggbb (engine casing) */
export function mixHex(a, b, t) {
  const pa = parseHex(a) || [0, 0, 0];
  const pb = parseHex(b) || [0, 0, 0];
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/* ---------------- pure: normalizers (lenient — never throw) ---------------- */
export function normalizeKit(raw, i = 0) {
  const k = raw && typeof raw === "object" ? raw : {};
  const name = typeof k.name === "string" && k.name.trim() ? k.name.trim().slice(0, 60) : `Brand kit ${i + 1}`;
  const id = typeof k.id === "string" && /^[a-zA-Z0-9_-]{1,40}$/.test(k.id) ? k.id : `kit${Date.now().toString(36)}${i}`;
  const kit = {
    id,
    name,
    primary: isHex(k.primary) ? k.primary : DEFAULT_KIT_COLORS.primary,
    accent: isHex(k.accent) ? k.accent : DEFAULT_KIT_COLORS.accent,
    textColor: isHex(k.textColor) ? k.textColor : DEFAULT_KIT_COLORS.textColor,
    headingFont: cleanFont(k.headingFont, DEFAULT_TEXT_STYLES.heading.fontFamily),
    bodyFont: cleanFont(k.bodyFont, DEFAULT_TEXT_STYLES.body.fontFamily),
  };
  if (typeof k.logo === "string" && k.logo) kit.logo = k.logo;
  return kit;
}

export function normalizeTier(raw, fallback) {
  const t = raw && typeof raw === "object" ? raw : {};
  return {
    fontFamily: cleanFont(t.fontFamily, fallback.fontFamily),
    fontSize: clampNum(t.fontSize, 6, 400, fallback.fontSize),
    fontWeight: cleanWeight(t.fontWeight, fallback.fontWeight),
  };
}

/* whole-document normalize: always returns a complete, valid settings doc */
export function normalizeSettings(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const seen = new Set();
  const brandKits = (Array.isArray(s.brandKits) ? s.brandKits : []).slice(0, SETTINGS_MAX_KITS).map((k, i) => {
    const kit = normalizeKit(k, i);
    while (seen.has(kit.id)) kit.id = `${kit.id}x`;
    seen.add(kit.id);
    return kit;
  });
  let textStyles = null;
  if (s.textStyles && typeof s.textStyles === "object" && !Array.isArray(s.textStyles)) {
    const ts = {};
    for (const tier of TEXT_TIERS) {
      if (s.textStyles[tier] != null) ts[tier] = normalizeTier(s.textStyles[tier], DEFAULT_TEXT_STYLES[tier]);
    }
    if (Object.keys(ts).length) textStyles = ts;
  }
  return { v: 1, brandKits, textStyles, defaultBg: isHex(s.defaultBg) ? s.defaultBg : null };
}

/* ---------------- pure: brand kit → project brand ---------------- */
/* the editor's project model keeps the ORIGINAL Brand-dialog shape
   ({ id, name, colors[5], headFont, bodyFont }) so brand application stays
   exactly the mechanism the old dialog used: the palette becomes the app
   swatches, new text layers use headFont + colors[4] (the text color). */
export function kitToBrand(kit) {
  return {
    id: `kit-${kit.id}`,
    name: kit.name,
    colors: [
      kit.primary,
      kit.accent,
      mixHex(kit.primary, kit.accent, 0.5),   /* bridge tone */
      mixHex(kit.primary, "#FFFFFF", 0.45),   /* light tint of the primary */
      kit.textColor,                          /* colors[4] = new-text fill */
    ],
    headFont: kit.headingFont,
    bodyFont: kit.bodyFont,
  };
}

/* upsert the mapped brand into the project's brands array and make it the
   active one — the same setBrands + setBrandId the BrandModal performed */
export function upsertBrand(brands, brand) {
  const list = Array.isArray(brands) ? brands : [];
  const exists = list.some((b) => b.id === brand.id);
  return { brands: exists ? list.map((b) => (b.id === brand.id ? brand : b)) : [...list, brand], brandId: brand.id };
}

/* ---------------- pure: text styles + stage bg ---------------- */
/* resolved per-tier style for the Text presets: user config wins, brand
   fonts fill the gaps (heading tiers ← headFont, body tiers ← bodyFont) */
export function resolveTextStyles(settings, brand) {
  const ts = (settings && settings.textStyles) || {};
  const head = (brand && brand.headFont) || DEFAULT_TEXT_STYLES.heading.fontFamily;
  const body = (brand && brand.bodyFont) || DEFAULT_TEXT_STYLES.body.fontFamily;
  return {
    heading: normalizeTier(ts.heading, { ...DEFAULT_TEXT_STYLES.heading, fontFamily: head }),
    subheading: normalizeTier(ts.subheading, { ...DEFAULT_TEXT_STYLES.subheading, fontFamily: head }),
    body: normalizeTier(ts.body, { ...DEFAULT_TEXT_STYLES.body, fontFamily: body }),
    caption: normalizeTier(ts.caption, { ...DEFAULT_TEXT_STYLES.caption, fontFamily: body }),
  };
}

/* user default stage background; BLACK when none is selected (per request) */
export function defaultStageBg(settings) {
  return settings && isHex(settings.defaultBg) ? settings.defaultBg : FALLBACK_STAGE_BG;
}

/* stage bg for a project being loaded: a FRESH blank project (no layers,
   factory-default bg — what the dashboard's blankProject ships) takes the
   user's configured default instead; anything the user actually built keeps
   its own saved bg. Missing bg keeps the current value (legacy projects). */
export function resolveLoadedStageBg(data, settings, currentBg) {
  const bg = data && data.stage && typeof data.stage.bg === "string" ? data.stage.bg : null;
  const empty = !data || !Array.isArray(data.objects) || data.objects.length === 0;
  if (empty && (!bg || bg.toUpperCase() === ENGINE_STAGE_BG.toUpperCase())) return defaultStageBg(settings);
  return bg || currentBg || defaultStageBg(settings);
}

/* ---------------- storage: localStorage mirror + server ---------------- */
export function readCachedSettings() {
  try {
    const raw = globalThis.localStorage && localStorage.getItem(SETTINGS_KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : emptySettings();
  } catch {
    return emptySettings();
  }
}

export function cacheSettings(settings) {
  try {
    if (globalThis.localStorage) localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* storage unavailable — server copy still applies */ }
}

/* GET /api/settings → normalized doc (and refresh the local mirror).
   Throws on any non-OK response (401 guest, network down) — callers fall
   back to the cached/local copy. */
export async function fetchSettings() {
  const res = await fetch(`${BASE}/api/settings`, { credentials: "include" });
  if (!res.ok) { const err = new Error(`settings fetch failed (${res.status})`); err.status = res.status; throw err; }
  const doc = normalizeSettings(await res.json());
  cacheSettings(doc);
  return doc;
}

/* PUT /api/settings — returns { ok, settings, remote, error? }. The local
   mirror is ALWAYS written first, so guests/offline sessions keep working
   (remote:false) and the next visit re-syncs. */
export async function persistSettings(next) {
  const doc = normalizeSettings(next);
  cacheSettings(doc);
  try {
    const res = await fetch(`${BASE}/api/settings`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) { const err = new Error((body && body.error) || `Save failed (${res.status})`); err.status = res.status; throw err; }
    const saved = normalizeSettings((body && body.settings) || doc);
    cacheSettings(saved);
    return { ok: true, settings: saved, remote: true };
  } catch (err) {
    return { ok: false, settings: doc, remote: false, error: err.message || "Couldn't reach the server" };
  }
}

/* ---------------- React hook: shared live view of the document ----------------
   Starts from the local mirror (synchronous — the editor's default bg never
   waits on the network), then revalidates against the server once. `remote`
   is null while unknown, true when server-backed, false in guest/offline
   (localStorage-only) mode. */
export function useUserSettings() {
  const [settings, setSettings] = useState(readCachedSettings);
  const [remote, setRemote] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchSettings()
      .then((doc) => { if (alive) { setSettings(doc); setRemote(true); } })
      .catch(() => { if (alive) setRemote(false); });
    return () => { alive = false; };
  }, []);
  const save = useCallback(async (next) => {
    const result = await persistSettings(next);
    setSettings(result.settings);
    setRemote(result.remote);
    return result;
  }, []);
  return { settings, save, remote };
}
