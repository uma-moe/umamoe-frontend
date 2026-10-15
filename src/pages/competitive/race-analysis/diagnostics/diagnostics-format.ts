import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
import {
  diagnosticLabel,
  skillActiveDuration,
  type DiagnosticRow,
  type HorseDiagnostics
} from '@/lib/race/race-diagnostics';
import { raceTimeAtDistance } from '@/lib/race/race-replay';
import { formatRaceTime } from '@/lib/race/race-display';

type CaptureRunner = ParsedRaceCapture['runners'][number];

export type DiagnosticsSampleRow = {
  time: number;
  targetSpeed: number | '—';
  acceleration: number | '—';
};

export type DiagnosticsSectionRow = {
  section: number;
  phase: string | number;
  start: number;
  end: number;
  speed: number;
  rng: number;
  time: number | '—';
};

export function display(value: unknown, key = ''): string | number {
  if (value === undefined || value === null) return '—';
  if (key === 'phase' && typeof value === 'number')
    return (
      ['Early race', 'Mid race', 'Late race', 'Last spurt', 'Finished'][value] ?? String(value)
    );
  if (key === 'result' && typeof value === 'string')
    return (
      (
        {
          True: 'Spurt selected',
          TrueExceedNeedMaximumHp: 'Full spurt selected',
          False: 'No spurt selected',
          FalseBelowNeedMinimumHp: 'Insufficient HP'
        } as Record<string, string>
      )[value] ?? value
    );
  if (key === 'outcome' && typeof value === 'string')
    return (
      (
        {
          NoMode: 'No mode',
          Rejected: 'Conditions not met',
          Started: 'Started',
          FailedRoll: 'Roll failed'
        } as Record<string, string>
      )[value] ?? value
    );
  if (typeof value === 'number') return Number.isInteger(value) ? value : Number(value.toFixed(4));
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map((v) => display(v)).join(', ');
  if (typeof value === 'object')
    return Object.entries(value)
      .map(([k, v]) => diagnosticLabel(k) + ': ' + display(v, k))
      .join(', ');
  return String(value);
}

export function rows(value: unknown): Record<string, string | number>[] {
  return (Array.isArray(value) ? value : [value]).map((item, i) => {
    const row: DiagnosticRow = item && typeof item === 'object' ? item : { value: item };
    return {
      id: i,
      ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, display(v, k)]))
    };
  });
}

export function number(value: unknown, digits = 0) {
  return typeof value === 'number'
    ? value.toLocaleString('en-US', { maximumFractionDigits: digits })
    : '—';
}

export function count(value: number, noun: string) {
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

export function timeLabel(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return rounded === 0 ? '0:00' : formatRaceTime(rounded, rounded % 1 ? 1 : 0);
}

export function signed(value: number, digits = 2) {
  const rounded = Number(value.toFixed(digits));
  return (rounded > 0 ? '+' : '') + rounded.toFixed(digits);
}

export function percentPosition(value: unknown) {
  return typeof value === 'number' ? Math.min(100, Math.max(0, value)) : 0;
}

export function runnerName(capture: ParsedRaceCapture, value: unknown) {
  return capture.runners.find((r) => r.index === Number(value))?.name ?? 'Unknown runner';
}

export function skillRows(
  capture: ParsedRaceCapture,
  index: number,
  horse: HorseDiagnostics | undefined,
  runner: CaptureRunner | undefined
) {
  const activations = capture.events.filter((e) => e.type === 3 && e.params[0] === index);
  return [
    ...new Set([
      ...(runner?.skillIds ?? []),
      ...activations.map((e) => e.params[1]!),
      ...(horse?.skillActivationDecisions ?? []).map((d) => Number(d.skillId))
    ])
  ].map((id) => {
    const events = activations.filter((e) => e.params[1] === id);
    const roll = horse?.skillActivationDecisions?.find((d) => d.skillId === id);
    return {
      id,
      count: events.length,
      first: events[0]?.frameTime ?? '—',
      duration: events.length || roll?.activated ? (skillActiveDuration(horse, id) ?? '—') : '—',
      status: roll
        ? roll.activated
          ? 'Activated'
          : !roll.passed
            ? 'Wit check failed'
            : roll.required
              ? 'Passed wit check, failed condition'
              : 'Not triggered'
        : events.length
          ? 'Activated'
          : 'Not recorded',
      witRequired: Number(roll?.required === true),
      witPassed: Number(roll?.passed === true),
      roll: typeof roll?.roll === 'number' ? roll.roll : '—',
      threshold: typeof roll?.threshold === 'number' ? roll.threshold : '—'
    };
  });
}

export function sampleRows(
  capture: ParsedRaceCapture,
  horse: HorseDiagnostics | undefined
): DiagnosticsSampleRow[] {
  return (horse?.sampleTimes ?? capture.detailed?.annotations.sampleTimes ?? []).map((time, i) => ({
    time,
    targetSpeed: horse?.targetSpeeds?.[i] ?? '—',
    acceleration: horse?.accelerationRates?.[i] ?? '—'
  }));
}

export function modeRows(capture: ParsedRaceCapture, horse: HorseDiagnostics | undefined) {
  return Object.entries(capture.detailed?.annotations.flags ?? {}).flatMap(([key, flag]) => {
    const spans = horse?.spans.filter((span) => (span.mask & flag) !== 0) ?? [];
    return spans.length
      ? [
          {
            id: key,
            mode: diagnosticLabel(key),
            duration: spans.reduce((total, span) => total + span.endTime - span.startTime, 0),
            periods: spans.length,
            time: spans[0]!.startTime
          }
        ]
      : [];
  });
}

export function sectionRows(
  capture: ParsedRaceCapture,
  index: number,
  sectionSpeeds: DiagnosticRow[],
  distance: number
): DiagnosticsSectionRow[] {
  return sectionSpeeds
    .map((row) => ({
      section: Number(row.sectionIndex) + 1,
      phase: display(row.phase, 'phase'),
      start: (distance * Number(row.sectionIndex)) / 24,
      end: (distance * (Number(row.sectionIndex) + 1)) / 24,
      speed: Number(row.baseTargetSpeed),
      rng: Number(row.randomPercentage),
      time:
        raceTimeAtDistance(capture.frames, (distance * Number(row.sectionIndex)) / 24, index) ??
        ('—' as const)
    }))
    .sort((a, b) => a.section - b.section);
}

export function rngLimit(sections: DiagnosticsSectionRow[]) {
  return Math.max(
    0.1,
    Math.ceil(Math.max(0, ...sections.map((row) => Math.abs(row.rng))) * 10) / 10
  );
}

export function seekRow(row: Record<string, string | number>, onseek: (time: number) => void) {
  const time = row.time ?? row.startTime;
  if (typeof time === 'number') onseek(time);
}

export function rushingPeriods(horse: HorseDiagnostics | undefined) {
  return (horse?.temptationSpans ?? []).map((span) => ({
    ...span,
    duration: span.endTime - span.startTime
  }));
}
