// Loads brand genomes from client/public/brand/<id>/brandkit.json so both the
// server and the Vite-served client read the same files.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BRANDS_DIR = path.resolve(__dirname, '../../client/public/brand');

export function listBrands() {
  if (!fs.existsSync(BRANDS_DIR)) return [];
  return fs.readdirSync(BRANDS_DIR)
    .filter((d) => fs.existsSync(path.join(BRANDS_DIR, d, 'brandkit.json')))
    .map((id) => {
      const kit = loadBrand(id);
      return { id, name: kit?.name || id, colors: kit?.colors?.slice(0, 6) || [] };
    });
}

export function loadBrand(id) {
  const p = path.join(BRANDS_DIR, id, 'brandkit.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function saveBrand(kit) {
  const dir = path.join(BRANDS_DIR, kit.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'brandkit.json'), JSON.stringify(kit, null, 2));
  return kit;
}
