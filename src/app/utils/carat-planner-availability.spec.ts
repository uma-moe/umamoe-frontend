import { isCaratPlannerAvailable } from './carat-planner-availability';

describe('isCaratPlannerAvailable', () => {
  it('enables the planner on the beta host', () => {
    expect(isCaratPlannerAvailable('beta.uma.moe')).toBeTrue();
  });

  it('keeps local development available', () => {
    expect(isCaratPlannerAvailable('localhost')).toBeTrue();
    expect(isCaratPlannerAvailable('127.0.0.1')).toBeTrue();
    expect(isCaratPlannerAvailable('::1')).toBeTrue();
  });

  it('disables the planner on production and unrelated hosts', () => {
    expect(isCaratPlannerAvailable('uma.moe')).toBeFalse();
    expect(isCaratPlannerAvailable('www.uma.moe')).toBeFalse();
    expect(isCaratPlannerAvailable('preview.example.com')).toBeFalse();
  });
});
