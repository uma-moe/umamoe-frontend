import { getScenarioName } from './profile-helpers';

describe('getScenarioName', () => {
  it('uses the Grand Live abbreviation for scenario ID 3', () => {
    expect(getScenarioName(3)).toBe('GL');
  });

  it('keeps Grand Masters at ID 5 and LArc at ID 6', () => {
    expect(getScenarioName(5)).toBe('Grand Masters');
    expect(getScenarioName(6)).toBe('LArc');
  });
});
