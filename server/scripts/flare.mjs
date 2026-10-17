// Quick quality + latency probe for GPT Image Flare.
// Usage: node scripts/flare.mjs "<prompt>" <out.png> [model] [size]
import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs';

const oai = new OpenAI({ baseURL: process.env.IMAGE_BASE_URL || undefined, apiKey: process.env.OPENAI_API_KEY });
const prompt = process.argv[2] || 'a flat vector tech ad background, royal blue organic blob shapes on white, minimal, modern';
const out = process.argv[3] || 'flare_test.png';
const model = process.argv[4] || process.env.IMAGE_MODEL || 'gpt-image-2.5-flare';
const size = process.argv[5] || '1024x1024';

const t0 = Date.now();
try {
  const r = await oai.images.generate({ model, prompt, size });
  const ms = Date.now() - t0;
  const d = r.data[0];
  if (d.b64_json) {
    fs.writeFileSync(out, Buffer.from(d.b64_json, 'base64'));
    console.log(`OK  model=${model} size=${size}  ${ms}ms  -> ${out} (${Math.round(d.b64_json.length * 0.75 / 1024)}KB)`);
    if (d.revised_prompt) console.log('revised_prompt:', d.revised_prompt.slice(0, 200));
  } else if (d.url) {
    console.log(`OK (url) model=${model} ${ms}ms -> ${d.url}`);
  } else {
    console.log('unexpected shape:', JSON.stringify(Object.keys(d)));
  }
} catch (e) {
  console.log(`FAIL model=${model} — ${e?.status || ''} ${e?.message || e}`);
}
