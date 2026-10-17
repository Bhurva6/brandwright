// Brandwright server. Robust backend: holds keys, streams generation so the
// layout lands instantly and images develop in, caches every render by hash.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { listBrands, loadBrand, saveBrand, BRANDS_DIR } from './lib/brand.mjs';
import { ingestFolder, samplePalette } from './lib/ingest.mjs';
import { inferGenome } from './lib/infer.mjs';
import { generateDesigns, editDesign } from './lib/agent.mjs';
import { generateImage, sizeForCanvas } from './lib/image.mjs';
import { critique, repairInstruction } from './lib/critic.mjs';
import { BLOB_DIR } from './lib/store.mjs';

const app = express();
app.use(cors());
app.use(express.json({ limit: '60mb' }));
app.use('/assets/blobs', express.static(BLOB_DIR, { maxAge: '1y', immutable: true }));

app.get('/api/health', (_req, res) => res.json({ ok: true, hosted: !!process.env.VERCEL }));
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
    const { brandId = 'xero', refId, spec, n = 3, presetId } = req.body || {};
    const brand = loadBrand(brandId);
    if (!brand) return res.status(400).json({ error: 'brand required' });
    const preset = brand.presets.find((p) => p.id === presetId) || brand.presets[0];

    // structure source: a curated text description (refId) or a live spec
    let structure;
    if (refId) {
      const ref = REFS.find((r) => r.id === refId);
      if (!ref) return res.status(400).json({ error: 'unknown refId' });
      structure = `"${ref.structure}"`;
    } else if (spec) {
      const skeleton = {
        background: spec.canvas.background,
        layers: spec.layers.map((l) => {
          const W = spec.canvas.w, H = spec.canvas.h;
          const o = { type: l.type, x: +(l.box.x / W).toFixed(2), y: +(l.box.y / H).toFixed(2), w: +(l.box.w / W).toFixed(2), h: +(l.box.h / H).toFixed(2) };
          if (l.role) o.role = l.role;
          return o;
        }),
      };
      structure = 'this layout skeleton (fractional boxes): ' + JSON.stringify(skeleton);
    } else {
      return res.status(400).json({ error: 'refId or spec required' });
    }

    const prompt =
      `REFERENCE REMIX. Recreate the STRUCTURE of this reference ad for ${brand.name}, fully on-brand:\n${structure}\n` +
      `Keep the same layout skeleton and visual rhythm, but use OUR brand colours, type roles, voice and assets, with fresh on-brand copy for ${brand.name}. Produce ${n} takes: one faithful to the structure, the rest progressively freer riffs on it.`;
    const { specs } = await generateDesigns({ brand, prompt, variations: n, preset });
    await fillImages(specs);
    res.json({ specs });
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

// OUTER LEARNING LOOP — every human edit is a preference signal. When the
// designer makes the same kind of correction 3 times, DeepSeek induces an
// explicit rule and writes it back into the genome (visible + versioned).
import { flash, MODELS } from './lib/openai.mjs';
const signalKey = (m) => String(m).toLowerCase().replace(/[^a-z ]/g, '').trim().split(' ').slice(0, 3).join(' ');
app.post('/api/learn', async (req, res) => {
  try {
    const { brandId, event } = req.body || {};
    const brand = loadBrand(brandId);
    if (!brand || !event) return res.status(400).json({ error: 'brandId and event required' });
    const ledgerPath = process.env.VERCEL ? path.join('/tmp', `bw-signals-${brandId}.json`) : path.join(BRANDS_DIR, brandId, 'signals.json');
    const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : [];
    ledger.push({ event, at: Date.now() });
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger));

    const key = signalKey(event);
    const count = ledger.filter((s) => signalKey(s.event) === key).length;
    const already = (brand.learned || []).some((l) => l.key === key);
    let learnedRule = null;
    if (count >= 3 && !already) {
      const r = await flash.chat.completions.create({
        model: MODELS.flash,
        temperature: 0.3,
        max_tokens: 120,
        messages: [{
          role: 'user',
          content: `A designer working on the ${brand.name} brand repeatedly made this correction: "${event}" (${count} times). Write ONE concise brand-guideline rule (max 18 words) capturing the preference. Reply with the rule text only.`,
        }],
      });
      const text = r.choices[0].message.content?.trim().replace(/^"|"$/g, '');
      if (text) {
        brand.learned = [...(brand.learned || []), { id: 'learned-' + (brand.learned?.length || 0), key, text, origin: 'learned', confirmations: count }];
        brand.rules = [...brand.rules, { id: 'learned-' + key.replace(/ /g, '-'), text, severity: 'warn' }];
        saveBrand(brand);
        learnedRule = text;
      }
    }
    res.json({ ok: true, learnedRule, signals: ledger.length });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// LIVE BRAND INGEST — point Brandwright at any brand's asset folder and it
// configures itself: classify assets, sample the exact palette, infer fonts /
// voice / rules / briefs with DeepSeek. The new genome is immediately active.
import fs from 'fs';
import os from 'os';
app.post('/api/ingest', async (req, res) => {
  try {
    if (process.env.VERCEL) return res.status(501).json({ error: 'Brand ingest needs the local build — the hosted demo filesystem is read-only.' });
    const { name, files } = req.body || {};
    if (!name?.trim() || !Array.isArray(files) || !files.length) return res.status(400).json({ error: 'name and files required' });
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) || 'brand';

    // materialize the uploaded folder (relative paths preserved for classification)
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-ingest-'));
    for (const f of files.slice(0, 80)) {
      const rel = String(f.path || f.name).replace(/^[/.]+/, '').replace(/\.\./g, '');
      const abs = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, Buffer.from(f.data, 'base64'));
    }

    const outDir = path.join(BRANDS_DIR, id, 'assets');
    const { assets } = await ingestFolder(tmp, outDir, { brandId: id });
    const allImages = fs.readdirSync(outDir).map((f) => path.join(outDir, f));
    const palette = await samplePalette(allImages.length ? allImages : [], 6);
    const inferred = await inferGenome({ name, palette, assets });

    const kit = {
      id,
      name: name.trim(),
      colors: inferred.colors,
      fonts: inferred.fonts,
      presets: [
        { id: 'square_1080', label: 'Square 1:1', w: 1080, h: 1080 },
        { id: 'story_1080x1920', label: 'Story 9:16', w: 1080, h: 1920 },
        { id: 'meta_feed_1200x1200', label: 'Meta feed', w: 1200, h: 1200 },
        { id: 'banner_1200x628', label: 'Banner 1.91:1', w: 1200, h: 628 },
      ],
      assets: assets.length
        ? assets
        : [{ id: 'logo-00', category: 'logo', label: 'Wordmark', variant: 'ink', text: name.trim(), fontFamily: "'Archivo', sans-serif", fontWeight: 800, color: inferred.colors.find((c) => c.roles?.includes('text'))?.value || '#111111' }],
      rules: inferred.rules,
      voice: inferred.voice,
      archetypes: [
        { id: 'headline-card', label: 'Card with bold headline + CTA pill, logo bottom-left', regions: [] },
        { id: 'photo-hero', label: 'Full-bleed photo, headline top, CTA + logo bottom', regions: [] },
        { id: 'type-poster', label: 'Typographic poster on a flat brand ground', regions: [] },
      ],
      rewardWeights: { palette: 0.14, contrast: 0.18, safezone: 0.14, archetype: 0.06, hook: 0.14, cta: 0.12, thumbstop: 0.08, hierarchy: 0.07, voice: 0.07 },
      learned: [],
      examples: inferred.examples,
    };
    // guarantee a logo asset exists (text wordmark fallback)
    if (!kit.assets.some((a) => a.category === 'logo')) {
      kit.assets.unshift({ id: 'logo-00', category: 'logo', label: 'Wordmark', variant: 'ink', text: name.trim(), fontFamily: "'Archivo', sans-serif", fontWeight: 800, color: inferred.colors.find((c) => c.roles?.includes('text'))?.value || '#111111' });
    }
    saveBrand(kit);
    fs.rmSync(tmp, { recursive: true, force: true });
    res.json({ kit });
  } catch (e) {
    console.error('ingest', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Re-skin (the "rebase"): replay a design's structure onto a DIFFERENT brand.
// Same layout skeleton; colours, fonts, logo, voice and product all retarget.
app.post('/api/reskin', async (req, res) => {
  try {
    const { spec, toBrandId } = req.body || {};
    const to = loadBrand(toBrandId);
    if (!spec || !to) return res.status(400).json({ error: 'spec and toBrandId required' });
    const preset = to.presets.find((p) => p.id === spec.canvas.preset) || to.presets[0];
    const { spec: reskinned } = await editDesign({
      brand: to,
      spec,
      instruction:
        `RE-SKIN this design for the brand ${to.name}. Keep the exact same layout skeleton — same layers, same ids, same positions and sizes. ` +
        `Map every colour to the closest ${to.name} brand token, switch the logo to a ${to.name} variant, and REWRITE all copy (headlines, body, CTA, features) for ${to.name}'s product and voice. ` +
        `If there are image layers, rewrite their prompts for ${to.name}'s world (then the imagery regenerates).`,
    });
    await fillImages([reskinned]);
    res.json({ spec: reskinned });
  } catch (e) {
    console.error('reskin', e);
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

export default app;
