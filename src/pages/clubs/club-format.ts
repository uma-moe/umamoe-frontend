export const compactNumber = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 2
});

export function number(value: number): string {
  return Math.round(value).toLocaleString();
}

export function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${number(value)}`;
}

export function joinLabel(value: number): string {
  if (value === 1) return 'Open';
  if (value === 2) return 'Approval';
  return 'Closed';
}
