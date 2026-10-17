// Brandwright server. Robust backend: holds keys, streams generation so the
// layout lands instantly and images develop in, caches every render by hash.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { listBrands, loadBrand } from './lib/brand.mjs';
import { generateDesigns, editDesign } from './lib/agent.mjs';
import { generateImage, sizeForCanvas } from './lib/image.mjs';
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
    await fillImages(specs, (ev) => send('image', ev));
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
