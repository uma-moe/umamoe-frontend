import { describe, expect, it } from 'vitest';
import { raceSelectionKey, selectedRaceSaddles, toggleRaceSelection } from './race-schedule-selection';

describe('Angular race schedule selection contract', () => {
  it('keeps one race per year/month/half cell and toggles the same race off', () => {
    expect(toggleRaceSelection([[0, 1, 1, 10]], [0, 1, 1, 20])).toEqual([[0, 1, 1, 20]]);
    expect(toggleRaceSelection([[0, 1, 1, 10]], [0, 1, 1, 10])).toEqual([]);
    expect(raceSelectionKey([1, 4, 2, 99])).toBe('classic-4-2:99');
  });
  it('derives the distinct single-race saddle ids required by the backend', () => {
    expect(selectedRaceSaddles([[0, 1, 1, 10], [1, 2, 2, 20]], new Map([[10, [7, 8]], [20, [8, 9]]]))).toEqual([7, 8, 9]);
  });
});
