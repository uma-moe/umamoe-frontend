import { describe, expect, it } from 'vitest';
import { dealsCmMoods, seededCmMoods, seededGates, seededTeamMoods } from './game-seating';

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

describe('a race dealt Champions Meeting moods', () => {
  const seed = 575300201;
  const slotMoods = [4, 3, 2, 4, 2, 5, 3, 5, 2];
  const slotGates = seededGates(seed, 9);

  it('is recognised in any runner order', () => {
    const inGateOrder = slotGates
      .map((gate, slot) => ({ gate, mood: slotMoods[slot] ?? 0 }))
      .toSorted((a, b) => a.gate - b.gate);

    expect(dealsCmMoods(seed, inGateOrder)).toBe(true);
  });

  it('is not a room match where every runner is Great', () => {
    const roomMatch = slotGates.map((gate) => ({ gate, mood: 5 }));

    expect(dealsCmMoods(seed, roomMatch)).toBe(false);
  });
});
