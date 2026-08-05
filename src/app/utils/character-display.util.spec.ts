import { getScenarioDisplayName } from './character-display.util';

describe('getScenarioDisplayName', () => {
  it('uses the Grand Live abbreviation for scenario ID 3', () => {
    expect(getScenarioDisplayName(3)).toBe('GL');
  });
});
