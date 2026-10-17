// Image generation via GPT Image Flare, with content-addressed caching,
// bounded concurrency, and retry/backoff. Parallel-friendly by design.
import { image, MODELS } from './openai.mjs';
import { createLimiter, withRetry } from './queue.mjs';
import { hashKey, hasBlob, putBlob, blobUrl, blobPath } from './store.mjs';
import fs from 'fs';

const limit = createLimiter(Number(process.env.IMAGE_CONCURRENCY || 4));

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
