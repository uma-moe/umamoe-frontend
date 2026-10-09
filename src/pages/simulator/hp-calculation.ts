import type { StaminaResult } from './simulator-repository';

/** A forced full-spurt decision is not evidence of sufficient HP. */
export function hpCalculation(result: StaminaResult, forced: boolean) {
  const available = result.check_hp[0], needed = result.full_spurt_need_hp[0];
  const balance = available !== undefined && needed !== undefined && Number.isFinite(available) && Number.isFinite(needed) ? available - needed : null;
  return {
    remainingPercent: result.max_hp > 0 ? Math.max(0, Math.min(100, result.remaining_hp / result.max_hp * 100)) : 0,
    spurt: forced ? 'Forced full spurt' : result.full_spurt ? 'Full spurt selected' : 'Reduced or delayed spurt',
    balance,
    feasibility: balance === null ? 'No spurt check returned' : balance >= 0 ? 'Enough HP at the first spurt check' : 'Insufficient HP at the first spurt check'
  };
}
