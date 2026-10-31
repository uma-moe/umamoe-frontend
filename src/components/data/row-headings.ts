interface ColumnKind {
  numeric?: boolean;
}

/**
 * How many leading columns name a row: those up to and including the first text column, such as a finish
 * position, gate and runner. A stacked row shows them on its first line and the other values beneath. Undefined
 * when there is no text column with values after it to stack.
 */
export function rowHeadingCount(columns: ColumnKind[]): number | undefined {
  const nameIndex = columns.findIndex((column) => !column.numeric);
  const hasValuesAfterName = nameIndex !== -1 && nameIndex < columns.length - 1;
  return hasValuesAfterName ? nameIndex + 1 : undefined;
}
