# Brandwright — Implementation Plan

> Version control for brand design. An agentic, brand-agnostic image editor that
> satisfies the GetCrux "Agentic Image Editor" brief, then layers a git-style
> version spine, an auto-learned Brand Genome, a self-checking/self-improving
> critic loop, and image reproducibility on top.

**Status: PROTOTYPE COMPLETE** (all phases 0–9 built and verified live).
Working: create/edit/reference flows · editable canvas · version spine
(branches/diff/restore) · Performance Lens + auto-fix · learning loop ·
per-brand reference remix · re-skin · multi-placement pack export · live brand
ingest · 5 bundled genomes (Xero + Coca-Cola/Spotify/Headspace/Airbnb with
official marks) · Crux-inspired UI with motion polish.
Remaining: demo script, 30-second launch video, presentation deck.

---

## What makes it agentic (this is the point, not a footnote)

Brandwright is not a prompt-to-image box. It is an agent that takes a goal and
drives it to a finished, on-brand result through a tool-using loop, correcting
itself along the way. Version control is the substrate; agency is the behavior.

- **Goal in, not step-by-step commands.** "Create 4 different images like this"
  or "make the headline angrier and swap the logo." The agent decomposes the goal
  into concrete actions itself.
- **Perceive → plan → act → observe → self-correct.** It reads the active genome,
  the current canvas, and the version history (perceive); plans layout and copy
  (plan); calls tools to generate imagery and add/move/edit layers (act); the
  critic scores the result against brand rules (observe); it commits fixes
  targeting the weak spots and loops until the design is on-brand (correct).
- **Real tools, real actions on the canvas.** `create_design`, `make_variations`,
  `add_layer`, `edit_layer`, `generate_image`. Every action lands as an editable
  layer and a commit, so the agent's work stays reviewable and adjustable, exactly
  as the brief asks.
- **Multi-agent.** A generator agent proposes; a critic agent audits and triggers
  repair. The two converse through commits, which is the inner reinforcement loop.
- **It learns.** Across sessions it folds your accept / edit / revert signals back
  into the genome, so the agent gets better at your brand over time.

Each of the three brief modes is the same agent under a different goal: create
(goal = a brief), edit (goal = a change to the current canvas), reference (goal =
recreate this structure in our brand).

---

## Self-improvement: the learning loops

Two nested feedback loops. No model weights are trained in a hackathon; the
learning lives in a reward function, its weights, and induced brand rules, all
versioned in the genome.

- **Inner loop — reward-guided refinement (RLAIF-style).** The critic scores a
  design against the genome with a reward `R(spec) = Σ wᵢ · scoreᵢ`; the generator
  edits the lowest-scoring dimensions and re-commits. Loop until `R ≥ τ` or it
  stops improving. Each pass is a commit, so the reward curve is visible on the
  branch.
- **Outer loop — preference learning.** Accept / edit / revert are implicit
  preferences (chosen ≻ rejected, DPO-style signal without the training cost).
  They reweight the reward and, on repeat, induce explicit genome rules. The
  brand guidelines self-update and the update history is itself inspectable.
- **Transfer.** The reward is defined over abstract dimensions, so weights and
  rules learned on one brand warm-start the next.

Reward dimensions: palette fidelity (ΔE, deterministic), contrast/legibility
(WCAG, deterministic), logo clear-space & safe zones (geometry, deterministic),
layout-archetype match (hybrid), hierarchy/balance (model judge), voice/copy fit
(model judge). Deterministic terms keep it grounded; the learned weights are what
the outer loop tunes.

---

## Technical depth

The parts that make this a real system, not a wrapper around an image API.

- **DesignSpec as an IR.** The agent targets a structured intermediate
  representation; a renderer lowers it to pixels like a compiler. Pixels are never
  the source of truth, so everything stays editable, diffable, brand-constrained.
- **Semantic diff over the IR.** Layer-identity matching + field-level comparison.
- **Content-addressed assets.** Renders stored by hash, referenced from commits;
  reproducibility is structural, not luck.
- **Valid-by-construction.** Colours/fonts/logos come only from the active genome.
- **Hybrid reward model.** Deterministic metrics (ΔE, WCAG, geometry) + LLM-judge.
- **Rate-limit-aware orchestration.** Queue + backoff + cache + pre-generated demo
  assets so the shared 429 limits never stall a run.

---

## How to read this plan

- **Phases are dependency-ordered, not clock-bound.** Each phase lists its goal,
  the work, who builds it (solo vs. fanned-out workflow), how we verify it, and
  whether it is demoable at that point.
- **The spine comes first.** We get one prompt to produce an editable, on-brand
  design on the canvas before we build anything clever, so we are never polishing
  a feature on top of a broken core.
- **De-risk before depth.** Phase 0 smoke-tests both APIs. The image-gen
  reproducibility worry and the DeepSeek-vision unknown get answered before we
  design around them.
- **Everything maps back to the brief.** The core editor (create / edit /
  reference, brand rules, asset library, editable canvas) is the floor. Version
  control, genome, and the loops sit on top as the reason we stand out.

---

## Stack decisions (my calls, open to change)

- **Client:** Vite + React + TypeScript (scaffolded). State: Zustand. Canvas:
  Konva via `react-konva` (real editable layers, free, full control, exports PNG).
- **Server:** Node + Express, OpenAI SDK pointed at the provided base URLs.
  Holds all keys (never in the browser). Includes a rate-limit queue + retry for
  the shared 429s, and a content-addressed asset store.
- **Models:** DeepSeek-V4-Pro for the generator/planner; DeepSeek-V4.1-Flash for
  the high-volume critic/scoring/ingest-inference; GPT Image Flare for imagery.
- **Persistence:** repo + genome + assets persisted to disk under the server
  (JSON + files); client mirrors via API. No database needed for the prototype.
- **No real git.** The "version control" is an in-memory + on-disk DAG of
  structured specs. We borrow git's model, not its plumbing.

---

## Core data model (the one contract)

Extends the existing `shared/types.ts`:

- `DesignSpec` — canvas + ordered layers (background, image, text, logo, shape,
  bloom, charm, pill, featureList). The agent edits this; the canvas renders it.
- `BrandKit` (the Genome) — colors, fonts, presets, classified assets, rules,
  voice, and learned layout archetypes.
- `GenerationRecipe` — prompt, model, size, seed (if supported), params; stored
  on every image layer so a render is reproducible as an instruction.
- Version types:
  - `Commit { id, parents[], author: 'human'|'generator'|'critic', message, spec, ciScore, createdBy }`
  - `Branch { name, head, strategy? }`
  - `Diff { added[], removed[], changed[] }` — semantic, field-level, over the spec.
- `AssetBlob` — content-addressed (hash → file) so good renders are never lost.

---

## Phases

### Phase 0 — Pre-flight de-risk (solo)
**Goal:** prove the tools before building on them.
- Smoke-test DeepSeek-V4-Pro and V4.1-Flash: connectivity, tool-calling, JSON mode.
- Smoke-test GPT Image Flare: correct model id, sizes, latency, return format
  (b64 vs url), and whether a **seed** is honored. This answers the reproducibility
  question definitively.
- Probe DeepSeek vision: can it read an image? If not, ingest classification and
  reference mode use filename/size/shape heuristics instead.
**Verify:** a short script prints a chat completion, a tool call, and a saved
generated image. Findings recorded.
**Demoable:** no (internal).

### Phase 1 — Foundations (solo; this is the contract everything else builds on)
**Goal:** shared types final, server + client shells up, infra in place.
- Finalize `shared/types.ts` with version + recipe + score types.
- Server: Express, OpenAI clients, `.env` (gitignored), 429 queue + backoff,
  content-addressed asset store, static serving of `/brand`.
- Client: app shell/layout, Zustand store, API client.
**Verify:** `npm run dev` serves client + server; a health route returns ok;
types compile.
**Demoable:** no.

### Phase 2 — The spine: prompt → DesignSpec → editable canvas → export (fan-out)
**Goal:** the end-to-end core, demoable on its own.
- Agent loop (DeepSeek tool-calling): `create_design`, `edit_layer`, `add_layer`,
  `generate_image`, `make_variations`. System prompt built from the active genome.
- Konva renderer for every layer type; select / move / resize / edit text /
  recolor from brand swatches only / delete; export PNG.
- Chat panel wired to the agent; result renders on the canvas.
**Verify:** type "make an ad that says X" → an on-brand, editable design appears;
you can move the headline and export a PNG.
**Demoable:** yes — this alone meets the brief's create + editable-canvas asks.

### Phase 3 — Brand Genome ingest (fan-out; the headline feature)
**Goal:** point it at any brand folder and it configures itself.
- Server pipeline: sample palette → catalog + classify assets → DeepSeek infers
  fonts / rules / voice / layout archetypes → `BrandKit` JSON → copy assets to
  `/brand/<id>` + manifest.
- Pre-ingest Xero so the app opens fully loaded; ingest a second brand live to
  prove agnosticism.
- Brand editor panel to view/tweak the learned genome.
**Verify:** drop the Xero folder → a genome card appears with correct palette and
assets; generate a design that visibly uses them.
**Demoable:** yes — the "it learns any brand" moment.

### Phase 4 — Image generation + reproducibility (fan-out)
**Goal:** never lose a good render; never re-roll the whole design.
- `generate_image` → queued GPT Image Flare call → store blob by hash → record
  `GenerationRecipe` on the layer.
- Per-layer regeneration; a candidate tray that keeps N takes as siblings so you
  choose the best rather than hope.
**Verify:** generate an image layer, keep it, regenerate just that layer, switch
back to the kept one instantly.
**Demoable:** yes.

### Phase 5 — Version spine: commits, branches, diff, history (fan-out; the differentiator)
**Goal:** git, mapped onto design.
- Commit DAG of specs; branches; HEAD; checkout; revert; persisted to disk.
- `make_variations(4)` → 4 branches = 4 creative directions.
- Semantic diff over the spec (field-level add/remove/change).
- Commit-graph UI, diff view, branch switcher, variations grid.
**Verify:** ask for 4 variations → 4 branches; open the diff between two → it reads
"headline changed, ink→blue, +charm"; revert to an earlier commit.
**Demoable:** yes — the signature view.

### Phase 6 — Critic loop + Brand CI + the learning loops (fan-out)
**Goal:** provably on-brand, and self-improving.
- Critic (Flash) scores a spec vs the genome on explicit rubrics → findings + score.
- Auto-fix: generator targets the lowest dimensions → re-commit; loop to threshold
  or max iterations (inner reward-guided loop). CI status (green/red) per commit.
- Preference memory: record keep / edit / revert signals; induce learned rules
  back into the genome (outer self-learning loop), persisted and visible.
**Verify:** a deliberately off-brand design gets auto-fixed with a rising score
across commits; correcting the AI twice adds a visible new genome rule.
**Demoable:** yes — self-healing history + a brand that learns.

### Phase 7 — Modes: edit + reference-inspired (fan-out)
**Goal:** complete the brief's three modes.
- Edit mode: "talk to the canvas" — chat edits the current spec as commits.
- Reference mode: pick a reference ad → extract its layout archetype → generate
  on-brand variations in that structure.
**Verify:** "move the headline up and use the pink charm" updates the canvas; a
reference recreates in-brand.
**Demoable:** yes.

### Phase 8 — Re-skin / rebase onto another brand (fan-out; the magic trick)
**Goal:** flip a finished design onto a different brand instantly.
- Replay a spec's structure against a different genome (map tokens + assets).
**Verify:** take a Xero design, switch the active brand, watch it re-skin.
**Demoable:** yes.

### Phase 9 — UX polish + frontend-design pass (solo + targeted agents)
**Goal:** studio-grade, not a dev demo.
- Apply the frontend-design principles: deliberate type, spend boldness in one
  place (the commit graph), live compliance badge, real empty/loading/error
  states, visible 429 handling.
**Verify:** screenshots reviewed against the design principles; keyboard focus and
reduced-motion respected.
**Demoable:** yes — this is the version we record.

### Phase 10 — Demo prep (after the prototype works)
- A scripted demo flow seeded and rehearsed.
- 30-second launch video storyboard + capture.
- Presentation/deck.

---

## Scope tiers (so we always have something to show)

- **MUST (brief floor + our spine):** Phases 0–5. Create + editable canvas +
  export, genome auto-ingest, image reproducibility, variations as branches with
  semantic diff.
- **SHOULD (the win):** Phase 6 critic loop + CI + learning, Phase 7 edit +
  reference modes.
- **COULD (the flourish):** Phase 8 re-skin, second live-ingested brand, blame view.

Mapped to judging: Phases 3+4+6 drive **output quality (#1)**; Phases 5+6 are the
**system-design (#2)** story; Phases 2–8 are the **feature count (#3)**; Phase 9 is
**UI/UX (#4)**; Phase 10 is **presentation (#5)**.

---

## Locked feature add-ons (all confirmed in scope)

Each folds into the phase noted:

1. **Multi-placement resize** — one design auto-adapted to square / story / banner /
   Meta feed, safe-zone aware. New **Phase 8b**.
2. **Brand-voice copywriting** — the agent writes on-brand headlines/CTAs, not just
   layout. Folds into the agent, **Phase 2**.
3. **Accessibility / contrast in CI** — WCAG contrast + legibility on every commit.
   Folds into Brand CI, **Phase 6**.
4. **"Why it's on-brand" rationale** — the agent explains each choice. Folds into
   the critic, **Phase 6**.
5. **Reference recreation from upload** — drop any competitor ad, recreate in-brand.
   Extends reference mode, **Phase 7**.
6. **Campaign / batch mode** — N concepts × M placements in one run. New **Phase 8c**.
7. **Motion export** — a short animated ad for the launch video. **Phase 10**.

---

## Milestones (dependency order)

- **M1:** spine green — one prompt → editable on-brand design → export (Phase 2).
- **M2:** genome ingest live — any brand folder configures the app (Phase 3).
- **M3:** variations as branches + semantic diff (Phases 4–5).
- **M4:** critic loop + CI + learning loops (Phase 6).
- **M5:** edit + reference modes + re-skin (Phases 7–8).
- **M6:** polish + demo assets (Phases 9–10).

Each milestone is independently demoable, so we can stop at any point and still
have a coherent story.

---

## Risks and mitigations

- **Image-gen reproducibility** (your concern) → content-addressed blob store +
  per-layer regeneration + candidate trays. A liked render is pinned forever.
- **GPT Image Flare unknowns** (model id, seed, params) → resolved in Phase 0
  before we design around it.
- **DeepSeek vision unknown** → heuristic fallback for ingest + reference mode.
- **Shared 429 rate limits** → server queue + backoff + response cache;
  pre-generate demo imagery so the live demo never waits on the shared pool.
- **Feature breadth vs. time** → spine first, each later phase is additive and
  feature-flaggable; we can ship at any milestone.
- **Version-model complexity** → keep it an in-memory/on-disk JSON DAG, not real git.

---

## Build orchestration (ultracode)

After Phase 1 fixes the shared contract, independent modules fan out as parallel
workflow agents, each built against `shared/types.ts`:

- A: ingest pipeline (server)
- B: Konva canvas renderer + editing
- C: agent loop + server tools + image gen
- D: version/diff engine + history UI
- E: app shell + panels + styling

The critic loop, CI, modes, and re-skin layer on after the spine is green. I stay
in the loop between phases and verify each with real output before moving on.

---

## Open questions (for you / Kunal)

1. Prototype scope target: are we aiming to land through **M4** (critic + learning
   loops) for the demo, or push to **M5** (re-skin)?
2. Second brand for the agnosticism demo: ingest one live on stage, or pre-bundle one?
3. Does Kunal want the UI built against his design, or should I ship a strong
   default now that he refines later?
