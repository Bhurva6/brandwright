// Content-addressed blob store. A generated image is keyed by the hash of its
// recipe, so identical requests are instant and a liked render is pinned forever.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Vercel's function FS is read-only except /tmp — blobs live there (ephemeral).
export const BLOB_DIR = process.env.VERCEL ? '/tmp/bw-blobs' : path.resolve(__dirname, '../.assets/blobs');
try { fs.mkdirSync(BLOB_DIR, { recursive: true }); } catch { /* read-only fs */ }

export const hashKey = (obj) => crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 24);
export const blobUrl = (hash) => `/assets/blobs/${hash}.png`;
export const blobPath = (hash) => path.join(BLOB_DIR, hash + '.png');
export const hasBlob = (hash) => fs.existsSync(blobPath(hash));

export function putBlob(hash, buf) {
  fs.writeFileSync(blobPath(hash), buf);
  return blobUrl(hash);
}
