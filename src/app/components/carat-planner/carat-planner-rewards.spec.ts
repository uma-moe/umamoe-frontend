import { ChangeDetectorRef } from '@angular/core';
import { CaratPlan } from '../../models/carat-planner.model';
import { CaratPlannerCalculationService } from '../../services/carat-planner-calculation.service';
import { CaratPlannerPersistenceService } from '../../services/carat-planner-persistence.service';
import { CaratPullProbabilityService } from '../../services/carat-pull-probability.service';
import { TimelineAvatarService } from '../../services/timeline-avatar.service';
import { CaratPlannerComponent } from './carat-planner.component';

describe('CaratPlannerComponent reward coverage', () => {
  it('shows mission item totals and locally bundled competitive event artwork', () => {
    localStorage.removeItem(CaratPlannerPersistenceService.STORAGE_KEY);
    const realPersistence = new CaratPlannerPersistenceService('browser' as never);
    const persistence = {
      savePlan: (plan: CaratPlan) => realPersistence.savePlan(plan),
    };
    const component = new CaratPlannerComponent(
      new CaratPlannerCalculationService(),
      new CaratPullProbabilityService(),
      persistence as never,
      {} as never,
      new TimelineAvatarService(),
      { markForCheck: () => undefined } as unknown as ChangeDetectorRef,
    );
    component.plan = realPersistence.activePlan;
    component.plan.projectionStartDate = '2030-01-01';
    component.events = [
      {
        id: 'team-event',
        title: 'Team event missions',
        type: 'strongest_team',
        globalReleaseDate: '2031-01-01',
        imagePath: '/assets/team-event.webp',
      },
      {
        id: 'global-legend-race-1021',
        title: 'Legend Race',
        type: 'legend_race',
        globalReleaseDate: '2031-02-01',
      },
    ];
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: {
        rewards: [{
          id: 'team-missions',
          label: 'Event missions',
          event_id: 'team-event',
          currency: 'free_jewels',
          amount: null,
          available_at: '2031-01-01',
          source_items: [
            { item_category: 90, item_id: 43, amount: 100, mission_count: 2 },
            { item_category: 40, item_id: 41, amount: 1 },
          ],
        }],
        competitive_variants: [{
          id: 'legend-clear',
          competition: 'legend_race',
          event_id: 'legend-race-1021',
          master_event_id: 1021,
          label: 'First clear',
          source_items: [{ item_category: 90, item_id: 43, amount: 150 }],
        }],
      },
    };

    const sync = (component as unknown as { syncAutomaticRewardSelection(): boolean })
      .syncAutomaticRewardSelection.bind(component);
    expect(sync()).toBeTrue();
    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    const missionGroup = component.displayedRewardGroups.find(group => group.eventId === 'team-event');
    const legendGroup = component.displayedRewardGroups.find(group => group.eventId === 'legend-race-1021');
    expect(missionGroup?.imagePath).toBe('/assets/team-event.webp');
    expect(missionGroup?.benefits.map(benefit => [benefit.kind, benefit.amount])).toEqual([
      ['uma_ticket', 1],
      ['carats', 100],
    ]);
    expect(legendGroup?.imagePath).toBe('assets/timeline-images/jp/events/legend-race/1021.webp');
    expect(legendGroup?.benefits.map(benefit => [benefit.kind, benefit.amount])).toEqual([
      ['competitive_outcomes', null],
    ]);
    expect(legendGroup?.variableOptions[0]).toEqual(jasmine.objectContaining({
      id: 'legend-clear',
      amountLabel: '150 Carats',
    }));
    expect(component.plan.enabledRewardIds).toEqual(['team-missions']);
  });
});
