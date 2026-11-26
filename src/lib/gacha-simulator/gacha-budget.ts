import type { GachaDrawCount } from './gacha-draw';

export interface GachaBudget {
  tickets: number;
  freeCarats: number;
  paidCarats: number;
}

/** The balances a purchase may draw on. */
export type GachaCurrency = keyof GachaBudget;

export interface GachaPurchase {
  count: GachaDrawCount;
  /** What it costs, in the currency `payWith` leads with: tickets or Carats. */
  cost: number;
  /** The balances it reaches, in order; none outside this list is touched. */
  payWith: readonly GachaCurrency[];
}

export interface GachaSpend {
  remaining: GachaBudget;
  spent: GachaBudget;
  /** What the budget is still short by, in the purchase's own currency; 0 when it covers it. */
  shortfall: number;
}

/** What a purchase would spend, in its own currency, whether or not the budget covers it. */
export function planGachaPurchase(budget: GachaBudget, purchase: GachaPurchase): GachaSpend {
  if (!validBudget(budget) || !validPurchase(purchase))
    throw new Error('Invalid gacha budget or purchase.');

  const spent: GachaBudget = { tickets: 0, freeCarats: 0, paidCarats: 0 };
  let outstanding = purchase.cost;

  for (const currency of purchase.payWith) {
    const take = Math.min(budget[currency] - spent[currency], outstanding);
    spent[currency] += take;
    outstanding -= take;
  }

  return {
    remaining: {
      tickets: budget.tickets - spent.tickets,
      freeCarats: budget.freeCarats - spent.freeCarats,
      paidCarats: budget.paidCarats - spent.paidCarats
    },
    spent,
    shortfall: outstanding
  };
}

/** The spend of a purchase the budget covers; undefined when it does not, and nothing is spent. */
export function spendGachaPurchase(
  budget: GachaBudget,
  purchase: GachaPurchase
): GachaSpend | undefined {
  const plan = planGachaPurchase(budget, purchase);
  return plan.shortfall === 0 ? plan : undefined;
}

function validPurchase(purchase: GachaPurchase): boolean {
  return (
    Number.isSafeInteger(purchase.cost) &&
    purchase.cost > 0 &&
    purchase.payWith.length > 0 &&
    purchase.payWith.every((currency) => currency in { tickets: 0, freeCarats: 0, paidCarats: 0 })
  );
}

function validBudget(budget: GachaBudget): boolean {
  return Object.values(budget).every((value) => Number.isSafeInteger(value) && value >= 0);
}
