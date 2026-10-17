// Genome inference: given sampled palette + asset catalog (filenames only — no
// vision), DeepSeek-Flash infers the brand's name/semantics: colour roles &
// names, font pairing (from the faces the client preloads), voice, rules,
// example briefs. The "comprehension" half of auto-ingest.
import { flash, MODELS } from './openai.mjs';
import { withRetry } from './queue.mjs';

// faces already loaded by the client — the model picks from these
const FACES = {
  headline: ['Archivo', 'Montserrat', 'Oswald', 'Baloo 2', 'DM Sans', 'Nunito Sans'],
  body: ['Inter', 'Quicksand', 'Nunito Sans', 'DM Sans'],
};

export async function inferGenome({ name, palette, assets }) {
  const fileHints = assets.slice(0, 60).map((a) => `${a.category}:${a.origName || a.label}`).join(', ');
  const r = await withRetry(() => flash.chat.completions.create({
    model: MODELS.flash,
    temperature: 0.4,
    max_tokens: 1400,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          `You configure a brand design system ("genome") from evidence. Reply ONLY JSON:\n` +
          `{"colors":[{"token":"<short>","value":"<hex from the palette>","name":"<label>","roles":["background"|"text"|"accent"|"cta"]}...4-7 items, ALWAYS include white #FFFFFF and a dark ink],` +
          `"fonts":{"headline":"<one of ${FACES.headline.join('|')}>","body":"<one of ${FACES.body.join('|')}>"},` +
          `"voice":"<2-3 sentence tone-of-voice with 2 example taglines>",` +
          `"rules":[{"id":"<slug>","text":"<concrete design rule>","severity":"error"|"warn"}...3-5],` +
          `"examples":["<ad brief>","<ad brief>","<ad brief>"]}`,
      },
      {
        role: 'user',
        content: `Brand name: ${name}\nSampled palette (hex: share): ${palette.map((p) => `${p.value}: ${p.pct}%`).join(', ')}\nAsset files: ${fileHints || 'none'}`,
      },
    ],
  }));
  const j = JSON.parse(r.choices[0].message.content);
  const headline = FACES.headline.includes(j.fonts?.headline) ? j.fonts.headline : 'Archivo';
  const body = FACES.body.includes(j.fonts?.body) ? j.fonts.body : 'Inter';
  return {
    colors: (j.colors || []).slice(0, 8),
    fonts: [
      { role: 'headline', family: headline, weights: [700, 800], stack: `'${headline}', system-ui, sans-serif` },
      { role: 'body', family: body, weights: [400, 600], stack: `'${body}', system-ui, sans-serif` },
      { role: 'eyebrow', family: body, weights: [600], stack: `'${body}', system-ui, sans-serif` },
    ],
    voice: j.voice || 'Confident, friendly, direct.',
    rules: (j.rules || []).slice(0, 6),
    examples: (j.examples || []).slice(0, 4),
  };
}
