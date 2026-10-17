# ❋ Brandwright

**Version control for brand design.** An agentic image editor that learns any brand's
DNA, composes editable on-brand ads, critiques and improves its own work, and tracks
every change — human or agent — as commits in one shared history.

Built for the GetCrux AI Hackathon (Agentic Image Editor challenge).

## The idea in one diagram

```
brand folder ──ingest──▶ BRAND GENOME ──grounds──▶ GENERATOR agent (DeepSeek-V4-Pro)
   (any brand)           palette·assets·fonts·        │ emits DesignSpec (structured IR)
                         voice·rules·archetypes       ▼
                              ▲                  DESIGN REPO ◀──commits── Designer (canvas edits)
                              │ learns           commit DAG: branches = variations,
                   preference signals            semantic diff, checkout, re-skin
                   (accept·edit·revert)               │ every commit
                                                      ▼
                                                 CRITIC agent (DeepSeek-Flash)
                                                 WCAG/geometry checks + LLM judge
                                                 R = Σ wᵢ·scoreᵢ → auto-fix loop
```

## Why it's agentic

The copilot takes a *goal* ("create 4 like this", "make it angrier") and runs
**perceive → plan → act → observe → self-correct**: it reads the genome + canvas +
history, plans layout and copy, calls tools (generate imagery, add/edit layers),
the critic scores the result against brand rules, and it commits fixes until the
reward clears threshold. Two agents (generator + critic) converse through commits.

## The core moves

- **DesignSpec as an IR.** The agent never draws pixels — it emits structured layers
  (`shared/types.ts`), a renderer draws them. Everything stays editable, diffable,
  and brand-constrained *by construction* (colours/fonts/logos only from the genome).
- **Git for design.** Every change is a commit; "4 variations" = 4 branches; diffs are
  semantic ("headline ✎ · ink→blue · +charm"); any version restores; **re-skin** =
  rebase a design onto a different brand's genome.
- **Brand genome auto-ingest.** Point it at any asset folder: assets are classified
  and optimized (`server/lib/ingest.mjs`), the exact palette is sampled, and DeepSeek
  infers fonts/voice/rules/example briefs (`server/lib/infer.mjs`). Xero ships
  pre-ingested; Coca-Cola, Spotify, Headspace and Airbnb are bundled (official marks).
- **Performance Lens + Brand CI.** A hybrid reward: deterministic checks (WCAG
  contrast, overlap geometry, palette ΔE, logo count) + an LLM judge (hook, CTA,
  thumb-stop, hierarchy, voice). Every generation is scored; auto-fix runs
  critique → repair → re-critique and shows the reward climbing.
- **Self-learning.** Human edits stream as preference signals; a correction repeated
  3× induces an explicit genome rule (visible, versioned). The reward weights live in
  the genome, so taste is tunable per brand.
- **Reproducibility.** Every render is content-addressed (`server/lib/store.mjs`);
  a liked image is pinned forever; re-rolls are per-layer with kept candidate takes.

## Features

Create (N variations = N branches) · editable canvas (drag/resize/retype/recolor/
reorder/delete, brand-swatch enforced) · conversational edit · per-layer image
re-roll with candidates · version history with authorship + semantic diff + restore ·
Performance Lens scores + insights · auto-fix · creative-fatigue refresh ·
reference remix (per-brand reference libraries; structure transfer) · re-skin to any
brand · multi-placement adapt + launch-pack export (zip: all sizes + copy sheet +
compliance report) · live brand ingest · brand-adaptive UI chrome.

## Run it

```bash
cp server/.env.example server/.env   # fill in the hackathon keys
npm install && npm --prefix server install && npm --prefix client install
npm run dev                          # server :8787 + client :5173
```

## Stack

React + Vite + TS + Zustand (client) · Node + Express (server, holds all keys,
429-aware queue + retry, content-addressed blob cache) · DeepSeek-V4-Pro (generator,
native tool-calling) · DeepSeek-V4.1-Flash (critic/ingest inference) ·
GPT Image Flare `gpt-image-2.5-flare` (imagery, always text-free).

## Repo map

```
shared/types.ts        the contract: DesignSpec IR, BrandKit genome, commits, diffs
server/lib/agent.mjs   generator agent: genome→system prompt, tool-forced emission
server/lib/critic.mjs  hybrid reward: deterministic checks + LLM judge, repair loop
server/lib/ingest.mjs  asset classification/optimization + palette sampling
server/lib/infer.mjs   genome semantics inference (fonts/voice/rules/briefs)
server/lib/image.mjs   Flare generation: cache, queue, retry, size mapping
server/lib/spec.mjs    normalizer: tokens→hex, asset binding, valid-by-construction
server/index.js        API: generate(SSE) edit critic autofix refresh remix adapt
                       reskin ingest learn image
client/src/vc.ts       the version engine: commit DAG, branches, semantic diff
client/src/store.ts    app state: repo, working tree, scores, learning signals
client/src/Editor.tsx  canvas editing, lens, history, re-skin, pack export
client/src/Layers.tsx  spec renderer (auto-fit text, recolorable blooms, wordmarks)
```
