import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const cli = resolve('node_modules/@lhci/cli/src/cli.js');
const configs = process.argv.includes('--live')
  ? ['lighthouse/live-comparison.json']
  : [
      'lighthouse/mobile-shell.json',
      'lighthouse/mobile-heavy.json',
      'lighthouse/desktop-shell.json',
      'lighthouse/desktop-heavy.json',
    ];

for (const config of configs) {
  const result = spawnSync(process.execPath, [cli, 'autorun', `--config=${config}`], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
