import fs from 'node:fs';
import path from 'node:path';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

// Native startup/shutdown profiles. Keep every >50 ms event-delay interval,
// including automation and browser-only work, rather than hiding non-app stalls.
const [directory = '.tmp/firefox-profiles', maps = 'dist/app'] = process.argv.slice(2);
const files = fs.readdirSync(directory).filter(file => /^firefox-.*\.json$/.test(file));
const sourceMaps = new Map(), result = [], workflows = new Set();
const top = counts => [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, ms]) => ({ name, ms: +ms.toFixed(1) }));
function source(location) {
  const match = location.match(/\/app\/([^/:]+\.js)(?: line \d+ > importedModule)?:(\d+):(\d+)/);
  if (!match) return location;
  if (!sourceMaps.has(match[1])) {
    const file = path.join(maps, match[1] + '.map');
    sourceMaps.set(match[1], fs.existsSync(file) ? new TraceMap(JSON.parse(fs.readFileSync(file))) : null);
  }
  const map = sourceMaps.get(match[1]);
  if (!map) return location;
  const original = originalPositionFor(map, { line: Number(match[2]), column: Math.max(0, Number(match[3]) - 1) });
  return original.source ? `${original.source}:${original.line} ${original.name ?? location.split(' (')[0]}` : location;
}
for (const file of files) {
  const profile = JSON.parse(fs.readFileSync(path.join(directory, file)));
  function visit(process) {
    for (const thread of process.threads) {
      if (thread.name !== 'GeckoMain' || thread.processType !== 'tab') continue;
      const strings = thread.stringTable;
      if (!strings.some(s => s.includes('127.0.0.1:4184'))) continue;
      const ms = thread.markers.schema, markers = [], stamps = [], pending = new Map();
      for (const row of thread.markers.data) {
        const name = strings[row[ms.name]], data = row[ms.data], start = row[ms.startTime], end = row[ms.endTime], phase = row[ms.phase];
        const label = data?.name ?? data?.message ?? data?.label;
        if (typeof label === 'string' && /^(Workflow|Click|Action): /.test(label)) {
          stamps.push({ time: start, label });
          if (label.startsWith('Workflow: ')) workflows.add(label.slice(10));
        }
        if (phase === 2) { const stack = pending.get(name) ?? []; stack.push(start); pending.set(name, stack); }
        else if (phase === 3) { const begin = pending.get(name)?.pop(); if (begin !== undefined) markers.push({ name, start: begin, end }); }
        else if (phase === 1) markers.push({ name, start, end });
      }
      stamps.sort((a, b) => a.time - b.time);
      const ss = thread.samples.schema, samples = thread.samples.data, peaks = samples.map(row => ({ time: row[ss.time], delay: row[ss.eventDelay] ?? 0 })).filter(s => s.delay > 50).sort((a, b) => b.delay - a.delay), stalls = [];
      for (const peak of peaks) if (!stalls.some(s => peak.time >= s.time - s.delay && peak.time <= s.time + 5)) stalls.push(peak);
      const frameSchema = thread.frameTable.schema, stackSchema = thread.stackTable.schema;
      const locations = thread.frameTable.data.map(frame => source(strings[frame[frameSchema.location]]));
      for (const peak of stalls) {
        const start = peak.time - peak.delay, end = peak.time, js = new Map(), self = new Map(), categories = new Map();
        for (let i = 0; i < samples.length; i++) {
          const row = samples[i], time = row[ss.time];
          const weight = Math.max(0, Math.min(time, end) - Math.max(i ? samples[i - 1][ss.time] : time - 1, start));
          if (!weight) continue;
          let stack = row[ss.stack], leaf = true, category; const seen = new Set();
          while (stack != null) {
            const entry = thread.stackTable.data[stack], frameIndex = entry[stackSchema.frame], frame = thread.frameTable.data[frameIndex], location = locations[frameIndex];
            if (leaf) {
              self.set(location, (self.get(location) ?? 0) + weight);
              leaf = false;
            }
            if (category === undefined && frame[frameSchema.category] != null) category = profile.meta.categories[frame[frameSchema.category]]?.name;
            if (/127\.0\.0\.1|\/src\/|node_modules|juggler|playwright|utilityScript|injectedScript/i.test(location) && !seen.has(location)) { js.set(location, (js.get(location) ?? 0) + weight); seen.add(location); }
            stack = entry[stackSchema.prefix];
          }
          categories.set(category ?? 'Unknown', (categories.get(category ?? 'Unknown') ?? 0) + weight);
        }
        result.push({ file, pid: thread.pid, delayMs: +peak.delay.toFixed(1), startMs: +(start + process.meta.startTime - profile.meta.startTime).toFixed(1),
          workflow: stamps.findLast(s => s.time <= end && s.label.startsWith('Workflow: '))?.label,
          action: stamps.findLast(s => s.time <= start && !s.label.startsWith('Workflow: '))?.label,
          categories: top(categories), self: top(self), inclusive: top(js), application: top(new Map([...js].filter(([name]) => name.includes('/src/') && !name.includes('node_modules/')))),
          markers: markers.filter(m => m.end > start && m.start < end && m.end - m.start > 2 && !/^(Load |IPC |CSS|Animation)/.test(m.name))
            .map(m => ({ name: m.name, ms: +(m.end - m.start).toFixed(1), overlapMs: +(Math.min(end, m.end) - Math.max(start, m.start)).toFixed(1) })).sort((a, b) => b.overlapMs - a.overlapMs).slice(0, 15)
        });
      }
    }
    for (const child of process.processes ?? []) visit(child);
  }
  visit(profile);
}
result.sort((a, b) => b.delayMs - a.delayMs);
fs.writeFileSync(path.join(directory, 'stalls.json'), JSON.stringify({ workflows: [...workflows], stalls: result }, null, 2));
console.log(JSON.stringify({ recordings: files.length, workflows: workflows.size, stalls: result.map(s => ({ ms: s.delayMs, workflow: s.workflow, action: s.action, functions: s.application.slice(0, 4), markers: s.markers.slice(0, 4) })) }, null, 2));
