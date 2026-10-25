// Copies the index of the generated card packs into public/ so the app can
// fetch it as a static file (packs/en/index.json): the generated data is
// English, localized names live inside it. The cards of a game come from the
// API, so the pack files themselves stay out.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(scriptDir, '../../packs/dist/en/index.json');
const target = path.resolve(scriptDir, '../public/packs');

if (!fs.existsSync(source)) {
  console.error(`copy-packs: index not found: ${source} (run "make packs")`);
  process.exit(1);
}

// Start from an empty target, so no file of a previous copy lingers.
fs.rmSync(target, { recursive: true, force: true });

const copy = path.join(target, 'en', 'index.json');
fs.mkdirSync(path.dirname(copy), { recursive: true });
fs.copyFileSync(source, copy);
console.log(`copy-packs: ${source} -> ${copy}`);
