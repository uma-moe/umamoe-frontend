/** One line of a chart tooltip. A row without a value only names something, such as an active skill. */
export interface TooltipRow {
  label: string;
  value?: string;
  color?: string;
}

const entities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (character) => entities[character] ?? character);

/** The replay telemetry's tooltip colours, so every race chart's hover reads alike. */
export function chartTooltipStyle(dark: boolean) {
  return {
    backgroundColor: dark ? '#202226' : '#fff',
    borderColor: dark ? '#42464c' : '#d2d5da',
    textStyle: { color: dark ? '#e8edf4' : '#202226' }
  };
}

function rowMarkup(row: TooltipRow): string {
  const marker = row.color
    ? `<span style="display:inline-block;margin-right:4px;border-radius:10px;width:10px;height:10px;background-color:${row.color}"></span>`
    : '';

  const value =
    row.value === undefined
      ? ''
      : `<span style="float:right;margin-left:20px;font-weight:900">${escapeHtml(row.value)}</span>`;

  return (
    `<div style="margin-top:10px;line-height:1">${marker}` +
    `<span style="margin-left:2px">${escapeHtml(row.label)}</span>${value}` +
    '<div style="clear:both"></div></div>'
  );
}

/**
 * Tooltip markup laid out like ECharts' own axis tooltip, which the replay telemetry uses: a title, then a
 * marker, name and bold value per row. Every label and value is escaped.
 */
export function chartTooltipContent(title: string, rows: TooltipRow[]): string {
  return `<div style="line-height:1"><div>${escapeHtml(title)}</div>${rows.map(rowMarkup).join('')}</div>`;
}
