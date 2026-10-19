// Copies the index of each language of the generated card packs into public/
// so the app can fetch it as a static file (packs/en/index.json, ...). The
// cards of a game come from the API, so the pack files themselves stay out.
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

// Start from an empty target, so no file of a previous copy lingers.
fs.rmSync(target, { recursive: true, force: true });

const languages = fs
  .readdirSync(source, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const lang of languages) {
  const index = path.join(source, lang, 'index.json');
  if (!fs.existsSync(index)) {
    console.error(`copy-packs: index not found: ${index} (run "make packs")`);
    process.exit(1);
  }
  fs.mkdirSync(path.join(target, lang), { recursive: true });
  fs.copyFileSync(index, path.join(target, lang, 'index.json'));
  console.log(`copy-packs: ${index} -> ${path.join(target, lang, 'index.json')}`);
}
