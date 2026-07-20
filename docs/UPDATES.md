# Life of Updates — planned features & ideas

A living backlog of things we *want* to build, with enough thinking captured that
any agent/dev can pick one up. This is the forward-looking companion to
[CHANGELOG.md](../CHANGELOG.md) (what shipped) and [ROADMAP.md](../ROADMAP.md)
(the enterprise-hardening plan).

Status legend: 💡 idea · 🔬 spike/prototype · 🛠️ in progress · ✅ shipped

---

## 💡 AI Asset Studio — "upload a photo → get an animated asset"

**The ask:** the user uploads a photo (or image/GIF), the AI analyzes what it is,
generates an *animated* asset that matches it, shows a live preview, lets the user
**chat to refine it**, and then **saves it to their library** as a reusable,
insertable asset.

**Verdict: feasible**, and a strong fit — the app already has the asset library,
the one deterministic renderer (`StageObject`), per-user settings persistence, and
(in this environment) the Magnific MCP generation tools.

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
2. **Analyze** — vision model returns `{ subject, style, colors, parts[], suggested
   motion, route: "A"|"B" }`.
3. **Generate** —
   - Route A: LLM emits a validated motion-spec JSON → new `engine/aiRecipe.js`
     builder → a clip. (Spec must be schema-validated + clamped, like the
     settings sanitizer, so a bad model output can never crash the renderer.)
   - Route B: call the generator (`images_to_svg` / `video_generate` /
     `models3d_generate`), then a bake step → frame sequence stored as an asset.
4. **Preview** — render the clip with the existing `StageObject` preview (no new
   renderer). Loop it.
5. **Chat to refine** — a conversational loop: user says "slower, make it wave,
   red not blue" → re-emit/patch the spec (Route A) or re-prompt the generator
   (Route B) → re-preview. Keep the last N specs for undo.
6. **Save to library** — persist as a reusable asset. Needs a new library
   category ("My AI assets") + a builder that reconstructs the clip from the
   saved spec/frames. Server: extend `user_settings` or add an `ai_assets` table
   (owner-scoped, JSON spec + optional baked-frame asset ids).

### Build order (each phase is shippable)
- **Phase 1 (spike, 🔬):** Route A only. One prompt: image → motion-spec JSON →
  clip → preview. No chat, no save. Proves the spec→render pipeline + determinism.
- **Phase 2:** chat refinement loop + spec undo/history.
- **Phase 3:** save to library + insert from library + a guard suite
  (`check-ai-recipe.mjs`: spec validation, deterministic render, seamless loop —
  same bar the emoji/kits checks meet).
- **Phase 4:** Route B (bake-to-frames) for rich subjects; the analyzer chooses A
  vs B; frame-asset storage + export inlining.

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
- **Where the AI runs** — a server route calling the model API (keeps keys
  server-side), streaming progress to the editor. New additive routes only.

### Rough pointers
- Engine: new `client/src/engine/aiRecipe.js` (Route A builder, mirrors
  `emoji.js`); frame-asset play path reuses the image layer.
- Server: `server/ai/` — analyze + generate + bake endpoints (owner-auth'd,
  rate-limited); optional/degrading like the `hyperframes` pattern so the app
  still runs without an API key.
- UI: a new rail panel "AI Studio" (upload → preview → chat → save).

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
