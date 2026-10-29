import type { SqlValue } from 'sql.js';
import { cellText } from './master-data-results';

export type ExportFormat = 'csv' | 'json';

export function exportContent(columns: string[], rows: SqlValue[][], format: ExportFormat): string {
  if (format === 'csv') {
    return [columns, ...rows.map((row) => row.map(cellText))]
      .map((fields) => fields.map(csvField).join(','))
      .join('\r\n');
  }

  const names = uniqueNames(columns);
  const objects = rows.map((row) =>
    Object.fromEntries(
      names.map((name, position) => {
        const value = row[position] ?? null;
        return [name, value instanceof Uint8Array ? cellText(value) : value];
      })
    )
  );

  return JSON.stringify(objects, null, 2);
}

export function downloadResult(columns: string[], rows: SqlValue[][], format: ExportFormat) {
  const url = URL.createObjectURL(
    new Blob([exportContent(columns, rows, format)], {
      type: format === 'json' ? 'application/json' : 'text/csv'
    })
  );

  const link = document.createElement('a');
  link.href = url;
  link.download = `master-data.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvField(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** JSON objects need distinct keys; `SELECT a.id, b.id` exports `id` and `id_2`. */
function uniqueNames(columns: string[]): string[] {
  const seen = new Map<string, number>();
  return columns.map((name) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return count === 1 ? name : `${name}_${count}`;
  });
}
