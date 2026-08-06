import { getScenarioDisplayName } from './character-display.util';

describe('getScenarioDisplayName', () => {
  it('uses the Grand Live abbreviation for scenario ID 3', () => {
    expect(getScenarioDisplayName(3)).toBe('GL');
  });

  it('keeps Grand Masters at ID 5 and LArc at ID 6', () => {
    expect(getScenarioDisplayName(5)).toBe('Grand Masters');
    expect(getScenarioDisplayName(6)).toBe('LArc');
  });
});
