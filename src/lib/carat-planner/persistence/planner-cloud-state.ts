import type { CaratPlan, CaratPlanCollection } from '../carat-planner';
import { CONDITIONAL_REWARD_DEFAULT_SELECTIONS } from '../rewards/planner-reward-assumptions';

export function mergePlannerCollections(
  local: CaratPlanCollection,
  remote: CaratPlanCollection,
  remoteUpdatedAt: string | null,
  preserveUntrackedLocalPlans: boolean
): CaratPlanCollection {
  const plans = new Map(remote.plans.map((plan) => [plan.id, plan]));
  const remoteUpdatedTime = dateTime(remoteUpdatedAt);
  let localWon = false;
  for (const localPlan of local.plans) {
    const remotePlan = plans.get(localPlan.id);
    if (remotePlan) {
      if (dateTime(localPlan.updatedAt) > dateTime(remotePlan.updatedAt)) {
        plans.set(localPlan.id, localPlan);
        localWon = true;
      }

      continue;
    }

    if (preserveUntrackedLocalPlans || dateTime(localPlan.updatedAt) > remoteUpdatedTime) {
      plans.set(localPlan.id, localPlan);
      localWon = true;
    }
  }

  const mergedPlans = [...plans.values()]
    .sort((left, right) => dateTime(left.createdAt) - dateTime(right.createdAt))
    .slice(0, 50);

  const preferredActiveId = localWon ? local.activePlanId : remote.activePlanId;
  return {
    version: 1,
    activePlanId: mergedPlans.some((plan) => plan.id === preferredActiveId)
      ? preferredActiveId
      : (mergedPlans[0]?.id ?? ''),
    plans: mergedPlans
  };
}

export function reconcileInitialPlannerCollections(
  localAtConnect: CaratPlanCollection,
  currentLocal: CaratPlanCollection,
  remote: CaratPlanCollection,
  remoteUpdatedAt: string | null,
  knownAccount: boolean
): CaratPlanCollection {
  if (knownAccount) {
    return plannerCollectionHash(localAtConnect) === plannerCollectionHash(remote)
      ? currentLocal
      : remote;
  }

  const meaningfulAnonymousData = hasMeaningfulPlannerData(localAtConnect);
  if (!meaningfulAnonymousData) return remote;
  return mergePlannerCollections(currentLocal, remote, remoteUpdatedAt, true);
}

export function plannerCollectionHash(collection: CaratPlanCollection): string {
  const canonical = canonicalJson(semanticState(collection));
  let first = 0xdeadbeef;
  let second = 0x41c6ce57;
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    first = Math.imul(first ^ code, 2_654_435_761);
    second = Math.imul(second ^ code, 1_597_334_677);
  }

  first =
    Math.imul(first ^ (first >>> 16), 2_246_822_507) ^
    Math.imul(second ^ (second >>> 13), 3_266_489_909);
  second =
    Math.imul(second ^ (second >>> 16), 2_246_822_507) ^
    Math.imul(first ^ (first >>> 13), 3_266_489_909);
  return `v1-${canonical.length.toString(36)}-${(second >>> 0).toString(16).padStart(8, '0')}${(first >>> 0).toString(16).padStart(8, '0')}`;
}

function semanticState(collection: CaratPlanCollection): unknown {
  return {
    ...collection,
    plans: collection.plans.map((plan) => ({
      ...plan,
      enabledIncomeRuleIds: sortedStrings(plan.enabledIncomeRuleIds),
      enabledRewardIds: sortedStrings(plan.enabledRewardIds),
      disabledRewardIds: sortedStrings(plan.disabledRewardIds ?? []),
      enabledRewardEventIds: [],
      disabledEventIds: sortedStrings(plan.disabledEventIds ?? []),
      resourceDefaultsApplied: undefined,
      variableRewardSelections: Object.fromEntries(
        Object.entries(plan.variableRewardSelections ?? {}).map(([eventId, selection]) => [
          eventId,
          { ...selection, label: undefined }
        ])
      ),
      customIncome: plan.customIncome.map(({ id: _id, ...income }) => income),
      targets: plan.targets.map(
        ({
          id: _id,
          title: _title,
          imagePath: _imagePath,
          bannerStart: _bannerStart,
          bannerEnd: _bannerEnd,
          desiredCopies: _desiredCopies,
          pickupId: _pickupId,
          ...target
        }) => ({ ...target, gachaIds: sortedNumbers(target.gachaIds ?? []) })
      )
    }))
  };
}

function hasMeaningfulPlannerData(collection: CaratPlanCollection): boolean {
  if (collection.plans.length > 1) return true;
  const plan = collection.plans[0];
  if (!plan) return false;
  if (plan.name !== 'My plan' || plan.targets.length > 0 || plan.customIncome.length > 0)
    return true;
  if (Object.values(plan.balances).some((value) => Number(value) > 0)) return true;
  if ((plan.disabledRewardIds?.length ?? 0) > 0 || (plan.disabledEventIds?.length ?? 0) > 0)
    return true;
  if (
    Object.keys(plan.variableRewardSelections ?? {}).length > 0 ||
    plan.enabledIncomeRuleIds.length > 0
  )
    return true;
  const expected: Record<string, string> = {
    speculative_income: 'include',
    ...CONDITIONAL_REWARD_DEFAULT_SELECTIONS
  };

  return (
    Object.entries(plan.scenarioSelections).some(([key, value]) => expected[key] !== value) ||
    Object.keys(expected).some((key) => plan.scenarioSelections[key] !== expected[key])
  );
}

function sortedStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sortedNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function dateTime(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => key !== 'updatedAt' && record[key] !== undefined)
    .sort();

  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

export function samePlannerCollection(
  left: CaratPlanCollection,
  right: CaratPlanCollection
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export type PlannerPlanIdentity = Pick<CaratPlan, 'id' | 'updatedAt'>;
