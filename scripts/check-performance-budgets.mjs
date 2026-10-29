import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = path.join(process.cwd(), 'dist');
const manifest = JSON.parse(await readFile(path.join(dist, '.vite', 'manifest.json'), 'utf8'));
const limits = { js: 100 * 1024, css: 35 * 1024 };
const totals = { js: 0, css: 0 };
const files = new Set();

function collectStaticGraph(key) {
  const entry = manifest[key];
  if (!entry) return;
  if (entry.file) files.add(entry.file);
  for (const css of entry.css ?? []) files.add(css);
  for (const imported of entry.imports ?? []) collectStaticGraph(imported);
}

// Include injected entry scripts such as the browser compatibility polyfills.
for (const [key, entry] of Object.entries(manifest)) {
  if (entry.isEntry) collectStaticGraph(key);
}

for (const file of files) {
  const kind = file.endsWith('.js') ? 'js' : file.endsWith('.css') ? 'css' : undefined;
  if (!kind) continue;
  totals[kind] += gzipSync(await readFile(path.join(dist, file))).byteLength;
}

const failures = Object.entries(limits).filter(([kind, limit]) => totals[kind] > limit);
for (const [kind, bytes] of Object.entries(totals)) {
  console.log(`Base shell ${kind.toUpperCase()} compressed: ${(bytes / 1024).toFixed(1)} KiB / ${(limits[kind] / 1024).toFixed(0)} KiB`);
}

const labEntries = Object.values(manifest).filter((entry) => entry.src?.includes('src/pages/ui/') && entry.isDynamicEntry);
if (labEntries.length) console.log(`Lazy UI Lab chunks: ${labEntries.map((entry) => entry.file).join(', ')} (loaded only when opened)`);

if (failures.length) {
  throw new Error(`Performance budget exceeded: ${failures.map(([kind]) => kind).join(', ')}`);
}
