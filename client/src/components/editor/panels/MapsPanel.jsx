import { useEffect, useMemo, useRef, useState } from "react";
import { StageObject } from "../../StageObject.jsx";
import { CONTINENTS, CONTINENT_NAMES, WORLD_LIST, COUNTRIES, MAPS, ringsToPath, HI_PALETTE } from "../../../engine/maps.js";

/* Maps panel — three categories, live previews, electric pop style:
     · Continents — the 7 true continent unions (Natural Earth 50m)
     · Countries  — all 239, searchable + grouped by continent (live trace thumbs)
     · World      — the world map
   Continent + World inserts carry a HIGHLIGHT COMPOSER: pick countries, each
   gets an electric color and appear/hide times; the preview + inserted object
   show a color-coded legend (swatch + name) and the timeline keeps the
   appear/hide points editable afterwards (props.hi — nothing is baked). */

const usePreviewTime = () => {
  const [now, setNow] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const t0 = performance.now();
    const loop = (t) => { setNow(t - t0); raf.current = requestAnimationFrame(loop); };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, []);
  return now;
};

const S = {
  wrap: { position: "absolute", right: 12, top: 12, bottom: 12, width: 372, background: "rgba(16,18,24,0.97)", border: "1px solid #262B38", borderRadius: 12, zIndex: 50, display: "flex", flexDirection: "column", overflow: "hidden", backdropFilter: "blur(8px)" },
  head: { display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid #262B38", flexShrink: 0 },
  title: { fontSize: 13, fontWeight: 700, color: "#fff", flex: 1 },
  close: { background: "none", border: "none", color: "#8A93A8", cursor: "pointer", fontSize: 16, padding: 4 },
  tabs: { display: "flex", gap: 6, padding: "10px 14px 8px", flexShrink: 0 },
  tab: (on) => ({ flex: 1, padding: "6px 0", fontSize: 11.5, fontWeight: 700, borderRadius: 7, border: "1px solid " + (on ? "#38BDF8" : "#2A3040"), background: on ? "rgba(56,189,248,0.14)" : "transparent", color: on ? "#7DD3FC" : "#8A93A8", cursor: "pointer" }),
  search: { margin: "0 14px 8px", padding: "7px 10px", fontSize: 12, background: "#0C0F15", border: "1px solid #2A3040", borderRadius: 7, color: "#E8EBF2", outline: "none", flexShrink: 0 },
  body: { flex: 1, overflowY: "auto", padding: "2px 14px 14px" },
  sec: { fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#5C6577", margin: "12px 0 6px" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  cell: { background: "#0C0F15", border: "1px solid #232936", borderRadius: 9, padding: 6, cursor: "pointer", textAlign: "center" },
  label: { fontSize: 10.5, color: "#AAB3C5", marginTop: 4, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  chipRow: { display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: "1px solid #1B2030" },
  swatch: (c) => ({ width: 14, height: 14, borderRadius: 4, background: c, flexShrink: 0, border: "1px solid rgba(255,255,255,0.25)", cursor: "pointer" }),
  num: { width: 52, padding: "3px 5px", fontSize: 10.5, background: "#0C0F15", border: "1px solid #2A3040", borderRadius: 5, color: "#E8EBF2", outline: "none" },
  insert: { margin: "10px 14px 14px", padding: "9px 0", fontSize: 12.5, fontWeight: 800, borderRadius: 8, border: "none", background: "linear-gradient(135deg,#38BDF8,#818CF8)", color: "#fff", cursor: "pointer", flexShrink: 0 },
  hint: { fontSize: 10.5, color: "#5C6577", padding: "0 14px 10px", flexShrink: 0 },
};

/* live CSS-trace thumb for a single country — cheap enough for 239 of them */
function CountryThumb({ cc }) {
  const m = MAPS[cc];
  if (!m) return null;
  const a = Math.min(4, Math.max(0.18, m.aspect));
  const cw = a >= 1 ? 100 : 100 * a, ch = a >= 1 ? 100 / a : 100;
  const w = 150, h = Math.max(46, Math.min(110, (w * ch) / cw));
  return (
    <svg width={w} height={h} viewBox={`-6 -6 ${cw + 12} ${ch + 12}`} style={{ display: "block", margin: "0 auto" }}>
      <style>{`@keyframes mzT{0%{stroke-dashoffset:100}42%,100%{stroke-dashoffset:0}}@keyframes mzF{0%,30%{fill-opacity:0}55%,100%{fill-opacity:.5}}`}</style>
      <path d={ringsToPath(m.rings)} fill="#22304A" stroke="none" style={{ animation: "mzF 4.4s ease-in-out infinite" }} />
      <path d={ringsToPath(m.rings)} fill="none" stroke="#00E5FF" strokeWidth={2.2} pathLength={100} strokeDasharray={100} strokeLinejoin="round" strokeLinecap="round" style={{ animation: "mzT 4.4s ease-in-out infinite" }} />
    </svg>
  );
}

/* live StageObject thumb (continent/world preview incl. composed highlights) */
function LiveThumb({ obj, time, hgt }) {
  return (
    <div style={{ position: "relative", width: "100%", height: hgt, overflow: "hidden", pointerEvents: "none" }}>
      <StageObject obj={obj} time={time % 4600} stage={{ w: 1280, h: 720 }} selected={false} interactive={false} />
    </div>
  );
}

const newProps = {
  map: (cc) => ({ country: cc, stroke: "#00E5FF", fillC: "#22304A", fillOp: 0.5, strokeW: 1.6, start: 200, dur: 1800, w: 420 }),
  continent: (name, hi) => ({ continent: name, base: "#26304A", baseOp: 0.9, stroke: "#3D4A6E", strokeW: 0.8, revealDur: 500, hi, legend: true, w: 620 }),
  world: (hi) => ({ base: "#1E2637", baseOp: 1, stroke: "#33405E", strokeW: 0.7, revealDur: 600, hi, legend: true, w: 780 }),
};

export default function MapsPanel({ addObject, setMapsOpen }) {
  const [tab, setTab] = useState("continents");
  const [q, setQ] = useState("");
  const [base, setBase] = useState("WORLD"); /* "WORLD" or a continent key — the composer target */
  const [hi, setHi] = useState([]);
  const now = usePreviewTime();

  const countryGroups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const groups = {};
    for (const { cc, n } of WORLD_LIST) {
      if (needle && !n.toLowerCase().includes(needle) && !cc.toLowerCase().includes(needle)) continue;
      const cont = COUNTRIES[cc] ? COUNTRIES[cc].c : "??";
      (groups[cont] = groups[cont] || []).push({ cc, n });
    }
    return Object.keys(CONTINENT_NAMES)
      .map((name) => ({ name, items: groups[CONT_TO_CODE[name]] || [] }))
      .filter((g) => g.items.length);
  }, [q]);

  const composerList = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pool = base === "WORLD" ? WORLD_LIST : WORLD_LIST.filter(({ cc }) => (CONTINENTS[base] || []).includes(cc));
    return pool.filter(({ cc, n }) => !hi.some((x) => x.cc === cc) && (!needle || n.toLowerCase().includes(needle) || cc.toLowerCase().includes(needle))).slice(0, 8);
  }, [q, base, hi]);

  const addHi = (cc) => {
    const i = hi.length;
    setHi([...hi, { cc, color: HI_PALETTE[i % HI_PALETTE.length], t: i * 700, out: i * 700 + 2400 }]);
  };
  const setHiField = (i, f, v) => setHi(hi.map((x, j) => (j === i ? { ...x, [f]: v } : x)));
  const composerHi = hi.map((x) => ({ id: x.cc, color: x.color, inT: +x.t || 0, outT: +x.out || 0 }));
  const isWorld = base === "WORLD";
  const previewObj = {
    id: "map-preview", type: isWorld ? "world" : "continent", name: "preview", tracks: {}, locked: false, hidden: false,
    props: { x: 172, y: isWorld ? 92 : 98, scale: 1, rotation: 0, opacity: 1, inT: 0, outT: null, path: null, prog: 0, ...(isWorld ? newProps.world(composerHi) : newProps.continent(base, composerHi)), w: isWorld ? 330 : 300 },
  };
  const insert = () => {
    if (isWorld) addObject("world", { name: "World map", props: newProps.world(composerHi) });
    else addObject("continent", { name: `${CONTINENT_NAMES[base]} map`, props: newProps.continent(base, composerHi) });
    setMapsOpen(false);
  };

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <div style={S.title}>Maps</div>
        <button style={S.close} onClick={() => setMapsOpen(false)}>✕</button>
      </div>
      <div style={S.tabs}>
        {[["continents", "Continents"], ["countries", "Countries"], ["world", "World"]].map(([k, l]) => (
          <button key={k} style={S.tab(tab === k)} onClick={() => { setTab(k); setQ(""); if (k === "world") setBase("WORLD"); }}>{l}</button>
        ))}
      </div>

      {tab === "countries" && (
        <>
          <input style={S.search} placeholder={`Search ${WORLD_LIST.length} countries…`} value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={S.body}>
            {countryGroups.map((g) => (
              <div key={g.name}>
                <div style={S.sec}>{CONTINENT_NAMES[g.name]} · {g.items.length}</div>
                <div style={S.grid}>
                  {g.items.map(({ cc, n }) => (
                    <div key={cc} style={S.cell} title={`Insert ${n} map`} onClick={() => { addObject("map", { name: `${n} map`, props: newProps.map(cc) }); setMapsOpen(false); }}>
                      <CountryThumb cc={cc} />
                      <div style={S.label}>{n}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!countryGroups.length && <div style={{ ...S.hint, padding: "18px 0" }}>No countries match “{q}”.</div>}
          </div>
        </>
      )}

      {tab === "continents" && (
        <div style={S.body}>
          <div style={S.sec}>7 continents · true country unions</div>
          <div style={S.grid}>
            {Object.keys(CONTINENTS).map((name) => (
              <div key={name} style={S.cell} title={`Compose ${CONTINENT_NAMES[name]} map`} onClick={() => { setBase(name); setTab("world"); }}>
                <LiveThumb hgt={104} time={now} obj={{ id: "pt" + name, type: "continent", name: "p", tracks: {}, locked: false, hidden: false, props: { x: 172, y: 60, scale: 1, rotation: 0, opacity: 1, inT: 0, outT: null, path: null, prog: 0, ...newProps.continent(name, []), w: 320 } }} />
                <div style={S.label}>{CONTINENT_NAMES[name]} · {CONTINENTS[name].length}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "world" && (
        <>
          <div style={S.body}>
            <div style={S.sec}>{isWorld ? "World map" : `${CONTINENT_NAMES[base]} map`} · live preview</div>
            <div style={{ background: "#0C0F15", border: "1px solid #232936", borderRadius: 9, padding: 6 }}>
              <LiveThumb hgt={isWorld ? 178 : 188} time={now} obj={previewObj} />
            </div>
            {!isWorld && (
              <button style={{ ...S.tab(true), width: "100%", marginTop: 6 }} onClick={() => setBase("WORLD")}>← switch to the whole world</button>
            )}
            {isWorld && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {Object.keys(CONTINENTS).map((name) => (
                  <button key={name} style={{ ...S.tab(false), flex: "0 0 auto", padding: "4px 8px", fontSize: 10 }} onClick={() => setBase(name)}>{CONTINENT_NAMES[name]}</button>
                ))}
              </div>
            )}
            <div style={S.sec}>Timed highlights · {hi.length}</div>
            {hi.map((x, i) => {
              const nm = (WORLD_LIST.find((w) => w.cc === x.cc) || {}).n || x.cc;
              return (
                <div key={x.cc} style={S.chipRow}>
                  <div style={S.swatch(x.color)} title="Cycle color" onClick={() => setHiField(i, "color", HI_PALETTE[(HI_PALETTE.indexOf(x.color) + 1 + HI_PALETTE.length) % HI_PALETTE.length])} />
                  <div style={{ flex: 1, fontSize: 11, color: "#E8EBF2", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nm}</div>
                  <input style={S.num} type="number" min={0} step={100} value={x.t} title="appears (ms)" onChange={(e) => setHiField(i, "t", e.target.value)} />
                  <span style={{ fontSize: 9.5, color: "#5C6577" }}>→</span>
                  <input style={S.num} type="number" min={0} step={100} value={x.out} title="hides (ms)" onChange={(e) => setHiField(i, "out", e.target.value)} />
                  <button style={{ ...S.close, fontSize: 12 }} onClick={() => setHi(hi.filter((_, j) => j !== i))}>✕</button>
                </div>
              );
            })}
            <input style={{ ...S.search, margin: "8px 0 4px" }} placeholder={`Add a ${isWorld ? "country" : CONTINENT_NAMES[base] + " country"}…`} value={q} onChange={(e) => setQ(e.target.value)} />
            {composerList.map(({ cc, n }) => (
              <div key={cc} style={{ ...S.chipRow, cursor: "pointer" }} onClick={() => addHi(cc)}>
                <div style={S.swatch(HI_PALETTE[hi.length % HI_PALETTE.length])} />
                <div style={{ flex: 1, fontSize: 11, color: "#AAB3C5" }}>{n}</div>
                <div style={{ fontSize: 10, color: "#38BDF8", fontWeight: 700 }}>+ add</div>
              </div>
            ))}
            <div style={{ ...S.hint, padding: "8px 0 0" }}>Each highlight pops in at its appear time and pops out at its hide time — the legend (swatch + name) rides on the map, and both times stay editable on the timeline / in the Inspector after insert.</div>
          </div>
          <button style={S.insert} onClick={insert}>Insert {isWorld ? "world map" : `${CONTINENT_NAMES[base]} map`}{hi.length ? ` · ${hi.length} highlight${hi.length > 1 ? "s" : ""}` : ""}</button>
        </>
      )}
    </div>
  );
}

const CONT_TO_CODE = { AFRICA: "AF", ASIA: "AS", EUROPE: "EU", "NORTH AMERICA": "NA", "SOUTH AMERICA": "SA", OCEANIA: "OC", ANTARCTICA: "AN" };
