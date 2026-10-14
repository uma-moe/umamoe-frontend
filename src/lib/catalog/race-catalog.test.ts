import { setupCatalogFixtures } from '../../../tests/fixtures/catalog-setup';
setupCatalogFixtures();
import { describe, expect, it } from 'vitest';
import { assignRaceWinSlots, loadOptimalRaceRecommendations, loadRaceHistory, loadRaceSaddleIndex, loadRaceSchedule, optimalRaceSchedule, raceHistorySchedule } from './race-catalog';

describe('shared Angular race catalog', () => {
  it('assigns wins in array order to distinct slots, matching race history', async () => {
    const schedule = await loadRaceSchedule(), saddles = await loadRaceSaddleIndex();
    for (const [wins, expected] of [
      [[11, 23], ['classic-11-2:101901', 'senior-11-2:101801']],
      [[23, 11], ['classic-11-2:101801', 'senior-11-2:101901']],
      [[11, 11], ['classic-11-2:101901', 'senior-11-2:101901']],
      [[11, 23, 11], ['classic-11-2:101901', 'senior-11-2:101801']]
    ] as const) {
      const selected = assignRaceWinSlots(schedule, saddles, wins);
      expect(selected.map(entry => entry.key)).toEqual(expected);
      expect(selected.map(entry => entry.winIndex)).toEqual([0, 1]);
      const history = await loadRaceHistory(wins, []);
      expect(history.map(entry => `${entry.year}-${entry.month}-${entry.half}:${entry.id}`)).toEqual(expected);
    }
    expect(assignRaceWinSlots(schedule, saddles, [999999, 11])).toEqual([{ key: 'classic-11-2:101901', winIndex: 1 }]);
  });

  it('decodes program * 100 + placement and does not duplicate its win saddle', async () => {
    const history = await loadRaceHistory([30], [102]);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ name: 'February Stakes', position: 2, won: false });
    expect(raceHistorySchedule(history).flatMap((year) => year.slots)).toHaveLength(1);
  });

  it('resolves saddle-only wins and preserves their chronological schedule', async () => {
    const history = await loadRaceHistory([30], []);
    expect(history[0]).toMatchObject({ name: 'February Stakes', position: 1, won: true, month: 2, half: 2 });
  });

  it('matches Angular +6/+3 G1 overlap recommendations', async () => {
    const recommendations = await loadOptimalRaceRecommendations([30], [30, 20]);
    expect(recommendations.slice(0, 2).map(({ name, affinityGain }) => ({ name, affinityGain }))).toEqual([
      { name: 'February Stakes', affinityGain: 6 },
      { name: 'Takamatsunomiya Kinen', affinityGain: 3 }
    ]);
    expect(optimalRaceSchedule(recommendations).flatMap((year) => year.slots)).toHaveLength(2);
  });

  it('reserves one race per turn and moves repeatable G1s to the next available year', async () => {
    const recommendations = await loadOptimalRaceRecommendations([16, 20], [16, 17, 15]);
    expect(recommendations.find((race) => race.saddleId === 16)).toMatchObject({ year: 'classic', month: 10, half: 2, affinityGain: 6 });
    expect(recommendations.find((race) => race.saddleId === 15)).toMatchObject({ year: 'senior', month: 10, half: 2 });
    const slots = optimalRaceSchedule(recommendations).flatMap((year) => year.slots);
    expect(slots.filter((slot) => slot.id.startsWith('senior-3-2-'))).toHaveLength(1);
    expect(new Set(slots.map((slot) => slot.id.split('-').slice(0, 3).join('-'))).size).toBe(slots.length);
    expect(optimalRaceSchedule(recommendations).find((year) => year.id === 'senior')!.slots.map((slot) => slot.id.split('-')[1])).toEqual(['3', '10']);
  });
});
