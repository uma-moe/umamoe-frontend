/**
 * Post-build image compression script.
 * Converts PNG images to WebP in dist/browser/assets/.
 * Updates all .png references in built JS/CSS/HTML to .webp.
 * Caches converted WebP files in .webp-cache/ to skip unchanged images.
 * Source images in src/ are never touched.
 *
 * Usage: node scripts/compress-images.js
 */
const sharp = require('sharp');
const archiver = require('archiver');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const DIST = path.resolve(__dirname, '..', 'dist', 'browser');
const DIST_ASSETS = path.join(DIST, 'assets');
const CACHE_DIR = path.resolve(__dirname, '..', '.webp-cache');
const ZIP_OUTPUT = path.resolve(__dirname, '..', 'dist', 'release.zip');
const WEBP_QUALITY = 80;

function hashBuffer(buf) {
  return crypto.createHash('xxhash64' in crypto ? 'xxhash64' : 'md5').update(buf).digest('hex');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function findFiles(dir, ext) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(await findFiles(full, ext));
    } else if (entry.name.toLowerCase().endsWith(ext)) {
      files.push(full);
    }
  }
  return files;
}

async function convertToWebp(filePath) {
  const original = fs.readFileSync(filePath);
  const originalSize = original.length;
  const webpPath = filePath.replace(/\.png$/i, '.webp');
  const hash = hashBuffer(original);
  const cachePath = path.join(CACHE_DIR, hash + '.webp');

  try {
    // Check cache first
    if (fs.existsSync(cachePath)) {
      const cached = fs.readFileSync(cachePath);
      fs.writeFileSync(webpPath, cached);
      fs.unlinkSync(filePath);
      return { file: filePath, before: originalSize, after: cached.length, converted: true, cached: true };
    }

    const webpBuffer = await sharp(original)
      .webp({ quality: WEBP_QUALITY, effort: 6 })
      .toBuffer();

    // Write to dist and cache
    fs.writeFileSync(webpPath, webpBuffer);
    fs.writeFileSync(cachePath, webpBuffer);
    fs.unlinkSync(filePath);
    return { file: filePath, before: originalSize, after: webpBuffer.length, converted: true, cached: false };
  } catch {
    return { file: filePath, before: originalSize, after: originalSize, converted: false, skipped: true };
  }
}

function rewriteReferences() {
  // Find all JS, CSS, HTML files in dist/browser/
  const textFiles = fs.readdirSync(DIST)
    .filter(f => /\.(js|css|html)$/.test(f))
    .map(f => path.join(DIST, f));

  let totalReplacements = 0;
  for (const file of textFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const updated = content.replaceAll('.png', '.webp');
    if (updated !== content) {
      fs.writeFileSync(file, updated, 'utf8');
      const count = (content.match(/\.png/g) || []).length;
      totalReplacements += count;
    }
  }
  return totalReplacements;
}

async function run() {
  if (!fs.existsSync(DIST_ASSETS)) {
    console.error(`Assets directory not found: ${DIST_ASSETS}`);
    console.error('Run ng build first.');
    process.exit(1);
  }

  // Step 1: Convert PNGs to WebP
  ensureDir(CACHE_DIR);
  const files = await findFiles(DIST_ASSETS, '.png');
  console.log(`Found ${files.length} PNG files to convert to WebP...\n`);

  let totalBefore = 0;
  let totalAfter = 0;
  let convertedCount = 0;
  let cachedCount = 0;
  let skippedCount = 0;

  const BATCH_SIZE = 50;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(f => convertToWebp(f)));

    for (const r of results) {
      totalBefore += r.before;
      totalAfter += r.after;
      if (r.converted) convertedCount++;
      if (r.cached) cachedCount++;
      if (r.skipped) skippedCount++;
    }

    const progress = Math.min(i + BATCH_SIZE, files.length);
    process.stdout.write(`\r  Converted ${progress}/${files.length} images...`);
  }

  // Step 2: Rewrite .png → .webp in built JS/CSS/HTML
  console.log('\n  Rewriting references in built files...');
  const refCount = rewriteReferences();

  const savedMB = ((totalBefore - totalAfter) / 1024 / 1024).toFixed(2);
  const pct = ((1 - totalAfter / totalBefore) * 100).toFixed(1);

  console.log(`\n  Results:`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  Total images:  ${files.length}`);
  console.log(`  Converted:     ${convertedCount} (.png → .webp)`);
  console.log(`  From cache:    ${cachedCount}`);
  console.log(`  Freshly done:  ${convertedCount - cachedCount}`);
  console.log(`  Skipped:       ${skippedCount} (unsupported format)`);
  console.log(`  References:    ${refCount} updated in JS/CSS/HTML`);
  console.log(`  Before:        ${(totalBefore / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  After:         ${(totalAfter / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Saved:         ${savedMB} MB (${pct}%)`);
  console.log(`  ─────────────────────────────────────\n`);

  // Step 3: Create zip archive
  console.log('  Creating release.zip...');
  await createZip();
}

function createZip() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(ZIP_OUTPUT);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`  ✓ release.zip: ${sizeMB} MB\n`);
      resolve();
    });

    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(DIST, false);
    archive.finalize();
  });
}

run().catch(err => {
  console.error('Compression failed:', err);
  process.exit(1);
});
