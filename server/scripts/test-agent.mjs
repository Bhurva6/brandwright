// Backend smoke: does the generator emit a valid, on-brand DesignSpec?
import { loadBrand } from '../lib/brand.mjs';
import { generateDesigns } from '../lib/agent.mjs';

const brand = loadBrand('xero');
const preset = brand.presets.find((p) => p.id === 'square_1080');
const prompt = process.argv[2] || 'Promote Xero as easy accounting software that helps small businesses get paid faster.';
const variations = Number(process.argv[3] || 2);

console.log(`brand=${brand.name}  preset=${preset.label}  variations=${variations}\nbrief: ${prompt}`);
console.time('agent');
const { specs } = await generateDesigns({ brand, prompt, variations, preset });
console.timeEnd('agent');

for (const s of specs) {
  console.log(`\n# ${s.name}   bg=${s.canvas.background}   — ${s.note}`);
  for (const l of s.layers) {
    const d =
      l.type === 'text' ? `"${l.text}"  [${l.role} ${l.color} ${l.align}]`
      : l.type === 'pill' ? `CTA "${l.text}"  ${l.fill}/${l.textColor}`
      : l.type === 'image' ? `img: ${String(l.prompt).slice(0, 72)}...`
      : l.type === 'logo' ? `logo variant=${l.variant}  ${l.src || 'NO-SRC'}`
      : l.type === 'featureList' ? JSON.stringify(l.items)
      : l.type === 'bloom' ? `bloom fill=${l.fill || '-'}  ${l.src ? 'bound' : 'NO-SRC'}`
      : l.type === 'charm' ? `${l.src ? 'bound' : 'NO-SRC'}`
      : l.type === 'shape' ? `${l.kind} ${l.fill}`
      : l.fill || '';
    console.log(`  - ${l.type.padEnd(11)} @(${l.box.x},${l.box.y} ${l.box.w}x${l.box.h})  ${d}`);
  }
}
const imgs = specs.flatMap((s) => s.layers.filter((l) => l.type === 'image')).length;
console.log(`\nOK: ${specs.length} designs, ${imgs} image layer(s) to generate.`);
