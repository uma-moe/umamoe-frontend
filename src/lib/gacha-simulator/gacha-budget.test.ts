import { describe, expect, it } from 'vitest';
import { planGachaPurchase, spendGachaPurchase } from './gacha-budget';

const wallet = { tickets: 3, freeCarats: 600, paidCarats: 1_000 };

describe('gacha purchases', () => {
  it('takes a single draw from paid Carats alone', () => {
    const plan = planGachaPurchase(wallet, { count: 1, cost: 50, payWith: ['paidCarats'] });

    expect(plan.spent).toEqual({ tickets: 0, freeCarats: 0, paidCarats: 50 });
    expect(plan.remaining).toEqual({ tickets: 3, freeCarats: 600, paidCarats: 950 });
    expect(plan.shortfall).toBe(0);
  });

  it('leaves free Carats alone when the balance it needs is paid', () => {
    const free = { tickets: 0, freeCarats: 9_000, paidCarats: 0 };

    expect(
      spendGachaPurchase(free, { count: 1, cost: 50, payWith: ['paidCarats'] })
    ).toBeUndefined();
  });

  it('takes a ticket ten-draw from tickets alone', () => {
    const plan = planGachaPurchase(
      { tickets: 12, freeCarats: 0, paidCarats: 0 },
      { count: 10, cost: 10, payWith: ['tickets'] }
    );

    expect(plan.spent).toEqual({ tickets: 10, freeCarats: 0, paidCarats: 0 });
    expect(plan.remaining.tickets).toBe(2);
  });

  it('spends free Carats before paid on a carat ten-draw', () => {
    const plan = planGachaPurchase(
      { tickets: 5, freeCarats: 900, paidCarats: 800 },
      { count: 10, cost: 1_500, payWith: ['freeCarats', 'paidCarats'] }
    );

    expect(plan.spent).toEqual({ tickets: 0, freeCarats: 900, paidCarats: 600 });
    expect(plan.remaining).toEqual({ tickets: 5, freeCarats: 0, paidCarats: 200 });
    expect(plan.shortfall).toBe(0);
  });

  it('reports the shortfall in the currency the purchase spends', () => {
    const short = { tickets: 4, freeCarats: 300, paidCarats: 100 };

    const tickets = planGachaPurchase(short, { count: 10, cost: 10, payWith: ['tickets'] });
    const carats = planGachaPurchase(short, {
      count: 10,
      cost: 1_500,
      payWith: ['freeCarats', 'paidCarats']
    });

    expect(tickets.shortfall).toBe(6);
    expect(carats.shortfall).toBe(1_100);
    expect(
      spendGachaPurchase(short, { count: 10, cost: 10, payWith: ['tickets'] })
    ).toBeUndefined();
  });
});
