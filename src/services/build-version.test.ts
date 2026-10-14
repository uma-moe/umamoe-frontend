// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('starts at the manual version, advances only its patch, and rejects invalid build numbers', () => {
  const { version, buildNumberBase } = JSON.parse(readFileSync('package.json', 'utf8'));
  const [major, minor, patch] = version.split('.').map(Number);
  for (const offset of [0, 1, 2, 0]) {
    const result = execFileSync(process.execPath, ['scripts/build-version.mjs'], { env: { ...process.env, GITHUB_RUN_NUMBER: String(buildNumberBase + offset) }, encoding: 'utf8' });
    expect(result.trim()).toBe(`${major}.${minor}.${patch + offset}`);
  }
  for (const invalid of ['', '0', '-1', '1.5', 'abc', String(buildNumberBase - 1), '9007199254740993']) {
    expect(spawnSync(process.execPath, ['scripts/build-version.mjs'], { env: { ...process.env, GITHUB_RUN_NUMBER: invalid } }).status).not.toBe(0);
  }
});
