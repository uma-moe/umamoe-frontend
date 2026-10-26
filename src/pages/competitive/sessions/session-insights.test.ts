import { describe, expect, it } from 'vitest';
import { analyzeMultiRace } from '@/lib/race/multi-race-analysis';
import { makeDemoRaces } from '../demo-races';
import { kpiText, opponentScoreKpi, playerKpi, styleKpi, umaKpi } from './session-kpis';
import {
  averageRoom,
  bestPlacingOpponents,
  COURSE_SECTIONS,
  FRONT_RUNNER,
  gateRecords,
  leaderlessRooms,
  phaseCounts,
  playerRecord,
  raceSummaries,
  roomCompositions,
  saturationBuckets,
  scoreAverages,
  scoreSummary,
  sectionCounts,
  sessionBaseline,
  SMALL_SAMPLE,
  standoutUma,
  styleStandouts,
  type StyleShare
} from './session-insights';

const races = makeDemoRaces(24);
const analysis = analyzeMultiRace(races);
const entries = races.flatMap((capture, race) =>
  capture.runners.map((runner) => ({ runner, race }))
);

function share(style: number, entries: number, fieldShare: number, winShare: number): StyleShare {
  return { style, entries, wins: 0, fieldShare, winShare };
}

describe('session baselines', () => {
  it('derives the neutral Uma and team rates from nine-runner, three-team rooms', () => {
    const baseline = sessionBaseline(analysis);

    expect(baseline.uma).toBeCloseTo(100 / 9);
    expect(baseline.team).toBeCloseTo(100 / 3);
  });

  it('counts the races the player’s runners won and placed in', () => {
    const expectedWins = races.filter((capture) =>
      capture.runners.some((runner) => runner.isPlayer && runner.result?.finishOrder === 1)
    ).length;

    const record = playerRecord(races);

    expect(record?.races).toBe(24);
    expect(record?.wins).toBe(expectedWins);
    expect(record?.podiums).toBeGreaterThanOrEqual(expectedWins);
  });

  it('has no player record when no runner is the player’s', () => {
    const spectated = races.map((capture) => ({
      ...capture,
      runners: capture.runners.map((runner) => ({ ...runner, isPlayer: false }))
    }));

    expect(playerRecord(spectated)).toBeUndefined();
  });
});

describe('session standouts', () => {
  it('picks the styles furthest above and below their field share, ignoring small samples', () => {
    const shares = [
      share(1, 40, 25, 10),
      share(2, 60, 30, 30),
      share(3, 50, 30, 50),
      share(4, SMALL_SAMPLE - 1, 2, 40)
    ];

    const { strongest, weakest } = styleStandouts(shares);

    expect(strongest?.style).toBe(3);
    expect(weakest?.style).toBe(1);
  });

  it('never leads with an Uma entered fewer than the small-sample threshold', () => {
    const lucky = { ...analysis.characters[0]!, key: 'lucky', races: SMALL_SAMPLE - 1, wins: 4 };

    const standout = standoutUma({ ...analysis, characters: [...analysis.characters, lucky] });

    expect(standout?.key).not.toBe('lucky');
    expect(standout?.races).toBeGreaterThanOrEqual(SMALL_SAMPLE);
  });
});

describe('race summaries', () => {
  it('lists each race winner with the margin to the runner-up and the player’s best finish', () => {
    const [first] = raceSummaries(races);
    const runnerUp = races[0]!.runners.find((runner) => runner.result?.finishOrder === 2)!;

    expect(first?.winner.result?.finishOrder).toBe(1);
    expect(first?.margin).toBeCloseTo(runnerUp.result!.finishTime - first!.time);
    expect(first?.playerBest).toBe(
      Math.min(
        ...races[0]!.runners
          .filter((runner) => runner.isPlayer)
          .map((runner) => runner.result!.finishOrder)
      )
    );
  });

  it('records every gate’s starts and the session’s wins', () => {
    const gates = gateRecords(entries);

    expect(gates).toHaveLength(9);
    expect(gates.every((gate) => gate.starts === 24)).toBe(true);
    expect(gates.reduce((total, gate) => total + gate.wins, 0)).toBe(24);
  });

  it('bins field and winner scores together so both distributions total 100%', () => {
    const summary = scoreSummary(entries)!;
    const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);

    expect(summary.bins).toHaveLength(10);
    expect(total(summary.field)).toBeCloseTo(100);
    expect(total(summary.winners)).toBeCloseTo(100);
    expect(summary.winnerAverage).toBeGreaterThan(0);
  });
});

describe('skill and course measures', () => {
  it('places activations in the course sections and race phases', () => {
    const sections = sectionCounts([0, 99, 100, 1700, 2399, 2400], 2400);

    const phases = phaseCounts(sections);

    expect(sections).toHaveLength(COURSE_SECTIONS);
    expect(sections[0]).toBe(2);
    expect(sections[1]).toBe(1);
    expect(sections[COURSE_SECTIONS - 1]).toBe(2);
    expect(phases.map((phase) => [phase.name, phase.count])).toEqual([
      ['Early race', 3],
      ['Mid race', 0],
      ['Late race', 1],
      ['Final leg', 2]
    ]);
  });

  it('turns style saturation into CM Data buckets with races per room count', () => {
    const style = analysis.strategies.find((row) => row.strategy > 0)!;

    const buckets = saturationBuckets(style);

    for (const bucket of buckets) {
      expect(bucket.races).toBe(bucket.entries / bucket.x);
      expect(bucket.races).toBeGreaterThanOrEqual(2);
      expect(bucket.ci[0]).toBeLessThanOrEqual(bucket.rate);
      expect(bucket.ci[1]).toBeGreaterThanOrEqual(bucket.rate);
    }
  });
});

describe('session KPIs', () => {
  const baseline = { uma: 100 / 9, team: 100 / 3 };

  it('compares the player’s team with an evenly matched one', () => {
    const kpi = playerKpi({ races: 24, wins: 13, podiums: 20 }, baseline);

    expect(kpiText(kpi)).toBe('Your team won · 54.2% · above the even 33.3% · 13 of 24 races');
    expect(kpi.comparison?.tone).toBe('over');
  });

  it('reads results within two points of neutral as about even', () => {
    const kpi = playerKpi({ races: 30, wins: 10, podiums: 20 }, baseline);

    expect(kpi.comparison).toEqual({ tone: 'even', text: 'about the even 33.3%' });
  });

  it('states a style’s wins against its field share', () => {
    const kpi = styleKpi(share(4, 62, 28.7, 45.8), 'Best running style');

    expect(kpi.value).toBe('45.8%');
    expect(kpi.comparison).toEqual({ tone: 'over', text: '1.6× its 28.7% field share' });
  });

  it('states an Uma’s record against the neutral rate and mutes small samples', () => {
    const uma = { ...analysis.characters[0]!, name: 'King Halo', races: 14, wins: 5 };

    const measured = umaKpi(uma, baseline, 'Top Uma');
    const lucky = umaKpi({ ...uma, races: SMALL_SAMPLE - 1, wins: 2 }, baseline, 'Top Uma');

    expect(kpiText(measured)).toBe(
      'Top Uma · King Halo · 35.7% · 3.2× the neutral 11.1% · 5 of 14 races'
    );
    expect(measured.few).toBe(false);
    expect(lucky.few).toBe(true);
  });

  it('reads an opponent score within one percent of the player’s as even', () => {
    const kpi = opponentScoreKpi({ player: 15_100, opponents: 15_000, bestOpponents: 16_200 });

    expect(kpi?.value).toBe((15_000).toLocaleString());
    expect(kpi?.comparison?.tone).toBe('even');
    expect(opponentScoreKpi({})).toBeUndefined();
  });
});

describe('Hakuraku room and opponent measures', () => {
  const styles = [1, 2, 3, 4];

  it('groups races by how many runners of each style they had', () => {
    const rooms = roomCompositions(races, styles);

    const roomRaces = rooms.reduce((total, room) => total + room.races, 0);
    const wins = rooms.reduce(
      (total, room) => total + room.wins.reduce((sum, count) => sum + count, 0),
      0
    );

    expect(roomRaces).toBe(24);
    expect(wins).toBe(24);
    for (const room of rooms) expect(room.counts.reduce((sum, count) => sum + count, 0)).toBe(9);
  });

  it('averages the room so its styles add up to the field size', () => {
    const average = averageRoom(roomCompositions(races, styles), styles);

    expect(average.reduce((sum, count) => sum + count, 0)).toBeCloseTo(9);
    expect(averageRoom([], styles)).toEqual([0, 0, 0, 0]);
  });

  it('counts the races without a Front Runner', () => {
    const withoutLeaders = races.map((capture) => ({
      ...capture,
      runners: capture.runners.map((runner) =>
        runner.result?.runningStyle === FRONT_RUNNER
          ? { ...runner, result: { ...runner.result, runningStyle: 2 } }
          : runner
      )
    }));

    expect(leaderlessRooms(withoutLeaders)).toBe(24);
  });

  it('names the opponent that finished first among the rest of each race', () => {
    const opponents = bestPlacingOpponents(races);
    const first = races[0]!;
    const expected = first.runners
      .filter((runner) => !runner.isPlayer)
      .sort((a, b) => a.result!.finishOrder - b.result!.finishOrder)[0]!;

    const firstRace = bestPlacingOpponents([first]);

    expect(opponents.races).toBe(24);
    expect(opponents.rows.reduce((total, row) => total + row.races, 0)).toBe(24);
    expect(firstRace.rows[0]?.name).toBe(expected.name);
    expect(firstRace.rows[0]?.wins).toBe(Number(expected.result!.finishOrder === 1));
  });

  it('averages the scores of the player, the opponents and the best-placed opponent', () => {
    const scores = scoreAverages(races);

    expect(scores.player).toBeGreaterThan(0);
    expect(scores.opponents).toBeGreaterThan(0);
    expect(scores.bestOpponents).toBeGreaterThan(0);
  });
});
