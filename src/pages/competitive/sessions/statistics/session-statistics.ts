import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
import type { MultiRaceAnalysis } from '@/lib/race/multi-race-analysis';
import { formatRaceTime } from '@/lib/race/replay/race-display';
import { rate, score, teamBuilds } from '../../analysis-view';

export type SessionEntry = { runner: RaceRunner; race: number };

export type SessionTeam = ReturnType<typeof teamBuilds>[number];

export const metricHelp = {
  'Field share': 'The percentage of all runner entries using this Uma or running style.',
  'Win share': 'The percentage of races won by this running style.',
  'Win rate':
    'Wins divided by appearances. A runner’s rate measures individual wins; a team’s rate measures races won by any member.',
  'Activation rate':
    'The percentage of learned skill entries that activated at least once. Repeat activations do not increase this percentage.',
  'Avg. active (s)':
    'Average total active time across runner entries with detailed simulation data, including entries where the skill did not activate.',
  'Wit check failed':
    'Learned skill entries that failed the activation check against the runner’s wit-based activation chance.',
  'Condition failed':
    'Learned skill entries that passed the wit check but never met the skill’s activation conditions.',
  'Runner win rate':
    'The win rate of runners that learned this skill. This is a correlation and does not isolate the skill’s effect.',
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
    grid: { left: 48, right: 24, top: 24, bottom: 45 },
    xAxis: {
      nameLocation: 'middle',
      nameGap: 30,
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

export function sessionFeats(winners: SessionEntry[]) {
  if (!winners.length) return [];
  const time = [...winners].sort(
    (a, b) => a.runner.result!.finishTime - b.runner.result!.finishTime
  );

  const ranked = winners
    .filter((e) => score(e.runner) > 0)
    .sort((a, b) => score(b.runner) - score(a.runner));

  return [
    {
      label: 'Fastest win',
      entry: time[0]!,
      value: formatRaceTime(time[0]!.runner.result!.finishTime)
    },
    {
      label: 'Slowest win',
      entry: time.at(-1)!,
      value: formatRaceTime(time.at(-1)!.runner.result!.finishTime)
    },
    ...(ranked.length
      ? [
          {
            label: 'Highest rated winner',
            entry: ranked[0]!,
            value: score(ranked[0]!.runner).toLocaleString()
          },
          {
            label: 'Lowest rated winner',
            entry: ranked.at(-1)!,
            value: score(ranked.at(-1)!.runner).toLocaleString()
          }
        ]
      : [])
  ];
}

export function styleCompositions(teams: SessionTeam[]) {
  const groups = new Map<
    string,
    { key: string; styles: number[]; appearances: number; wins: number }
  >();

  for (const team of teams) {
    const styles = team.members.map((r) => r.result?.runningStyle ?? 0).sort();
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
