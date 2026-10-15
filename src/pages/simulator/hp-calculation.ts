import type { StaminaResult } from './simulator-repository';

/** A forced full-spurt decision is not evidence of sufficient HP. */
export function hpCalculation(result: StaminaResult, forced: boolean) {
  const available = result.check_hp[0],
    needed = result.full_spurt_need_hp[0];

  const balance =
    available !== undefined &&
    needed !== undefined &&
    Number.isFinite(available) &&
    Number.isFinite(needed)
      ? available - needed
      : null;

  let spurt = 'Reduced or delayed spurt';
  if (forced) spurt = 'Forced full spurt';
  else if (result.full_spurt) spurt = 'Full spurt selected';
  let feasibility = 'No spurt check returned';
  if (balance !== null)
    feasibility =
      balance >= 0
        ? 'Enough HP at the first spurt check'
        : 'Insufficient HP at the first spurt check';
  return {
    remainingPercent:
      result.max_hp > 0
        ? Math.max(0, Math.min(100, (result.remaining_hp / result.max_hp) * 100))
        : 0,
    spurt,
    balance,
    feasibility
  };
}
