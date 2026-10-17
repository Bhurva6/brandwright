// Image generation via GPT Image Flare, with content-addressed caching,
// bounded concurrency, and retry/backoff. Parallel-friendly by design.
import { toFile } from 'openai';
import { image, MODELS } from './openai.mjs';
import { createLimiter, withRetry } from './queue.mjs';
import { hashKey, hasBlob, putBlob, blobUrl, blobPath } from './store.mjs';
import fs from 'fs';

const limit = createLimiter(Number(process.env.IMAGE_CONCURRENCY || 4));

/** Load the bytes behind an image layer's src — data URL or local blob path. */
export function readImageSource(src) {
  if (typeof src !== 'string') throw new Error('no image source');
  if (src.startsWith('data:')) return Buffer.from(src.split(',')[1], 'base64');
  if (src.startsWith('/assets/blobs/')) {
    const hash = src.split('/').pop().replace(/\.png$/, '');
    return fs.readFileSync(blobPath(hash));
  }
  throw new Error('unsupported image source');
}

/** Cut the subject out onto a transparent background via the image-edit API. */
export async function removeBackground(src) {
  const buf = readImageSource(src);
  const file = await toFile(buf, 'layer.png', { type: 'image/png' });
  const call = (model) => image.images.edit({
    model,
    image: file,
    prompt: 'Isolate the main subject perfectly and remove the background completely. Output ONLY the subject on a fully transparent background. Do not alter the subject.',
    background: 'transparent',
    size: '1024x1024',
  });
  let r;
  try {
    r = await withRetry(() => call(MODELS.image), { tries: 2 });
  } catch {
    r = await withRetry(() => call('gpt-image-1'), { tries: 2 }); // older edit-capable fallback
  }
  const d = r.data[0];
  const out = d.b64_json ? Buffer.from(d.b64_json, 'base64') : Buffer.from(await (await fetch(d.url)).arrayBuffer());
  return 'data:image/png;base64,' + out.toString('base64');
}

// Flare supports 1024x1024, 1024x1536, 1536x1024. Map any canvas to the nearest.
export function sizeForCanvas(w, h) {
  const r = w / h;
  if (r > 1.2) return '1536x1024';
  if (r < 0.83) return '1024x1536';
  return '1024x1024';
}

/** Returns { url, hash, cached, recipe }. Cache hit is instant. */
export async function generateImage({ prompt, size = '1024x1024', model = MODELS.image }) {
  // Images are backgrounds/photography only — never let the model render text,
  // which it does badly. All real copy comes from the design's text layers.
  const cleanPrompt = `${prompt}. Clean, clear, high-quality advertising photography/illustration. Absolutely no text, no words, no letters, no numbers, no logos, no watermarks, no captions, no signage.`;
  const recipe = { model, prompt: cleanPrompt, size };
  const hash = hashKey(recipe);
  if (hasBlob(hash)) {
    const url = process.env.VERCEL
      ? 'data:image/png;base64,' + fs.readFileSync(blobPath(hash)).toString('base64')
      : blobUrl(hash);
    return { url, hash, cached: true, recipe: { ...recipe, assetHash: hash } };
  }

  const buf = await limit(() => withRetry(async () => {
    const r = await image.images.generate({ model, prompt: cleanPrompt, size });
    const d = r.data[0];
    if (d.b64_json) return Buffer.from(d.b64_json, 'base64');
    if (d.url) {
      const res = await fetch(d.url);
      return Buffer.from(await res.arrayBuffer());
    }
    throw new Error('image response had no data');
  }));

  // Hosted (Vercel): functions are stateless, so a /assets/blobs path written by
  // one invocation may not exist for the next. Inline the image as a data URL.
  if (process.env.VERCEL) {
    try { putBlob(hash, buf); } catch { /* ephemeral best-effort */ }
    const dataUrl = 'data:image/png;base64,' + buf.toString('base64');
    return { url: dataUrl, hash, cached: false, recipe: { ...recipe, assetHash: hash } };
  }

  putBlob(hash, buf);
  return { url: blobUrl(hash), hash, cached: false, recipe: { ...recipe, assetHash: hash } };
}
