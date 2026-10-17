// Phase 0 smoke test. Answers the de-risk questions:
//  - DeepSeek chat + tool-calling + JSON mode (the agent needs these)
//  - DeepSeek vision (ingest / reference mode depend on it, else heuristics)
//  - Flash works (critic / high-volume)
//  - GPT Image Flare: correct model id, what it returns, saved to disk
import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs';

const ok = (s) => console.log('  \x1b[32m✓\x1b[0m ' + s);
const bad = (s) => console.log('  \x1b[31m✗\x1b[0m ' + s);
const head = (s) => console.log('\n\x1b[1m=== ' + s + ' ===\x1b[0m');

const pro = new OpenAI({ baseURL: process.env.DEEPSEEK_PRO_BASE_URL, apiKey: process.env.DEEPSEEK_PRO_API_KEY });
const flash = new OpenAI({ baseURL: process.env.DEEPSEEK_FLASH_BASE_URL, apiKey: process.env.DEEPSEEK_FLASH_API_KEY });
const oai = new OpenAI({ baseURL: process.env.IMAGE_BASE_URL || undefined, apiKey: process.env.OPENAI_API_KEY });

const PRO = process.env.DEEPSEEK_PRO_MODEL;
const FLASH = process.env.DEEPSEEK_FLASH_MODEL;
const IMG = process.env.IMAGE_MODEL || 'gpt-image-1';

const results = {};
async function test(key, name, fn) {
  try { const r = await fn(); ok(name + (r ? ' — ' + r : '')); results[key] = true; }
  catch (e) {
    const code = e?.status || e?.code || '';
    bad(name + ' — ' + code + ' ' + (e?.message || e));
    results[key] = false;
  }
}

head('DeepSeek-V4-Pro  ' + process.env.DEEPSEEK_PRO_BASE_URL);
await test('pro_chat', 'chat', async () => {
  const r = await pro.chat.completions.create({ model: PRO, max_tokens: 10, messages: [{ role: 'user', content: 'Reply with exactly: OK' }] });
  return JSON.stringify(r.choices[0].message.content);
});
await test('pro_tools', 'tool-calling', async () => {
  const r = await pro.chat.completions.create({
    model: PRO, max_tokens: 120, tool_choice: 'auto',
    messages: [{ role: 'user', content: 'Call make_design with title "hello".' }],
    tools: [{ type: 'function', function: { name: 'make_design', description: 'make a design', parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } } }]
  });
  const tc = r.choices[0].message.tool_calls;
  return tc?.length ? 'tool_calls=' + JSON.stringify(tc.map(t => t.function.name + '(' + t.function.arguments + ')')) : 'NO tool_calls; content=' + JSON.stringify(r.choices[0].message.content);
});
await test('pro_json', 'json mode', async () => {
  const r = await pro.chat.completions.create({ model: PRO, max_tokens: 60, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: 'Return a JSON object with key ok set to true.' }] });
  return r.choices[0].message.content;
});
await test('pro_vision', 'vision probe', async () => {
  const red = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const r = await pro.chat.completions.create({ model: PRO, max_tokens: 20, messages: [{ role: 'user', content: [{ type: 'text', text: 'What colour is this image? One word.' }, { type: 'image_url', image_url: { url: red } }] }] });
  return 'accepted image input — ' + JSON.stringify(r.choices[0].message.content);
});

head('DeepSeek-V4.1-Flash  ' + process.env.DEEPSEEK_FLASH_BASE_URL);
await test('flash_chat', 'chat', async () => {
  const r = await flash.chat.completions.create({ model: FLASH, max_tokens: 10, messages: [{ role: 'user', content: 'Reply with exactly: OK' }] });
  return JSON.stringify(r.choices[0].message.content);
});

head('GPT Image Flare  (OpenAI images)');
await test('img_models', 'list models', async () => {
  const m = await oai.models.list();
  const ids = m.data.map(x => x.id);
  const imgish = ids.filter(i => /image|flare|dall/i.test(i));
  return 'image-like: ' + JSON.stringify(imgish) + '  (total ' + ids.length + ')';
});
await test('img_gen', 'generate image (' + IMG + ')', async () => {
  const r = await oai.images.generate({ model: IMG, prompt: 'a simple flat royal-blue circle on a white background, minimal, centered', size: '1024x1024' });
  const d = r.data[0];
  if (d.b64_json) { fs.writeFileSync(new URL('./smoke_image.png', import.meta.url), Buffer.from(d.b64_json, 'base64')); }
  const kind = d.b64_json ? 'b64_json(' + d.b64_json.length + ' chars) saved smoke_image.png' : (d.url ? 'url=' + d.url : 'unknown shape: ' + JSON.stringify(Object.keys(d)));
  return 'returned ' + kind;
});

console.log('\n\x1b[1mSUMMARY\x1b[0m ' + JSON.stringify(results));
console.log('decisions:');
console.log('  agent tool-calling  -> ' + (results.pro_tools ? 'YES (native agent loop)' : 'NO (fallback: JSON-mode structured output)'));
console.log('  deepseek vision     -> ' + (results.pro_vision ? 'YES (use for ingest + reference)' : 'NO (use filename/geometry heuristics)'));
console.log('  image gen           -> ' + (results.img_gen ? 'WORKING with model "' + IMG + '"' : 'CHECK model id (see list models output)'));
