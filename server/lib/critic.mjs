// The critic agent: brand CI + Performance Lens.
// Hybrid reward: deterministic checks (WCAG contrast, overlap geometry, logo
// count, palette fidelity) + DeepSeek-Flash judging performance dimensions.
// R(spec) = Σ wᵢ·scoreᵢ  — weights live in the genome (outer loop tunes them).
import { flash, MODELS } from './openai.mjs';
import { withRetry } from './queue.mjs';

// ---------- deterministic helpers ----------
const hex2rgb = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
};
const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastRatio = (a, b) => {
  const la = lum(a), lb = lum(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};
const overlapArea = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

/** Colour most likely behind a box: topmost shape/background fill covering its centre. */
function groundBehind(spec, box) {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  let fill = spec.canvas.background;
  for (const l of spec.layers) {
    if (l.type === 'shape' || l.type === 'background') {
      const b = l.type === 'background' ? { x: 0, y: 0, w: spec.canvas.w, h: spec.canvas.h } : l.box;
      if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h && l.fill) fill = l.fill;
    }
    if (l.type === 'image' && l.src) {
      const b = l.box;
      if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) fill = null; // photo behind: can't be exact
    }
  }
  return fill;
}

export function deterministicChecks(spec, brand) {
  const findings = [];
  const scores = {};
  const W = spec.canvas.w, H = spec.canvas.h;

  // palette fidelity: every used colour must be a brand token
  const kitColors = new Set(brand.colors.map((c) => c.value.toLowerCase()));
  let used = 0, offBrand = 0;
  for (const l of spec.layers) {
    for (const f of ['fill', 'color', 'textColor', 'markColor']) {
      const v = l[f];
      if (typeof v === 'string' && v.startsWith('#')) {
        used++;
        if (!kitColors.has(v.toLowerCase())) {
          offBrand++;
          findings.push({ dimension: 'palette', severity: 'error', layerId: l.id, message: `${l.type}.${f} uses off-brand colour ${v}` });
        }
      }
    }
  }
  scores.palette = used ? Math.max(0, 1 - offBrand / used) : 1;

  // contrast: text/pill/featureList vs ground behind
  let txt = 0, bad = 0;
  for (const l of spec.layers) {
    if (!['text', 'featureList'].includes(l.type)) continue;
    txt++;
    const ground = groundBehind(spec, l.box);
    const fg = hex2rgb(l.color);
    const bg = ground ? hex2rgb(ground) : null;
    if (fg && bg) {
      const cr = contrastRatio(fg, bg);
      if (cr < 3) {
        bad++;
        findings.push({ dimension: 'contrast', severity: cr < 2 ? 'error' : 'warn', layerId: l.id, message: `Low contrast (${cr.toFixed(1)}:1) for ${l.type} on ${ground}` });
      }
    }
  }
  scores.contrast = txt ? Math.max(0, 1 - bad / txt) : 1;

  // layout: elements inside canvas, text boxes not overlapping each other
  let layoutIssues = 0;
  const textish = spec.layers.filter((l) => ['text', 'pill', 'featureList', 'logo'].includes(l.type));
  for (const l of textish) {
    const b = l.box;
    if (b.x < -2 || b.y < -2 || b.x + b.w > W + 2 || b.y + b.h > H + 2) {
      layoutIssues++;
      findings.push({ dimension: 'safezone', severity: 'warn', layerId: l.id, message: `${l.type} extends outside the canvas` });
    }
  }
  for (let i = 0; i < textish.length; i++) {
    for (let j = i + 1; j < textish.length; j++) {
      const a = textish[i], b = textish[j];
      const ov = overlapArea(a.box, b.box);
      const minA = Math.min(a.box.w * a.box.h, b.box.w * b.box.h);
      if (minA > 0 && ov / minA > 0.25) {
        layoutIssues++;
        findings.push({ dimension: 'safezone', severity: 'error', layerId: b.id, message: `${a.type} and ${b.type} overlap — separate them` });
      }
    }
  }
  scores.safezone = Math.max(0, 1 - layoutIssues * 0.25);

  // logo: exactly one
  const logos = spec.layers.filter((l) => l.type === 'logo').length;
  if (logos !== 1) findings.push({ dimension: 'archetype', severity: 'error', message: logos ? 'More than one logo' : 'Missing the brand logo' });
  scores.archetype = logos === 1 ? 1 : 0.3;

  return { scores, findings };
}

// ---------- LLM judge (Performance Lens) ----------
const summarize = (spec) =>
  spec.layers
    .map((l) => {
      if (l.type === 'text') return `${l.role}: "${l.text}" (${l.color})`;
      if (l.type === 'pill') return `CTA: "${l.text}"`;
      if (l.type === 'featureList') return `features: ${(l.items || []).join(', ')}`;
      if (l.type === 'image') return `photo: ${l.prompt?.slice(0, 90)}`;
      return l.type;
    })
    .join(' | ');

export async function judgePerformance(spec, brand) {
  const r = await withRetry(() => flash.chat.completions.create({
    model: MODELS.flash,
    temperature: 0.2,
    max_tokens: 500,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a strict performance-marketing creative director for ${brand.name}. Brand voice: ${brand.voice}\nScore this ad layout 0..1 on each dimension and give ONE terse improvement. Reply JSON only: {"hook":0-1,"cta":0-1,"thumbstop":0-1,"hierarchy":0-1,"voice":0-1,"insight":"<one sentence>"}`,
      },
      { role: 'user', content: `Canvas ${spec.canvas.w}x${spec.canvas.h}, background ${spec.canvas.background}.\nLayers: ${summarize(spec)}` },
    ],
  }));
  try {
    const j = JSON.parse(r.choices[0].message.content);
    return {
      scores: {
        hook: +j.hook || 0.5, cta: +j.cta || 0.5, thumbstop: +j.thumbstop || 0.5,
        hierarchy: +j.hierarchy || 0.5, voice: +j.voice || 0.5,
      },
      insight: j.insight || '',
    };
  } catch {
    return { scores: { hook: 0.5, cta: 0.5, thumbstop: 0.5, hierarchy: 0.5, voice: 0.5 }, insight: '' };
  }
}

const DEFAULT_WEIGHTS = { palette: 0.14, contrast: 0.16, safezone: 0.14, archetype: 0.08, hook: 0.14, cta: 0.12, thumbstop: 0.08, hierarchy: 0.07, voice: 0.07 };

export async function critique(spec, brand) {
  const det = deterministicChecks(spec, brand);
  const judge = await judgePerformance(spec, brand);
  const dims = { ...det.scores, ...judge.scores };
  const weights = { ...DEFAULT_WEIGHTS, ...(brand.rewardWeights || {}) };
  let total = 0, wsum = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (dims[k] !== undefined) { total += dims[k] * w; wsum += w; }
  }
  total = wsum ? total / wsum : 0;
  const errors = det.findings.filter((f) => f.severity === 'error');
  return {
    total: Math.round(total * 100) / 100,
    dimensions: dims,
    findings: det.findings,
    insight: judge.insight,
    pass: total >= 0.7 && errors.length === 0,
  };
}

/** Build a terse repair instruction from the critique — fed back to the editor agent. */
export function repairInstruction(score) {
  const parts = [];
  for (const f of score.findings.filter((x) => x.severity === 'error').slice(0, 4)) parts.push(f.message);
  const dims = Object.entries(score.dimensions).filter(([, v]) => v < 0.6).map(([k]) => k);
  if (dims.length) parts.push(`improve: ${dims.join(', ')}`);
  if (score.insight) parts.push(score.insight);
  return 'Fix these issues while keeping the design concept: ' + parts.join('; ');
}
