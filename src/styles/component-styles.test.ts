// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { compile, preprocess } from 'svelte/compiler';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { format } from 'prettier';
import { expect, it } from 'vitest';

it('keeps companion CSS scoped to its component and tracks edits to that stylesheet', async () => {
  const filename = path.resolve('src/components/cards/CircleCard.svelte');
  const stylesheet = path.resolve('src/components/cards/circle-card.css');
  const source = readFileSync(filename, 'utf8');
  const inline = source.replace("@import './circle-card.css';", readFileSync(stylesheet, 'utf8'));
  const processed = await preprocess(source, vitePreprocess(), { filename });
  const options = { filename, cssHash: () => 'svelte-style-contract' };

  const expected = compile(inline, options).css!.code;
  const actual = compile(processed.code, options).css!.code;

  expect(await format(actual, { parser: 'css' })).toBe(await format(expected, { parser: 'css' }));
  expect(actual).toContain('.svelte-style-contract');
  expect(processed.dependencies?.map((dependency) => path.resolve(dependency))).toContain(
    stylesheet
  );
});
