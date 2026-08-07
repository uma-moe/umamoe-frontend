import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const executable = resolve('node_modules/jscpd/run-jscpd.js');
const run = spawnSync(process.execPath, [executable, '--config', '.jscpd.json'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});
process.stdout.write(run.stdout ?? '');
process.stderr.write(run.stderr ?? '');
if (run.error) throw run.error;

const reportPath = resolve('reports/jscpd/jscpd-report.json');
if (!existsSync(reportPath)) {
  console.error(`Clone report was not created at ${reportPath}.`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const statistics = report.statistics ?? {};
const formats = statistics.formats ?? {};
const percentage = value => Number(value?.percentage ?? 0);
const actual = {
  overall: percentage(statistics.total),
  markup: Math.max(percentage(formats.markup), percentage(formats.html)),
  typescript: percentage(formats.typescript),
  scss: percentage(formats.scss),
};
const limits = { overall: 2, markup: 4, typescript: 1.75, scss: 2 };
const failures = Object.entries(limits)
  .filter(([name, limit]) => actual[name] > limit)
  .map(([name, limit]) => `${name}: ${actual[name]}% > ${limit}%`);

console.table(Object.fromEntries(Object.keys(limits).map(name => [name, {
  duplicated: `${actual[name]}%`,
  budget: `${limits[name]}%`,
}])));
if (failures.length) {
  console.error(`Clone budget failures:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
