const fullStyleNames: Record<number, string> = {
  1: 'Front Runner',
  2: 'Pace Chaser',
  3: 'Late Surger',
  4: 'End Closer',
  5: 'Runaway'
};

const shortStyleNames: Record<number, string> = {
  1: 'Front',
  2: 'Pace',
  3: 'Late',
  4: 'End',
  5: 'Runaway'
};

export function hpRemainingColor(value?: number, dark = true): string {
  if (value === undefined) return 'var(--text-secondary)';
  const colors = [
    [197, 45, 61],
    [237, 145, 55],
    [229, 199, 76],
    dark ? [129, 199, 132] : [21, 128, 61]
  ];

  const stops = [0, 12.5, 25, 100],
    index = value > 25 ? 2 : value > 12.5 ? 1 : 0;

  const mix =
    (Math.min(100, Math.max(0, value)) - stops[index]!) / (stops[index + 1]! - stops[index]!);

  return (
    'rgb(' +
    colors[index]!.map((channel, i) =>
      Math.round(channel + (colors[index + 1]![i]! - channel) * mix)
    ).join(',') +
    ')'
  );
}

export function runningStyleName(value?: number, compact = false): string {
  return (
    (compact ? shortStyleNames : fullStyleNames)[value ?? 0] ??
    (value ? `Style ${value}` : 'Unknown')
  );
}

/** A finishing place as read aloud: 1st, 2nd, 11th, 23rd. */
export function ordinalPlace(place: number): string {
  const teen = place % 100 >= 11 && place % 100 <= 13;
  return place + (teen ? 'th' : (['th', 'st', 'nd', 'rd'][place % 10] ?? 'th'));
}

export function formatPercentage(value: number, total: number, digits = 1): string {
  return total > 0 ? `${((value / total) * 100).toFixed(digits)}%` : '-';
}

export function formatRaceTime(value?: number, digits = 3): string {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return '-';
  const minutes = Math.floor(value / 60);
  return `${minutes}:${(value - minutes * 60).toFixed(digits).padStart(digits ? digits + 3 : 2, '0')}`;
}

const trackLabels = {
  condition: ['Firm', 'Good', 'Soft', 'Heavy'],
  weather: ['Sunny', 'Cloudy', 'Rainy', 'Snowy'],
  season: ['Spring', 'Summer', 'Fall', 'Winter', 'Spring']
};

export function trackDetailName(kind: keyof typeof trackLabels, value?: string): string {
  return trackLabels[kind][Number(value) - 1] ?? (value?.trim() || 'Unknown ' + kind);
}
