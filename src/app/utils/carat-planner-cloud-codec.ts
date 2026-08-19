import { CaratPlan, CaratPlanCollection } from '../models/carat-planner.model';
import {
  compactPlannerPlanData,
  expandCompactPlannerPlanData,
} from './carat-planner-share-codec';

const CLOUD_FORMAT_VERSION = 2;

type CompactCloudPlan = [
  id: string,
  createdAt: string,
  updatedAt: string,
  customIncomeIds: string[],
  targetIds: string[],
  plan: unknown,
];

interface CompactCloudCollection {
  version: 2;
  activePlanId: string;
  plans: CompactCloudPlan[];
}

interface CompactCloudShare {
  id: string;
  name: string;
  v: 2;
  p: unknown;
}

/** Encodes only user choices. Resource-derived dates and expanded defaults stay out of the DB. */
export function compactPlannerCollectionForCloud(collection: CaratPlanCollection): unknown {
  return {
    version: CLOUD_FORMAT_VERSION,
    activePlanId: collection.activePlanId,
    plans: collection.plans.map(plan => [
      plan.id,
      plan.createdAt,
      plan.updatedAt,
      plan.customIncome.map(item => item.id),
      plan.targets.map(target => target.id),
      compactPlannerPlanData(plan),
    ]),
  } satisfies CompactCloudCollection;
}

/** Reads both compact v2 rows and existing full v1 rows for a no-downtime migration. */
export function expandPlannerCollectionFromCloud(value: unknown): CaratPlanCollection | null {
  if (isLegacyCollection(value)) return value;
  if (!isCompactCollection(value)) return null;

  const plans = value.plans
    .map(expandCloudPlan)
    .filter((plan): plan is CaratPlan => plan !== null);
  if (plans.length === 0) return null;
  return {
    version: 1,
    activePlanId: plans.some(plan => plan.id === value.activePlanId)
      ? value.activePlanId
      : plans[0].id,
    plans,
  };
}

export function isCompactPlannerCollectionForCloud(value: unknown): boolean {
  return isCompactCollection(value);
}

/** Keeps the short-share DB row compact while retaining id/name for backend validation. */
export function compactPlannerPlanForCloudShare(plan: CaratPlan): unknown {
  return {
    id: plan.id,
    name: plan.name,
    v: CLOUD_FORMAT_VERSION,
    p: compactPlannerPlanData(plan),
  } satisfies CompactCloudShare;
}

export function expandPlannerPlanFromCloudShare(value: unknown): CaratPlan | null {
  if (isLegacyPlan(value)) return value;
  if (!isCompactShare(value)) return null;
  const plan = expandCompactPlannerPlanData(value.p);
  if (!plan) return null;
  return { ...plan, id: value.id, name: value.name };
}

function expandCloudPlan(value: CompactCloudPlan): CaratPlan | null {
  const plan = expandCompactPlannerPlanData(value[5]);
  if (!plan) return null;
  return {
    ...plan,
    id: value[0],
    createdAt: value[1],
    updatedAt: value[2],
    customIncome: plan.customIncome.map((item, index) => ({
      ...item,
      id: value[3][index] ?? item.id,
    })),
    targets: plan.targets.map((target, index) => ({
      ...target,
      id: value[4][index] ?? target.id,
    })),
  };
}

function isLegacyCollection(value: unknown): value is CaratPlanCollection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<CaratPlanCollection>;
  return record.version === 1
    && typeof record.activePlanId === 'string'
    && Array.isArray(record.plans)
    && record.plans.every(isLegacyPlan);
}

function isCompactCollection(value: unknown): value is CompactCloudCollection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<CompactCloudCollection>;
  return record.version === CLOUD_FORMAT_VERSION
    && typeof record.activePlanId === 'string'
    && Array.isArray(record.plans)
    && record.plans.every(item => Array.isArray(item)
      && item.length === 6
      && typeof item[0] === 'string'
      && typeof item[1] === 'string'
      && typeof item[2] === 'string'
      && Array.isArray(item[3])
      && Array.isArray(item[4]));
}

function isCompactShare(value: unknown): value is CompactCloudShare {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<CompactCloudShare>;
  return record.v === CLOUD_FORMAT_VERSION
    && typeof record.id === 'string'
    && typeof record.name === 'string'
    && record.p !== undefined;
}

function isLegacyPlan(value: unknown): value is CaratPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<CaratPlan>;
  return typeof record.id === 'string'
    && typeof record.name === 'string'
    && Array.isArray(record.targets)
    && Array.isArray(record.customIncome);
}
