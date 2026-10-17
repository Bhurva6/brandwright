// The generator agent. Builds a system prompt from the active genome and uses
// DeepSeek tool-calling to emit complete, on-brand layouts as structured layers.
import { pro, MODELS } from './openai.mjs';
import { withRetry } from './queue.mjs';
import { normalizeDesign, toAgentFormat } from './spec.mjs';

function systemPrompt(brand) {
  const colors = brand.colors.map((c) => `  ${c.token} = ${c.value}  (${c.name}; roles: ${(c.roles || []).join('/') || 'any'})`).join('\n');
  const fonts = brand.fonts.map((f) => `${f.role} -> ${f.family}`).join(', ');
  const logos = brand.assets.filter((a) => a.category === 'logo').map((a) => a.variant).filter(Boolean).join(', ') || 'default';
  const arche = (brand.archetypes || []).map((a) => `  - ${a.id}: ${a.label}`).join('\n');
  const rules = brand.rules.map((r) => `  - ${r.text}`).join('\n');

  return `You are the lead designer in Brandwright, an on-brand image editor for ${brand.name}.
You compose advertising designs as STRUCTURED LAYERS on a canvas. You never draw pixels — you emit a layout, and the renderer draws it. Everything you choose MUST be on-brand.

BRAND PALETTE — refer to colours ONLY by these token names, never raw hex:
${colors}

FONTS (applied automatically from a text layer's role): ${fonts}

LOGO variants available: ${logos}. Pick the variant that contrasts with whatever is behind it.

LAYOUT ARCHETYPES — pick ONE per design and follow its structure:
${arche}

BRAND RULES:
${rules}

BRAND VOICE: ${brand.voice}

COORDINATES: x, y, w, h are FRACTIONS of the canvas in 0..1, origin at top-left.

LAYER TYPES (emit layers back-to-front; start with a background):
  background   { type:"background", fill:<token> }
  image        { type:"image", x,y,w,h, prompt:"<vivid photography or abstract brand background; NO text, NO logos in the image>", fit:"cover" }
  shape        { type:"shape", x,y,w,h, shapeKind:"rect"|"ellipse"|"blob", fill:<token>, radius:<0..1 of min side> }
  bloom        { type:"bloom", x,y,w,h, fill:<token> }   // signature organic brand shape; renderer picks the asset
  charm        { type:"charm", x,y,w,h }                 // playful sticker; renderer picks the asset
  text         { type:"text", x,y,w,h, text, role:"headline"|"body"|"eyebrow", color:<token>, align:"left"|"center"|"right" }
  logo         { type:"logo", x,y,w,h, variant:<one of the variants above> }
  pill         { type:"pill", x,y,w,h, text, fill:<token>, textColor:<token> }   // CTA button
  featureList  { type:"featureList", x,y,w,h, items:["ACCOUNTING","PAYMENTS"], color:<token>, markColor:<token> }

GUIDELINES:
  - Always include a background and exactly ONE logo. Lead with a big, confident headline.
  - Write all copy in the brand voice. Keep headlines short and punchy.
  - Use STRONG contrast: dark text on light grounds, light text on dark grounds.
  - For image layers, describe real photography or an abstract brand-coloured background; never request text or logos inside the generated image.
  - Add a CTA pill when it fits the brief; charms and blooms are accents, used sparingly.
  - LAYOUT SPACING: give each text layer its own vertical band with a clear gap. NEVER overlap text boxes with each other or with the logo. Make every text box tall enough for its words.
  - COPY LENGTH: headlines 3 to 6 words; body one short sentence. Short and punchy beats long.
  - Image layers are backgrounds / photography ONLY — describe the scene; the generated image must contain NO text or logos, because your text layers provide every word.
  - Produce the requested number of DISTINCT designs, each a different creative direction (e.g. bold-typographic, photo-led, illustration/shape-led, product-led).`;
}

const EMIT_TOOL = {
  type: 'function',
  function: {
    name: 'emit_designs',
    description: 'Emit the finished designs as structured layers.',
    parameters: {
      type: 'object',
      properties: {
        designs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'short name for this design' },
              strategy: { type: 'string', description: 'the creative direction in a few words' },
              archetype: { type: 'string' },
              background: { type: 'string', description: 'brand colour token for the canvas background' },
              note: { type: 'string', description: 'one-line rationale shown in the variations grid' },
              layers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'keep the existing layer id when editing; omit for new layers' },
                    type: { type: 'string', enum: ['background', 'image', 'text', 'shape', 'bloom', 'charm', 'logo', 'pill', 'featureList'] },
                    x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' },
                    text: { type: 'string' }, role: { type: 'string' }, color: { type: 'string' }, align: { type: 'string' }, size: { type: 'number' },
                    prompt: { type: 'string' }, fit: { type: 'string' },
                    shapeKind: { type: 'string' }, fill: { type: 'string' }, radius: { type: 'number' },
                    variant: { type: 'string' }, textColor: { type: 'string' },
                    items: { type: 'array', items: { type: 'string' } }, markColor: { type: 'string' }, columns: { type: 'number' },
                  },
                  required: ['type'],
                },
              },
            },
            required: ['name', 'layers'],
          },
        },
      },
      required: ['designs'],
    },
  },
};

// DeepSeek sometimes returns `designs` as a JSON string (occasionally with
// trailing junk), sometimes as a real array. Extract robustly either way.
function toDesignArray(args) {
  let d = args?.designs ?? args;
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') return Object.values(d);
  if (typeof d === 'string') {
    try { return JSON.parse(d); } catch { /* fall through to balanced scan */ }
    const start = d.indexOf('[');
    if (start < 0) throw new Error('no array found in designs string');
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < d.length; i++) {
      const c = d[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '[') depth++;
      else if (c === ']' && --depth === 0) return JSON.parse(d.slice(start, i + 1));
    }
    throw new Error('unbalanced designs array');
  }
  throw new Error('designs not parseable: ' + typeof d);
}

export async function generateDesigns({ brand, prompt, variations = 1, preset }) {
  const r = await withRetry(() => pro.chat.completions.create({
    model: MODELS.pro,
    temperature: 0.9,
    max_tokens: Math.min(2500 + 1900 * variations, 16000),
    messages: [
      { role: 'system', content: systemPrompt(brand) },
      { role: 'user', content: `Brief: ${prompt}\n\nProduce ${variations} distinct design(s) for the ${preset.label} canvas (${preset.w}x${preset.h}).` },
    ],
    tools: [EMIT_TOOL],
    tool_choice: { type: 'function', function: { name: 'emit_designs' } },
  }));

  const tc = r.choices[0].message.tool_calls?.[0];
  if (!tc) throw new Error('agent emitted no designs');
  if (process.env.DEBUG_AGENT) console.error('RAW ARGS >>>', String(tc.function.arguments).slice(0, 900));
  let args;
  try {
    args = JSON.parse(tc.function.arguments);
  } catch (e) {
    throw new Error('agent returned malformed design JSON: ' + e.message);
  }
  const designs = toDesignArray(args);
  const specs = designs.slice(0, variations).map((d) => normalizeDesign(d, brand, preset));
  return { specs, raw: designs };
}

/**
 * Conversational edit: the agent receives the CURRENT design (with layer ids)
 * and an instruction, and returns the full edited design. Unchanged image
 * layers keep their rendered src; only genuinely new prompts regenerate.
 */
export async function editDesign({ brand, spec, instruction }) {
  const preset = brand.presets.find((p) => p.id === spec.canvas.preset) || { id: spec.canvas.preset, label: 'custom', w: spec.canvas.w, h: spec.canvas.h };
  const current = toAgentFormat(spec);

  const r = await withRetry(() => pro.chat.completions.create({
    model: MODELS.pro,
    temperature: 0.4,
    max_tokens: 6000,
    messages: [
      { role: 'system', content: systemPrompt(brand) },
      {
        role: 'user',
        content:
          `Here is the CURRENT design on the canvas (fractional coordinates, layers back-to-front, each with its id):\n\n` +
          JSON.stringify(current) +
          `\n\nEDIT INSTRUCTION: ${instruction}\n\n` +
          `Apply the instruction. Return ONE design containing the FULL edited layer list.\n` +
          `- KEEP the same id for every layer you keep (edited or not); omit a layer to delete it; new layers get no id.\n` +
          `- Do NOT change an image layer's prompt unless the instruction asks for different imagery.\n` +
          `- Keep everything else as it is — make the smallest change that fully satisfies the instruction.`,
      },
    ],
    tools: [EMIT_TOOL],
    tool_choice: { type: 'function', function: { name: 'emit_designs' } },
  }));

  const tc = r.choices[0].message.tool_calls?.[0];
  if (!tc) throw new Error('agent returned no edit');
  const designs = toDesignArray(JSON.parse(tc.function.arguments));
  const next = normalizeDesign({ ...designs[0], id: spec.id }, brand, preset, { keepIds: true });

  // Carry over rendered imagery for image layers whose prompt didn't change.
  const oldById = new Map(spec.layers.map((l) => [l.id, l]));
  for (const l of next.layers) {
    if (l.type !== 'image') continue;
    const old = oldById.get(l.id);
    if (old && old.src && (!l.prompt || l.prompt === old.prompt)) {
      l.src = old.src;
      l.status = 'ready';
      l.recipe = old.recipe;
      l.prompt = old.prompt;
    }
  }
  return { spec: next };
}
