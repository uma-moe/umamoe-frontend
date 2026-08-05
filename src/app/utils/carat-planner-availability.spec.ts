import { isCaratPlannerAvailable } from './carat-planner-availability';

describe('isCaratPlannerAvailable', () => {
  it('enables the planner on beta and production hosts', () => {
    expect(isCaratPlannerAvailable('beta.uma.moe')).toBeTrue();
    expect(isCaratPlannerAvailable('uma.moe')).toBeTrue();
    expect(isCaratPlannerAvailable('www.uma.moe')).toBeTrue();
  });

  it('keeps local development available', () => {
    expect(isCaratPlannerAvailable('localhost')).toBeTrue();
    expect(isCaratPlannerAvailable('127.0.0.1')).toBeTrue();
    expect(isCaratPlannerAvailable('::1')).toBeTrue();
  });

  it('keeps preview deployments available', () => {
    expect(isCaratPlannerAvailable('preview.example.com')).toBeTrue();
  });
});
