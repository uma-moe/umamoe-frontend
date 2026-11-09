import { describe, expect, it } from 'vitest';
import {
  recordedMoodDeal,
  seededCmMoods,
  seededGates,
  seededRunnerMoods,
  seededTeamMoods
} from './game-seating';

describe('seeded gates', () => {
  it('seat runners as the game did', () => {
    // A room match from 2026-10-27 and a career race from 2026-10-25, gates in capture order.
    const roomMatch = seededGates(1498120452, 9);
    const careerRace = seededGates(696552051, 16);

    expect(roomMatch).toEqual([1, 5, 6, 4, 7, 2, 3, 9, 8]);
    expect(careerRace).toEqual([7, 9, 8, 1, 6, 2, 4, 15, 5, 11, 12, 13, 10, 16, 14, 3]);
  });

  it('seat every runner in its own gate on a negative seed', () => {
    const gates = seededGates(-1672009168, 18);

    expect(gates.toSorted((a, b) => a - b)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });
});

describe('Champions Meeting moods', () => {
  // Two CM20 races from 2026-10-11, moods in capture order.
  it('are dealt as the game dealt them', () => {
    expect(seededTeamMoods(575300201)).toEqual([4, 3, 2, 4, 2, 5, 3, 5, 2]);
    expect(seededTeamMoods(1262192222)).toEqual([2, 5, 3, 2, 2, 4, 5, 3, 2]);
  });

  it('give each team listed apart its draws in list order', () => {
    const teamIds = [1, 2, 1, 3, 2, 1, 3, 3, 2];

    const moods = seededCmMoods(teamIds, 575300201);

    const team = (id: number) =>
      teamIds.flatMap((teamId, p) => (teamId === id ? [moods?.[p]] : []));
    expect(team(1)).toEqual([4, 3, 2]);
    expect(team(2)).toEqual([4, 2, 5]);
    expect(team(3)).toEqual([3, 5, 2]);
  });

  it('are dealt only to three teams of three', () => {
    expect(seededCmMoods([1, 1, 1, 1, 2, 2, 3, 3, 3], 7)).toBeUndefined();
    expect(seededCmMoods([0, 0, 0, 2, 2, 2, 3, 3, 3], 7)).toBeUndefined();
    expect(seededCmMoods([1, 1, 1, 2, 2, 2], 7)).toBeUndefined();
  });
});

describe('Team Trials moods', () => {
  // Two Team Trials races from 2026-09-11 and a random-mood room match from CM10's archive, moods in capture order.
  it('give every runner the mood its own draw deals', () => {
    expect(seededRunnerMoods(1119669181, 12)).toEqual([2, 1, 2, 5, 1, 5, 2, 1, 4, 4, 5, 2]);
    expect(seededRunnerMoods(621764430, 12)).toEqual([3, 2, 3, 4, 4, 4, 2, 5, 5, 4, 2, 2]);
    expect(seededRunnerMoods(375632601, 9)).toEqual([4, 1, 2, 3, 5, 4, 5, 5, 4]);
  });
});

describe('the deal a race was dealt its moods by', () => {
  /** Each runner's gate and mood, listed by gate as saved replays list them. */
  function recordedRunners(seed: number, slotMoods: readonly number[]) {
    return seededGates(seed, slotMoods.length)
      .map((gate, slot) => ({ gate, mood: slotMoods[slot] ?? 0 }))
      .toSorted((a, b) => a.gate - b.gate);
  }

  it('is Champions Meeting for a CM race in any runner order', () => {
    const cmRace = recordedRunners(575300201, [4, 3, 2, 4, 2, 5, 3, 5, 2]);

    expect(recordedMoodDeal(575300201, cmRace)).toBe('championsMeeting');
  });

  it('is each runner its own for a Team Trials race', () => {
    const teamTrialsRace = recordedRunners(1119669181, [2, 1, 2, 5, 1, 5, 2, 1, 4, 4, 5, 2]);

    expect(recordedMoodDeal(1119669181, teamTrialsRace)).toBe('perRunner');
  });

  it('is none for a room match where every runner is Great', () => {
    const roomMatch = recordedRunners(575300201, Array(9).fill(5));

    expect(recordedMoodDeal(575300201, roomMatch)).toBeUndefined();
  });
});
