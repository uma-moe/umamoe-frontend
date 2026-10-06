import { describe, expect, it } from 'vitest';
import { activePlan, createPlan, importPlanCollection, loadPlanCollection, sanitizePlan, savePlanCollection, withoutPlannerResourceDates, type CaratPlanCollection } from './carat-planner';
import { compactPlannerCollectionForCloud, compactPlannerPlanForCloudShare, expandPlannerCollectionFromCloud, expandPlannerPlanFromCloudShare } from './planner-cloud-codec';
import { compactPlannerPlanData, decodeCompactPlannerShare, encodeCompactPlannerShare, expandCompactPlannerPlanData } from './planner-share-codec';
import { plannerCollectionHash } from './planner-cloud-state';

const legacyTarget = {
  id: 'target', eventId: 'banner', title: 'Banner', bannerKind: 'support' as const,
  pullTiming: 'custom' as const, customPullDate: '2026-09-01', plannedPulls: 200,
  pickupId: 30123, desiredCopies: 3, useTickets: true, ticketLimit: 10,
  allowPaidJewels: false, rainbowCrystalsPlanned: 1,
};
const notes = 'LB3, +1 "selector"\nUsable LB2; 日本語 🎠 ';
const empty: CaratPlanCollection = { version: 1, activePlanId: '', plans: [] };

describe('Pull-plan notes', () => {
  it('imports old JSON exports and compact shares without requiring notes', () => {
    const plan = { ...createPlan('Old plan'), targets: [legacyTarget] };
    for (const payload of [plan, { version: 1, plan }, { ...empty, activePlanId: plan.id, plans: [plan] }]) {
      const restored = activePlan(importPlanCollection(JSON.stringify(payload), empty));
      expect(restored.targets[0]).toMatchObject(legacyTarget);
      expect(restored.targets[0]?.pickupGoals).toEqual([{ pickupId: 30123, desiredCopies: 3 }]);
      expect(restored.targets[0]?.notes).toBeUndefined();
    }
    const oldShare = compactPlannerPlanData(plan) as unknown[][];
    (oldShare[14]![0] as unknown[]).length = 17;
    expect(expandCompactPlannerPlanData(oldShare)?.targets[0]).toMatchObject({ ...legacyTarget, id: 'shared-target-1' });
    expect(expandCompactPlannerPlanData(oldShare)?.targets[0]?.notes).toBeUndefined();
  });

  it('preserves per-banner notes through JSON export/import, reload, cloud sync, and sharing', async () => {
    const plan = sanitizePlan({ ...createPlan('Notes'), targets: [{ ...legacyTarget, notes }, { ...legacyTarget, id: 'other', eventId: 'other' }] })!;
    const collection: CaratPlanCollection = { ...empty, activePlanId: plan.id, plans: [plan, { ...plan, id: 'copy', name: 'Notes copy' }] };
    for (const payload of [{ version: 1, plan: withoutPlannerResourceDates(plan) }, collection]) {
      const imported = importPlanCollection(JSON.stringify(payload), empty);
      expect(imported.plans).toEqual('plan' in payload ? [plan] : collection.plans);
      let stored = '';
      savePlanCollection(imported, { setItem: (_, value) => { stored = value; } });
      expect(loadPlanCollection({ getItem: () => stored })).toEqual(imported);
      expect(JSON.parse(stored).version).toBe(1);
    }
    const cloud = expandPlannerCollectionFromCloud(JSON.parse(JSON.stringify(compactPlannerCollectionForCloud(collection))))!;
    cloud.plans = cloud.plans.map(plan => sanitizePlan(plan)!);
    expect(plannerCollectionHash(cloud)).toBe(plannerCollectionHash(collection));
    const shortShare = expandPlannerPlanFromCloudShare(compactPlannerPlanForCloudShare(plan))!;
    const compactShare = sanitizePlan((await decodeCompactPlannerShare(await encodeCompactPlannerShare(plan))).plan)!;
    for (const restored of [activePlan(cloud), shortShare, compactShare]) {
      expect(restored.targets.map(target => target.notes)).toEqual([notes, undefined]);
      expect(restored.targets[0]).toMatchObject({ plannedPulls: 200, customPullDate: '2026-09-01', ticketLimit: 10, rainbowCrystalsPlanned: 1 });
    }
    const previousHash = plannerCollectionHash(collection);
    plan.targets[0]!.notes = '';
    expect(plannerCollectionHash(collection)).not.toBe(previousHash);
    expect(sanitizePlan(plan)?.targets[0]?.notes).toBeUndefined();
    expect(expandPlannerCollectionFromCloud(compactPlannerCollectionForCloud(collection))?.plans[0]?.targets[0]?.notes).toBeUndefined();
  });

  it('bounds imported notes and ignores non-text values', () => {
    for (const value of [undefined, null, 42, {}, ['notes'], '', 'x'.repeat(2100)]) {
      const plan = sanitizePlan({ ...createPlan(), targets: [{ ...legacyTarget, notes: value }] });
      expect(plan?.targets[0]?.notes).toBe(typeof value === 'string' && value ? value.slice(0, 2000) : undefined);
    }
  });
});
