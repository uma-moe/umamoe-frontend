import {
  resolveEncodedSkill,
  skillImage,
  type SkillCatalogEntry
} from '@/lib/catalog/skill-catalog';
import { formatRaceTime } from '@/lib/race/race-display';
import {
  courseSegments,
  type Course
} from '@/pages/competitive/race-analysis/replay/replay-course';
import { skillDistributions } from './skill-distributions';
import { simulatorSampleSummary } from '../../simulator-results';
import type { MonteCarloResult } from '../../simulator-repository';

/**
 * A half-second grid; each point counts the races that start the skill within a second of it.
 * Heat runs on a log scale from LOW to HIGH of races, so 2% and 6% look different while 60% still stands out.
 * Core spots are peaks where at least SPOT of races start within that second.
 */
export const STEP = 0.5,
  REACH = 1,
  LOW = 0.01,
  HIGH = 0.6,
  SPOT = 0.2,
  FIXED = 3;
/** Magma, a perceptually even heat ramp: dark purple for rare, through pink and orange, to cream for most races. Light mode runs it the other way so more is always more visible. */
export const RAMP_DARK = [
  [44, 17, 72, 0.85],
  [120, 35, 128, 0.95],
  [205, 64, 110, 1],
  [246, 138, 88, 1],
  [253, 231, 169, 1]
];
export const RAMP_LIGHT = [
  [253, 231, 169, 1],
  [246, 138, 88, 1],
  [205, 64, 110, 1],
  [120, 35, 128, 1],
  [44, 17, 72, 1]
];

const heat = (share: number) =>
  share <= 0
    ? 0
    : Math.max(0, Math.min(1, Math.log(Math.max(share, LOW) / LOW) / Math.log(HIGH / LOW)));

function color(share: number, ramp: number[][]) {
  if (share <= 0) return 'rgba(0,0,0,0)';
  const t = heat(share) * (ramp.length - 1),
    index = Math.min(ramp.length - 2, Math.floor(t)),
    mix = t - index,
    [a, b] = [ramp[index]!, ramp[index + 1]!];
  return (
    'rgba(' +
    [0, 1, 2]
      .map((channel) => Math.round(a[channel]! + (b[channel]! - a[channel]!) * mix))
      .join(',') +
    ',' +
    (a[3]! + (b[3]! - a[3]!) * mix).toFixed(2) +
    ')'
  );
}

/** Light smoothing over the half-second grid so the heat shows the shape, not single-race noise. */
const smooth = (values: number[]) =>
  values.map((_, index) => {
    let sum = 0,
      weight = 0;
    for (let offset = -2; offset <= 2; offset++) {
      const value = values[index + offset];
      if (value === undefined) continue;
      const w = 3 - Math.abs(offset);
      sum += value * w;
      weight += w;
    }
    return values[index]! > 0 || sum > 0 ? sum / weight : 0;
  });

/** Course sections named as in the Course strip, placed on the replay clock where the mean race's leader enters them. */
export function windowSections(
  course: Course | undefined,
  timeAt: (distance: number) => number | undefined,
  startTime: number
) {
  const parts = courseSegments(course, true),
    seen = new Map<string, number>();
  return parts.map((part) => {
    const label =
      part.label === 'Unspecified' ? (part.start === 0 ? 'Start' : 'Between sections') : part.label;
    const total = parts.filter((other) => other.label === part.label).length,
      count = (seen.get(label) ?? 0) + 1;
    seen.set(label, count);
    return {
      start: part.start,
      end: part.end,
      name: total > 1 && part.label !== 'Unspecified' ? label + ' ' + count : label,
      from: part.start <= 0 ? startTime : (timeAt(part.start) ?? startTime)
    };
  });
}
export type WindowSection = ReturnType<typeof windowSections>[number];

/** The replay clock's half-second grid between startTime and endTime. */
export function windowGrid(startTime: number, endTime: number) {
  const span = Math.max(1, endTime - startTime);
  const points = Math.max(2, Math.ceil(span / STEP) + 1);
  return {
    startTime,
    span,
    points,
    pointOf: (value: number) =>
      Math.max(0, Math.min(points - 1, Math.round((value - startTime) / STEP))),
    pointAt: (index: number) => Math.max(0, Math.min(100, ((index * STEP) / span) * 100)),
    at: (value: number) => Math.max(0, Math.min(100, ((value - startTime) / span) * 100))
  };
}
export type WindowGrid = ReturnType<typeof windowGrid>;

/** Peaks of at least SPOT, one per hill: two peaks count as separate spots only if the strip dips below half the smaller one between them. */
function spots(share: number[], startTime: number) {
  const peaks = share
    .flatMap((value, index) =>
      value >= SPOT && value >= (share[index - 1] ?? 0) && value > (share[index + 1] ?? 0)
        ? [index]
        : []
    )
    .sort((a, b) => share[b]! - share[a]!);
  const kept: number[] = [];
  for (const peak of peaks) {
    const sameHill = kept.some((other) => {
      const [from, to] = peak < other ? [peak, other] : [other, peak];
      return Math.min(...share.slice(from, to + 1)) >= share[peak]! / 2;
    });
    if (!sameHill) kept.push(peak);
  }
  return kept.map((index) => ({ time: startTime + index * STEP, share: share[index]! }));
}

/** Each learned skill that fired, with its heat strip, core spots and where on the course it starts. */
export function windowSkills(
  result: MonteCarloResult,
  runner: number,
  owned: number[],
  catalog: Map<number, SkillCatalogEntry>,
  grid: WindowGrid,
  sections: WindowSection[],
  ramp: number[][]
) {
  const sectionAt = (distance: number) =>
    sections.find(
      (section, index) =>
        distance >= section.start && (distance < section.end || index === sections.length - 1)
    )?.name ?? 'The race';
  const { points, pointOf, pointAt } = grid;
  const table = skillDistributions(result, runner, owned).rows.filter(
    (row) => owned.includes(row.id) && row.triggered
  );
  return table.map((row) => {
    const resolved = resolveEncodedSkill(catalog, row.id),
      name = resolved.skill?.name ?? 'Skill ' + row.id;
    const passive = row.procs.every(({ proc }) => proc[6] < 0),
      starts = row.procs.map(({ proc }) => proc[4]).sort((a, b) => a - b);
    // A race counts once per grid point, even when the skill starts twice near it.
    const counts = new Int32Array(points),
      stamp = new Int32Array(points),
      reach = Math.round(REACH / STEP);
    for (const { run, proc } of row.procs) {
      const centre = pointOf(proc[4]);
      for (
        let index = Math.max(0, centre - reach);
        index <= Math.min(points - 1, centre + reach);
        index++
      )
        if (stamp[index] !== run + 1) {
          stamp[index] = run + 1;
          counts[index]!++;
        }
    }
    const share = Array.from(counts, (count) => count / Math.max(1, result.runs));
    const summary = simulatorSampleSummary(starts)!,
      lasting = row.procs.map(({ proc }) => proc[6]).filter((value) => value > 0);
    const places = new Map<string, Set<number>>();
    for (const { run, proc } of row.procs) {
      const place = sectionAt(proc[5]);
      places.set(place, (places.get(place) ?? new Set()).add(run));
    }
    return {
      id: row.id,
      name,
      icon: skillImage(resolved.skill?.icon),
      rate: row.rate,
      passive,
      summary,
      fixed: summary.p90 - summary.p10 <= FIXED,
      duration: lasting.length ? simulatorSampleSummary(lasting)!.median : 0,
      share,
      spots: spots(share, grid.startTime),
      gradient:
        'linear-gradient(to right,' +
        smooth(share)
          .map((value, index) => color(value, ramp) + ' ' + pointAt(index).toFixed(2) + '%')
          .join(',') +
        ')',
      places: [...places]
        .map(([place, runs]) => ({ place, share: runs.size / Math.max(1, result.runs) }))
        .sort((a, b) => b.share - a.share)
    };
  });
}
export type WindowSkill = ReturnType<typeof windowSkills>[number];

export type WindowTip = {
  skill: WindowSkill;
  moment: number;
  x: number;
  below: number;
  above: number;
};

export const clock = (value: number) => formatRaceTime(Math.max(0, value), 1);
export const pct = (value: number) => Math.round(value) + '%';
export const timing = (skill: WindowSkill) =>
  skill.fixed
    ? 'Usually at ' + clock(skill.summary.median) + ', ' + skill.places[0]!.place
    : '80% of its starts fall between ' +
      clock(skill.summary.p10) +
      ' and ' +
      clock(skill.summary.p90);
export const describe = (skill: WindowSkill) =>
  skill.name +
  ' fires in ' +
  pct(skill.rate) +
  ' of races. ' +
  timing(skill) +
  '. ' +
  (skill.duration ? 'Lasts about ' + skill.duration.toFixed(1) + ' s.' : 'Instant effect.');
