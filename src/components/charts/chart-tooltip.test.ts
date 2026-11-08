import { expect, it } from 'vitest';
import { chartTooltipContent } from './chart-tooltip';

it('lists each row after the title with its marker and value', () => {
  const content = chartTooltipContent('806 m', [
    { label: 'HP', value: '1,940', color: '#7cc6a0' },
    { label: 'Groundwork' }
  ]);

  expect(content.indexOf('806 m')).toBeLessThan(content.indexOf('HP'));
  expect(content).toContain('background-color:#7cc6a0');
  expect(content).toContain('font-weight:900">1,940</span>');
  expect(content).toContain('>Groundwork</span><div style="clear:both">');
});

it('escapes titles, labels and values', () => {
  const content = chartTooltipContent('<title>', [{ label: '<skill>', value: '"value"' }]);

  expect(content).not.toMatch(/<title>|<skill>|"value"/);
  expect(content).toContain('&lt;skill&gt;');
});
