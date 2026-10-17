// Build the bundled multi-brand genomes (beyond Xero): Coca-Cola, Spotify,
// Headspace, Airbnb. Logos are styled TEXT wordmarks (we don't fabricate
// trademark marks); blooms are shared recolorable masks copied from Xero.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const BRANDS = path.join(REPO, 'client/public/brand');

// shared blooms: copy a curated set of Xero's recolorable masks
const COMMON = path.join(BRANDS, 'common/blooms');
fs.mkdirSync(COMMON, { recursive: true });
const xeroAssets = path.join(BRANDS, 'xero/assets');
const bloomFiles = fs.readdirSync(xeroAssets).filter((f) => f.startsWith('bloom-')).slice(0, 14);
for (const f of bloomFiles) fs.copyFileSync(path.join(xeroAssets, f), path.join(COMMON, f));
const bloomAssets = bloomFiles.map((f, i) => ({
  id: `bloom-${String(i).padStart(3, '0')}`,
  category: 'bloom',
  label: 'Shape',
  src: `/brand/common/blooms/${f}`,
  recolorable: true,
}));

const PRESETS = [
  { id: 'square_1080', label: 'Square 1:1', w: 1080, h: 1080 },
  { id: 'story_1080x1920', label: 'Story 9:16', w: 1080, h: 1920 },
  { id: 'meta_feed_1200x1200', label: 'Meta feed', w: 1200, h: 1200 },
  { id: 'banner_1200x628', label: 'Banner 1.91:1', w: 1200, h: 628 },
];

const ARCHETYPES = [
  { id: 'headline-card', label: 'Card with bold headline + CTA pill, wordmark bottom-left', regions: [] },
  { id: 'photo-hero', label: 'Full-bleed photo, headline top, CTA + wordmark bottom', regions: [] },
  { id: 'type-poster', label: 'Typographic poster: giant headline, flat brand ground, minimal accents', regions: [] },
];

const textLogo = (brand, variants) =>
  variants.map((v, i) => ({
    id: `logo-${String(i).padStart(2, '0')}`,
    category: 'logo',
    label: `Wordmark · ${v.variant}`,
    variant: v.variant,
    text: v.text ?? brand,
    fontFamily: v.font,
    fontWeight: v.weight ?? 700,
    color: v.color,
    letterSpacing: v.ls,
  }));

const REWARD = { palette: 0.14, contrast: 0.18, safezone: 0.14, archetype: 0.06, hook: 0.14, cta: 0.12, thumbstop: 0.08, hierarchy: 0.07, voice: 0.07 };

const GENOMES = [
  {
    id: 'cocacola',
    name: 'Coca-Cola',
    colors: [
      { token: 'red', value: '#F40009', name: 'Coke Red', roles: ['background', 'accent', 'cta'] },
      { token: 'white', value: '#FFFFFF', name: 'White', roles: ['text', 'background'] },
      { token: 'black', value: '#1E1E1E', name: 'Coke Black', roles: ['text', 'background'] },
      { token: 'cream', value: '#F7F3E8', name: 'Cream', roles: ['background'] },
      { token: 'darkred', value: '#A3000C', name: 'Classic Dark Red', roles: ['background', 'accent'] },
    ],
    fonts: [
      { role: 'headline', family: 'Oswald', weights: [600, 700], stack: "'Oswald', 'Arial Narrow', sans-serif" },
      { role: 'body', family: 'Inter', weights: [400, 600], stack: "'Inter', system-ui, sans-serif" },
      { role: 'eyebrow', family: 'Oswald', weights: [600], stack: "'Oswald', sans-serif" },
    ],
    logos: [
      { variant: 'white', text: 'Coca-Cola', font: "'Pacifico', cursive", weight: 400, color: '#FFFFFF' },
      { variant: 'red', text: 'Coca-Cola', font: "'Pacifico', cursive", weight: 400, color: '#F40009' },
    ],
    rules: [
      { id: 'red', text: 'Coke Red dominates. White script wordmark on red; red wordmark only on white/cream.', severity: 'error' },
      { id: 'joy', text: 'Imagery radiates togetherness, refreshment and joy — never clinical or corporate.', severity: 'warn' },
      { id: 'contrast', text: 'Headlines are white on red or black on cream. Never grey.', severity: 'error' },
    ],
    voice: "Joyful, iconic, universal. Short uplifting lines about moments of refreshment and togetherness: 'Taste the feeling.' 'Open happiness.' 'Real magic.'",
    examples: [
      'A summer campaign: ice-cold Coke with friends on a rooftop at sunset.',
      'Festive season sharing ad — togetherness over a family dinner.',
      'Launch Coke Zero to gamers pulling an all-nighter.',
    ],
  },
  {
    id: 'spotify',
    name: 'Spotify',
    colors: [
      { token: 'green', value: '#1ED760', name: 'Spotify Green', roles: ['accent', 'cta'] },
      { token: 'black', value: '#121212', name: 'Black', roles: ['background', 'text'] },
      { token: 'white', value: '#FFFFFF', name: 'White', roles: ['text', 'background'] },
      { token: 'purple', value: '#7358FF', name: 'Electric Purple', roles: ['background', 'accent'] },
      { token: 'pink', value: '#F774C4', name: 'Hot Pink', roles: ['background', 'accent'] },
      { token: 'yellow', value: '#FFF176', name: 'Acid Yellow', roles: ['accent'] },
    ],
    fonts: [
      { role: 'headline', family: 'Montserrat', weights: [800, 900], stack: "'Montserrat', 'Helvetica Neue', sans-serif" },
      { role: 'body', family: 'Inter', weights: [400, 600], stack: "'Inter', system-ui, sans-serif" },
      { role: 'eyebrow', family: 'Montserrat', weights: [700], stack: "'Montserrat', sans-serif" },
    ],
    logos: [
      { variant: 'white', text: 'Spotify', font: "'Montserrat', sans-serif", weight: 800, color: '#FFFFFF', ls: '-0.02em' },
      { variant: 'green', text: 'Spotify', font: "'Montserrat', sans-serif", weight: 800, color: '#1ED760', ls: '-0.02em' },
      { variant: 'black', text: 'Spotify', font: "'Montserrat', sans-serif", weight: 800, color: '#121212', ls: '-0.02em' },
    ],
    rules: [
      { id: 'green', text: 'Spotify Green is an accent, never a background for text. Black grounds dominate.', severity: 'error' },
      { id: 'bold', text: 'Typography is huge, tight and ultra-bold. Headlines can shout.', severity: 'warn' },
      { id: 'duotone', text: 'Imagery leans duotone/high-saturation; music culture, never stock-corporate.', severity: 'warn' },
    ],
    voice: "Bold, culture-fluent, a little cheeky. Speaks to listeners like insiders: 'Music for every mood.' 'Your year, wrapped.' Short, punchy, confident.",
    examples: [
      'Promote a 3-months-free Premium offer to students.',
      'Launch a true-crime podcast exclusive — dark and intriguing.',
      'Wrapped-style year-in-review hype ad.',
    ],
  },
  {
    id: 'headspace',
    name: 'Headspace',
    colors: [
      { token: 'orange', value: '#F47D31', name: 'Headspace Orange', roles: ['background', 'accent', 'cta'] },
      { token: 'ink', value: '#2D3240', name: 'Ink', roles: ['text'] },
      { token: 'cream', value: '#FBF3E4', name: 'Warm Cream', roles: ['background'] },
      { token: 'blue', value: '#5A7BEF', name: 'Calm Blue', roles: ['background', 'accent'] },
      { token: 'yellow', value: '#FFCE00', name: 'Sunshine', roles: ['accent'] },
      { token: 'white', value: '#FFFFFF', name: 'White', roles: ['text', 'background'] },
    ],
    fonts: [
      { role: 'headline', family: 'Baloo 2', weights: [600, 700], stack: "'Baloo 2', 'Comic Sans MS', sans-serif" },
      { role: 'body', family: 'Quicksand', weights: [500, 600], stack: "'Quicksand', system-ui, sans-serif" },
      { role: 'eyebrow', family: 'Quicksand', weights: [600], stack: "'Quicksand', sans-serif" },
    ],
    logos: [
      { variant: 'ink', text: 'headspace', font: "'Baloo 2', sans-serif", weight: 700, color: '#2D3240' },
      { variant: 'white', text: 'headspace', font: "'Baloo 2', sans-serif", weight: 700, color: '#FFFFFF' },
    ],
    rules: [
      { id: 'soft', text: 'Everything is soft and rounded — generous curves, no sharp corners, no harsh contrast.', severity: 'warn' },
      { id: 'calm', text: 'Copy soothes, never pressures. No urgency, no FOMO, no exclamation-mark stacking.', severity: 'error' },
      { id: 'warm', text: 'Warm grounds (orange/cream); ink text on light, white text on orange.', severity: 'error' },
    ],
    voice: "Warm, gentle, lightly playful. Permission-giving, never preachy: 'Less overthinking. More you.' 'Meditation made simple.' Breathes between words.",
    examples: [
      'Encourage stressed professionals to try a 10-minute sleep meditation.',
      'New-year reset: be kind to your mind.',
      'Student discount on mindfulness for exam season.',
    ],
  },
  {
    id: 'airbnb',
    name: 'Airbnb',
    colors: [
      { token: 'rausch', value: '#FF385C', name: 'Rausch', roles: ['accent', 'cta'] },
      { token: 'ink', value: '#222222', name: 'Ink', roles: ['text'] },
      { token: 'white', value: '#FFFFFF', name: 'White', roles: ['background', 'text'] },
      { token: 'linen', value: '#F7F3EF', name: 'Linen', roles: ['background'] },
      { token: 'teal', value: '#00847E', name: 'Teal', roles: ['accent'] },
    ],
    fonts: [
      { role: 'headline', family: 'Nunito Sans', weights: [800, 900], stack: "'Nunito Sans', 'Helvetica Neue', sans-serif" },
      { role: 'body', family: 'Nunito Sans', weights: [400, 600], stack: "'Nunito Sans', system-ui, sans-serif" },
      { role: 'eyebrow', family: 'Nunito Sans', weights: [700], stack: "'Nunito Sans', sans-serif" },
    ],
    logos: [
      { variant: 'rausch', text: 'airbnb', font: "'Nunito Sans', sans-serif", weight: 800, color: '#FF385C' },
      { variant: 'white', text: 'airbnb', font: "'Nunito Sans', sans-serif", weight: 800, color: '#FFFFFF' },
      { variant: 'ink', text: 'airbnb', font: "'Nunito Sans', sans-serif", weight: 800, color: '#222222' },
    ],
    rules: [
      { id: 'photo', text: 'Photography-first: real homes, real light, real belonging. Minimal overlay chrome.', severity: 'warn' },
      { id: 'clean', text: 'White or linen grounds; Rausch only for CTAs and small accents.', severity: 'error' },
      { id: 'human', text: 'Copy is human and hosted — about belonging, never about “inventory”.', severity: 'error' },
    ],
    voice: "Warm, human, editorial. Speaks about belonging anywhere: 'Belong anywhere.' 'Made possible by Hosts.' Understated confidence, never salesy.",
    examples: [
      'Summer escapes: book a lakeside cabin for the long weekend.',
      'Promote Airbnb Experiences — cook pasta with a nonna in Rome.',
      'Host your spare room and earn while you travel.',
    ],
  },
];

for (const g of GENOMES) {
  const kit = {
    id: g.id,
    name: g.name,
    colors: g.colors,
    fonts: g.fonts,
    presets: PRESETS,
    assets: [...textLogo(g.name, g.logos), ...bloomAssets],
    rules: g.rules,
    voice: g.voice,
    archetypes: ARCHETYPES,
    rewardWeights: REWARD,
    learned: [],
    examples: g.examples,
  };
  const dir = path.join(BRANDS, g.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'brandkit.json'), JSON.stringify(kit, null, 2));
  console.log(`${g.name}: ${kit.colors.length} colours, ${kit.assets.length} assets (logos+blooms)`);
}
console.log('done');
