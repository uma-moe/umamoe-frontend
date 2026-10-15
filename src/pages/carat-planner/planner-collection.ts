import {
  activePlan,
  clonePlanCollection,
  type CaratPlan,
  type CaratPlanCollection
} from '@/lib/carat-planner/carat-planner';

export function withCurrentPlan(
  collection: CaratPlanCollection,
  plan: CaratPlan
): CaratPlanCollection {
  return {
    ...collection,
    plans: collection.plans.map((item) => (item.id === plan.id ? plan : item))
  };
}

export function duplicateActivePlan(collection: CaratPlanCollection): CaratPlanCollection {
  const next = clonePlanCollection(collection);
  const source = activePlan(next);
  const copy = JSON.parse(JSON.stringify(source)) as CaratPlan;
  copy.id = `plan-${crypto.randomUUID()}`;
  copy.name = `${source.name} copy`.slice(0, 80);
  copy.createdAt = copy.updatedAt = new Date().toISOString();
  copy.customIncome = copy.customIncome.map((item) => ({
    ...item,
    id: `income-${crypto.randomUUID()}`
  }));
  copy.targets = copy.targets.map((target) => ({
    ...target,
    id: `target-${crypto.randomUUID()}`
  }));
  next.plans.push(copy);
  next.activePlanId = copy.id;
  return next;
}

export function plannerShareUrl(
  origin: string,
  link: { share: string } | { payload: string }
): URL {
  const url = new URL('/timeline', origin);
  url.searchParams.set('tab', 'carat-planner');
  if ('share' in link) url.searchParams.set('share', link.share);
  else url.hash = `p=${link.payload}`;
  return url;
}

export function isPlannerShareId(shareId: string): boolean {
  return /^(?:[a-fA-F0-9]{16}|[a-zA-Z0-9]{8,12})$/.test(shareId);
}
