import { expect, it } from 'vitest';
import { memberProgressionOption } from './club-chart';
import type { ClubChartMember } from '@/lib/clubs/club-progression';

it('renders prior and solid runs without drawing into trailing carries, retaining safe tooltip values', () => {
  const member: ClubChartMember = {
    viewerId: 1,
    name: '<b>Trainer</b>',
    color: '#64b5f6',
    values: [10, 20, 20, 20],
    priorClub: [true, false, false, false],
    carriedForward: [false, false, false, true]
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
