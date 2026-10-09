import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
import { diagnosticHorse } from '@/lib/race/race-diagnostics';

export interface SkillPeriod { start: number; end?: number; }
export interface SkillActivityRow { id: number; periods: SkillPeriod[]; totalActive?: number; }

export function skillIconGroups(rows: SkillActivityRow[], start: number, end: number, width: number) {
  const events = rows.flatMap(row => row.periods.map(period => ({ id: row.id, period }))).sort((a, b) => a.period.start - b.period.start);
  const groups: { left: number; events: typeof events }[] = [];
  const plotWidth = Math.max(32, width);
  for (const event of events) {
    const left = Math.max(14, Math.min(plotWidth - 14, (event.period.start - start) / Math.max(1, end - start) * plotWidth));
    const last = groups.at(-1);
    if (last && left - last.left < 32) last.events.push(event);
    else groups.push({ left, events: [event] });
  }
  return groups.map(group => ({ ...group, left: group.left / plotWidth * 100 }));
}

export function skillActivityRows(capture: ParsedRaceCapture, index: number): SkillActivityRow[] {
  const spans = diagnosticHorse(capture, index)?.activeSkillSpans ?? [];
  const activations = capture.events.filter(event => event.type === 3 && event.params[0] === index);
  const ids = new Set([...spans.map(span => span.skillId), ...activations.map(event => event.params[1]!)]);
  return [...ids].map(id => {
    const periods: SkillPeriod[] = [];
    // One skill can apply several effects. Show their union rather than counting overlaps twice.
    for (const span of spans.filter(span => span.skillId === id && span.endTime >= span.startTime).sort((a, b) => a.startTime - b.startTime)) {
      const last = periods.at(-1);
      if (last?.end !== undefined && span.startTime <= last.end) last.end = Math.max(last.end, span.endTime);
      else periods.push({ start: span.startTime, end: span.endTime });
    }
    const totalActive = periods.length ? periods.reduce((sum, period) => sum + period.end! - period.start, 0) : undefined;
    for (const event of activations.filter(event => event.params[1] === id)) {
      if (!periods.some(period => event.frameTime >= period.start - .001 && event.frameTime <= (period.end ?? period.start) + .001)) periods.push({ start: event.frameTime });
    }
    return { id, totalActive, periods: periods.sort((a, b) => a.start - b.start) };
  }).filter(row => row.periods.length).sort((a, b) => a.periods[0]!.start - b.periods[0]!.start);
}
