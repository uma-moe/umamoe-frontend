import { expect, it } from 'vitest';
import { finalSpurtSection } from './final-spurt';

it('marks the full final third as the spurt opportunity, separate from the final sixth', () => {
  expect(finalSpurtSection(1200)).toMatchObject({ start: 800, end: 1200 });
  expect(finalSpurtSection(2500).start).toBeCloseTo(1666.6667);
});
