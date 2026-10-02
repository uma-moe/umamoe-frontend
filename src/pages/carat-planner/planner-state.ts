import { get, writable } from 'svelte/store';
import { loadPlanCollection, savePlanCollection, type CaratPlanCollection } from '@/lib/timeline/carat-planner';
import { plannerCollectionHash } from '@/lib/timeline/planner-cloud-state';
import { canonicalIncomeRuleId } from '@/lib/timeline/planner-income-assumptions';
import { authUser } from '@/services/auth/auth-state';
import { PlannerCloudSync } from './planner-cloud-sync';

// The lazy-loaded planner owns its session, not either of its mounted views.
// Keep queued saves and recoverable local edits when navigating away and back.
export const plannerCollection = writable(loadPlanCollection());
export const plannerSaveError = writable('');
export const plannerCloudSync = new PlannerCloudSync(
  () => get(plannerCollection),
  collection => savePlannerCollection(collection, false),
);

export function savePlannerCollection(collection: CaratPlanCollection, notifyCloud = true): void {
  // Account restores must migrate IDs in the visible state as well as on disk.
  collection = { ...collection, plans: collection.plans.map(plan => ({
    ...plan, enabledIncomeRuleIds: [...new Set(plan.enabledIncomeRuleIds.map(canonicalIncomeRuleId))],
  })) };
  // Resource-derived labels/defaults are not edits and must not clear a conflict.
  const changed = notifyCloud && plannerCollectionHash(collection) !== plannerCollectionHash(get(plannerCollection));
  try {
    savePlanCollection(collection);
    plannerSaveError.set('');
  } catch {
    plannerSaveError.set('Your changes are still open, but this browser could not save them. Retry saving or export your plan before leaving this page.');
  }
  // A subscriber can synchronously save a migration. Persist before notifying it.
  plannerCollection.set(collection);
  if (changed) plannerCloudSync.notifyLocalChange(get(plannerCollection));
}

let unsubscribeAuth: (() => void) | undefined;
export function startPlannerCloudSync(): void {
  if (unsubscribeAuth) return;
  let connectedUserId: string | null | undefined;
  unsubscribeAuth = authUser.subscribe(user => {
    const userId = user?.id ?? null;
    if (userId === connectedUserId) return;
    connectedUserId = userId;
    plannerCloudSync.connect(userId);
  });
}

if (import.meta.hot) import.meta.hot.dispose(() => {
  unsubscribeAuth?.();
  plannerCloudSync.dispose();
});
