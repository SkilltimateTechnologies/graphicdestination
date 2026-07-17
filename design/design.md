# GraphicDestination Motion — Design System v1.0
Brand: "GraphicDestination Motion" — browser-native motion graphics studio.
Positioning: "After Effects-grade motion design, zero install, zero render farm."
Personality: precise, cinematic, professional. CapCut/Linear-grade polish. NOT Google-material, NOT playful.

## Color System (dark-first, low saturation, warm accent)
- bg-canvas:  #0A0C10  (app background)
- bg-panel:   #10131A  (panels)
- bg-raised:  #171B24  (cards, inputs, raised surfaces)
- bg-hover:   #1E2330  (hover states)
- border:     #232936  (hairlines) / border-strong: #2E3546
- text:       #E9ECF3  (primary)
- text-dim:   #939BAD  (secondary)
- text-faint: #5D667A  (tertiary/placeholder)
- accent:     #F5A524  (amber — brand; CTAs, playhead, selected keyframes, active tools)
- accent-dim: #B87A18  (accent pressed)
- accent-soft: rgba(245,165,36,0.12) (selected backgrounds)
- success:    #3FB68B, danger: #E5636A, info: #5B8DEF
- Focus ring: 2px rgba(245,165,36,0.45) offset
- NO gradients on large surfaces. NO blue-purple gradients. Amber reserved for action/selection only.

## Typography
- UI font: "Inter", system-ui fallback. Import via Google Fonts in index.html.
- Mono/timecode: "JetBrains Mono", monospace (timeline ruler, time displays, keyframe values).
- Scale: 11px labels (uppercase, 0.06em tracking, text-faint), 12.5px body-dense (editor UI), 14px body (marketing), 20/28/40/56px headings (landing), tight tracking (-0.02em) on headings.
- Numbers in time/values: font-variant-numeric: tabular-nums.

## Shape & Depth
- Radius: 6px controls, 8px cards/panels, 10px modals.
- Shadows: none on flat panels (use 1px borders); modal shadow 0 12px 40px rgba(0,0,0,0.5).
- Panel separation: 1px border #232936, no gaps (pro tools feel dense).

## Motion (UI micro-interactions)
- Hover transitions 120ms ease-out. Panel/modal enter 160ms ease-out (opacity+translateY 4px).
- No bouncy/spring animations in UI chrome. Springs belong in user content only.

## Layout — Editor (pro NLE convention)
- Top bar (44px): brand mark + project name (editable), save status ("Saved" / "Saving…"), Export button (accent, primary CTA), user menu.
- Left rail (56px icon rail) + flyout panel (264px): Media / Text / Shapes / Layers.
- Center: stage on bg-canvas with dotted safe-margin guides, zoom controls bottom-right of stage (Fit, 50%, 100%), timecode under stage (JetBrains Mono).
- Right inspector (280px): contextual properties of selection, keyframe diamonds.
- Bottom timeline (240px, resizable): toolbar left (add track, split, delete), ruler top with playhead (accent), tracks below.
- Empty states: subtle icon + one-line guidance + accent action button. Never blank panels.

## Pages
### Landing (/)
- Sticky top nav (transparent → bg-canvas 90% blur on scroll): logo "GraphicDestination" + Motion badge, links (Features, Workflow, Pricing), Sign in, CTA "Start creating".
- Hero: eyebrow "BROWSER-NATIVE MOTION STUDIO", H1 "After Effects-grade motion graphics. In your browser.", sub: keyframes, shape morphing, text FX, instant export — no install, no render farm. Two CTAs: Start creating free (accent) / Watch it work (ghost).
- Hero visual: CSS-composed mock of the editor stage with animated shapes (pure CSS keyframes, 60fps transform/opacity only) — NOT a static screenshot.
- Feature grid (6 cards): Keyframe animation, Shape morphing, Text effects, Cloud projects, One-click export (WebM/MP4), Real-time preview. Icons: minimal 1.5px stroke SVG.
- "How it works" 3-step strip. Pricing teaser (Free / Pro placeholder). Footer minimal.
- Landing is dark (same palette), generous whitespace, max-width 1120px content column.

### Auth (/login) — combined Sign in / Sign up card
- Centered 400px card on bg-canvas with subtle radial vignette.
- Tabs or toggle: "Sign in" | "Create account". Sign up: username + password + confirm.
- Brand mark above card. Error states inline (danger text). Loading state on button.
- API contract (backend provides): POST /api/auth/signup {username, password} → sets session cookie, returns {username, role}; 409 {error:"Username is taken"}; 400 validation errors. Auto-login on success.

## Editor engine constraint
GraphicDestinationMotion.jsx contains a working engine (shapes, morphs, keyframes,
easing, FX). UI restyle MUST NOT alter: easing math, shape point sampling, keyframe
model, timeline data structures, render loop logic, project JSON schema. Presentation
(classNames, colors, layout, labels, icons) may change freely. If logic must move,
move it verbatim.

## Export UX (Export dialog)
- Triggered from top bar "Export". Modal (480px): format cards — "WebM (instant, in-browser)" recommended badge, "MP4 (server render)" beta badge.
- Options: resolution (1280×720), fps (30), quality slider. Progress bar with %, cancel button. On complete: auto-download + success toast.
