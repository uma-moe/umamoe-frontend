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

  it('inherits CM and LoH income assumptions and preserves an explicit result selection', () => {
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
    component.plan.scenarioSelections = {
      ...component.plan.scenarioSelections,
      champions_meeting_result: 'champion',
      league_of_heroes_rank: 'gold_4',
    };
    component.events = [
      {
        id: 'champions-meeting-811',
        title: 'Champions Meeting: Test Cup',
        type: 'champions_meeting',
        globalReleaseDate: '2031-01-01',
      },
      {
        id: 'league-of-heroes-100',
        title: 'League of Heroes',
        type: 'league_of_heroes',
        globalReleaseDate: '2031-02-01',
      },
    ];
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: {
        rewards: [],
        competitive_variants: [
          {
            id: 'cm-resource-outcome',
            competition: 'champions_meeting',
            event_id: 'champions-meeting-811',
            master_event_id: 811,
            label: 'Final result',
            source_items: [],
          },
          {
            id: 'loh-resource-outcome',
            competition: 'league_of_heroes',
            event_id: 'league-of-heroes-100',
            master_event_id: 100,
            label: 'Final rank',
            source_items: [],
          },
        ],
      },
    };

    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    const championsMeeting = component.displayedRewardGroups.find(group =>
      group.eventId === 'champions-meeting-811');
    const leagueOfHeroes = component.displayedRewardGroups.find(group =>
      group.eventId === 'league-of-heroes-100');
    expect(championsMeeting).toBeDefined();
    expect(leagueOfHeroes).toBeDefined();
    expect(championsMeeting?.imagePath)
      .toBe('assets/timeline-images/en/events/champions-meeting/811.webp');
    expect(component.selectedVariableRewardOption(championsMeeting!).label).toBe('Champion');
    expect(component.selectedVariableRewardOption(championsMeeting!).amountLabel)
      .toBe('3,300 Carats · 5 Uma tix · 5 support tix');
    expect(component.selectedVariableRewardOption(leagueOfHeroes!).label).toBe('Gold 4');
    expect(component.selectedVariableRewardOption(leagueOfHeroes!).amountLabel)
      .toBe('1,300 Carats · 2 Uma tix · 2 support tix');
    expect(championsMeeting?.benefits.map(benefit => benefit.kind))
      .toEqual(jasmine.arrayContaining(['carats', 'uma_ticket', 'support_ticket']));

    const explicit = championsMeeting!.variableOptions.find(option => option.label === 'Group B 2nd')!;
    component.setVariableRewardSelection(championsMeeting!, explicit.id);
    const stored = component.plan.variableRewardSelections?.['champions-meeting-811'];
    expect(stored?.optionId).toBe(explicit.id);

    component.toggleRewardGroupSelection(championsMeeting!);
    expect(component.plan.disabledEventIds).toContain('champions-meeting-811');
    expect(component.plan.variableRewardSelections?.['champions-meeting-811']).toEqual(stored);

    component.toggleRewardGroupSelection(championsMeeting!);
    expect(component.plan.disabledEventIds).not.toContain('champions-meeting-811');
    expect(component.selectedVariableRewardOption(championsMeeting!).label).toBe('Group B 2nd');
    expect(component.plan.variableRewardSelections?.['champions-meeting-811']).toEqual(stored);
  });});
