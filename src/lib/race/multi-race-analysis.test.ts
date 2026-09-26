import { describe, expect, it } from 'vitest';
import type { ParsedRaceCapture } from './race-capture-parser';
import { analyzeMultiRace, groupMultiRaceCaptures } from './multi-race-analysis';

function capture(seed: number, winner = 0): ParsedRaceCapture {
  return {
    source: 'api', fileName: `race-${seed}.json`, courseId: 10101, laneDistanceMax: 15.1875, raceDistance: 1600, randomSeed: seed, track: { condition: 'Firm' },
    frames: [
      { time: 0, horses: [{ distance: 0, lanePosition: 10, speed: 1200, hp: 1000, temptationMode: 0, blockFrontHorseIndex: -1 }, { distance: 0, lanePosition: 20, speed: 1100, hp: 900, temptationMode: 0, blockFrontHorseIndex: -1 }] },
      { time: 90, horses: [{ distance: 1600, lanePosition: 10, speed: 1800, hp: 100, temptationMode: 0, blockFrontHorseIndex: -1 }, { distance: 1590, lanePosition: 20, speed: 1700, hp: 0, temptationMode: 0, blockFrontHorseIndex: -1 }] }
    ],
    events: [{ frameTime: 40, type: 3, params: [0, 200001] }, { frameTime: 70, type: 3, params: [0, 200001] }],
    runners: [0, 1].map((index) => ({ index, cardId: 100 + index, name: index ? 'Runner B' : 'Runner A', isPlayer: index === 0, trainerName: 'Trainer', stats: {}, aptitudes: {}, skillIds: index ? [200002] : [200001], raw: { team_id: index + 1 }, result: { finishOrder: index === winner ? 1 : 2, finishTime: 90 + index, finishDiffTime: 0, startDelayTime: 0, lastSpurtStartDistance: 1100, runningStyle: index + 1 } }))
  };
}

describe('multi-race analysis', () => {
  it('aggregates characters, skills, HP, and double activations without UI services', () => {
    const analysis = analyzeMultiRace([capture(1), capture(2)]);
    expect(analysis.races).toBe(2);
    expect(analysis.entries.every(entry => entry.raceDistance === 1600)).toBe(true);
    expect(analysis.characters[0]).toMatchObject({ name: 'Runner A', races: 2, wins: 2 });
    expect(analysis.skills.find((skill) => skill.skillId === 200001)).toMatchObject({ learned: 2, activations: 4, doubleProcRaces: 2 });
    expect(analysis.hp[0]).toMatchObject({ name: 'Runner A', races: 2, survived: 2, lastSpurtRaces: 2 });
  });

  it('groups captures by track and condition before analysis', () => {
    const wider = capture(2); wider.laneDistanceMax=20;
    expect(groupMultiRaceCaptures([capture(1), wider])).toHaveLength(1);
    const alternate = capture(3); alternate.track.condition = 'Heavy';
    expect(groupMultiRaceCaptures([capture(1), capture(2), alternate]).map((group) => group.captures.length)).toEqual([2, 1]);
  });
});
