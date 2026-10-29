import { expect, it, vi } from 'vitest';
const resourceData = vi.hoisted(() => ({
  factors: [{ id: '200010', text: 'Old Skill ○', type: 3 }]
}));

vi.mock('@/lib/game-data/factors/factors', () => ({
  factorOptions: () => [...resourceData.factors]
}));

import { namedUqlFactors, scopedUqlFactors, buildScopedSparkFields } from './uql-fields';
import { UqlCompiler } from './uql-compiler';

it('reuses unchanged factor indexes and replaces them when the resource resourceData changes', () => {
  const named = namedUqlFactors(),
    scoped = scopedUqlFactors(named),
    fields = buildScopedSparkFields(scoped);

  const first = new UqlCompiler(),
    second = new UqlCompiler();

  expect(namedUqlFactors()).toBe(named);
  expect(scopedUqlFactors()).toBe(scoped);
  expect(buildScopedSparkFields(scoped)).toBe(fields);
  expect(fields.every((field) => new Set(field.aliases).size === field.aliases.length)).toBe(true);
  expect(first.compile('GP1 Old Skill >= 2')).toBe(
    'overlaps(left_white_factors, (2000102, 2000103))'
  );
  expect(second.compile('GP1 Old Skill >= 2')).toBe(first.compile('GP1 Old Skill >= 2'));
  resourceData.factors = [{ id: '200020', text: 'New Skill ○', type: 3 }];
  expect(namedUqlFactors()).not.toBe(named);
  expect(buildScopedSparkFields(scopedUqlFactors())).not.toBe(fields);
  expect(new UqlCompiler().compile('GP1 New Skill >= 2')).toBe(
    'overlaps(left_white_factors, (2000202, 2000203))'
  );
});
