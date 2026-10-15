export const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
].map((label, index) => ({ value: String(index + 1), label }));

export const pageSizeOptions = [20, 50, 100].map((value) => ({
  value: String(value),
  label: String(value)
}));

export function rankingYears(today: Date) {
  return Array.from({ length: today.getFullYear() - 2020 }, (_, index) => ({
    value: String(2021 + index),
    label: String(2021 + index)
  }));
}
