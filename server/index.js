// Brandwright server. Robust backend: holds keys, streams generation so the
// layout lands instantly and images develop in, caches every render by hash.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { listBrands, loadBrand } from './lib/brand.mjs';
import { generateDesigns, editDesign } from './lib/agent.mjs';
import { generateImage, sizeForCanvas } from './lib/image.mjs';
import { critique, repairInstruction } from './lib/critic.mjs';
import { BLOB_DIR } from './lib/store.mjs';

const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use('/assets/blobs', express.static(BLOB_DIR, { maxAge: '1y', immutable: true }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/brands', (_req, res) => res.json(listBrands()));
app.get('/api/brand/:id', (req, res) => {
  const kit = loadBrand(req.params.id);
  return kit ? res.json(kit) : res.status(404).json({ error: 'brand not found' });
});

// Fill every image layer across all specs in parallel; `onImage` streams each one.
async function fillImages(specs, onImage) {
  const jobs = [];
  for (const s of specs) {
    for (const l of s.layers) {
      if (l.type !== 'image' || !l.prompt) continue;
      jobs.push((async () => {
        try {
          const { url, recipe } = await generateImage({ prompt: l.prompt, size: sizeForCanvas(s.canvas.w, s.canvas.h) });
          l.src = url; l.status = 'ready'; l.recipe = recipe;
          onImage?.({ specId: s.id, layerId: l.id, src: url });
        } catch {
          l.status = 'error';
          onImage?.({ specId: s.id, layerId: l.id, error: true });
        }
      })());
    }
  }
  await Promise.all(jobs);
}

// Streaming generate: SSE events — status, specs (instant layout), image (×N), done.
app.post('/api/generate/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    const { brandId = 'xero', prompt, variations = 4, presetId } = req.body || {};
    const brand = loadBrand(brandId);
    if (!brand) { send('error', { error: 'brand not found' }); return res.end(); }
    if (!prompt?.trim()) { send('error', { error: 'prompt required' }); return res.end(); }
    const preset = brand.presets.find((p) => p.id === presetId) || brand.presets[0];

    send('status', { stage: 'thinking' });
    const { specs } = await generateDesigns({ brand, prompt, variations, preset });
    send('specs', { specs }); // layout appears immediately; image layers are pending
    // Performance Lens: critic scores stream in alongside the images
    const scoring = Promise.all(
      specs.map((s) =>
        critique(s, brand)
          .then((score) => send('score', { specId: s.id, score }))
          .catch(() => {}),
      ),
    );
    await Promise.all([fillImages(specs, (ev) => send('image', ev)), scoring]);
    send('done', {});
  } catch (e) {
    console.error('generate/stream', e);
    send('error', { error: String(e?.message || e) });
  }
  res.end();
});

// Non-streaming fallback (waits for everything).
app.post('/api/generate', async (req, res) => {
  try {
    const { brandId = 'xero', prompt, variations = 4, presetId } = req.body || {};
    const brand = loadBrand(brandId);
    if (!brand) return res.status(404).json({ error: 'brand not found' });
    const preset = brand.presets.find((p) => p.id === presetId) || brand.presets[0];
    const { specs } = await generateDesigns({ brand, prompt, variations, preset });
    await fillImages(specs);
    res.json({ specs });
  } catch (e) {
    console.error('generate', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Conversational edit of the current design. Returns the edited spec with any
// new image layers filled (unchanged images are carried over, not regenerated).
app.post('/api/edit', async (req, res) => {
  try {
    const { brandId = 'xero', spec, instruction } = req.body || {};
    const brand = loadBrand(brandId);
    if (!brand) return res.status(404).json({ error: 'brand not found' });
    if (!spec || !instruction?.trim()) return res.status(400).json({ error: 'spec and instruction required' });
    const { spec: next } = await editDesign({ brand, spec, instruction });
    await fillImages([next]);
    res.json({ spec: next });
  } catch (e) {
    console.error('edit', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Critic on demand (editor's compliance panel).
app.post('/api/critic', async (req, res) => {
  try {
    const { brandId = 'xero', spec } = req.body || {};
    const brand = loadBrand(brandId);
    if (!brand || !spec) return res.status(400).json({ error: 'brand and spec required' });
    res.json({ score: await critique(spec, brand) });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// The inner loop: critique → repair → re-critique. Returns the improved spec
// plus before/after scores, so the UI can show the reward climbing.
app.post('/api/autofix', async (req, res) => {
  try {
    const { brandId = 'xero', spec } = req.body || {};
    const brand = loadBrand(brandId);
    if (!brand || !spec) return res.status(400).json({ error: 'brand and spec required' });
    const before = await critique(spec, brand);
    if (before.pass) return res.json({ improved: false, before, spec });
    const { spec: fixed } = await editDesign({ brand, spec, instruction: repairInstruction(before) });
    await fillImages([fixed]);
    const after = await critique(fixed, brand);
    res.json({ improved: true, before, after, spec: fixed });
  } catch (e) {
    console.error('autofix', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Creative fatigue → refresh: N fresh executions of the same concept.
app.post('/api/refresh', async (req, res) => {
  try {
    const { brandId = 'xero', spec, n = 3 } = req.body || {};
    const brand = loadBrand(brandId);
    if (!brand || !spec) return res.status(400).json({ error: 'brand and spec required' });
    const preset = brand.presets.find((p) => p.id === spec.canvas.preset) || brand.presets[0];
    const headline = spec.layers.find((l) => l.type === 'text' && l.role === 'headline')?.text || spec.name;
    const cta = spec.layers.find((l) => l.type === 'pill')?.text;
    const prompt =
      `This winning ad is fatiguing: concept "${spec.name}", headline "${headline}"${cta ? `, CTA "${cta}"` : ''}. ` +
      `Create ${n} FRESH executions of the SAME core concept and message — new layouts, new art directions, new copy angles that keep the promise intact.`;
    const { specs } = await generateDesigns({ brand, prompt, variations: n, preset });
    await fillImages(specs);
    res.json({ specs });
  } catch (e) {
    console.error('refresh', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Competitor / reference remix: recreate a reference ad's STRUCTURE in the
// active brand — the structured-spec superpower, cross-brand.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirnameX = path.dirname(fileURLToPath(import.meta.url));
const REFS = JSON.parse(readFileSync(path.join(__dirnameX, '../client/public/refs/manifest.json'), 'utf8')).refs;

app.post('/api/remix', async (req, res) => {
  try {
    const { brandId = 'xero', refId, n = 3, presetId } = req.body || {};
    const brand = loadBrand(brandId);
    const ref = REFS.find((r) => r.id === refId);
    if (!brand || !ref) return res.status(400).json({ error: 'brand and refId required' });
    const preset = brand.presets.find((p) => p.id === presetId) || brand.presets[0];
    const prompt =
      `REFERENCE REMIX. Recreate the STRUCTURE of this reference ad for ${brand.name}, fully on-brand:\n` +
      `"${ref.structure}"\n` +
      `Keep the same layout skeleton and visual rhythm, but use OUR brand colours, type roles, voice and assets, with fresh on-brand copy for ${brand.name}. Produce ${n} takes: one faithful to the structure, the rest progressively freer riffs on it.`;
    const { specs } = await generateDesigns({ brand, prompt, variations: n, preset });
    await fillImages(specs);
    res.json({ specs, ref });
  } catch (e) {
    console.error('remix', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Multi-placement adapt: re-layout one design for another canvas preset.
app.post('/api/adapt', async (req, res) => {
  try {
    const { brandId = 'xero', spec, presetId } = req.body || {};
    const brand = loadBrand(brandId);
    const preset = brand?.presets.find((p) => p.id === presetId);
    if (!brand || !spec || !preset) return res.status(400).json({ error: 'brand, spec, presetId required' });
    const resized = { ...spec, canvas: { ...spec.canvas, w: preset.w, h: preset.h, preset: preset.id } };
    const { spec: adapted } = await editDesign({
      brand,
      spec: resized,
      instruction:
        `Re-layout this exact design for a ${preset.label} canvas (${preset.w}x${preset.h}). ` +
        `Keep every piece of content, colour and imagery; rearrange and rescale the layers so the composition works natively at this aspect ratio. Keep the logo and CTA fully inside safe margins (>=4% from edges).`,
    });
    await fillImages([adapted]);
    res.json({ spec: adapted });
  } catch (e) {
    console.error('adapt', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Per-layer image (re)generation — used by the editor's re-roll + candidates.
app.post('/api/image', async (req, res) => {
  try {
    const { prompt, w = 1080, h = 1080, take } = req.body || {};
    if (!prompt?.trim()) return res.status(400).json({ error: 'prompt required' });
    // `take` varies the recipe so each re-roll is a fresh render (and its own cached blob)
    const p = take ? `${prompt} (take ${take})` : prompt;
    const { url, recipe, cached } = await generateImage({ prompt: p, size: sizeForCanvas(w, h) });
    res.json({ url, recipe, cached });
  } catch (e) {
    console.error('image', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`\n  Brandwright server → http://localhost:${PORT}\n`));
