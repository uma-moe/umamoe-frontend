import { Injectable } from '@angular/core';
import { CaratPlannerTimelineEvent } from '../models/carat-planner.model';
import { CaratPlannerPersistenceService } from './carat-planner-persistence.service';
import { CaratPlannerResourceService } from './carat-planner-resource.service';
import { isCaratPlannerAvailable } from '../utils/carat-planner-availability';

@Injectable({ providedIn: 'root' })
export class CaratPlannerTimelineService {
  private readonly rewardOperation = new Map<string, number>();

  constructor(
    private readonly persistence: CaratPlannerPersistenceService,
    private readonly resources: CaratPlannerResourceService,
  ) {}

  setEventActive(event: CaratPlannerTimelineEvent, active: boolean): void {
    if (!isCaratPlannerAvailable()) return;

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
      this.persistence.setEventActive(event, true, data.rewards.rewards);
    }).catch(() => undefined);
  }
}
