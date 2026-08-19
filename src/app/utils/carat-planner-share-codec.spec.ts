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
    expect(restored.targets[0].id).not.toBe(source.targets[0].id);
    expect(restored.targets[0].pickupGoals).toEqual([{ pickupId: 123, desiredCopies: 5 }]);
    expect(restored.customIncome[0].label).toBe('Tournament bonus');
    expect(restored.variableRewardSelections?.['loh-1'].amounts).toEqual({
      free_jewels: 1_500,
      rainbow_crystal: 2,
    });
    expect(decoded.fingerprint).toMatch(/^[a-f0-9]{8,16}$/);
  });

  it('keeps existing version 1 links readable', async () => {
    const source = plan();
    const payload = legacyJsonPayload(source);
    const decoded = await decodeCompactPlannerShare(payload);

    expect((decoded.plan as CaratPlan).name).toBe(source.name);
    expect((decoded.plan as CaratPlan).targets[0].id).toBe('target-1');
  });

  it('keeps a maximum-sized practical plan within the expanded link budget', async () => {
    const source = plan();
    source.enabledRewardIds = Array.from({ length: 5_000 }, (_, index) => `timeline-reward-${index + 1}`);
    source.targets = Array.from({ length: 200 }, (_, index) => ({
      ...source.targets[0],
      id: `target-${index + 1}`,
      eventId: `support-banner-${index + 1}`,
      gachaId: 10_000 + index,
      title: `Long-term support banner number ${index + 1}`,
      imagePath: `https://assets.example.test/banners/support-${index + 1}.webp`,
      pickupId: 20_000 + index,
      pickupGoals: [{ pickupId: 20_000 + index, desiredCopies: 5 }],
    }));

    const payload = await encodeCompactPlannerShare(source);
    const rawPlanBytes = new TextEncoder().encode(JSON.stringify({ v: 1, p: source })).byteLength;
    const decoded = await decodeCompactPlannerShare(payload);

    expect(payload.length).toBeLessThan(32_000);
    expect(payload.length).toBeLessThan(rawPlanBytes * 0.35);
    expect((decoded.plan as CaratPlan).targets.length).toBe(200);
    expect((decoded.plan as CaratPlan).enabledRewardIds.length).toBe(5_000);
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
    disabledRewardIds: ['reward-3'],
    enabledRewardEventIds: ['event-1'],
    disabledEventIds: ['event-2'],
    scenarioSelections: { speculative_income: 'include' },
    variableRewardSelections: {
      'loh-1': {
        optionId: 'platinum',
        label: 'Platinum',
        availableAt: '2026-09-01',
        amounts: { free_jewels: 1_500, rainbow_crystal: 2 },
      },
    },
    freePullCampaignSelections: { 'campaign-1': 'support-123' },
    resourceDefaultsApplied: true,
    customIncome: [{
      id: 'income-1',
      label: 'Tournament bonus',
      currency: 'free_jewels',
      amount: 250,
      cadence: 'monthly',
      startDate: '2026-09-01',
      endDate: '2027-09-01',
      every: 2,
    }],
    targets: [{
      id: 'target-1',
      eventId: 'support-123',
      gachaId: 123,
      gachaIds: [123, 124],
      title: 'Support banner',
      bannerKind: 'support',
      imagePath: '/images/support-123.webp',
      plannedPulls: 200,
      pullTiming: 'end',
      desiredCopies: 5,
      pickupId: 123,
      pickupGoals: [{ pickupId: 123, desiredCopies: 5 }],
      useTickets: true,
      ticketLimit: 20,
      allowPaidJewels: false,
      rainbowCrystalsPlanned: 2,
      goldCrystalsPlanned: 1,
    }],
  };
}

function legacyJsonPayload(source: CaratPlan): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, p: source }));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `j.${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
}
