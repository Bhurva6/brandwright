// Reusable brand-asset ingest: scan a folder, classify + optimize + copy assets,
// return a manifest. No vision needed — classification is folder + heuristics.
// Used both to pre-build the Xero example and (Phase 3) to ingest any brand live.
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

// Map a brand folder's top-level dirs to asset categories. null = skip.
// Generic fallback classification (below) handles folders we don't recognize.
const CATEGORY_BY_FOLDER = {
  '10_Logo': 'logo',
  '05_Logo_Guidelines': null, // large guideline sheets, not placeable
  '06_Shapes_Cropping_Blooms': 'bloom',
  '07_Illustration': 'illustration',
  '22_Charms': 'charm',
  '24_Background_Templates': 'background',
  '11_Product_UI_References': null, // 5-9MB screenshots, skip for placement
  '17_Meta_Asset_Safe_Zones': null, // informs CI rules, not a placeable asset
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-/i;
const IMG_EXT = ['.png', '.svg', '.webp', '.jpg', '.jpeg'];

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else out.push({ p, name, size: st.size });
  }
  return out;
}

const topFolder = (srcDir, filePath) => path.relative(srcDir, filePath).split(path.sep)[0];

// Generic classifier for unknown folder names (keeps ingest brand-agnostic).
function classifyGeneric(folder, name) {
  const f = (folder + ' ' + name).toLowerCase();
  if (/logo|wordmark|lockup/.test(f)) return 'logo';
  if (/bloom|shape|blob/.test(f)) return 'bloom';
  if (/charm|sticker|badge/.test(f)) return 'charm';
  if (/illustration|spot|icon/.test(f)) return 'illustration';
  if (/background|bg|pattern|texture/.test(f)) return 'background';
  return null;
}

function includeFile(category, f) {
  if (!category) return false;
  const ext = path.extname(f.name).toLowerCase();
  if (!IMG_EXT.includes(ext)) return false;
  if (category === 'bloom') return UUID.test(f.name) && f.size < 60_000; // individual blooms, not doc sheets
  if (category === 'illustration') return ext === '.svg' || f.size < 220_000;
  if (category === 'background') return f.size < 450_000;
  return f.size < 2_000_000; // logo, charm
}

function labelFor(category, name) {
  const base = { logo: 'Wordmark', bloom: 'Bloom', charm: 'Charm', illustration: 'Illustration', background: 'Background', product: 'Product' };
  return base[category] || category;
}

/**
 * @param {string} srcDir  brand asset folder
 * @param {string} outDir  where optimized assets are written (served statically)
 * @param {{brandId:string, servedBase?:string}} opts
 * @returns {Promise<{assets:any[]}>}
 */
export async function ingestFolder(srcDir, outDir, { brandId, servedBase }) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const base = servedBase || `/brand/${brandId}/assets`;
  const files = walk(srcDir).sort((a, b) => a.p.localeCompare(b.p));
  const assets = [];
  let idx = 0;

  for (const f of files) {
    const folder = topFolder(srcDir, f.p);
    let category = folder in CATEGORY_BY_FOLDER ? CATEGORY_BY_FOLDER[folder] : classifyGeneric(folder, f.name);
    if (!includeFile(category, f)) continue;

    const ext = path.extname(f.name).toLowerCase();
    const id = `${category}-${String(idx++).padStart(3, '0')}`;
    let outName, w, h, hasAlpha = false;

    if (ext === '.svg') {
      outName = id + '.svg';
      fs.copyFileSync(f.p, path.join(outDir, outName));
    } else {
      outName = id + '.png';
      try {
        let img = sharp(f.p);
        const meta = await img.metadata();
        hasAlpha = !!meta.hasAlpha;
        if (['logo', 'bloom', 'charm'].includes(category) && hasAlpha) img = img.trim();
        img = img.resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true });
        const { data, info } = await img.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
        fs.writeFileSync(path.join(outDir, outName), data);
        w = info.width; h = info.height;
      } catch {
        fs.copyFileSync(f.p, path.join(outDir, outName));
      }
    }

    assets.push({
      id, category, origName: f.name, label: labelFor(category, f.name),
      src: `${base}/${outName}`, w, h, hasAlpha,
      recolorable: category === 'bloom',
    });
  }
  return { assets };
}

// Rough palette sampler (Phase 3 generic ingest). Resizes small, buckets saturated colors.
export async function samplePalette(filePaths, max = 6) {
  const buckets = new Map();
  for (const p of filePaths) {
    try {
      const { data, info } = await sharp(p).resize(64, 64, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
      const ch = info.channels;
      for (let i = 0; i < data.length; i += ch) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const sat = mx ? (mx - mn) / mx : 0;
        if (sat < 0.25 || mx < 50) continue; // skip greys / near-white / near-black
        const key = `${r >> 4},${g >> 4},${b >> 4}`;
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }
    } catch { /* skip unreadable */ }
  }
  const total = [...buckets.values()].reduce((a, b) => a + b, 0) || 1;
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, max)
    .map(([k, n]) => {
      const [r, g, b] = k.split(',').map((x) => (parseInt(x) << 4) + 8);
      const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      return { value: hex, pct: Math.round((1000 * n) / total) / 10 };
    });
}
