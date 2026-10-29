import { readFileSync } from 'node:fs';

// On a manual major/minor bump, set buildNumberBase to its first workflow run number.
// CI advances only the patch; rerunning the same workflow keeps the same version.
const { version, buildNumberBase } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const build = process.env.GITHUB_RUN_NUMBER;
if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[1-9]\d*$/.test(build ?? '') || !Number.isSafeInteger(Number(build)) || !Number.isSafeInteger(buildNumberBase) || buildNumberBase < 1 || Number(build) < buildNumberBase) {
  throw new Error('Expected a major.minor.patch version and a GITHUB_RUN_NUMBER at or above buildNumberBase.');
}
const [major, minor, patch] = version.split('.').map(Number);
const nextPatch = patch + Number(build) - buildNumberBase;
if (![major, minor, nextPatch].every(Number.isSafeInteger)) throw new Error('Build version exceeds safe integer bounds.');
console.log(`${major}.${minor}.${nextPatch}`);
