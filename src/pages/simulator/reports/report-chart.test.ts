import { expect, it } from 'vitest';
import { courseChart } from './report-chart';
import type { ReportBand } from './simulation-report';

it('keeps final-spurt and baseline markers together on course-distance charts', () => {
  const bands: ReportBand[] = [
    [0, 0, 0, 0, 1],
    [2, 1, 2, 3, 1]
  ];
  const option = courseChart(
    [0, 1200],
    [{ source: 0, name: 'Runner', bands }],
    [],
    true,
    undefined,
    { format: String, zero: true }
  );

  expect(option.series).toMatchObject([
    { markLine: { data: [{ name: 'Final spurt window', xAxis: 800 }, { yAxis: 0 }] } }
  ]);
});
