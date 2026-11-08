/** A rate as the estimate prints it: up to one decimal, so a whole rate reads as 51% rather than 51.0%. */
export function percent(value: number) {
  return Number(value.toFixed(1)) + '%';
}
