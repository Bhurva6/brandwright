// Turns the agent's compact, fractional-coordinate design into a full DesignSpec:
// resolves brand tokens -> hex, binds bloom/charm/logo layers to real assets,
// converts 0..1 boxes to pixels, assigns ids. This is where "valid-by-construction"
// brand enforcement happens.
import crypto from 'crypto';

const sid = (p = 'l') => p + '_' + crypto.randomUUID().slice(0, 8);

export const colorMap = (brand) => Object.fromEntries(brand.colors.map((c) => [c.token, c.value]));

function resolveColor(token, cmap, fallback) {
  if (!token) return fallback;
  if (typeof token === 'string' && token.startsWith('#')) return token; // tolerate raw hex
  return cmap[token] || fallback;
}

function pickAsset(brand, category, idHint) {
  const pool = brand.assets.filter((a) => a.category === category);
  if (!pool.length) return null;
  if (idHint) {
    const hit = pool.find((a) => a.id === idHint);
    if (hit) return hit;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickLogo(brand, variant) {
  const logos = brand.assets.filter((a) => a.category === 'logo');
  return logos.find((a) => a.variant === variant) || logos[0] || null;
}

export function normalizeDesign(raw, brand, preset, opts = {}) {
  const cmap = colorMap(brand);
  const W = preset.w;
  const H = preset.h;
  const toBox = (l) => ({
    x: Math.round((l.x ?? 0) * W),
    y: Math.round((l.y ?? 0) * H),
    w: Math.round((l.w ?? 0.2) * W),
    h: Math.round((l.h ?? 0.1) * H),
    rotation: l.rotation || 0,
  });

  const layers = [];
  for (const l of raw.layers || []) {
    const id = (opts.keepIds && l.id) || sid();
    const box = toBox(l);
    switch (l.type) {
      case 'background':
        layers.push({ id, type: 'background', box: { x: 0, y: 0, w: W, h: H }, fill: resolveColor(l.fill, cmap, '#FFFFFF') });
        break;
      case 'image':
        layers.push({ id, type: 'image', box, prompt: l.prompt || '', fit: l.fit || 'cover', radius: l.radius || 0, status: 'pending' });
        break;
      case 'text':
        layers.push({ id, type: 'text', box, text: l.text || '', role: l.role || 'headline', size: l.size || Math.round(box.h * 0.6), color: resolveColor(l.color, cmap, '#00124E'), align: l.align || 'left', weight: l.weight, lineHeight: l.lineHeight });
        break;
      case 'shape':
        layers.push({ id, type: 'shape', box, kind: l.shapeKind || 'rect', fill: resolveColor(l.fill, cmap, '#1F65D6'), radius: l.radius || 0 });
        break;
      case 'bloom': {
        const a = pickAsset(brand, 'bloom', l.assetId);
        if (!a) break; // no bloom assets in this genome — drop rather than ghost
        layers.push({ id, type: 'bloom', box, assetId: a.id, src: a.src, fill: resolveColor(l.fill, cmap, undefined) });
        break;
      }
      case 'charm': {
        const a = pickAsset(brand, 'charm', l.assetId);
        if (!a) break; // brand has no charms — drop the layer rather than render a ghost
        // tiny source stickers pixelate when blown up — clamp to ~3x natural size
        if (a?.w && a?.h) {
          const maxW = a.w * 3, maxH = a.h * 3;
          if (box.w > maxW || box.h > maxH) {
            const k = Math.min(maxW / box.w, maxH / box.h);
            box.w = Math.round(box.w * k);
            box.h = Math.round(box.h * k);
          }
        }
        layers.push({ id, type: 'charm', box, assetId: a?.id, src: a?.src });
        break;
      }
      case 'logo': {
        const a = pickLogo(brand, l.variant);
        layers.push({
          id, type: 'logo', box, assetId: a?.id, variant: a?.variant || l.variant, src: a?.src,
          // text wordmark (brands without a drawn mark render styled type)
          text: a?.text, fontFamily: a?.fontFamily, fontWeight: a?.fontWeight, color: a?.color, letterSpacing: a?.letterSpacing,
        });
        break;
      }
      case 'pill':
        layers.push({ id, type: 'pill', box, text: l.text || '', fill: resolveColor(l.fill, cmap, '#00124E'), textColor: resolveColor(l.textColor, cmap, '#FFFFFF') });
        break;
      case 'featureList':
        layers.push({ id, type: 'featureList', box, items: l.items || [], color: resolveColor(l.color, cmap, '#00124E'), markColor: resolveColor(l.markColor, cmap, '#4FB985'), columns: l.columns || 1 });
        break;
      default:
        break;
    }
  }

  const spec = {
    id: (opts.keepIds && raw.id) || sid('d'),
    name: raw.name || 'Design',
    note: raw.note || raw.strategy || '',
    canvas: { w: W, h: H, preset: preset.id, background: resolveColor(raw.background, cmap, '#FFFFFF') },
    layers,
  };
  if (opts.tidy !== false) resolveCollisions(spec);
  return spec;
}

/**
 * Deterministic tidy pass: readable layers (text/pill/featureList/logo) never
 * overlap each other and always sit inside the canvas. The model proposes;
 * geometry disposes.
 */
export function resolveCollisions(spec) {
  const W = spec.canvas.w, H = spec.canvas.h;
  const pad = Math.round(Math.min(W, H) * 0.02);
  const readable = spec.layers.filter((l) => ['text', 'pill', 'featureList', 'logo'].includes(l.type));

  // clamp into the canvas first
  for (const l of readable) {
    const b = l.box;
    b.w = Math.min(b.w, W - pad * 2);
    b.h = Math.min(b.h, H - pad * 2);
    b.x = Math.max(pad, Math.min(b.x, W - b.w - pad));
    b.y = Math.max(pad, Math.min(b.y, H - b.h - pad));
  }

  const overlap = (a, b) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  };

  // top-to-bottom: anything colliding with an earlier layer gets pushed below it
  const placed = [];
  for (const l of [...readable].sort((a, b) => a.box.y - b.box.y)) {
    for (let guard = 0; guard < 8; guard++) {
      const hit = placed.find((p) => {
        const minA = Math.min(p.box.w * p.box.h, l.box.w * l.box.h);
        return minA > 0 && overlap(p.box, l.box) / minA > 0.12;
      });
      if (!hit) break;
      l.box.y = hit.box.y + hit.box.h + Math.round(H * 0.015);
      if (l.box.y + l.box.h > H - pad) {
        // ran out of room below — shrink to fit the remaining band
        l.box.y = Math.min(l.box.y, H - pad - l.box.h);
        break;
      }
    }
    placed.push(l);
  }
}

/** Convert a px DesignSpec back to the agent's fractional format (keeps ids). */
export function toAgentFormat(spec) {
  const W = spec.canvas.w, H = spec.canvas.h;
  const r4 = (v) => Math.round(v * 1000) / 1000;
  return {
    id: spec.id,
    name: spec.name,
    background: spec.canvas.background,
    layers: spec.layers.map((l) => {
      const o = { id: l.id, type: l.type, x: r4(l.box.x / W), y: r4(l.box.y / H), w: r4(l.box.w / W), h: r4(l.box.h / H) };
      for (const f of ['text', 'role', 'color', 'align', 'fill', 'textColor', 'variant', 'items', 'markColor', 'prompt', 'fit', 'radius']) {
        if (l[f] !== undefined) o[f] = l[f];
      }
      if (l.type === 'shape') o.shapeKind = l.kind;
      return o;
    }),
  };
}
