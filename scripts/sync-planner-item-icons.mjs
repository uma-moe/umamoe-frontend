import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ITEM_IDS = [41, 43, 111, 141, 164, 165, 178, 197, 205, 214, 255];
const API_URL = 'https://wiki.biligame.com/umamusume/api.php';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.join(ROOT, 'src', 'assets', 'images', 'item');

const itemFilename = itemId => itemId.toString().padStart(5, '0');
const titles = ITEM_IDS.map(itemId => `File:Item icon ${itemFilename(itemId)}.png`).join('|');
const query = new URLSearchParams({
  action: 'query',
  format: 'json',
  prop: 'imageinfo',
  iiprop: 'url|size',
  titles,
});

const metadataResponse = await fetch(`${API_URL}?${query}`);
if (!metadataResponse.ok) {
  throw new Error(`Item icon metadata request failed (${metadataResponse.status}).`);
}
const metadata = await metadataResponse.json();
const pages = Object.values(metadata?.query?.pages ?? {});
const sources = new Map();
for (const page of pages) {
  const match = String(page.title ?? '').match(/(\d{5})\.png$/i);
  const sourceUrl = page.imageinfo?.[0]?.url;
  if (match && sourceUrl) sources.set(Number(match[1]), sourceUrl);
}

await mkdir(OUTPUT_DIR, { recursive: true });
for (const itemId of ITEM_IDS) {
  const sourceUrl = sources.get(itemId);
  if (!sourceUrl) throw new Error(`No source image was found for item ${itemId}.`);
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Item ${itemId} download failed (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const outputPath = path.join(OUTPUT_DIR, `item_icon_${itemFilename(itemId)}.webp`);
  await sharp(bytes)
    .resize(96, 96, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(outputPath);
  console.log(`Prepared ${path.relative(ROOT, outputPath)}`);
}
