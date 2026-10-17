// Native canvas renderer for DesignSpecs — the export engine.
// We own the spec format, so we draw it ourselves: no DOM screenshots, no
// foreignObject quirks. Powers PNG / JPEG / PDF / Pack / Motion identically.
import type { DesignSpec, BrandKit, Layer } from './types';

const imgCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  if (!imgCache.has(src)) {
    imgCache.set(
      src,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image failed: ' + src.slice(0, 60)));
        img.src = src;
      }),
    );
  }
  return imgCache.get(src)!;
}

const fontFor = (role: string, kit?: BrandKit) =>
  (kit?.fonts?.find((f) => f.role === role) || kit?.fonts?.find((f) => f.role === 'body'))?.stack || 'Inter, sans-serif';
const weightFor = (role: string) => (role === 'headline' ? 800 : role === 'eyebrow' ? 600 : 500);

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW || !line) line = t;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, fit: 'cover' | 'contain', anchorLeft = false) {
  const ir = img.width / img.height;
  const br = w / h;
  let dw = w, dh = h, dx = x, dy = y;
  if (fit === 'cover') {
    let sw = img.width, sh = img.height, sx = 0, sy = 0;
    if (ir > br) { sw = img.height * br; sx = (img.width - sw) / 2; }
    else { sh = img.width / br; sy = (img.height - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    return;
  }
  if (ir > br) { dh = w / ir; dy = y + (h - dh) / 2; }
  else { dw = h * ir; dx = anchorLeft ? x : x + (w - dw) / 2; dy = y; if (!anchorLeft) dy = y; else dy = y + (h - dh) / 2; }
  if (ir <= br && anchorLeft) { dx = x; }
  ctx.drawImage(img, dx, dy, dw, dh);
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

async function tintedMask(src: string, w: number, h: number, fill: string): Promise<HTMLCanvasElement> {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const x = c.getContext('2d')!;
  // contain the mask, then tint
  const ir = img.width / img.height, br = w / h;
  let dw = w, dh = h, dx = 0, dy = 0;
  if (ir > br) { dh = w / ir; dy = (h - dh) / 2; } else { dw = h * ir; dx = (w - dw) / 2; }
  x.drawImage(img, dx, dy, dw, dh);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = fill;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

async function drawLayer(ctx: CanvasRenderingContext2D, l: Layer, spec: DesignSpec, kit?: BrandKit) {
  const { x, y, w, h } = l.box;
  ctx.save();
  ctx.globalAlpha = l.opacity ?? 1;
  if (l.box.rotation) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((l.box.rotation * Math.PI) / 180);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }
  try {
    switch (l.type) {
      case 'background':
        ctx.fillStyle = l.fill || '#fff';
        ctx.fillRect(0, 0, spec.canvas.w, spec.canvas.h);
        break;
      case 'shape': {
        ctx.fillStyle = l.fill || '#000';
        if (l.kind === 'ellipse') {
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (l.kind === 'blob') {
          roundRectPath(ctx, x, y, w, h, Math.min(w, h) * 0.48);
          ctx.fill();
        } else {
          roundRectPath(ctx, x, y, w, h, (l.radius || 0) * Math.min(w, h));
          ctx.fill();
        }
        break;
      }
      case 'image': {
        if (!l.src) break;
        const img = await loadImage(l.src);
        if (l.radius) { roundRectPath(ctx, x, y, w, h, l.radius); ctx.clip(); }
        drawCover(ctx, img, x, y, w, h, (l.fit as any) || 'cover');
        break;
      }
      case 'bloom': {
        if (!l.src) break;
        const tinted = await tintedMask(l.src, w, h, l.fill || '#82C7F5');
        ctx.drawImage(tinted, x, y);
        break;
      }
      case 'charm': {
        if (!l.src) break;
        drawCover(ctx, await loadImage(l.src), x, y, w, h, 'contain');
        break;
      }
      case 'logo': {
        if (l.src) {
          const img = await loadImage(l.src);
          // contain, anchored left-center (matches the DOM renderer)
          const ir = img.width / img.height;
          let dw = w, dh = w / ir;
          if (dh > h) { dh = h; dw = h * ir; }
          ctx.drawImage(img, x, y + (h - dh) / 2, dw, dh);
        } else if (l.text) {
          const size = Math.min(h * 0.72, (w / Math.max(String(l.text).length, 3)) * 1.7);
          ctx.font = `${l.fontWeight || 800} ${size}px ${l.fontFamily || fontFor('headline', kit)}`;
          ctx.fillStyle = l.color || '#000';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          ctx.fillText(String(l.text), x, y + h / 2);
        }
        break;
      }
      case 'text': {
        const role = l.role || 'headline';
        const family = fontFor(role, kit);
        const weight = l.weight || weightFor(role);
        const lh = l.lineHeight || (role === 'headline' ? 1.04 : 1.3);
        const text = role === 'eyebrow' ? String(l.text || '').toUpperCase() : String(l.text || '');
        let size = l.size || Math.round(h * (role === 'headline' ? 0.92 : role === 'eyebrow' ? 0.6 : 0.42));
        let lines: string[] = [];
        for (let i = 0; i < 160 && size > 7; i++) {
          ctx.font = `${weight} ${size}px ${family}`;
          lines = wrapText(ctx, text, w);
          const tooTall = lines.length * size * lh > h + 1;
          const tooWide = Math.max(...lines.map((ln) => ctx.measureText(ln).width)) > w + 1;
          if (!tooTall && !tooWide) break;
          size = Math.floor(size * 0.93);
        }
        ctx.font = `${weight} ${size}px ${family}`;
        ctx.fillStyle = l.color || '#000';
        ctx.textBaseline = 'alphabetic';
        const align = l.align || 'left';
        ctx.textAlign = align as CanvasTextAlign;
        const ax = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
        const block = lines.length * size * lh;
        let ty = y + (h - block) / 2 + size * 0.82; // vertical centre, first baseline
        for (const ln of lines) {
          ctx.fillText(ln, ax, ty);
          ty += size * lh;
        }
        break;
      }
      case 'pill': {
        ctx.fillStyle = l.fill || '#000';
        roundRectPath(ctx, x, y, w, h, h / 2);
        ctx.fill();
        const size = Math.min(h * 0.4, w * 0.12);
        ctx.font = `600 ${size}px ${fontFor('body', kit)}`;
        ctx.fillStyle = l.textColor || '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(l.text || ''), x + w / 2, y + h / 2 + size * 0.05);
        break;
      }
      case 'featureList': {
        const items: string[] = l.items || [];
        if (!items.length) break;
        const rowH = h / items.length;
        const tick = rowH * 0.56;
        const size = Math.min(rowH * 0.46, 40);
        ctx.font = `700 ${size}px ${fontFor('eyebrow', kit)}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        items.forEach((it, i) => {
          const cy = y + rowH * i + rowH / 2;
          ctx.fillStyle = l.markColor || '#4FB985';
          ctx.beginPath();
          ctx.arc(x + tick / 2, cy, tick / 2, 0, Math.PI * 2);
          ctx.fill();
          // the tick
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = Math.max(1.5, tick * 0.12);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x + tick * 0.28, cy + tick * 0.02);
          ctx.lineTo(x + tick * 0.45, cy + tick * 0.18);
          ctx.lineTo(x + tick * 0.74, cy - 0.18 * tick);
          ctx.stroke();
          ctx.fillStyle = l.color || '#000';
          ctx.fillText(String(it), x + tick + rowH * 0.28, cy + size * 0.04);
        });
        break;
      }
    }
  } catch (e) {
    console.error('rasterize: layer failed', l.type, e); // a broken layer never kills the export
  }
  ctx.restore();
}

/** Render a full spec to a canvas at native resolution. */
export async function renderSpecToCanvas(spec: DesignSpec, kit?: BrandKit, filter?: (l: Layer) => boolean): Promise<HTMLCanvasElement> {
  await (document as any).fonts?.ready?.catch?.(() => {});
  const c = document.createElement('canvas');
  c.width = spec.canvas.w;
  c.height = spec.canvas.h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = spec.canvas.background || '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  for (const l of spec.layers) {
    if (filter && !filter(l)) continue;
    await drawLayer(ctx, l, spec, kit);
  }
  return c;
}

export async function renderSpecDataUrl(spec: DesignSpec, kit?: BrandKit, type: 'image/png' | 'image/jpeg' = 'image/png', quality = 0.92): Promise<string> {
  const c = await renderSpecToCanvas(spec, kit);
  return c.toDataURL(type, quality);
}
