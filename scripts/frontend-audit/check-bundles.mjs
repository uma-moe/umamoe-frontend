import { brotliCompressSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';

const reportOnly = process.argv.includes('--report-only');
const root = process.cwd();
const statsPath = resolve(root, 'dist/stats.json');
const budgets = JSON.parse(readFileSync(resolve(root, 'audit/frontend-budgets.json'), 'utf8'));
const stats = JSON.parse(readFileSync(statsPath, 'utf8'));
const outputs = stats.outputs ?? {};

const normalizedOutputKeys = new Map(
  Object.keys(outputs).map(key => [normalize(key), key]),
);

function isEmittedFile(key) {
  return !key.endsWith('.map') && !key.endsWith('/');
}

function isBundleFile(key) {
  return /\.(?:css|js)$/i.test(key);
}

function normalizeEntryPoint(value = '') {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function resolveImportKey(importerKey, importPath) {
  const candidates = [
    normalize(importPath),
    normalize(join(dirname(importerKey), importPath)),
    normalize(join(dirname(importerKey), importPath.replace(/^\.\//, ''))),
  ];
  return candidates.map(candidate => normalizedOutputKeys.get(candidate)).find(Boolean);
}

function staticClosure(seedKeys) {
  const closure = new Set();
  const queue = [...seedKeys];
  while (queue.length) {
    const key = queue.pop();
    if (!key || closure.has(key) || !isEmittedFile(key) || !isBundleFile(key)) continue;
    closure.add(key);
    for (const imported of outputs[key]?.imports ?? []) {
      if (imported.external || imported.kind === 'dynamic-import') continue;
      const resolved = resolveImportKey(key, imported.path);
      if (resolved) queue.push(resolved);
    }
  }
  return closure;
}

function outputForEntryPoint(entryPoint) {
  const expected = normalizeEntryPoint(entryPoint);
  return Object.keys(outputs).find(key => normalizeEntryPoint(outputs[key]?.entryPoint) === expected);
}

function emittedPath(key) {
  const direct = resolve(root, key);
  if (existsSync(direct)) return direct;
  const browserRelative = key.replace(/^dist[\\/]browser[\\/]/, '');
  const inBrowser = resolve(root, 'dist/browser', browserRelative);
  return existsSync(inBrowser) ? inBrowser : null;
}

function sumBytes(keys) {
  return [...keys].reduce((total, key) => total + Number(outputs[key]?.bytes ?? 0), 0);
}

function sumBrotliBytes(keys) {
  return [...keys].reduce((total, key) => {
    const path = emittedPath(key);
    if (!path || !statSync(path).isFile()) return total;
    return total + brotliCompressSync(readFileSync(path)).byteLength;
  }, 0);
}

const initialSeeds = Object.keys(outputs).filter(key => {
  const entry = normalizeEntryPoint(outputs[key]?.entryPoint);
  const base = key.replaceAll('\\', '/').split('/').pop() ?? '';
  return entry === 'src/main.ts'
    || entry.includes('angular:polyfills')
    || entry.includes('angular:styles')
    || base === 'polyfills.js'
    || base === 'styles.css';
});
const initialClosure = staticClosure(initialSeeds);
const globalCssKey = [...initialClosure].find(key => /(?:^|[\\/])styles(?:-[^\\/]*)?\.css$/.test(key));
const initialAssets = new Set();
for (const key of initialClosure) {
  for (const imported of outputs[key]?.imports ?? []) {
    const resolved = resolveImportKey(key, imported.path);
    if (resolved && isEmittedFile(resolved) && !isBundleFile(resolved)) initialAssets.add(resolved);
  }
}

const result = {
  generatedAt: new Date().toISOString(),
  initial: {
    rawBytes: sumBytes(initialClosure),
    transferredBytes: sumBrotliBytes(initialClosure),
    files: initialClosure.size,
    globalCssBytes: globalCssKey ? Number(outputs[globalCssKey]?.bytes ?? 0) : 0,
    outputs: [...initialClosure].sort(),
    assets: {
      rawBytes: sumBytes(initialAssets),
      transferredBytes: sumBrotliBytes(initialAssets),
      files: initialAssets.size,
      outputs: [...initialAssets].sort(),
    },
  },
  routes: {},
};

for (const [name, budget] of Object.entries(budgets.routes)) {
  const entryOutput = outputForEntryPoint(budget.entryPoint);
  if (!entryOutput) {
    result.routes[name] = { error: `No output found for ${budget.entryPoint}`, maxBytes: budget.maxBytes };
    continue;
  }
  const closure = staticClosure([entryOutput]);
  for (const initialKey of initialClosure) closure.delete(initialKey);
  result.routes[name] = {
    rawBytes: sumBytes(closure),
    transferredBytes: sumBrotliBytes(closure),
    files: closure.size,
    maxBytes: budget.maxBytes,
    entryPoint: budget.entryPoint,
    outputs: [...closure].sort(),
  };
}

const reportDir = resolve(root, 'reports/frontend-audit');
mkdirSync(reportDir, { recursive: true });
writeFileSync(join(reportDir, 'bundle-report.json'), `${JSON.stringify(result, null, 2)}\n`);

const failures = [];
for (const [metric, maximum] of Object.entries(budgets.initial)) {
  if (result.initial[metric] > maximum) {
    failures.push(`initial ${metric}: ${result.initial[metric]} > ${maximum}`);
  }
}
for (const [name, route] of Object.entries(result.routes)) {
  if (route.error) failures.push(`${name}: ${route.error}`);
  else if (route.rawBytes > route.maxBytes) failures.push(`${name}: ${route.rawBytes} > ${route.maxBytes}`);
}

console.table({
  initial: {
    raw: result.initial.rawBytes,
    brotli: result.initial.transferredBytes,
    files: result.initial.files,
    budget: budgets.initial.rawBytes,
  },
  ...Object.fromEntries(Object.entries(result.routes).map(([name, route]) => [name, {
    raw: route.rawBytes ?? 'missing',
    brotli: route.transferredBytes ?? 'missing',
    files: route.files ?? 'missing',
    budget: route.maxBytes,
  }])),
});

if (failures.length) {
  console.error(`\nBundle budget failures:\n- ${failures.join('\n- ')}`);
  if (!reportOnly) process.exitCode = 1;
}
