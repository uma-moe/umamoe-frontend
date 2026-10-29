import { resourceCache } from '@/services/resources/resource-cache';
import type { RaceBadgeData, RaceGrade, RaceScheduleYear } from '@/components/game/race-types';

export type RaceYear = 'junior' | 'classic' | 'senior';

interface RaceMapping {
  race_id?: number;
  race_instance_id: number;
  thumbnail_id: number;
  grade: number;
  name: string;
  short_name: string;
  schedule: {
    program_id?: number;
    month: number;
    half: number;
    turn_label?: string;
    race_permission: number;
  }[];
  win_saddles?: Array<{
    saddle_id: number;
    group_id?: number;
    win_saddle_type?: number;
    win_saddle_type_label?: string;
    required_race_instance_ids?: number[];
  }>;
}

export interface RaceHistoryEntry extends RaceBadgeData {
  raceInstanceId: number;
  year: RaceYear;
  yearLabel: string;
  month: number;
  half: number;
  turnLabel: string;
  position: number;
  won: boolean;
}

export interface OptimalRaceRecommendation {
  groupId: number;
  saddleId: number;
  raceInstanceId: number;
  name: string;
  shortName: string;
  scheduleLabel: string;
  year: RaceYear;
  month: number;
  half: number;
  image?: string;
  grade: RaceGrade;
  overlapsP1: boolean;
  overlapsP2: boolean;
  overlapCount: 1 | 2;
  affinityGain: 3 | 6;
}

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

const yearLabels: Record<RaceYear, string> = {
  junior: 'Junior Year',
  classic: 'Classic Year',
  senior: 'Senior Year'
};

const yearOrder: RaceYear[] = ['junior', 'classic', 'senior'];
let raceMappingsPromise: Promise<RaceMapping[]> | undefined;
resourceCache.onUpdate((name) => {
  if (name === 'race_to_saddle_mapping') raceMappingsPromise = undefined;
});

function grade(value: number): RaceGrade {
  return value === 100 ? 'G1' : value === 200 ? 'G2' : 'G3';
}

function years(permission: number): RaceYear[] {
  if (permission === 1) return ['junior'];
  if (permission === 2) return ['classic'];
  if (permission === 3) return ['classic', 'senior'];
  if (permission === 4) return ['senior'];
  return [];
}

function raceImage(race: Pick<RaceMapping, 'thumbnail_id'>): string {
  return `/game-assets/textures/race_banners/thum_race_rt_000_${String(race.thumbnail_id).padStart(4, '0')}_00.webp`;
}

function turnLabel(month: number, half: number): string {
  return `${monthNames[month - 1] ?? month} ${half === 1 ? 'Early' : 'Late'}`;
}

function slotKey(year: RaceYear, month: number, half: number): string {
  return `${year}:${month}:${half}`;
}

function raceBadge(race: RaceMapping, position?: number): RaceBadgeData {
  return {
    id: String(race.race_instance_id),
    name: race.name,
    shortName: race.short_name,
    grade: grade(race.grade),
    image: raceImage(race),
    placement: position
  };
}

function raceSlots(
  race: RaceMapping
): Array<{ year: RaceYear; month: number; half: number; label: string }> {
  const slots = new Map<string, { year: RaceYear; month: number; half: number; label: string }>();
  for (const schedule of race.schedule ?? [])
    for (const year of years(schedule.race_permission)) {
      const key = slotKey(year, schedule.month, schedule.half);
      if (!slots.has(key))
        slots.set(key, {
          year,
          month: schedule.month,
          half: schedule.half,
          label: schedule.turn_label?.trim() || turnLabel(schedule.month, schedule.half)
        });
    }

  return [...slots.values()].sort(
    (left, right) =>
      yearOrder.indexOf(left.year) - yearOrder.indexOf(right.year) ||
      left.month - right.month ||
      left.half - right.half
  );
}

async function raceMappings(): Promise<RaceMapping[]> {
  raceMappingsPromise ??= resourceCache
    .load<{ races: RaceMapping[] }>('race_to_saddle_mapping')
    .then((data) => data.races)
    .catch((error) => {
      raceMappingsPromise = undefined;
      throw error;
    });

  return raceMappingsPromise;
}

export interface RaceQueryValue {
  id: number;
  name: string;
  shortName: string;
  image?: string;
  aliases?: string[];
  searchText?: string;
  saddleIds: number[];
  grade?: RaceGrade;
}

export function normalizeRaceName(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export async function loadRaceFactorImages(): Promise<Map<string, string>> {
  const images = new Map(
    Object.entries({
      kawasakikinen: 1107,
      zennipponjunioryushun: 1108,
      kashiwakinen: 1109,
      mcnambuhai: 1110
    }).map(([name, thumbnail_id]) => [name, raceImage({ thumbnail_id })])
  );

  for (const race of await raceMappings()) {
    if (!Number.isInteger(race.thumbnail_id) || race.thumbnail_id <= 0) continue;
    for (const name of [race.name, race.short_name])
      if (name) images.set(normalizeRaceName(name), raceImage(race));
  }

  for (const [alias, name] of Object.entries({
    jdderby: 'japandirtderby',
    jbclclassic: 'jbcladiesclassic'
  })) {
    const image = images.get(name);
    if (image) images.set(alias, image);
  }

  return images;
}

export async function loadRaceQueryValues(): Promise<RaceQueryValue[]> {
  return (await raceMappings()).flatMap((race) => {
    const saddleIds = [
      ...new Set(
        (race.win_saddles ?? [])
          .map((win) => win.saddle_id)
          .filter((id) => Number.isInteger(id) && id > 0)
      )
    ].sort((a, b) => a - b);

    const aliases = [
      ...new Set(
        [race.short_name, String(race.race_instance_id), race.race_id?.toString()].filter(
          (value): value is string => Boolean(value)
        )
      )
    ];

    const requiredIds = (race.win_saddles ?? []).flatMap(
      (win) => win.required_race_instance_ids ?? []
    );

    return saddleIds.length
      ? [
          {
            id: race.race_instance_id,
            name: race.name,
            shortName: race.short_name,
            image: raceImage(race),
            aliases,
            searchText: [race.name, ...aliases, ...saddleIds, ...requiredIds].join(' '),
            saddleIds,
            grade: [100, 200, 300].includes(race.grade) ? grade(race.grade) : undefined
          }
        ]
      : [];
  });
}

export async function loadRaceSchedule(query = ''): Promise<RaceScheduleYear[]> {
  const data = { races: await raceMappings() };

  const search = query.trim().toLowerCase();
  const slots = new Map<
    string,
    {
      year: 'junior' | 'classic' | 'senior';
      month: number;
      half: number;
      races: RaceScheduleYear['slots'][number]['races'];
    }
  >();

  for (const race of data.races ?? []) {
    if (
      search &&
      !`${race.name} ${race.short_name} ${grade(race.grade)}`.toLowerCase().includes(search)
    )
      continue;
    for (const schedule of race.schedule ?? [])
      for (const year of years(schedule.race_permission)) {
        const key = `${year}:${schedule.month}:${schedule.half}`;
        const slot = slots.get(key) ?? {
          year,
          month: schedule.month,
          half: schedule.half,
          races: []
        };

        if (!slot.races.some((entry) => entry.id === String(race.race_instance_id))) {
          slot.races.push({
            id: String(race.race_instance_id),
            name: race.name,
            shortName: race.short_name,
            grade: grade(race.grade),
            image: raceImage(race)
          });
        }

        slots.set(key, slot);
      }
  }

  return (
    [
      ['junior', 'Junior Year'],
      ['classic', 'Classic Year'],
      ['senior', 'Senior Year']
    ] as const
  ).map(([id, label]) => ({
    id,
    label,
    slots: [...slots.values()]
      .filter((slot) => slot.year === id)
      .sort((left, right) => left.month - right.month || left.half - right.half)
      .map((slot) => ({
        id: `${id}-${slot.month}-${slot.half}`,
        label: `${slot.half === 1 ? 'Early' : 'Late'} ${monthNames[slot.month - 1]}`,
        races: slot.races.sort(
          (left, right) =>
            left.grade.localeCompare(right.grade) || left.name.localeCompare(right.name)
        )
      }))
  }));
}

/** Angular Veteran filters match selected race instances through their
 * single-race win-saddle ids. Keep that compatibility index beside the
 * demand-loaded schedule so the large mapping never enters the base shell. */
export async function loadRaceSaddleIndex(): Promise<Map<number, number[]>> {
  const data = { races: await raceMappings() };

  return new Map(
    (data.races ?? []).map((race) => [
      race.race_instance_id,
      (race.win_saddles ?? [])
        .filter((saddle) => saddle.required_race_instance_ids?.length === 1)
        .map((saddle) => saddle.saddle_id)
    ])
  );
}

/** Saved wins claim their first free calendar slot in array order. */
export function assignRaceWinSlots(
  schedule: readonly RaceScheduleYear[],
  saddleIndex: ReadonlyMap<number, number[]>,
  wins: readonly number[]
): Array<{ key: string; winIndex: number }> {
  const slots = schedule.flatMap((year) => year.slots);
  const usedSlots = new Set<string>();
  const selected: Array<{ key: string; winIndex: number }> = [];
  for (const [winIndex, saddleId] of wins.entries()) {
    for (const slot of slots) {
      if (usedSlots.has(slot.id)) continue;
      const race = slot.races.find((race) => saddleIndex.get(Number(race.id))?.includes(saddleId));
      if (!race) continue;
      usedSlots.add(slot.id);
      selected.push({ key: `${slot.id}:${race.id}`, winIndex });
      break;
    }
  }

  return selected;
}

/** One bonus per G1 group, even when its year-specific saddle IDs differ. */
export async function loadG1SaddleGroups(): Promise<Map<number, number>> {
  const groups = new Map<number, number>();
  for (const race of await raceMappings())
    for (const saddle of race.win_saddles ?? []) {
      if (
        (saddle.win_saddle_type === 3 || saddle.win_saddle_type_label?.toUpperCase() === 'G1') &&
        Number.isFinite(saddle.group_id)
      )
        groups.set(saddle.saddle_id, saddle.group_id!);
    }

  return groups;
}

/** Resolve the compact Angular race-results and win-saddle payloads through
 * the same race schedule data used by filters and the planner. */
export async function loadRaceHistory(
  winSaddleIds: readonly number[],
  runRaceIds: readonly number[]
): Promise<RaceHistoryEntry[]> {
  const races = await raceMappings();
  const raceById = new Map(races.map((race) => [race.race_instance_id, race]));
  const raceByProgram = new Map<number, RaceMapping>();
  const scheduleByProgram = new Map<number, RaceMapping['schedule'][number]>();
  const racesBySaddle = new Map<number, RaceMapping[]>();
  for (const race of races) {
    for (const schedule of race.schedule ?? [])
      if (schedule.program_id) {
        raceByProgram.set(schedule.program_id, race);
        scheduleByProgram.set(schedule.program_id, schedule);
      }

    for (const saddle of race.win_saddles ?? [])
      for (const raceId of saddle.required_race_instance_ids ?? []) {
        const saddleRace = raceById.get(raceId);
        if (!saddleRace) continue;
        const values = racesBySaddle.get(saddle.saddle_id) ?? [];
        if (!values.some((entry) => entry.race_instance_id === saddleRace.race_instance_id))
          values.push(saddleRace);
        racesBySaddle.set(saddle.saddle_id, values);
      }
  }

  const usedSlots = new Set<string>();
  const seen = new Set<string>();
  const entries: RaceHistoryEntry[] = [];
  const add = (
    race: RaceMapping,
    slot: { year: RaceYear; month: number; half: number; label: string },
    position: number
  ): void => {
    const identity = `${slotKey(slot.year, slot.month, slot.half)}:${race.race_instance_id}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    usedSlots.add(slotKey(slot.year, slot.month, slot.half));
    entries.push({
      ...raceBadge(race, position),
      raceInstanceId: race.race_instance_id,
      year: slot.year,
      yearLabel: yearLabels[slot.year],
      month: slot.month,
      half: slot.half,
      turnLabel: slot.label,
      position,
      won: position === 1
    });
  };

  for (const result of runRaceIds) {
    const programId = Math.floor(Number(result) / 100);
    const position = Number(result) % 100;
    const race = raceByProgram.get(programId);
    const schedule = scheduleByProgram.get(programId);
    if (!race || !schedule || position <= 0) continue;
    const year = years(schedule.race_permission).find(
      (candidate) => !usedSlots.has(slotKey(candidate, schedule.month, schedule.half))
    );

    if (!year) continue;
    add(
      race,
      {
        year,
        month: schedule.month,
        half: schedule.half,
        label: schedule.turn_label?.trim() || turnLabel(schedule.month, schedule.half)
      },
      position
    );
  }

  for (const saddleId of winSaddleIds)
    for (const race of racesBySaddle.get(Number(saddleId)) ?? []) {
      const slot = raceSlots(race).find(
        (candidate) => !usedSlots.has(slotKey(candidate.year, candidate.month, candidate.half))
      );

      if (slot) add(race, slot, 1);
    }

  return entries.sort(
    (left, right) =>
      yearOrder.indexOf(left.year) - yearOrder.indexOf(right.year) ||
      left.month - right.month ||
      left.half - right.half ||
      left.raceInstanceId - right.raceInstanceId
  );
}

export function raceHistorySchedule(entries: readonly RaceHistoryEntry[]): RaceScheduleYear[] {
  return yearOrder.map((id) => ({
    id,
    label: yearLabels[id],
    slots: entries
      .filter((entry) => entry.year === id)
      .map((entry) => ({
        id: `${id}-${entry.month}-${entry.half}-${entry.raceInstanceId}`,
        label: entry.turnLabel,
        races: [{ ...entry }]
      }))
  }));
}

/** Angular assigns +3 affinity for a G1 shared with one parent and +6 when
 * both P1 and P2 share the same saddle group. */
export async function loadOptimalRaceRecommendations(
  p1Wins: readonly number[],
  p2Wins: readonly number[]
): Promise<OptimalRaceRecommendation[]> {
  const races = await raceMappings();
  const groupBySaddle = await loadG1SaddleGroups();
  const raceByGroup = new Map<number, { race: RaceMapping; saddleId: number }>();
  for (const race of races)
    for (const saddle of race.win_saddles ?? []) {
      const type = Number(saddle.win_saddle_type);
      const label = String(saddle.win_saddle_type_label ?? '').toLocaleUpperCase();
      const groupId = Number(saddle.group_id);
      if (!Number.isFinite(groupId) || (type !== 3 && label !== 'G1')) continue;
      groupBySaddle.set(Number(saddle.saddle_id), groupId);
      if (!raceByGroup.has(groupId))
        raceByGroup.set(groupId, { race, saddleId: Number(saddle.saddle_id) });
    }

  const p1Groups = new Set(
    p1Wins
      .map(Number)
      .map((id) => groupBySaddle.get(id))
      .filter((id): id is number => id !== undefined)
  );

  const p2Groups = new Set(
    p2Wins
      .map(Number)
      .map((id) => groupBySaddle.get(id))
      .filter((id): id is number => id !== undefined)
  );

  const recommendations = [...new Set([...p1Groups, ...p2Groups])]
    .flatMap((groupId) => {
      const source = raceByGroup.get(groupId);
      if (!source) return [];
      const overlapsP1 = p1Groups.has(groupId);
      const overlapsP2 = p2Groups.has(groupId);
      const overlapCount = (overlapsP1 && overlapsP2 ? 2 : 1) as 1 | 2;
      const slot = raceSlots(source.race)[0];
      return [
        {
          groupId,
          saddleId: source.saddleId,
          raceInstanceId: source.race.race_instance_id,
          name: source.race.name,
          shortName: source.race.short_name,
          scheduleLabel: slot?.label ?? '',
          year: slot?.year ?? 'senior',
          month: slot?.month ?? 0,
          half: slot?.half ?? 0,
          image: raceImage(source.race),
          grade: grade(source.race.grade),
          overlapsP1,
          overlapsP2,
          overlapCount,
          affinityGain: (overlapCount * 3) as 3 | 6
        }
      ];
    })
    .sort(
      (left, right) =>
        right.overlapCount - left.overlapCount ||
        left.raceInstanceId - right.raceInstanceId ||
        left.name.localeCompare(right.name)
    );

  const usedSlots = new Set<string>();
  return recommendations.map((recommendation) => {
    const race = raceByGroup.get(recommendation.groupId)!.race;
    const slot = raceSlots(race).find(
      (candidate) => !usedSlots.has(slotKey(candidate.year, candidate.month, candidate.half))
    );

    // Match Angular's scheduler: higher-priority recommendations claim the
    // first free turn; a race with no remaining turn is not placed on the calendar.
    if (!slot) return { ...recommendation, month: 0, half: 0, scheduleLabel: '' };

    usedSlots.add(slotKey(slot.year, slot.month, slot.half));
    return {
      ...recommendation,
      year: slot.year,
      month: slot.month,
      half: slot.half,
      scheduleLabel: slot.label
    };
  });
}

export function optimalRaceSchedule(
  recommendations: readonly OptimalRaceRecommendation[]
): RaceScheduleYear[] {
  return yearOrder.map((id) => ({
    id,
    label: yearLabels[id],
    slots: recommendations
      .filter((race) => race.year === id && race.month > 0)
      .sort((left, right) => left.month - right.month || left.half - right.half)
      .map((race) => {
        return {
          id: `${id}-${race.month}-${race.half}-${race.groupId}`,
          label: race.scheduleLabel,
          races: [
            {
              id: String(race.raceInstanceId),
              name: race.name,
              shortName: race.shortName,
              grade: race.grade,
              image: race.image,
              affinityGain: race.affinityGain
            }
          ]
        };
      })
  }));
}
