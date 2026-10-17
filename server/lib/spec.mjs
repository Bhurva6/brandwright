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

export function normalizeDesign(raw, brand, preset) {
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
    const id = sid();
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
        layers.push({ id, type: 'bloom', box, assetId: a?.id, src: a?.src, fill: resolveColor(l.fill, cmap, undefined) });
        break;
      }
      case 'charm': {
        const a = pickAsset(brand, 'charm', l.assetId);
        layers.push({ id, type: 'charm', box, assetId: a?.id, src: a?.src });
        break;
      }
      case 'logo': {
        const a = pickLogo(brand, l.variant);
        layers.push({ id, type: 'logo', box, assetId: a?.id, variant: a?.variant || l.variant, src: a?.src });
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

  return {
    id: sid('d'),
    name: raw.name || 'Design',
    note: raw.note || raw.strategy || '',
    canvas: { w: W, h: H, preset: preset.id, background: resolveColor(raw.background, cmap, '#FFFFFF') },
    layers,
  };
}
