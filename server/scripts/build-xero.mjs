// Pre-build the Xero example genome so Brandwright opens fully loaded.
// Catalogs + optimizes the real Xero assets, then writes a complete BrandKit
// (palette sampled earlier, fonts/rules/voice/archetypes authored from the refs).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ingestFolder } from '../lib/ingest.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const SRC = '/Users/bhurvasharma/Downloads/Brand Kit';
const OUT_DIR = path.join(REPO, 'client/public/brand/xero');
const OUT_ASSETS = path.join(OUT_DIR, 'assets');

const { assets } = await ingestFolder(SRC, OUT_ASSETS, { brandId: 'xero' });

// Assign logo variants from the original filenames (01 white, 02 midnight, 03 blue).
for (const a of assets) {
  if (a.category !== 'logo') continue;
  if (a.origName?.startsWith('01')) { a.label = 'Wordmark · white'; a.variant = 'white'; }
  else if (a.origName?.startsWith('02')) { a.label = 'Wordmark · midnight'; a.variant = 'midnight'; }
  else if (a.origName?.startsWith('03')) { a.label = 'Wordmark · blue'; a.variant = 'blue'; }
}

const kit = {
  id: 'xero',
  name: 'Xero',
  colors: [
    { token: 'ink', value: '#00124E', name: 'Midnight', roles: ['text', 'background'] },
    { token: 'blue', value: '#1F65D6', name: 'Xero Blue', roles: ['accent', 'background', 'cta'] },
    { token: 'sky', value: '#82C7F5', name: 'Sky', roles: ['background', 'accent'] },
    { token: 'skyPale', value: '#CCE7F8', name: 'Pale Sky', roles: ['background'] },
    { token: 'paper', value: '#F2F0ED', name: 'Paper', roles: ['background'] },
    { token: 'white', value: '#FFFFFF', name: 'White', roles: ['background', 'text'] },
    { token: 'yellow', value: '#F5C44D', name: 'Charm Yellow', roles: ['accent'] },
    { token: 'amber', value: '#D98B3A', name: 'Charm Amber', roles: ['accent'] },
    { token: 'pink', value: '#F0869A', name: 'Charm Pink', roles: ['accent'] },
    { token: 'green', value: '#4FB985', name: 'Tick Green', roles: ['accent'] },
  ],
  fonts: [
    { role: 'headline', family: 'DM Sans', weights: [700, 800], stack: "'DM Sans', system-ui, sans-serif" },
    { role: 'body', family: 'Inter', weights: [400, 500, 600], stack: "'Inter', system-ui, sans-serif" },
    { role: 'eyebrow', family: 'Inter', weights: [600], stack: "'Inter', system-ui, sans-serif" },
  ],
  presets: [
    { id: 'square_1080', label: 'Square 1:1', w: 1080, h: 1080 },
    { id: 'story_1080x1920', label: 'Story 9:16', w: 1080, h: 1920 },
    { id: 'meta_feed_1200x1200', label: 'Meta feed', w: 1200, h: 1200 },
    { id: 'banner_1200x628', label: 'Banner 1.91:1', w: 1200, h: 628 },
  ],
  assets,
  rules: [
    { id: 'contrast', text: 'Headline text must be ink (#00124E) or white with strong contrast; never low-contrast on sky.', severity: 'error' },
    { id: 'logo-once', text: 'The xero wordmark appears once, from the asset library, with clear-space at least its cap-height.', severity: 'error' },
    { id: 'palette', text: 'Use only brand palette colours. Blue and sky for shapes and blooms; charms are accents only.', severity: 'error' },
    { id: 'ticks', text: 'Feature lists use green ticks with short uppercase labels (ACCOUNTING, PAYMENTS, PAYROLL, ANALYTICS).', severity: 'warn' },
    { id: 'safezone', text: 'Respect Meta safe zones on social placements; keep the logo and CTA inside the safe area.', severity: 'warn' },
  ],
  voice:
    "Friendly, plain-spoken and encouraging. Short active sentences that talk to small-business owners like a helpful partner. Confident, never jargon-y. Examples: 'Get a Xero Coach. Get ahead.' / 'Up and running in under 4 hours.' / 'Other software holds you back. Xero holds your hand.'",
  archetypes: [
    {
      id: 'headline-card',
      label: 'White card headline + CTA pill, logo bottom-left, charms top-right',
      regions: [
        { role: 'background', box: { x: 0, y: 0, w: 1, h: 1 } },
        { role: 'card', box: { x: 0.04, y: 0.13, w: 0.92, h: 0.66 } },
        { role: 'headline', box: { x: 0.1, y: 0.3, w: 0.72, h: 0.24 } },
        { role: 'pill', box: { x: 0.1, y: 0.62, w: 0.5, h: 0.1 } },
        { role: 'charm', box: { x: 0.6, y: 0.08, w: 0.32, h: 0.18 } },
        { role: 'logo', box: { x: 0.06, y: 0.88, w: 0.22, h: 0.07 } },
        { role: 'featureList', box: { x: 0.36, y: 0.88, w: 0.58, h: 0.08 } },
      ],
    },
    {
      id: 'photo-hero',
      label: 'Photo with blob overlay, headline top, logo bottom-right, CTA bottom-left',
      regions: [
        { role: 'image', box: { x: 0, y: 0, w: 1, h: 1 } },
        { role: 'headline', box: { x: 0.06, y: 0.06, w: 0.82, h: 0.2 } },
        { role: 'pill', box: { x: 0.06, y: 0.85, w: 0.42, h: 0.09 } },
        { role: 'logo', box: { x: 0.7, y: 0.87, w: 0.24, h: 0.08 } },
      ],
    },
    {
      id: 'split-contrast',
      label: 'Navy + sky split, contrasting headlines, product centred',
      regions: [
        { role: 'background', box: { x: 0, y: 0, w: 0.5, h: 1 } },
        { role: 'headline', box: { x: 0.04, y: 0.08, w: 0.42, h: 0.3 } },
        { role: 'headline', box: { x: 0.54, y: 0.08, w: 0.42, h: 0.3 } },
        { role: 'image', box: { x: 0.3, y: 0.32, w: 0.4, h: 0.52 } },
        { role: 'featureList', box: { x: 0.04, y: 0.72, w: 0.32, h: 0.16 } },
        { role: 'logo', box: { x: 0.04, y: 0.9, w: 0.22, h: 0.07 } },
      ],
    },
  ],
  rewardWeights: { palette: 0.2, contrast: 0.2, safezone: 0.15, archetype: 0.15, hierarchy: 0.15, voice: 0.15 },
  learned: [],
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'brandkit.json'), JSON.stringify(kit, null, 2));

const byCat = assets.reduce((m, a) => ((m[a.category] = (m[a.category] || 0) + 1), m), {});
console.log(`Xero genome written -> ${path.relative(REPO, OUT_DIR)}/brandkit.json`);
console.log(`  ${assets.length} assets:`, JSON.stringify(byCat));
console.log(`  ${kit.colors.length} colours, ${kit.archetypes.length} archetypes, ${kit.rules.length} rules`);
const logos = assets.filter((a) => a.category === 'logo').map((a) => a.variant || a.origName);
console.log(`  logo variants:`, JSON.stringify(logos));
