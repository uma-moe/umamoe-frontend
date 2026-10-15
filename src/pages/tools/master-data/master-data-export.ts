export type MasterDataRow = Record<string, string | number>;

export function downloadRows(rows: MasterDataRow[], columns: string[], format: 'json' | 'csv') {
  const escape = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
  const content =
    format === 'json'
      ? JSON.stringify(rows, null, 2)
      : [
          columns.map(escape).join(','),
          ...rows.map((row) => columns.map((column) => escape(row[column])).join(','))
        ].join('\r\n');
  const url = URL.createObjectURL(
    new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `master-data.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
