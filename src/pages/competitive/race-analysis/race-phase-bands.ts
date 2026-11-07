/** An ECharts mark area: the styled start point and the end point along the x axis. */
export type PhaseMarkArea = [Record<string, unknown>, { xAxis: number }];

/** The race's four phases as shares of the course, tinted alike in every race analysis chart. */
export const racePhaseBands = [
  { name: 'Early race', start: 0, end: 1 / 6, color: '#b5b9c2' },
  { name: 'Mid race', start: 1 / 6, end: 2 / 3, color: '#6ab7ee' },
  { name: 'Late race', start: 2 / 3, end: 5 / 6, color: '#dfba72' },
  { name: 'Final leg', start: 5 / 6, end: 1, color: '#bd91d1' }
] as const;

export type RacePhaseBand = (typeof racePhaseBands)[number];

/** A phase's tinted background between two x-axis values, named at its top unless `labelled` is off. */
export function phaseBandArea({
  phase,
  start,
  end,
  dark,
  labelled = true
}: {
  phase: RacePhaseBand;
  start: number;
  end: number;
  dark: boolean;
  labelled?: boolean;
}): PhaseMarkArea {
  return [
    {
      name: phase.name,
      xAxis: start,
      itemStyle: { color: phase.color, opacity: 0.07 },
      label: {
        show: labelled,
        position: 'insideTop',
        fontSize: 9,
        color: dark ? '#abb4c3' : '#566071',
        formatter: phase.name.replace(' race', '')
      }
    },
    { xAxis: end }
  ];
}
