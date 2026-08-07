import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const npmCli = process.env.npm_execpath
  ?? resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
if (!existsSync(npmCli)) throw new Error(`Unable to locate npm CLI at ${npmCli}`);

for (const script of ['audit:bundle', 'audit:duplicates', 'audit:routes', 'audit:lighthouse']) {
  const result = spawnSync(process.execPath, [npmCli, 'run', script], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
