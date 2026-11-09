import { expect, it } from 'vitest';
import { memberProgressionOption } from './club-chart';
import type { ClubChartMember } from '@/lib/clubs/club-progression';

it('renders prior and solid runs without drawing into trailing carries, retaining safe tooltip values', () => {
  const member: ClubChartMember = {
    viewerId: 1,
    name: '<b>Trainer</b>',
    color: '#64b5f6',
    values: [10, 20, 20, 20],
    segments: ['club', 'prior', 'club', 'club'],
    carriedForward: [false, false, false, true],
    untrackedDays: [0, 0, 0, 0]
  };

  const option = memberProgressionOption(
    ['01.09', '02.09', '03.09', '04.09'],
    [member],
    'cumulative',
    1
  );

  const series = option.series as Array<{
    data: Array<number | null>;
    lineStyle: { type?: string | number[]; width?: number };
  }>;

  expect(series.map((series) => series.data)).toEqual([
    [10, 20, 20, 20],
    [10, 20],
    [null, 20, 20]
  ]);
  expect(series.slice(1).map((series) => series.lineStyle)).toEqual([
    { width: 4, color: '#64b5f6', type: [6, 4] },
    { width: 4, color: '#64b5f6', type: 'solid' }
  ]);

  const body = (option.tooltip as { formatter: (params: unknown) => HTMLElement }).formatter([
    { dataIndex: 1 }
  ]);

  expect(body.textContent).toContain('<b>Trainer</b>: 20 (+10)');
  expect(body.querySelector('b')).toBeNull();
});

it('draws untracked gaps dotted and labels their values as spread over the gap', () => {
  const member: ClubChartMember = {
    viewerId: 1,
    name: 'Trainer',
    color: '#64b5f6',
    values: [5, 10, 10, 5],
    segments: ['prior', 'untracked', 'untracked', 'club'],
    carriedForward: [false, false, false, false],
    untrackedDays: [0, 2, 2, 0]
  };

  const option = memberProgressionOption(['01.09', '02.09', '03.09', '04.09'], [member], 'delta');

  const runs = (option.series as Array<{ lineStyle: { type?: string | number[] } }>).slice(1);
  expect(runs.map((run) => run.lineStyle.type)).toEqual([[2, 4], 'solid']);

  const body = (option.tooltip as { formatter: (params: unknown) => HTMLElement }).formatter([
    { dataIndex: 1 }
  ]);

  expect(body.textContent).toContain('Trainer: +10 avg of 2 untracked days');
});
