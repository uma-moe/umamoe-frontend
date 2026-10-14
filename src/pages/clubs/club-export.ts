import { clubMetric, clubMetrics, type ClubDisplayConfig } from '@/lib/clubs/club-display';
import { clubProgression, effectiveMemberFans, memberDailyDeltas, type ClubMemberMetric } from '@/lib/clubs/member-metrics';
import type { ClubDetails } from './community-types';

type ExportColumn = { label: string; get: (member: ClubMemberMetric, index: number) => string | number; sum: boolean };

export async function exportClub(details: ClubDetails, members: ClubMemberMetric[], config: ClubDisplayConfig, year: number, month: number, format: 'json' | 'csv' | 'xlsx'): Promise<void> {
  if (!members.length) return;
  const days = new Date(year, month, 0).getDate();
  const primary = clubMetric(config);
  const metrics = [primary, ...clubMetrics.filter(metric => metric !== primary && config[metric.flag])];
  const columns: ExportColumn[] = [
    { label: 'Rank', get: (_, i) => i + 1, sum: false },
    { label: 'Name', get: member => member.name, sum: false },
    { label: 'Trainer ID', get: member => String(member.viewerId), sum: false },
    ...(config.showRole ? [{ label: 'Role', get: (member: ClubMemberMetric) => member.role, sum: false }] : []),
    { label: 'Status', get: member => member.active ? 'Active' : 'Inactive', sum: false },
    ...metrics.map(metric => ({ label: metric.label, get: (member: ClubMemberMetric) => ['sevenDayAverage', 'dailyAverage', 'projectedMonthly'].includes(metric.key) ? Math.round(member[metric.key]) : member[metric.key], sum: metric.key !== 'dailyAverage' })),
    ...(config.includePriorClubData && (primary.key === 'monthlyGain' || config.showMonthlyGain) ? [{ label: 'Prior Club Gain', get: (member: ClubMemberMetric) => member.priorClubGain, sum: true }] : []),
    ...(config.showLastUpdated ? [{ label: 'Last Updated', get: (member: ClubMemberMetric) => member.lastUpdated, sum: false }] : [])
  ];
  const rows = members.map((member, i) => columns.map(column => column.get(member, i)));
  const totals = columns.map((column, i) => column.sum ? rows.reduce((sum, row) => sum + Number(row[i] || 0), 0) : i === 0 ? 'TOTAL' : '');
  const snapshots = members.map(member => details.members.find(source => source.viewer_id === member.viewerId && source.year === year && source.month === month) ?? details.members.find(source => source.viewer_id === member.viewerId));
  const fans = snapshots.map(source => source ? effectiveMemberFans(source, days) : []);
  // Angular always exports the complete raw daily history. The preference changes
  // calculated metrics and prior-club annotations, not the Day/Delta data itself.
  const deltas = snapshots.map(source => source ? memberDailyDeltas(source, days, true) : []);
  const dayCount = Math.max(days, ...fans.map(values => values.length)), deltaCount = dayCount - 1;
  const dayRows = fans.map(values => Array.from({ length: dayCount }, (_, day) => values[day] ? Math.abs(values[day]!) : null));
  const deltaRows = deltas.map(values => Array.from({ length: deltaCount }, (_, day) => values[day] ?? null));
  const dayTotals = Array.from({ length: dayCount }, (_, day) => dayRows.reduce((sum, row) => sum + (row[day] ?? 0), 0) || null);
  const deltaTotals = Array.from({ length: deltaCount }, (_, day) => deltaRows.reduce((sum, row) => sum + (row[day] ?? 0), 0) || null);
  let blob: Blob;
  if (format === 'json') {
    const data = {
      export_config: config,
      circle: details.circle,
      members: members.map((member, index) => ({
        trainer_id: String(member.viewerId), name: member.name, fan_count: member.fanCount, last_updated: member.lastUpdated, role: member.role,
        today_gain: member.todayGain, daily_gain: member.dailyGain, monthly_gain: member.monthlyGain, seven_day_avg: member.sevenDayAverage,
        daily_avg: member.dailyAverage, weekly_gain: member.weeklyGain, projected_monthly: member.projectedMonthly,
        priorCircleGain: member.priorClubGain, priorInToday: member.priorInToday, priorInDaily: member.priorInDaily, priorInWeekly: member.priorInWeekly,
        hasPriorCircleData: member.hasPriorClubData, isActive: member.active,
        daily_fans: fans[index]!.map(Math.abs), daily_delta: deltas[index],
        ...(config.includePriorClubData ? { daily_fans_raw: snapshots[index]?.daily_fans ?? [], prior_circle_days: (snapshots[index]?.daily_fans ?? []).flatMap((value, day) => value < 0 ? [day + 1] : []) } : {})
      })),
      history: clubProgression(details.members, year, month)
    };
    blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  } else if (format === 'csv') {
    // Preserve spreadsheet-formula protection for untrusted names/IDs. Numeric
    // gains remain numbers, including negative corrections.
    const escape = (value: string | number): string | number => typeof value === 'string' ? `"${(/^[=+@\-\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"` : value;
    const header = [...columns.map(column => escape(column.label)), '', ...Array.from({ length: deltaCount }, (_, i) => `Delta ${i + 1}`), '', ...Array.from({ length: dayCount }, (_, i) => `Day ${i + 1}`)];
    const lines = [header, ...rows.map((row, i) => [...row.map(escape), '', ...deltaRows[i]!, '', ...dayRows[i]!]), [...totals.map(escape), '', ...deltaTotals, '', ...dayTotals]];
    blob = new Blob([lines.map(line => line.join(',')).join('\n')], { type: 'text/csv' });
  } else {
    const module = await import('exceljs');
    const { Workbook } = module.default ?? module;
    const workbook = new Workbook(); workbook.creator = 'uma.moe'; workbook.created = new Date();
    const fill = (argb: string) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } } as const);
    const rowBackground = (member: ClubMemberMetric, index: number) => !member.active ? 'FF2A1F1F' : index % 2 === 0 ? 'FF16162A' : 'FF1A1A32';
    const summary = workbook.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 1 }] });
    summary.addRows([columns.map(column => column.label), ...rows, totals]);
    summary.eachRow((row, rowNumber) => {
      const header = rowNumber === 1, total = rowNumber === rows.length + 2, member = members[rowNumber - 2];
      row.height = header || total ? 22 : 20;
      row.eachCell({ includeEmpty: true }, cell => {
        cell.fill = fill(header ? 'FF1B3A6B' : total ? 'FF0D47A1' : rowBackground(member!, rowNumber - 2));
        cell.font = { ...(header || total ? { bold: true } : {}), color: { argb: header || total || member?.active ? 'FFFFFFFF' : 'FF888888' }, size: header || total ? 11 : 10 };
        cell.alignment = { ...(header ? { horizontal: 'center' } : {}), vertical: 'middle' };
        if (header) cell.border = { bottom: { style: 'medium', color: { argb: 'FF2979FF' } } };
        else if (typeof cell.value === 'number') { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right', vertical: 'middle' }; }
      });
    });
    summary.columns.forEach((column, i) => { column.width = Math.min(Math.max(columns[i]!.label.length, ...rows.map(row => String(row[i]).length)) + 4, 30); });
    const daily = workbook.addWorksheet('Daily Data', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
    daily.addRow(['Rank', 'Name', ...Array.from({ length: dayCount }, (_, i) => `Day ${i + 1}`), '', ...Array.from({ length: deltaCount }, (_, i) => `Δ${i + 1}`)]);
    members.forEach((member, i) => daily.addRow([i + 1, member.name, ...dayRows[i]!, null, ...deltaRows[i]!]));
    daily.addRow(['TOTAL', '', ...dayTotals, null, ...deltaTotals]);
    daily.eachRow((row, rowNumber) => {
      const header = rowNumber === 1, total = rowNumber === members.length + 2, member = members[rowNumber - 2], raw = snapshots[rowNumber - 2]?.daily_fans ?? [];
      row.height = header || total ? 22 : 18;
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        const prior = !header && !total && config.includePriorClubData && column >= 3 && (raw[column - 3] ?? 0) < 0;
        cell.fill = fill(header ? column >= 4 + dayCount ? 'FF163044' : column >= 3 && column <= 2 + dayCount ? 'FF162244' : 'FF1B3A6B' : total ? 'FF0D47A1' : prior ? 'FF152215' : rowBackground(member!, rowNumber - 2));
        cell.font = { ...(header || total ? { bold: true } : { italic: prior }), color: { argb: prior ? 'FF81C784' : header || total || member?.active ? 'FFFFFFFF' : 'FF666666' }, size: 10 };
        if (header) cell.alignment = { horizontal: 'center', vertical: 'middle' };
        else if (typeof cell.value === 'number') { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right', vertical: 'middle' }; }
      });
    });
    daily.columns.forEach((column, i) => { column.width = i === 0 ? 6 : i === 1 ? 18 : i === 2 + dayCount ? 2 : 7; });
    const buffer = await workbook.xlsx.writeBuffer();
    blob = new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = `circle_${details.circle.circle_id}_${year}_${month}_stats.${format}`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
