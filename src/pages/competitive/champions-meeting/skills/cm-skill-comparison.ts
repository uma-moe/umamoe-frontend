import type { SkillDetail } from '../cm-exploration';

export type SkillDistribution = {
  id: number;
  detail?: SkillDetail;
  bins: number[];
  total: number;
  timing?: { mean: number; median: number };
};

// Distinct dashes keep the legend usable without relying on hue alone.
const firstStyle = { color: 'var(--comparison-blue)', dash: '' };
const seriesStyles = [
  firstStyle,
  { color: 'var(--comparison-amber)', dash: '8 4' },
  { color: 'var(--comparison-pink)', dash: '2 4' },
  { color: 'var(--comparison-teal)', dash: '10 3 2 3' },
  { color: 'var(--comparison-purple)', dash: '5 3' },
  { color: 'var(--comparison-yellow)', dash: '12 4' }
];

export function comparisonLines(distributions: SkillDistribution[]) {
  const lines = distributions.map((series, index) => {
    const appearance = seriesStyles[index % seriesStyles.length] ?? firstStyle;
    const peak = Math.max(0, ...series.bins);
    const normalizedBins = series.bins.map((count) => (peak ? count / peak : 0));

    return {
      ...series,
      ...appearance,
      normalizedBins,
      path: normalizedBins
        .map(
          (height, bucket) =>
            (bucket === 0 ? 'M' : 'L') + (bucket * 10 + 5) + ',' + (96 - height * 72).toFixed(2)
        )
        .join(' ')
    };
  });

  return { lines };
}
