import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { previews } from './catalog';

test('gallery previews reference components reachable from the app without the gallery', () => {
  const files = new Set(readdirSync('src', { recursive:true }).filter(file => typeof file === 'string' && /\.(svelte|ts|css)$/.test(file)).map(file => 'src/' + String(file).replaceAll('\\','/')));
  const visited = new Set<string>();
  function visit(file: string) {
    if (visited.has(file) || file.startsWith('src/pages/ui/')) return;
    visited.add(file);
    for (const match of readFileSync(file,'utf8').matchAll(/(?:from\s*|import\s*(?:\(\s*)?)(['"])([^'"]+)\1/g)) {
      const spec = match[2]!;
      const stem = spec.startsWith('@/') ? 'src/' + spec.slice(2) : spec.startsWith('.') ? path.posix.join(path.posix.dirname(file),spec) : '';
      const target = [stem,stem+'.ts',stem+'.svelte',stem+'/index.ts'].find(candidate => files.has(candidate));
      if (target) visit(target);
    }
  }
  visit('src/main.ts');
  expect(new Set(previews.map(item => item.id)).size).toBe(previews.length);
  for (const entry of previews) for (const component of entry.components) expect(visited.has('src/'+component), component + ' is only a demo or a retired component').toBe(true);
  for (const file of files) if (file.startsWith('src/components/') && file.endsWith('.svelte')) expect(visited.has(file), file + ' is unused').toBe(true);
});
