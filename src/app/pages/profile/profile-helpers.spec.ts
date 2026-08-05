import { getScenarioName } from './profile-helpers';

describe('getScenarioName', () => {
  it('uses the Grand Live abbreviation for scenario ID 3', () => {
    expect(getScenarioName(3)).toBe('GL');
  });
});
