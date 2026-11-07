import { describe, expect, it } from 'vitest';
import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
import { raceAptitudes } from './race-aptitudes';

function runner({
  raw = {},
  aptitudes = {},
  runningStyle = 2
}: {
  raw?: Record<string, unknown>;
  aptitudes?: RaceRunner['aptitudes'];
  runningStyle?: number;
}): RaceRunner {
  return {
    index: 0,
    name: 'Runner',
    isPlayer: false,
    stats: {},
    aptitudes,
    skillIds: [],
    result: { finishOrder: 1, finishTime: 120, finishDiffTime: 0, runningStyle },
    raw
  };
}

describe('race aptitudes', () => {
  it("reads the grades of the race's distance, track and the runner's style", () => {
    const graded = runner({
      raw: { proper_distance_middle: 7, proper_ground_turf: 8, proper_running_style_senko: 5 }
    });

    const tiles = raceAptitudes(graded, { surface: 1, distance: 2200 });

    expect(tiles).toEqual([
      { group: 'Distance', label: 'Medium', grade: 'A' },
      { group: 'Track', label: 'Turf', grade: 'S' },
      { group: 'Style', label: 'Pace', grade: 'C' }
    ]);
  });

  it('places distances into the game categories at their upper bounds', () => {
    const labelAt = (distance: number) => raceAptitudes(runner({}), { distance })[0]?.label;

    expect([1400, 1401, 1800, 2400, 2401].map(labelAt)).toEqual([
      'Sprint',
      'Mile',
      'Mile',
      'Medium',
      'Long'
    ]);
  });

  it('falls back to summary grades only when the capture has no category grades', () => {
    const summaryOnly = runner({ aptitudes: { distance: 6, surface: 7, style: 8 } });
    const partlyGraded = runner({ raw: { proper_ground_turf: 7 }, aptitudes: { distance: 6 } });

    const summaryTiles = raceAptitudes(summaryOnly, { surface: 1, distance: 1600 });
    const partialTiles = raceAptitudes(partlyGraded, { surface: 1, distance: 1600 });

    expect(summaryTiles.map((tile) => tile.grade)).toEqual(['B', 'A', 'S']);
    expect(partialTiles.map((tile) => tile.grade)).toEqual([undefined, 'A', undefined]);
  });

  it('leaves the label out when the race context lacks it', () => {
    const tiles = raceAptitudes(runner({ runningStyle: 0 }), {});

    expect(tiles.map((tile) => tile.label)).toEqual([undefined, undefined, undefined]);
  });
});
