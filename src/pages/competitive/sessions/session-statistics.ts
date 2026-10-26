import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
import type { MultiRaceAnalysis } from '@/lib/race/multi-race-analysis';
import { chartTheme } from '@/components/charts/chart-theme';
import { rate, teamBuilds } from '../analysis-view';

export type SessionEntry = { runner: RaceRunner; race: number };

export type SessionTeam = ReturnType<typeof teamBuilds>[number];

export type SessionView = 'overview' | 'strategy' | 'umas' | 'teams' | 'skills' | 'runners';

/** What the Teams view is narrowed to when another view sends the reader there. */
export type TeamFilter = { uma?: string; style?: string; composition?: string; own?: boolean };

export const metricHelp = {
  'Field share': 'The percentage of all runner entries using this Uma or running style.',
  'Win share': 'The percentage of races won by this running style.',
  'Win rate':
    'Wins divided by appearances. A runner’s rate measures individual wins; a team’s rate measures races won by any member.',
  'Team wins':
    'Races won by any member of the team, divided by its races. Three equally matched teams each win one race in three.',
  'Activation rate':
    'The percentage of learned skill entries that activated at least once. Repeat activations do not increase this percentage.',
  'Win% if active':
    'The win rate of runners whose skill activated. Stronger builds activate more skills, so this is a correlation, not the skill’s effect.',
  'Median activation':
    'The course position of the middle activation. The bar marks where the middle half of the activations fell.',
  'vs. without':
    'Win rate of runners that learned this skill minus the win rate of runners that did not, in percentage points. Stronger builds learn more skills, so read a gap as a hint, not as the skill’s effect.',
  'Your best': 'The best finish among your runners in that race.',
  Margin: 'Time between the winner and the runner-up.',
  'Double procs': 'Runner entries where this skill activated at least twice.',
  'Avg. start HP': 'Average HP at the start across entries with an HP measurement.',
  'Avg. finish HP':
    'Average HP at each runner’s finish, rather than the end of the whole field. Missing measurements are excluded.',
  'Finished with HP': 'Percentage of measured entries with HP remaining at their finish.',
  'Avg. spurt delay':
    'Average distance from the first last-spurt check to the selected spurt start. Zero means no delay. Entries without a spurt measurement are excluded.',
  'Avg. spurt speed':
    'Average selected last-spurt target speed across entries with detailed speed measurements.'
};

export function sessionChart(
  ink: string,
  series: unknown[],
  xAxis: Record<string, unknown>,
  yAxis: Record<string, unknown> = { type: 'value' },
  extra: Record<string, unknown> = {}
) {
  return {
    animation: false,
    textStyle: { color: ink },
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 12, top: 18, bottom: 36 },
    xAxis: {
      nameLocation: 'middle',
      nameGap: 26,
      axisLabel: { fontSize: 10, color: ink },
      splitLine: { lineStyle: { color: ink, opacity: 0.12 } },
      ...xAxis
    },
    yAxis: {
      axisLabel: { fontSize: 10, color: ink },
      splitLine: { lineStyle: { color: ink, opacity: 0.12 } },
      ...yAxis
    },
    series,
    ...extra
  };
}

export function isPlayerTeam(team: SessionTeam) {
  return team.members.some((runner) => runner.isPlayer);
}

/** A team's running styles in a fixed order, so the same lineup always shares one key. */
export function compositionStyles(members: RaceRunner[]) {
  return members.map((runner) => runner.result?.runningStyle ?? 0).sort((a, b) => a - b);
}

export function styleCompositions(teams: SessionTeam[]) {
  const groups = new Map<
    string,
    { key: string; styles: number[]; appearances: number; wins: number }
  >();

  for (const team of teams) {
    const styles = compositionStyles(team.members);
    const key = styles.join('-'),
      row = groups.get(key) ?? { key, styles, appearances: 0, wins: 0 };

    row.appearances += team.appearances;
    row.wins += team.wins;
    groups.set(key, row);
  }

  return [...groups.values()].sort(
    (a, b) => rate(b.wins, b.appearances) - rate(a.wins, a.appearances)
  );
}

export type SessionComposition = ReturnType<typeof styleCompositions>[number];

export function styleRepresentatives(analysis: MultiRaceAnalysis, id: number) {
  return analysis.characters
    .map((r) => ({
      ...r,
      entries: analysis.entries.filter((e) => e.charaKey === r.key && e.strategy === id)
    }))
    .filter((r) => r.entries.length)
    .sort((a, b) => b.entries.length - a.entries.length)
    .slice(0, 4);
}

/** How often each running style was used by one Uma, most used first. */
export function umaStyleMix(analysis: MultiRaceAnalysis) {
  const mix = new Map<string, Map<number, number>>();
  for (const entry of analysis.entries) {
    const styles = mix.get(entry.charaKey) ?? new Map<number, number>();
    styles.set(entry.strategy, (styles.get(entry.strategy) ?? 0) + 1);
    mix.set(entry.charaKey, styles);
  }

  return new Map(
    [...mix].map(([key, styles]) => [
      key,
      [...styles]
        .map(([strategy, entries]) => ({ strategy, entries }))
        .sort((a, b) => b.entries - a.entries)
    ])
  );
}

/**
 * Chart colours for measures that are not running styles: the field in a neutral grey and the
 * highlighted group in the accent, so style colours keep meaning only running styles.
 */
export function chartColors(dark: boolean) {
  return {
    ink: dark ? '#abb4c3' : '#566071',
    muted: chartTheme(dark).muted,
    shade: chartTheme(dark).shade,
    accent: dark ? '#64b5f6' : '#2563eb'
  };
}
