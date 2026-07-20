# Life of Updates — planned features & ideas

A living backlog of things we *want* to build, with enough thinking captured that
any agent/dev can pick one up. This is the forward-looking companion to
[CHANGELOG.md](../CHANGELOG.md) (what shipped) and [ROADMAP.md](../ROADMAP.md)
(the enterprise-hardening plan).

Status legend: 💡 idea · 🔬 spike/prototype · 🛠️ in progress · ✅ shipped

---

## 🛠️ Fixes & polish (near-term, actionable)

These are concrete bugs/regressions and standardizations to do soon (each ships
independently, each needs its guard updated in the same change).

1. **Drop the "re-arm Animate" nudge.** The R10 disarm-nudge banner
   (`.gd-disarm-nudge` + raise sites in `onBarDown`/rotate/clip-scale) is not
   wanted — the user just toggles Animate on/off themselves. Remove the banner,
   the `gdNudgeIn` animation, and the raise/settle logic; keep the arm toggle.
   Update the `check-r10` disarm-nudge assertions accordingly.

2. **Emojis on canvas behave erratically + can't resize.** Dig into the insert
   path: emoji currently insert as a **100×100 grouped clip** (`f813ee2`), and a
   clip resizes differently from a normal object (it scales children / the frame
   math differs), which is likely why the grips feel out of control and the
   resize doesn't take. **Fix for all cases:** make an emoji behave like every
   other object on resize — strongest option is to insert it as a **plain image
   object** (direct `w`/`h` resize) at a standard default size, not a grouped
   clip; if it must stay a clip, make clip resize map to a uniform scale that the
   grips drive predictably. Verify with a browser resize test.

3. **Standard default placement size.** Everything dropped on the canvas should
   start at a consistent size — **100×100** (or 150×150; pick one and make it the
   standard). Applies to shapes (currently ~190×190), emoji, etc. Centralize the
   default so every insert path uses it.

4. **Duration changes must NOT stretch existing timings.** If a comp starts at 5s
   and is later extended to 20s, every object keeps the exact `inT`/`outT` it was
   designed with (no time-stretch). Same for **scenes/clips**: a clip set to 8s
   stays 8s even when the parent/main timeline grows to 20s — its length is its
   own, independent of the main duration. Audit `setCtxDurMs` / the
   `stretchClips` path and the clip-duration logic; extending duration should
   only add empty room, never rescale keyframes/spans. **Fable 5 confirmed the
   exact bug:** `stretchClips` defaults **true** (`GraphicDestinationMotion.jsx`
   ~`:422`); the duration input passes it through (`Timeline.jsx` ~`:281`) →
   `setCtxDurMs` runs `scaleLayerTimes(o, nd/compDur)` over every object,
   multiplying all keyframe/`inT`/`outT`/clip-`start`/clip-`dur` by the factor
   (×4 for 5s→20s). Fix = pin the extend path (call `setCtxDurMs(v)` WITHOUT the
   flag) + flip the checkbox default to false. Nested clip `dur` is already its
   own field — pinning keeps scene lengths independent.

5. **Shape morph — VERIFY-ONLY (re-diagnosed by the Fable 5 review).** The morph
   UI is actually **intact and wired** — Inspector Shape card + dedicated Morph
   card (A→B chip, live preview, target picker `data-morph-picker`, clear-morph)
   are all present (`Inspector.jsx` ~452–517), guarded by `check-r9w2` (340).
   Nothing was dropped. The real issue is **discoverability**: the controls only
   appear when a **shape** is selected (only a shape can morph — not emoji/image/
   kit). Action: browser-verify (select a shape → morph card shows), and maybe
   add a one-line "select a shape to morph" hint. Likely **zero code change** —
   lowest priority.

6. **Group/ungroup as inline icons + real nesting (3 levels).** Grouping exists
   (⌘G / Inspector / timeline / right-click) but it's tucked into buttons. Put
   **small group + ungroup icons right at the layers section** (e.g. at the top
   of the timeline lane list / beside the selection), always visible and acting
   on the current selection — one glyph to group, one to ungroup, no hunting.
   Support **nested groups up to 3 levels deep** (a group inside a group inside a
   group): the clip system already nests (`groupSelection` makes a clip; grouping
   a selection that includes a clip should nest it), so verify 3-level nesting
   works end-to-end (create, enter/exit each level, ungroup one level at a time,
   render + export). Show the current nesting level in the lane label / crumb so
   the user always knows how deep they are.

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

## 💡 Editable Templates (admin can edit existing + add new)

**The ask:** the built-in templates shouldn't be frozen in code — an **admin
should be able to edit existing templates and add new ones** through the app,
and have those changes show up for everyone. (Pairs with the AI Asset Studio's
"Save to Templates" — same store, different scope.)

**Verdict: feasible and natural** — a template is *already just a project JSON*
(the editor produces and consumes that shape via the `initialProject` / `onChange`
cloud seam), so "edit a template" = load its JSON into the editor, change it,
save it back. No new renderer, no new format.

### Shape of it
- **Templates become data, not only code.** `templates.js` stays as the seed /
  built-in fallback (back-compat — old projects + a fresh DB still work). A server
  store overlays editable ones on top.
- **Three scopes, merged in the Templates panel:**
  1. **built-in** — from `templates.js` (read-only baseline)
  2. **global** — admin-authored/edited, visible to all users
  3. **personal** — a user's own saved templates (from the AI Studio)
  An admin editing a built-in one saves a **global override** with the same id;
  the panel prefers global > built-in so nothing in code is mutated.
- **Editing flow:** open a template → it loads into the normal editor → edit →
  **"Save as template"** (admin → global scope; user → personal). Optionally an
  admin "Templates" manager (list / rename / recategorize / delete / reorder /
  set thumbnail).
- **Role gate:** global create/edit/delete requires `role === "admin"` (the
  `users` table already has `role`; `requireAuth` + a role check on the routes).

### Server (additive)
- `templates` table: `id, scope ("global"|"user"), owner_id?, name, category,
  data JSON, thumbnail?, updated_at`. Owner-scoped for user rows; admin-only
  writes for global rows.
- Routes: `GET /api/templates` (built-in-merged list for the current user),
  `POST/PUT/DELETE /api/templates[/:id]` (scope + role enforced), validated +
  size-capped like `user_settings`.
- Thumbnails: reuse the SSR hold-frame approach the panels already use, or store
  a small rendered still.

### Risks / notes
- **Back-compat:** never delete or hard-edit `templates.js` entries (projects and
  the seed rely on them); overlays only.
- **Validation:** incoming template JSON is untrusted — sanitize/clamp like the
  settings sanitizer; it must round-trip through `StageObject` + the export checks.
- **Determinism:** a saved template is a normal project, so it inherits the same
  deterministic-render guarantees; add a check that every stored template renders
  non-empty + exports clean.

---

## 💡 Uploads — one unified, organized assets hub

**The ask:** stop scattering media across separate rail panels. Have **one
"Uploads" section** where the user uploads images, audio (and later video), all
**categorized inside it** — and remove the standalone Image / Audio panels.
Assets should be **project-scoped by default**, with the option to **search
across other projects' folders** when needed. Goal: less clutter, more organized.

**Verdict: feasible** — the asset API already exists (`/api/assets`, owner-scoped,
MIME allowlist, size caps, kind = image|audio). This is mostly a UI consolidation
+ a scoping/organization layer.

### Shape of it (brainstorm)
- **One rail entry "Uploads"** replacing "Image" and "Audio". Inside: tabs/filter
  chips by kind — **Images · Audio · Video** (video later) — plus an upload
  dropzone that routes by MIME to the right kind.
- **Project-scoped view by default.** Tag each asset with the project(s) it's
  used in (or a folder/project id). The Uploads hub shows **this project's
  assets** first.
- **Cross-project search.** A search box + a "search all my projects" toggle that
  queries the full owner library (the API is already owner-scoped, so this is a
  filter/endpoint param, not new auth). Results show which project each came from.
- **Folders / collections (optional):** let users group assets into named folders
  independent of projects.
- **Reuse, don't re-upload:** picking an existing asset inserts it by reference
  (`/api/assets/:id`) — no duplicate bytes.

### Server (additive)
- Extend the asset row with a `project_id?` (or a join table for many-to-many
  usage) so "this project's assets" and "used in project X" are queryable.
- `GET /api/assets?scope=project|all&kind=image|audio&q=…` — one endpoint, the
  Uploads hub drives it.

### Risks / notes
- **Back-compat:** existing assets (no project tag) still list under "all"; don't
  orphan them.
- **Don't break the share path** — token-scoped public asset serving must keep
  working (it references assets by id).
- Keep the size caps + MIME allowlist; video will need its own caps + the
  deterministic-export story (bake/seek) before it's real.

---

## 💡 Timeline: real tracks (multiple clips per track, CapCut-style)

**The ask:** a lane shouldn't be limited to a single object. Like CapCut / any NLE,
a **track** should hold **multiple components** (text, icon, image, clip…) placed
at different times, **playing one after another** as the playhead passes. Adding
something makes a new track by default, but the user can **move/resize it and drop
it onto any track, anywhere in time**.

**This evolves — and reconciles — the current model.** Today the timeline is
strictly one-object-per-row (the AE model we shipped after the "two labels in one
row was confusing" note). The confusion was really about the *label*, not about
sharing a lane. The right synthesis:
- A **TRACK = one lane with ONE name** (double-click to rename — already built).
- The track's lane holds **many clips**, each its own block with a mini
  label/thumbnail, laid out in time; they play sequentially.
- So the clean single-label look stays, AND a lane can hold multiple items.

### Shape of it
- **Explicit, persistent track assignment.** Give each object a stable `track`
  id/index (not auto-packed by time — that was the "jumping" bug). One lane per
  track; every object assigned to that track renders as a block on it.
- **Drag = 2 axes:** horizontal moves in time (already works); vertical **moves
  the clip to another track** (reassigns `track`, persisted on drop — the
  AE/CapCut reorder gesture the current build stubs out).
- **Add-to-any-track:** new items land on a new track by default but can be
  dropped onto an existing one; two clips on a track can't overlap in time
  (they queue one after another, or the drop snaps/pushes — decide the rule).
- **Overlap rule:** within a track, clips are sequential (no time overlap);
  across tracks they can overlap (stacking = z-order by track order).

### Notes / migration
- The engine already stores time spans (`inT`/`outT`, clip `start`/`dur`), so a
  track is a *lane assignment*, not a new data model — add a `track` field,
  default each existing object to its own track (identical to today's view), then
  let the user consolidate.
- Keep it deterministic + export-clean (unchanged — it's still the same objects).
- This supersedes the current `rows = ctxLayers.map(o => [o])`: rows become
  `groupBy(track)`, ordered, each lane laying its clips out by time. Update the
  timeline guards to the track model in the same change.

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
