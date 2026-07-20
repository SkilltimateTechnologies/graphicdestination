# Life of Updates — planned features & ideas

A living backlog of things we *want* to build, with enough thinking captured that
any agent/dev can pick one up. This is the forward-looking companion to
[CHANGELOG.md](../CHANGELOG.md) (what shipped) and [ROADMAP.md](../ROADMAP.md)
(the enterprise-hardening plan).

Status legend: 💡 idea · 🔬 spike/prototype · 🛠️ in progress · ✅ shipped

---

## 💡 AI Asset Studio — "upload a photo → get an animated asset"

**The ask (refined):**
- Upload a photo **and/or give design references** — the AI analyzes them and
  produces an *animated* asset that matches the reference **on point**.
- **Route A** (AI → engine recipe) is the chosen approach.
- A **dedicated Studio page** (its own route, e.g. `/studio`) to do all of this
  — not a cramped rail panel.
- **Full control of the look** — colors, parts, which parts animate, motion
  style, timing, size — with easy, direct controls (not just chat).
- Live **preview**, **chat to refine**, then **save to Templates** (so it lands
  in the Templates library and can be inserted like any built-in template).
- **Model provider: the Kimi 3 API** (Moonshot AI) for both the vision analysis
  and the recipe generation — keys server-side.

**Verdict: feasible**, and a strong fit — the app already has the Templates
system (`templates.js` + insert-as-group), the asset library, the one
deterministic renderer (`StageObject`), and per-user persistence.

### Matching a design reference "exactly" — how
Pure "the model redraws your reference in vectors and nails it" is unreliable —
it drifts. The way to get **on-point** results with Route A is to **use the
reference as the source**, not re-draw it:
- **Image-base:** the reference (or a background-removed cutout) becomes an
  IMAGE layer; the AI only decides the *motion* (pop/bob/parallax/whichever) and
  which regions move. Pixel-identical to the reference, animated. Best default.
- **Auto-vectorize:** run the reference through image→SVG (Kimi, or the Magnific
  `images_to_svg`), map paths to shape layers, then animate. Editable + close to
  the reference; good for flat/graphic art.
- **Guided redraw:** for simple geometric marks, the AI emits precise shape specs
  (positions/sizes/colors sampled from the reference). Only for simple subjects.
The Studio should let the user pick the fidelity mode (or auto-pick by subject),
so "exactly like this" is a real, controllable outcome rather than a gamble.

### The one hard constraint
Everything on a render path must stay a **pure, deterministic function of timeline
time** (AGENTS.md rule #1) so exports re-render byte-identically. So we can't just
drop a live-playing GIF/video in and call it done — whatever we generate has to
resolve to deterministic frames. Two ways to honor that:

- **Route A — AI → engine recipe (recommended default).** The AI emits a
  *structured motion spec* (JSON) that an engine builder turns into a normal clip
  of existing primitives (shapes / image layers / text + the in→hold→out motion
  grammar). Exactly how `kits.js` / `emoji.js` / `templates.js` already work.
  - ✅ Deterministic, export-perfect, editable, tiny, on-brand motion.
  - ➖ Limited to what the engine can represent. Great for logos, icons, badges,
    simple characters, "make this bounce/pulse/spin."
- **Route B — AI → real animation, baked to frames.** Use image→SVG,
  image→video, or image→3D generation, then **rasterize to a fixed frame
  sequence** (or animated WebP) that `StageObject` plays by time — the same
  bake-to-frames trick the Fluent-3D emoji use to stay deterministic.
  - ✅ Rich / photoreal results, true per-part motion.
  - ➖ Heavier assets; must bake for export; per-tool licensing to vet.
- **Route C — Hybrid (the real product).** The analyzer decides: simple/graphic
  subject → Route A; complex/photoreal → Route B. Chat refinement works on both.

### Flow (end to end)
1. **Upload** — reuse the existing asset-upload path (`POST /api/assets`, size/MIME
   caps). Store the source image.
2. **Analyze** — the **Kimi 3 vision** model reads the reference(s) and returns
   `{ subject, style, colors, parts[], suggested motion, fidelity:
   "image-base"|"vectorize"|"redraw" }`.
3. **Generate (Route A)** — **Kimi 3** emits a validated motion-spec JSON for the
   chosen fidelity mode → `engine/aiRecipe.js` builds a clip. The spec MUST be
   schema-validated + clamped (like the settings sanitizer; never `eval`, never
   unbounded loops) so bad model output can't crash the renderer. Direct UI
   controls (colors, which parts move, motion style, timing, size) patch the
   SAME spec, so "chat" and "knobs" stay in sync.
4. **Preview** — render the clip with the existing `StageObject` preview (no new
   renderer). Loop it.
5. **Chat + controls to refine** — "slower, make it wave, red not blue" (chat) or
   the direct knobs → patch the spec → re-preview. Keep the last N specs for undo.
6. **Save to Templates** — persist the finished clip as a reusable TEMPLATE (the
   `templates.js` shape: a `buildClip`/`buildProject` that reconstructs it), so it
   appears in the Templates panel and inserts as a movable group like any built-in
   template. Server: an owner-scoped `user_templates` table (JSON spec + any
   baked-frame asset ids), surfaced under "My templates".

### Build order (each phase is shippable)
- **Phase 1 (spike, 🔬):** the `/studio` page + Route A "image-base" only —
  upload reference → Kimi picks a motion → `aiRecipe.js` builds a clip →
  preview. No chat, no save. Proves the Kimi→spec→render pipeline + determinism.
- **Phase 2:** direct look/motion controls (the "control of how it looks" knobs)
  + chat refinement, both patching one spec; spec undo/history.
- **Phase 3:** **Save to Templates** + insert from the Templates panel + a guard
  suite (`check-ai-recipe.mjs`: spec validation, deterministic render, seamless
  loop — the same bar the emoji/kits checks meet).
- **Phase 4:** "vectorize" fidelity (image→SVG) for editable, close-to-reference
  results; then Route-B bake-to-frames for rich/photoreal subjects.

### Risks / open questions
- **Determinism & export** — non-negotiable; every generated asset must pass the
  frame-math/roundtrip export checks. Route B baking is the tricky part.
- **Cost / latency** — generation + vision calls are slow and metered; needs a
  job/queue model (ties into ROADMAP.md 2.7 server-render queue) and a spinner UX.
- **Spec safety** — treat model JSON as untrusted: schema-validate, clamp
  numbers, cap child count, allowlist shape types (never `eval`, never unbounded
  loops on the render path).
- **Licensing** — vet each generator's output license before it can be saved and
  reused commercially (see the Fluent-emoji MIT precedent).
- **Where the AI runs** — a server route calling the **Kimi 3 API** (Moonshot AI)
  with `KIMI_API_KEY` kept server-side, streaming progress to the Studio page.
  New additive routes only; degrade gracefully if the key is unset.

### Rough pointers
- Engine: new `client/src/engine/aiRecipe.js` (Route A builder, mirrors
  `emoji.js`) — "image-base" reuses the image layer; "vectorize" maps SVG paths
  to shape layers. The save path emits a `templates.js`-shaped builder.
- Server: `server/ai/` — Kimi-backed **analyze** + **recipe** endpoints
  (owner-auth'd, rate-limited, `KIMI_API_KEY`); optional/degrading like the
  `hyperframes` pattern so the app still runs without a key. `user_templates`
  table for saved results.
- UI: a **dedicated `/studio` page** (its own route, like `/settings`) — reference
  upload + fidelity picker + live looping preview + direct look/motion knobs +
  chat + "Save to Templates". A page, not a rail panel.
- Config: add `KIMI_API_KEY` (+ base URL/model) to `server/config.js` validation
  and `server/.env.example`.

---

## Backlog (smaller ideas)

- **Always-visible scrub ruler polish** — the pinned overlay ships; revisit if any
  edge cases appear on very long comps.
- **Vertical drag-to-reorder layers** — now that the timeline is one-row-per-layer,
  dragging a lane up/down could reorder z-order (AE-style), persisting on drop.
- **Lottie hero emoji** — a curated ~30 reactions via Lottie for pixel-perfect
  per-part motion, complementing the Fluent-3D set (ROADMAP note).
- **More Jitter-grade UI elements** — continue the Reaction Bar / Like Burst
  family (e.g., audio equalizer, notification bell, tab bar, confetti button).

<!-- add new ideas above this line; move to CHANGELOG.md when shipped -->
