import { Injectable } from '@angular/core';
import { CaratPlannerTimelineEvent } from '../models/carat-planner.model';
import { CaratPlannerPersistenceService } from './carat-planner-persistence.service';
import { CaratPlannerResourceService } from './carat-planner-resource.service';
import { isCaratPlannerAvailable } from '../utils/carat-planner-availability';

@Injectable({ providedIn: 'root' })
export class CaratPlannerTimelineService {
  private readonly rewardOperation = new Map<string, number>();
  private readonly pendingOperations = new Map<string, { event: CaratPlannerTimelineEvent; active: boolean }>();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private flushFrame: number | undefined;

  constructor(
    private readonly persistence: CaratPlannerPersistenceService,
    private readonly resources: CaratPlannerResourceService,
  ) {}

  setEventActive(event: CaratPlannerTimelineEvent, active: boolean): void {
    if (!isCaratPlannerAvailable()) return;

    // Timeline cards update optimistically. Defer persistence and resource work
    // to the next task so the pressed state can paint without waiting for a
    // planner collection clone, localStorage write, or protected-data load.
    this.pendingOperations.set(event.id, { event, active });
    if (this.flushFrame !== undefined || this.flushTimer !== undefined) return;
    if (typeof requestAnimationFrame === 'function') {
      this.flushFrame = requestAnimationFrame(() => {
        this.flushFrame = undefined;
        this.flushTimer = setTimeout(() => this.flushPendingOperations(), 0);
      });
      return;
    }
    this.flushTimer = setTimeout(() => this.flushPendingOperations(), 16);
  }

  private flushPendingOperations(): void {
    this.flushTimer = undefined;
    const operations = [...this.pendingOperations.values()];
    this.pendingOperations.clear();
    operations.forEach(operation => this.commitEventActive(operation.event, operation.active));
  }

  private commitEventActive(event: CaratPlannerTimelineEvent, active: boolean): void {
    const planId = this.persistence.activePlan.id;
    this.persistence.setEventActive(event, active);
    if (!event.plannerRewardAvailable || !active) return;

    const operationKey = `${planId}:${event.id}`;
    const operation = (this.rewardOperation.get(operationKey) ?? 0) + 1;
    this.rewardOperation.set(operationKey, operation);
    void this.resources.loadInitial().then(data => {
      if (this.rewardOperation.get(operationKey) !== operation) return;
      const collection = this.persistence.snapshot;
      if (collection.activePlanId !== planId || (collection.plans.find(plan => plan.id === planId)?.disabledEventIds ?? []).includes(event.id)) {
        return;
      }
      this.persistence.setEventActive(
        event,
        true,
        data.rewards.rewards,
        data.rewards.competitive_variants ?? [],
      );
    }).catch(() => undefined);
  }
}
