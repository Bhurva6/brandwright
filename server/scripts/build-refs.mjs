// Pre-generate each bundled brand's OWN reference library using our engine:
// 4 archetype-spanning ads per brand, saved as spec JSONs the client renders
// live (and remixes with full structural fidelity).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadBrand, BRANDS_DIR } from '../lib/brand.mjs';
import { generateDesigns } from '../lib/agent.mjs';
import { generateImage, sizeForCanvas } from '../lib/image.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BRIEFS = {
  cocacola: 'A reference set for the brand team: 4 flagship ad styles — a bold typographic poster, a photo-led togetherness moment, a product-hero with dramatic colour blocking, and a stat/claim card.',
  spotify: 'A reference set for the brand team: 4 flagship ad styles — a loud typographic poster, a duotone artist/listener photo ad, a playlist-promo card, and a stat/claim card (listening hours, wrapped-style).',
  headspace: 'A reference set for the brand team: 4 flagship ad styles — a calm typographic poster, a soft illustration-led ad, a benefit card with gentle CTA, and a stat/claim card about sleep or stress.',
  airbnb: 'A reference set for the brand team: 4 flagship ad styles — an editorial photo-led stay ad, a clean typographic belonging poster, a host-earnings claim card, and an Experiences promo.',
};

async function fill(specs) {
  const jobs = [];
  for (const s of specs) for (const l of s.layers) {
    if (l.type === 'image' && l.prompt) {
      jobs.push(generateImage({ prompt: l.prompt, size: sizeForCanvas(s.canvas.w, s.canvas.h) }).then(({ url }) => { l.src = url; l.status = 'ready'; }).catch(() => { l.status = 'error'; }));
    }
  }
  await Promise.all(jobs);
}

for (const [id, brief] of Object.entries(BRIEFS)) {
  const brand = loadBrand(id);
  if (!brand) { console.log('skip', id); continue; }
  const preset = brand.presets[0];
  process.stdout.write(`${brand.name}… `);
  try {
    const { specs } = await generateDesigns({ brand, prompt: brief, variations: 4, preset });
    await fill(specs);
    fs.writeFileSync(path.join(BRANDS_DIR, id, 'refs.json'), JSON.stringify({ refs: specs }, null, 1));
    console.log(`OK (${specs.length} refs)`);
  } catch (e) {
    console.log('FAIL', e.message);
  }
}
console.log('done');
