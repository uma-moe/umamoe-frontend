import { CaratPlan } from '../models/carat-planner.model';
import {
  decodeCompactPlannerShare,
  encodeCompactPlannerShare,
} from './carat-planner-share-codec';

describe('Carat Planner compact share codec', () => {
  it('round-trips a plan through a URL-safe payload', async () => {
    const source = plan();
    const payload = await encodeCompactPlannerShare(source);
    const decoded = await decodeCompactPlannerShare(payload);
    const restored = decoded.plan as CaratPlan;

    expect(payload).toMatch(/^[gj]\.[a-zA-Z0-9_-]+$/);
    expect(restored.name).toBe('Long-term plan 日本語');
    expect(restored.targets[0].eventId).toBe('support-123');
    expect(decoded.fingerprint).toMatch(/^[a-f0-9]{8,16}$/);
  });

  it('rejects malformed and unsupported payloads', async () => {
    await expectAsync(decodeCompactPlannerShare('not-a-plan')).toBeRejected();
    await expectAsync(decodeCompactPlannerShare('x.e30')).toBeRejected();
  });
});

function plan(): CaratPlan {
  return {
    id: 'plan-local',
    name: 'Long-term plan 日本語',
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
    projectionStartDate: '2026-08-19',
    balances: {
      freeJewels: 12_345,
      paidJewels: 0,
      umaTickets: 4,
      supportTickets: 8,
      rainbowCrystals: 12,
      goldCrystals: 3,
      rainbowFullCrystals: 1,
      goldFullCrystals: 0,
    },
    enabledIncomeRuleIds: ['daily-missions'],
    enabledRewardIds: ['reward-1', 'reward-2'],
    enabledRewardEventIds: ['event-1'],
    scenarioSelections: { speculative_income: 'include' },
    customIncome: [],
    targets: [{
      id: 'target-1',
      eventId: 'support-123',
      title: 'Support banner',
      bannerKind: 'support',
      plannedPulls: 200,
      pullTiming: 'end',
      desiredCopies: 1,
      pickupGoals: [],
      useTickets: true,
      allowPaidJewels: false,
      rainbowCrystalsPlanned: 0,
      goldCrystalsPlanned: 0,
    }],
  };
}
