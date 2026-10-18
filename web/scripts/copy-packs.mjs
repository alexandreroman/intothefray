// Copies the generated card packs into public/ so the app can fetch
// them as static files (packs/en/index.json, ...).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(scriptDir, '../../packs/dist');
const target = path.resolve(scriptDir, '../public/packs');

if (!fs.existsSync(source)) {
  console.error(`copy-packs: source directory not found: ${source} (run "make packs")`);
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
console.log(`copy-packs: ${source} -> ${target}`);
