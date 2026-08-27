import { ChangeDetectorRef } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { CaratPlan, CaratPlanCollection, CaratPlannerDataBundle, PlannerTarget } from '../../models/carat-planner.model';
import { CaratPlannerCalculationService } from '../../services/carat-planner-calculation.service';
import { CaratPlannerPersistenceService } from '../../services/carat-planner-persistence.service';
import { CaratPullProbabilityService } from '../../services/carat-pull-probability.service';
import { TimelineAvatarService } from '../../services/timeline-avatar.service';
import { CaratPlannerComponent } from './carat-planner.component';

describe('CaratPlannerComponent banner ordering', () => {
  const createComponent = () => {
    localStorage.removeItem(CaratPlannerPersistenceService.STORAGE_KEY);
    const realPersistence = new CaratPlannerPersistenceService('browser' as never);
    let component: CaratPlannerComponent;
    const persistence = {
      savePlan: (plan: CaratPlan) => realPersistence.savePlan(plan),
      setEventActive: (...args: Parameters<CaratPlannerPersistenceService['setEventActive']>) => {
        const plan = realPersistence.setEventActive(...args);
        component.plan = plan;
        return plan;
      },
    };
    component = new CaratPlannerComponent(
      new CaratPlannerCalculationService(),
      new CaratPullProbabilityService(),
      persistence as never,
      { loadGachasForEvents: () => new Promise<never>(() => undefined) } as never,
      new TimelineAvatarService(),
      { markForCheck: () => undefined } as unknown as ChangeDetectorRef,
    );
    component.plan = realPersistence.activePlan;
    component.plan.projectionStartDate = '2030-01-01';
    return component;
  };

  it('shows future banners ascending before past banners newest first', () => {
    const component = createComponent();
    component.events = [
      { id: 'past-old', title: 'Past old', type: 'character_banner', globalReleaseDate: '2028-01-01' },
      { id: 'future-late', title: 'Future late', type: 'support_banner', globalReleaseDate: '2031-02-01' },
      { id: 'past-new', title: 'Past new', type: 'character_banner', globalReleaseDate: '2029-01-01' },
      { id: 'future-soon', title: 'Future soon', type: 'support_banner', globalReleaseDate: '2031-01-01' },
    ];

    expect(component.filteredEvents.map(event => event.id)).toEqual([
      'future-soon', 'future-late', 'past-new', 'past-old',
    ]);
  });

  it('renders large banner catalogues in responsive batches without limiting search', () => {
    const component = createComponent();
    component.events = Array.from({ length: 95 }, (_, index) => ({
      id: `banner-${index}`,
      title: `Banner ${index}`,
      type: index % 2 === 0 ? 'character_banner' : 'support_banner',
      globalReleaseDate: `2031-01-${String((index % 28) + 1).padStart(2, '0')}`,
    }));

    expect(component.filteredEvents.length).toBe(95);
    expect(component.visiblePickerEvents.length).toBe(40);
    expect(component.remainingPickerEventCount).toBe(55);

    component.showMorePickerEvents();
    expect(component.visiblePickerEvents.length).toBe(80);

    component.onEventViewportScroll({
      currentTarget: { scrollHeight: 1_000, scrollTop: 760, clientHeight: 100 },
    } as unknown as Event);
    expect(component.visiblePickerEvents.length).toBe(95);

    component.searchEvents('Banner 94');
    expect(component.filteredEvents.map(event => event.id)).toEqual(['banner-94']);
    expect(component.visiblePickerEvents.length).toBe(1);
  });

  it('combines full and crafted Uncap Crystals while retaining next-crystal progress', () => {
    const component = createComponent();

    expect(component.craftedCrystalCount(undefined)).toBe(0);
    expect(component.craftedCrystalCount(19)).toBe(0);
    expect(component.craftedCrystalCount(20)).toBe(1);
    expect(component.craftedCrystalCount(41)).toBe(2);
    expect(component.craftedCrystalCount(19, 2)).toBe(2);
    expect(component.craftedCrystalCount(21, 2)).toBe(3);
    expect(component.crystalShardRemainder(19)).toBe(19);
    expect(component.crystalShardRemainder(21)).toBe(1);
  });

  it('includes quantified rewards by default and remembers explicit exclusions', () => {
    const component = createComponent();
    const first = { id: 'first', label: 'First reward', currency: 'free_jewels' as const, amount: 300, available_at: '2030-01-02' };
    const second = { id: 'second', label: 'Second reward', currency: 'free_jewels' as const, amount: 500, available_at: '2030-01-03' };
    component.data = { core: {}, income: { rules: [] }, rewards: { rewards: [first, second] } };
    const sync = (component as unknown as { syncAutomaticRewardSelection(): boolean }).syncAutomaticRewardSelection.bind(component);

    expect(sync()).toBeFalse();
    expect(component.plan.enabledRewardIds).toEqual([]);
    expect(component.isRewardActive(first)).toBeTrue();

    component.toggleReward(first, false);
    expect(component.plan.disabledRewardIds).toEqual(['first']);
    expect(sync()).toBeFalse();
    expect(component.plan.enabledRewardIds).toEqual([]);
    expect(component.isRewardActive(first)).toBeFalse();
  });

  it('orders pull targets from the plan boundary and excludes historical pulls from the total', () => {
    const component = createComponent();
    const target = (id: string, pullDate: string, plannedPulls: number): PlannerTarget => ({
      id,
      eventId: id,
      title: id,
      bannerKind: 'character',
      bannerStart: pullDate,
      bannerEnd: pullDate,
      pullTiming: 'end',
      plannedPulls,
      desiredCopies: 1,
      useTickets: true,
      allowPaidJewels: false,
    });
    const pastOld = target('past-old', '2028-01-01', 10);
    const futureLate = target('future-late', '2031-02-01', 20);
    const pastNew = target('past-new', '2029-01-01', 30);
    const boundary = target('boundary', '2030-01-01', 40);
    const futureSoon = target('future-soon', '2031-01-01', 50);
    component.plan.targets = [pastOld, futureLate, pastNew, boundary, futureSoon];

    expect(component.activeTargets.map(item => item.id)).toEqual([
      'boundary', 'future-soon', 'future-late', 'past-new', 'past-old',
    ]);
    expect(component.plannedPullTotal).toBe(110);
    expect(component.plan.targets).toEqual([pastOld, futureLate, pastNew, boundary, futureSoon]);

    component.plan.projectionStartDate = '2027-01-01';
    expect(component.activeTargets.map(item => item.id)).toEqual([
      'past-old', 'past-new', 'boundary', 'future-soon', 'future-late',
    ]);
    expect(component.plannedPullTotal).toBe(150);
  });

  it('applies pull timing and paid Carat settings to every active banner', () => {
    const component = createComponent();
    const target = (id: string, pullTiming: 'start' | 'end', allowPaidJewels: boolean): PlannerTarget => ({
      id,
      eventId: id,
      title: id,
      bannerKind: 'character',
      bannerStart: '2031-01-01',
      bannerEnd: '2031-01-10',
      pullTiming,
      customPullDate: '2031-01-05',
      plannedPulls: 200,
      desiredCopies: 1,
      useTickets: true,
      allowPaidJewels,
    });
    component.plan.targets = [target('first', 'start', false), target('second', 'end', true)];
    const save = spyOn(component, 'saveAfterInteraction');

    expect(component.globalPullTimingValue).toBe('');
    expect(component.globalPaidCaratsValue).toBe('');

    component.applyGlobalPullTiming('end');
    component.applyGlobalPaidCarats('free-only');

    expect(component.plan.targets.every(item => item.pullTiming === 'end')).toBeTrue();
    expect(component.plan.targets.every(item => item.customPullDate === undefined)).toBeTrue();
    expect(component.plan.targets.every(item => !item.allowPaidJewels)).toBeTrue();
    expect(component.globalPullTimingValue).toBe('end');
    expect(component.globalPaidCaratsValue).toBe('free-only');
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('shows only the nearest anniversary in each gap between planned pulls', () => {
    const component = createComponent();
    const target = (id: string, pullDate: string): PlannerTarget => ({
      id,
      eventId: id,
      title: id,
      bannerKind: 'character',
      bannerStart: pullDate,
      bannerEnd: pullDate,
      pullTiming: 'end',
      plannedPulls: 200,
      desiredCopies: 1,
      useTickets: true,
      allowPaidJewels: false,
    });
    component.events = [
      { id: 'anniv-old', title: '1st Anniversary Campaign Vol. 1', type: 'campaign', globalReleaseDate: '2029-02-01' },
      { id: 'anniv-late', title: '2nd Anniversary Campaign Vol. 2', type: 'campaign', globalReleaseDate: '2031-02-10' },
      { id: 'anniv-first', title: '2nd Anniversary Campaign Vol. 1', type: 'campaign', globalReleaseDate: '2031-02-01' },
      { id: 'anniv-nearest', title: '2.5-Year Anniversary Campaign', type: 'campaign', globalReleaseDate: '2031-02-20' },
      { id: 'ordinary', title: 'Ordinary campaign', type: 'campaign', globalReleaseDate: '2031-02-05' },
    ];
    component.plan.targets = [target('before', '2031-01-15'), target('after', '2031-03-01')];

    expect(component.pullPlanItems.map(item => item.id)).toEqual([
      'target:before',
      'anniversary:2.5',
      'target:after',
    ]);
    expect(component.pullPlanItems[1]).toEqual(jasmine.objectContaining({
      date: '2031-02-20',
      label: '2.5-Year Anniversary',
    }));
  });

  it('summarizes shortfalls only for targets inside the active projection', () => {
    const component = createComponent();
    const target = (id: string, pullDate: string): PlannerTarget => ({
      id,
      eventId: id,
      title: id,
      bannerKind: 'character',
      bannerStart: pullDate,
      bannerEnd: pullDate,
      pullTiming: 'end',
      plannedPulls: 200,
      desiredCopies: 1,
      useTickets: true,
      allowPaidJewels: false,
    });
    component.plan.targets = [target('past', '2029-01-01'), target('first', '2030-02-01'), target('second', '2030-03-01')];
    component.projectionByTarget.set('past', { shortfallJewels: 900 } as never);
    component.projectionByTarget.set('first', { shortfallJewels: 300 } as never);
    component.projectionByTarget.set('second', { shortfallJewels: 600 } as never);

    expect(component.totalShortfallCarats).toBe(900);
  });

  it('adjusts planned pulls in small and large steps within planner limits', () => {
    const component = createComponent();
    const target = {
      id: 'stepper', eventId: 'stepper', title: 'Stepper', bannerKind: 'support',
      bannerStart: '2031-01-01', bannerEnd: '2031-01-10', pullTiming: 'end',
      plannedPulls: 200, desiredCopies: 1, useTickets: true, allowPaidJewels: false,
    } as PlannerTarget;
    const save = spyOn(component, 'save');

    component.adjustTargetPulls(target, 100);
    component.adjustTargetPulls(target, 10);
    expect(target.plannedPulls).toBe(310);

    target.plannedPulls = 5;
    component.adjustTargetPulls(target, -10);
    expect(target.plannedPulls).toBe(0);

    target.plannedPulls = 4990;
    component.adjustTargetPulls(target, 100);
    expect(target.plannedPulls).toBe(5000);
    expect(save).toHaveBeenCalledTimes(4);
  });

  it('ranks exact and title-prefix matches before other textual matches', () => {
    const component = createComponent();
    component.events = [
      { id: 'contains', title: 'Alpha Beta', type: 'character_banner', globalReleaseDate: '2031-01-01' },
      { id: 'prefix', title: 'Beta Special', type: 'support_banner', globalReleaseDate: '2031-03-01' },
      { id: 'exact', title: 'Beta', type: 'character_banner', globalReleaseDate: '2031-05-01' },
    ];

    component.searchEvents('beta');

    expect(component.filteredEvents.map(event => event.id)).toEqual(['exact', 'prefix', 'contains']);
  });

  it('supports arrow and Enter navigation in the banner picker', () => {
    const component = createComponent();
    component.events = [
      { id: 'first', title: 'First banner', type: 'character_banner', globalReleaseDate: '2031-01-01' },
      { id: 'second', title: 'Second banner', type: 'support_banner', globalReleaseDate: '2031-02-01' },
    ];
    component.searchEvents('');

    component.onEventPickerKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(component.eventPickerActiveIndex).toBe(1);

    component.onEventPickerKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(component.plan.targets.map(target => target.eventId)).toEqual(['second']);
    expect(component.showEventPicker).toBeFalse();
  });

  it('finds secondary pickups and excludes unsupported paid banners', () => {
    const component = createComponent();
    component.events = [
      {
        id: 'support-banner',
        title: 'Kitasan Black + 4 more',
        type: 'support_card_banner',
        globalReleaseDate: '2031-01-01',
        relatedSupportCards: ['Kitasan Black', 'Satono Diamond'],
      },
      {
        id: 'paid-banner',
        title: 'Guaranteed paid scout',
        type: 'paid_banner',
        globalReleaseDate: '2031-02-01',
        gachaId: 50001,
      },
    ];

    component.searchEvents('Satono Diamond');
    expect(component.filteredEvents.map(event => event.id)).toEqual(['support-banner']);

    component.searchEvents('');
    expect(component.filteredEvents.map(event => event.id)).not.toContain('paid-banner');
    component.addEvent({
      id: 'paid-banner',
      title: 'Guaranteed paid scout',
      type: 'paid_banner',
      globalReleaseDate: '2031-02-01',
      gachaId: 50001,
    });
    expect(component.plan.targets).toEqual([]);
  });

  it('searches support titles and filters ordinary, support, and rerun banners', () => {
    const component = createComponent();
    component.events = [
      { id: 'uma', title: 'Regular trainee scout', type: 'character_banner', globalReleaseDate: '2031-01-01' },
      {
        id: 'tachyon-support',
        title: 'Featured support scout',
        type: 'support_card_banner',
        globalReleaseDate: '2031-02-01',
        relatedSupportCardNames: ['Agnes Tachyon Lab Coat'],
      },
      {
        id: 'rerun-support',
        title: 'Returning supports',
        type: 'support_card_banner',
        gachaTypeName: 'Rerun Scout',
        globalReleaseDate: '2031-03-01',
      },
    ];

    component.searchEvents('Tachyon');
    expect(component.filteredEvents.map(event => event.id)).toEqual(['tachyon-support']);

    component.searchEvents('rerun');
    expect(component.filteredEvents.map(event => event.id)).toEqual(['rerun-support']);

    component.searchEvents('support');
    expect(component.filteredEvents.map(event => event.id)).toEqual(['tachyon-support', 'rerun-support']);
  });

  it('uses the banner start when its end date is missing or invalid', () => {
    const component = createComponent();

    component.addEvent({
      id: 'missing-end',
      title: 'Missing end',
      type: 'character_banner',
      globalReleaseDate: '2031-04-12',
    });
    component.addEvent({
      id: 'invalid-end',
      title: 'Invalid end',
      type: 'support_banner',
      globalReleaseDate: '2031-05-20',
      estimatedEndDate: 'not-a-date',
    });

    expect(component.plan.targets.map(target => [target.bannerStart, target.bannerEnd])).toEqual([
      ['2031-04-12', '2031-04-12'],
      ['2031-05-20', '2031-05-20'],
    ]);
  });

  it('replaces a saved banner schedule with the current timeline resource dates', () => {
    const component = createComponent();
    component.plan.targets = [{
      id: 'target',
      eventId: 'updated-banner',
      title: 'Updated banner',
      bannerKind: 'support',
      bannerStart: '2031-09-01',
      bannerEnd: '2031-09-06',
      pullTiming: 'end',
      plannedPulls: 200,
      desiredCopies: 1,
      useTickets: true,
      allowPaidJewels: false,
    }];

    component.events = [{
      id: 'updated-banner',
      title: 'Updated banner',
      type: 'support_banner',
      globalReleaseDate: '2031-08-12',
      estimatedEndDate: '2031-08-19',
    }];

    expect(component.plan.targets[0].bannerStart).toBe('2031-08-12');
    expect(component.plan.targets[0].bannerEnd).toBe('2031-08-19');
    expect(component.targetBannerStart(component.plan.targets[0])).toBe('2031-08-12');
    expect(component.targetBannerEnd(component.plan.targets[0])).toBe('2031-08-19');
  });

  it('adds every positive reward for a reward-bearing timeline event without creating a pull target', () => {
    const component = createComponent();
    component.plan.enabledRewardIds = [];
    component.plan.enabledRewardEventIds = [];
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: [
        { id: 'jewels', label: 'Jewels', event_id: 'campaign-1', currency: 'free_jewels', amount: 150, available_at: '2031-01-01' },
        { id: 'ticket', label: 'Ticket', event_id: 'campaign-1', currency: 'uma_ticket', amount: 1, available_at: '2031-01-01' },
        { id: 'other', label: 'Other', event_id: 'campaign-2', currency: 'free_jewels', amount: 500, available_at: '2031-01-01' },
      ] },
    };
    (component as unknown as { plannerDataReady: boolean }).plannerDataReady = true;

    component.addEvent({
      id: 'campaign-1',
      title: 'Reward campaign',
      type: 'campaign',
      plannerRewardAvailable: true,
      globalReleaseDate: '2031-01-01',
    });

    expect(component.plan.targets).toEqual([]);
    expect(component.plan.enabledRewardIds).toEqual([]);
    expect(component.plan.enabledRewardEventIds).toEqual(['campaign-1']);
  });

  it('adds both the pull target and linked rewards for a reward-bearing banner', () => {
    const component = createComponent();
    component.plan.enabledRewardIds = [];
    component.plan.enabledRewardEventIds = [];
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: [
        { id: 'banner-jewels', label: 'Banner jewels', event_id: 'banner-reward', currency: 'free_jewels', amount: 300, available_at: '2031-01-01' },
      ] },
    };
    (component as unknown as { plannerDataReady: boolean }).plannerDataReady = true;

    component.addEvent({
      id: 'banner-reward',
      title: 'Reward banner',
      type: 'character_banner',
      plannerRewardAvailable: true,
      globalReleaseDate: '2031-01-01',
    });

    expect(component.plan.targets.map(target => target.eventId)).toEqual(['banner-reward']);
    expect(component.plan.enabledRewardIds).toEqual([]);
    expect(component.plan.enabledRewardEventIds).toEqual(['banner-reward']);
  });

  it('selects several pickups and keeps a separate desired-copy target for each', () => {
    const component = createComponent();
    component.addEvent({
      id: 'multi-support',
      title: 'Two featured supports',
      type: 'support_card_banner',
      globalReleaseDate: '2031-01-01',
      pickupCardIds: [30031, 30033],
    });
    const target = component.plan.targets[0];

    expect(target.pickupGoals).toEqual([{ pickupId: 30031, desiredCopies: 1 }]);

    component.togglePickupGoal(target, 30033);
    component.adjustPickupGoalCopies(target, 30031, 1);

    expect(target.pickupGoals).toEqual([
      { pickupId: 30031, desiredCopies: 2 },
      { pickupId: 30033, desiredCopies: 1 },
    ]);
    expect([target.pickupId, target.desiredCopies]).toEqual([30031, 2]);

    component.adjustPickupGoalCopies(target, 30033, 1);
    component.togglePickupGoal(target, 30033);
    expect(target.pickupGoals).toEqual([{ pickupId: 30031, desiredCopies: 2 }]);

    component.togglePickupGoal(target, 30033);
    expect(target.pickupGoals).toEqual([
      { pickupId: 30031, desiredCopies: 2 },
      { pickupId: 30033, desiredCopies: 2 },
    ]);
  });

  it('shows direct goal odds without ambiguous plus-copy shorthand', () => {
    const component = createComponent();
    const goal = {
      pickupId: 30031,
      label: 'Yaeno Muteki',
      rate: 0.0075,
      desiredCopies: 2,
      probability: 0.442,
    };

    expect(component.pickupGoalOddsLabel(goal)).toBe('44.2%');
    expect(component.pickupGoalOddsAriaLabel(goal)).toBe(
      '44.2% chance of at least 2 copies of Yaeno Muteki',
    );
    expect(component.pickupGoalOddsLabel({ ...goal, probability: undefined })).toBe('Unavailable');
    expect(component.pickupGoalOddsAriaLabel({ ...goal, probability: undefined })).toBe(
      'Odds unavailable for Yaeno Muteki',
    );

    const crystalGoal = {
      ...goal,
      copiesNeededFromPulls: 1,
      crystalCopiesApplied: 1,
      crystalKind: 'rainbow' as const,
    };
    expect(component.pickupGoalRequirementLabel(crystalGoal)).toBe(
      '1 copy required + 1 Rainbow Uncap',
    );
    expect(component.pickupGoalOddsAriaLabel(crystalGoal)).toBe(
      '44.2% chance of at least 1 copy of Yaeno Muteki; 1 rainbow Uncap Crystal supplies the remaining limit breaks toward 2 total copies',
    );
  });

  it('groups pull outcomes into semantic cold, expected, and lucky ranges', () => {
    const component = createComponent();
    const probabilities = new CaratPullProbabilityService();
    const buildSegments = (result: ReturnType<CaratPullProbabilityService['calculate']>) => (
      component as unknown as {
        outcomeSegments: (value: ReturnType<CaratPullProbabilityService['calculate']>) => {
          tone: string;
          semanticLabel: string;
          rangeLabel: string;
          probability: number;
          width: number;
        }[];
      }
    ).outcomeSegments(result);

    const onePickup = buildSegments(probabilities.calculate({
      pulls: 200,
      rateUpRates: [0.0075],
      sparkPulls: 200,
    }));
    expect(onePickup.map(segment => [segment.tone, segment.semanticLabel, segment.rangeLabel])).toEqual([
      ['miss', 'Exchange only', '1 copy'],
      ['expected', 'Expected range', '2\u20133 copies'],
      ['lucky', 'Above expected', '4 or more copies'],
    ]);
    expect(onePickup.reduce((sum, segment) => sum + segment.probability, 0)).toBeCloseTo(1, 10);
    expect(onePickup.reduce((sum, segment) => sum + segment.width, 0)).toBeCloseTo(100, 8);

    const twoPickups = buildSegments(probabilities.calculate({
      pulls: 200,
      rateUpRates: [0.0075, 0.0075],
      sparkPulls: 200,
    }));
    expect(twoPickups.map(segment => [segment.tone, segment.semanticLabel, segment.rangeLabel])).toEqual([
      ['miss', 'Exchange only', '1 copy'],
      ['below', 'Below expected', '2 copies'],
      ['expected', 'Expected range', '3\u20135 copies'],
      ['lucky', 'Above expected', '6 or more copies'],
    ]);
  });

  it('uses a neutral outcome when no pull chance is configured', () => {
    const component = createComponent();
    const result = new CaratPullProbabilityService().calculate({ pulls: 0, rateUpRates: [] });
    const segments = (component as unknown as {
      outcomeSegments: (value: typeof result) => {
        tone: string;
        semanticLabel: string;
        rangeLabel: string;
        probability: number;
      }[];
    }).outcomeSegments(result);

    expect(segments).toEqual([jasmine.objectContaining({
      tone: 'neutral',
      semanticLabel: 'No chance configured',
      rangeLabel: '0 copies',
      probability: 1,
    })]);
  });

  it('uses timeline names and deterministic artwork instead of generic pickup IDs', () => {
    const component = createComponent();
    component.events = [{
      id: 'named-support',
      title: 'Featured support',
      type: 'support_card_banner',
      globalReleaseDate: '2031-01-01',
      pickupCardIds: [30031],
      relatedSupportCards: ['Mejiro McQueen'],
      relatedSupportCardNames: ['Heirs to the Throne'],
    }];
    component.addEvent(component.filteredEvents[0]);
    const target = component.plan.targets[0];
    const option = (component as unknown as {
      buildPickupOption: (
        targetValue: typeof target,
        pickup: { pickup_id: number; rate: number; label?: string },
      ) => { label: string; imagePath?: string };
    }).buildPickupOption(target, { pickup_id: 30031, rate: 0.0075, label: 'Support Card 30031' });

    expect(option.label).toBe('Mejiro McQueen - Heirs to the Throne');
    expect(option.imagePath).toBe('/assets/images/support_card/half/support_card_s_30031.webp');
  });

  it('hydrates future character pickup names and artwork fallbacks from master data', () => {
    const component = createComponent();
    component.events = [{
      id: 'future-character',
      title: 'Future character',
      type: 'character_banner',
      globalReleaseDate: '2031-01-01',
      pickupCardIds: [113202],
    }];
    component.addEvent(component.filteredEvents[0]);
    const target = component.plan.targets[0];
    const option = (component as unknown as {
      buildPickupOption: (
        targetValue: typeof target,
        pickup: { pickup_id: number; rate: number; label?: string },
      ) => { label: string; imagePath?: string; fallbackImagePath?: string; placeholderImagePath: string };
    }).buildPickupOption(target, { pickup_id: 113202, rate: 0.0075, label: 'Character 113202' });

    expect(option.label).toBe('Loves Only You');
    expect(option.imagePath).toBe('/assets/images/character_stand/chara_stand_113202.webp');
    expect(option.fallbackImagePath).toBe('/assets/images/character_stand/chara_stand_113201.webp');
    expect(option.placeholderImagePath)
      .toBe('assets/images/character_stand/chara_stand_100101.webp');
  });

  it('uses bundled game artwork for missing support-card pickups', () => {
    const component = createComponent();
    component.events = [{
      id: 'future-support',
      title: 'Future support',
      type: 'support_card_banner',
      globalReleaseDate: '2031-01-01',
      pickupCardIds: [39999],
    }];
    component.addEvent(component.filteredEvents[0]);
    const target = component.plan.targets[0];
    const option = (component as unknown as {
      buildPickupOption: (
        targetValue: typeof target,
        pickup: { pickup_id: number; rate: number; label?: string },
      ) => { placeholderImagePath: string };
    }).buildPickupOption(target, { pickup_id: 39999, rate: 0.0075 });

    expect(option.placeholderImagePath)
      .toBe('assets/images/support_card/half/support_card_s_30031.webp');
  });

  it('builds compact scenario selectors with site-native club rank artwork', () => {
    const component = createComponent();
    component.data = {
      core: {},
      income: { rules: [
        { id: 'class-6', label: 'Team Trials Class 6', currency: 'free_jewels', amount: 375, cadence: 'weekly', start_date: '2030-01-01', scenario_group: 'team_trials_class', scenario_option: 'class_6' },
        { id: 'class-2', label: 'Team Trials Class 2', currency: 'free_jewels', amount: 35, cadence: 'weekly', start_date: '2030-01-01', scenario_group: 'team_trials_class', scenario_option: 'class_2' },
        { id: 'rank-11', label: 'Club rank SS', currency: 'free_jewels', amount: 4500, cadence: 'monthly', start_date: '2030-01-01', scenario_group: 'club_rank', scenario_option: 'rank_11' },
        { id: 'rank-2', label: 'Club rank D+', currency: 'free_jewels', amount: 225, cadence: 'monthly', start_date: '2030-01-01', scenario_group: 'club_rank', scenario_option: 'rank_2' },
      ] },
      rewards: {
        rewards: [],
        global_reward_comparison: {
          news_match_method: 'same_announce_id',
          speculative_method: 'mean_last_6_complete_calendar_months',
          archive_as_of: '2026-08-07',
          observation_start: '2025-06-26',
          observation_end: '2026-08-06',
          observation_days: 407,
          observed_months: 13.372,
          matched_news_global_carats: 10_200,
          matched_news_jp_carats: 10_200,
          matched_news_extra_carats: 0,
          en_only_news_carats: 2850,
          social_carats: 33_600,
          social_reward_posts: 26,
          social_news_duplicate_reward_items_removed: 1,
          social_news_duplicate_carats_removed: 1500,
          speculative_observed_carats: 36_450,
          speculative_mean_monthly_carats: 2726,
          speculative_recent_median_monthly_carats: 775,
          speculative_recent_median_window_start: '2026-02',
          speculative_recent_median_window_end: '2026-07',
          speculative_monthly_carats: 1233,
          speculative_window_start: '2026-02',
          speculative_window_end: '2026-07',
          speculative_months: [2100, 600, 2700, 450, 600, 950]
            .map((total_carats, index) => ({
              month: `2026-${String(index + 2).padStart(2, '0')}`,
              matched_news_extra_carats: 0,
              en_only_news_carats: index === 5 ? 350 : 0,
              social_carats: total_carats - (index === 5 ? 350 : 0),
              total_carats,
            })),
          matched_news: Array.from({ length: 4 }, (_, index) => ({
            announce_id: 800 + index, title: 'Matched', global_carats: 1,
            jp_carats: 1, extra_carats: 0, global_url: '',
          })),
          en_only_news: Array.from({ length: 7 }, (_, index) => ({
            announce_id: 100_000 + index, title: 'EN-only', global_carats: 1,
            jp_carats: 0, extra_carats: 1, global_url: '',
          })),
        },
      },
    };

    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    expect(component.scenarioGroupOptions[0].options).toEqual([
      { value: 'class_2', label: 'Class 2', amountLabel: '+35/wk' },
      { value: 'class_6', label: 'Class 6', amountLabel: '+375/wk' },
    ]);
    expect(component.scenarioGroupOptions[1].options).toEqual([
      { value: 'rank_2', label: 'D+', amountLabel: '+225/mo' },
      { value: 'rank_11', label: 'SS', amountLabel: '+4,500/mo' },
    ]);
    expect(component.scenarioGroupOptions[2].options[0]).toEqual({
      value: 'champion', label: 'Champion', amountLabel: '+2,500 + 10 tix / event',
    });
    const cmRounds = component.scenarioGroupOptions.find(group =>
      group.id === 'champions_meeting_round_income');
    expect(cmRounds?.options).toEqual([
      { value: 'low_investment', label: 'Low investment', icon: 'savings', amountLabel: '+255 / event' },
      { value: 'competitive', label: 'Competitive', icon: 'emoji_events', amountLabel: '+640 / event' },
      { value: 'meta_highroller', label: 'Meta highroller', icon: 'diamond', amountLabel: '+1,260 / event' },
    ]);
    expect(cmRounds?.helpText).toContain('Final placement rewards are counted separately.');
    const leagueOfHeroes = component.scenarioGroupOptions.find(group =>
      group.id === 'league_of_heroes_rank');
    expect(leagueOfHeroes?.options[4]).toEqual({
      value: 'gold_4', label: 'Gold 4', amountLabel: '+1,300 + 4 tix + 1R/2G shards / event',
    });
    const trainingPass = component.scenarioGroupOptions.find(group => group.id === 'training_pass');
    const speculativeIncome = component.scenarioGroupOptions.find(group => group.id === 'speculative_income');
    const mastersChallenges = component.scenarioGroupOptions.find(group => group.id === 'masters_challenge_rewards');
    const storyEvents = component.scenarioGroupOptions.find(group => group.id === 'story_event_rewards');
    expect(trainingPass?.options).toEqual([
      { value: 'free', label: 'Free', amountLabel: '+500 + 4 tix / month' },
      { value: 'premium', label: 'Premium', amountLabel: '+2,200 + 8 tix + 1 rainbow shard / month' },
    ]);
    expect(trainingPass?.sourceUrl).toBe('https://umapyoi.net/news/1788?lang=jp');
    expect(speculativeIncome?.options).toEqual([
      { value: 'include', label: 'Rolling mean', amountLabel: '+1,233 Carats / month' },
      { value: 'median', label: 'Conservative median', amountLabel: '+775 Carats / month' },
    ]);
    expect(mastersChallenges).toEqual(jasmine.objectContaining({
      label: 'Masters Challenges',
      options: [
        { value: 'clear_1', label: 'Clear 1 race', amountLabel: '+900 + 1R/1G shards / event' },
        { value: 'clear_2', label: 'Clear 2 races', amountLabel: '+1,800 + 2R/2G shards / event' },
        { value: 'clear_3', label: 'Clear 3 races', amountLabel: '+2,700 + 3R/3G shards / event' },
        { value: 'include', label: 'Clear every race', amountLabel: 'Up to +4,500 + 5R/5G shards / event' },
      ],
    }));
    expect(storyEvents).toEqual(jasmine.objectContaining({
      label: 'Story event rewards',
      options: [{ value: 'include', label: 'Complete all rewards', amountLabel: 'Varies by event' }],
    }));
    expect(speculativeIncome?.scheduleLabel).toBe(
      'Rolling six completed months; recalculates automatically',
    );
    expect(speculativeIncome?.helpText).toContain(
      'Rolling mean: average of the last 6 completed months; best for long-term planning.\n',
    );
    expect(component.scenarioGroupIcon('team_trials_class')).toBe('stadium');
    expect(component.scenarioGroupIcon('training_pass')).toBe('fact_check');
    expect(component.scenarioGroupIcon('speculative_income')).toBe('auto_graph');
    expect(component.scenarioOptionIconPath('club_rank', 'rank_11'))
      .toBe('assets/images/icon/circle_rank/utx_ico_circle_rank_11.webp');

    component.plan.scenarioSelections = { club_rank: 'rank_11' };
    expect(component.selectedScenarioOption(component.scenarioGroupOptions[1])).toEqual({
      value: 'rank_11',
      label: 'SS',
      amountLabel: '+4,500/mo',
    });
    component.plan.scenarioSelections = {};
    expect(component.selectedScenarioOption(component.scenarioGroupOptions[1])).toBeNull();
    component.cycleScenario(component.scenarioGroupOptions[2], 1);
    expect(component.plan.scenarioSelections['champions_meeting_result']).toBe('champion');

    component.plan.scenarioSelections['speculative_income'] = 'include';
    component.cycleScenario(speculativeIncome!, -1);
    expect(component.plan.scenarioSelections['speculative_income']).toBe('none');
    expect(component.selectedScenarioOption(speculativeIncome!)).toBeNull();
  });

  it('groups assumptions and toggles a whole section with conservative defaults', () => {
    const component = createComponent();
    component.data = {
      core: {},
      income: { rules: [
        { id: 'class-2', label: 'Team Trials Class 2', currency: 'free_jewels', amount: 35, cadence: 'weekly', start_date: '2030-01-01', scenario_group: 'team_trials_class', scenario_option: 'class_2' },
        { id: 'class-3', label: 'Team Trials Class 3', currency: 'free_jewels', amount: 100, cadence: 'weekly', start_date: '2030-01-01', scenario_group: 'team_trials_class', scenario_option: 'class_3' },
        { id: 'class-6', label: 'Team Trials Class 6', currency: 'free_jewels', amount: 375, cadence: 'weekly', start_date: '2030-01-01', scenario_group: 'team_trials_class', scenario_option: 'class_6' },
        { id: 'rank-2', label: 'Club rank D+', currency: 'free_jewels', amount: 225, cadence: 'monthly', start_date: '2030-01-01', scenario_group: 'club_rank', scenario_option: 'rank_2' },
        { id: 'rank-3', label: 'Club rank C', currency: 'free_jewels', amount: 750, cadence: 'monthly', start_date: '2030-01-01', scenario_group: 'club_rank', scenario_option: 'rank_3' },
        { id: 'rank-11', label: 'Club rank SS', currency: 'free_jewels', amount: 4500, cadence: 'monthly', start_date: '2030-01-01', scenario_group: 'club_rank', scenario_option: 'rank_11' },
      ] },
      rewards: { rewards: [] },
    };
    component.plan.scenarioSelections = {};
    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    expect(component.scenarioSections.map(section => section.label)).toEqual([
      'Account & recurring',
      'Competitive & challenge events',
      'Event completion',
      'Stories & login bonuses',
      'Estimated income',
    ]);
    const account = component.scenarioSections[0];
    expect(account.groups.map(group => group.id)).toEqual([
      'team_trials_class',
      'club_rank',
      'training_pass',
    ]);
    expect(component.scenarioSectionState(account)).toBe('none');

    component.toggleScenarioSection(account);
    expect(component.scenarioSectionState(account)).toBe('all');
    expect(component.plan.scenarioSelections).toEqual(jasmine.objectContaining({
      team_trials_class: 'class_3',
      club_rank: 'rank_3',
      training_pass: 'free',
    }));

    component.toggleScenarioSection(account);
    expect(component.scenarioSectionState(account)).toBe('none');
    expect(component.plan.scenarioSelections['team_trials_class']).toBeUndefined();
    expect(component.plan.scenarioSelections['club_rank']).toBeUndefined();
    expect(component.plan.scenarioSelections['training_pass']).toBeUndefined();

    component.toggleScenarioSection(account);
    expect(component.plan.scenarioSelections['team_trials_class']).toBe('class_3');
    expect(component.plan.scenarioSelections['club_rank']).toBe('rank_3');
    expect(component.plan.scenarioSelections['training_pass']).toBe('free');
  });

  it('applies four editable income presets across account, event, competition, and estimate groups', () => {
    const component = createComponent();
    component.data = {
      core: {},
      income: { rules: [
        { id: 'class-2', label: 'Team Trials Class 2', currency: 'free_jewels', amount: 35, cadence: 'weekly', start_date: '2030-01-01', scenario_group: 'team_trials_class', scenario_option: 'class_2' },
        { id: 'class-3', label: 'Team Trials Class 3', currency: 'free_jewels', amount: 100, cadence: 'weekly', start_date: '2030-01-01', scenario_group: 'team_trials_class', scenario_option: 'class_3' },
        { id: 'class-4', label: 'Team Trials Class 4', currency: 'free_jewels', amount: 150, cadence: 'weekly', start_date: '2030-01-01', scenario_group: 'team_trials_class', scenario_option: 'class_4' },
        { id: 'class-5', label: 'Team Trials Class 5', currency: 'free_jewels', amount: 225, cadence: 'weekly', start_date: '2030-01-01', scenario_group: 'team_trials_class', scenario_option: 'class_5' },
        { id: 'class-6', label: 'Team Trials Class 6', currency: 'free_jewels', amount: 375, cadence: 'weekly', start_date: '2030-01-01', scenario_group: 'team_trials_class', scenario_option: 'class_6' },
        { id: 'rank-2', label: 'Club rank D+', currency: 'free_jewels', amount: 225, cadence: 'monthly', start_date: '2030-01-01', scenario_group: 'club_rank', scenario_option: 'rank_2' },
        { id: 'rank-3', label: 'Club rank C', currency: 'free_jewels', amount: 750, cadence: 'monthly', start_date: '2030-01-01', scenario_group: 'club_rank', scenario_option: 'rank_3' },
        { id: 'rank-5', label: 'Club rank B', currency: 'free_jewels', amount: 1500, cadence: 'monthly', start_date: '2030-01-01', scenario_group: 'club_rank', scenario_option: 'rank_5' },
        { id: 'rank-7', label: 'Club rank A', currency: 'free_jewels', amount: 2250, cadence: 'monthly', start_date: '2030-01-01', scenario_group: 'club_rank', scenario_option: 'rank_7' },
        { id: 'rank-11', label: 'Club rank SS', currency: 'free_jewels', amount: 4500, cadence: 'monthly', start_date: '2030-01-01', scenario_group: 'club_rank', scenario_option: 'rank_11' },
        { id: 'shop-friend', label: 'Friend Point Exchange tickets', currency: 'uma_ticket', amount: 1, cadence: 'monthly', start_date: '2030-01-01', scenario_group: 'monthly_shop_tickets', scenario_option: 'friend_points' },
        { id: 'shop', label: 'Clover Exchange tickets', currency: 'uma_ticket', amount: 2, cadence: 'monthly', start_date: '2030-01-01', scenario_group: 'monthly_shop_tickets', scenario_option: 'include' },
      ] },
      rewards: { rewards: [] },
    };
    component.plan.scenarioSelections = {};
    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();
    const save = spyOn(component, 'save');

    component.applyIncomePreset('conservative');
    expect(component.plan.scenarioSelections).toEqual(jasmine.objectContaining({
      team_trials_class: 'class_3',
      club_rank: 'rank_3',
      champions_meeting_result: 'open_third',
      league_of_heroes_rank: 'silver_4',
        story_event_rewards: 'none',
        factor_research_rewards: 'none',
        login_milestone_rewards: 'none',
        valentines_gift_rewards: 'none',
        white_day_gift_rewards: 'none',
        christmas_gift_rewards: 'none',
        speculative_income: 'none',
    }));
    expect(component.plan.scenarioSelections['monthly_shop_tickets']).toBeUndefined();
    expect(component.plan.scenarioSelections['random_gameplay_income']).toBeUndefined();
    expect(component.activeIncomePresetId).toBe('conservative');

    component.applyIncomePreset('casual');
    expect(component.plan.scenarioSelections).toEqual(jasmine.objectContaining({
      team_trials_class: 'class_4',
      club_rank: 'rank_5',
      monthly_shop_tickets: 'friend_points',
        masters_challenge_rewards: 'clear_1',
        story_event_rewards: 'include',
        login_milestone_rewards: 'include',
        valentines_gift_rewards: 'include',
        white_day_gift_rewards: 'include',
        christmas_gift_rewards: 'include',
        factor_research_rewards: 'none',
      speculative_income: 'median',
    }));

    component.applyIncomePreset('active');
    expect(component.plan.scenarioSelections).toEqual(jasmine.objectContaining({
      team_trials_class: 'class_5',
      club_rank: 'rank_7',
      monthly_shop_tickets: 'friend_points',
      masters_challenge_rewards: 'clear_3',
      factor_research_rewards: 'include',
      speculative_income: 'include',
    }));

    component.applyIncomePreset('completionist');
    expect(component.plan.scenarioSelections).toEqual(jasmine.objectContaining({
      team_trials_class: 'class_6',
      club_rank: 'rank_11',
      monthly_shop_tickets: 'include',
      training_pass: 'free',
      champions_meeting_result: 'champion',
      league_of_heroes_rank: 'platinum_4',
      masters_challenge_rewards: 'include',
      random_gameplay_income: 'high',
      speculative_income: 'include',
    }));
    expect(component.activeIncomePresetId).toBe('completionist');
    expect(component.plan.incomePresetId).toBe('completionist');
    expect(component.incomePresetEdited).toBeFalse();
    expect(save).toHaveBeenCalledTimes(4);

    component.setScenario('random_gameplay_income', 'medium');
    expect(component.activeIncomePresetId).toBe('completionist');
    expect(component.plan.incomePresetEdited).toBeTrue();
    expect(component.incomePresetEdited).toBeTrue();
  });

  it('repairs missing values for an unedited saved preset without overriding edited presets', () => {
    const completionist = createComponent();
    completionist.plan.incomePresetId = 'completionist';
    completionist.plan.incomePresetEdited = false;
    delete completionist.plan.scenarioSelections['random_gameplay_income'];

    (completionist as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    expect(completionist.plan.scenarioSelections['random_gameplay_income']).toBe('high');

    const edited = createComponent();
    edited.plan.incomePresetId = 'completionist';
    edited.plan.incomePresetEdited = true;
    delete edited.plan.scenarioSelections['random_gameplay_income'];

    (edited as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    expect(edited.plan.scenarioSelections['random_gameplay_income']).toBeUndefined();
  });

  it('migrates legacy maxed plans and makes Completionist include every optional dated reward', () => {
    const component = createComponent();
    const optionalReward = {
      id: 'optional-gift',
      label: 'Optional dated gift',
      currency: 'free_jewels' as const,
      amount: 3_000,
      available_at: '2030-02-01',
      default_enabled: false,
    };
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: [optionalReward] },
    };
    component.plan.scenarioSelections = {
      team_trials_class: 'class_6',
      club_rank: 'rank_11',
      champions_meeting_result: 'champion',
      league_of_heroes_rank: 'platinum_4',
      strongest_team_reward_tier: 'all',
      legend_race_clears: 'all',
      masters_challenge_rewards: 'include',
      story_event_rewards: 'include',
      random_gameplay_income: 'high',
      speculative_income: 'include',
    };
    delete component.plan.incomePresetId;
    delete component.plan.incomePresetEdited;

    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    expect<string | undefined>(component.plan.incomePresetId).toBe('completionist');
    expect<boolean | undefined>(component.plan.incomePresetEdited).toBeFalse();
    expect(component.plan.scenarioSelections['champions_meeting_round_income']).toBe('meta_highroller');
    expect(component.plan.enabledRewardIds).toEqual(['optional-gift']);
  });

  it('resets sparse reward exclusions when Completionist is explicitly reapplied', () => {
    const component = createComponent();
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: [{
        id: 'optional-gift',
        label: 'Optional dated gift',
        currency: 'free_jewels',
        amount: 3_000,
        available_at: '2030-02-01',
        event_id: 'reward-event',
        default_enabled: false,
      }] },
    };
    component.plan.disabledRewardIds = ['optional-gift'];
    component.plan.disabledEventIds = ['reward-event', 'target-event'];
    component.plan.targets = [{
      id: 'target',
      eventId: 'target-event',
      title: 'Target',
      bannerKind: 'support',
      plannedPulls: 200,
      desiredCopies: 1,
      pullTiming: 'end',
      useTickets: true,
      allowPaidJewels: false,
    }];

    component.applyIncomePreset('completionist');

    expect(component.plan.enabledRewardIds).toEqual(['optional-gift']);
    expect(component.plan.disabledRewardIds).toEqual([]);
    expect(component.plan.disabledEventIds).toEqual(['target-event']);
  });

  it('shows the master-backed Monthly Shop ticket toggle transparently', () => {
    const component = createComponent();
    component.data = {
      core: {},
      income: { rules: [
        { id: 'shop-friend-uma', label: 'Friend Point Exchange tickets', currency: 'uma_ticket', amount: 1, cadence: 'monthly', start_date: '2026-01-06', day_of_month: 1, scenario_group: 'monthly_shop_tickets', scenario_option: 'include' },
        { id: 'shop-friend-support', label: 'Friend Point Exchange tickets', currency: 'support_ticket', amount: 1, cadence: 'monthly', start_date: '2026-01-06', day_of_month: 1, scenario_group: 'monthly_shop_tickets', scenario_option: 'include' },
        { id: 'shop-clover-uma', label: 'Clover Exchange tickets', currency: 'uma_ticket', amount: 2, cadence: 'monthly', start_date: '2025-06-26', day_of_month: 1, scenario_group: 'monthly_shop_tickets', scenario_option: 'include' },
        { id: 'shop-clover-support', label: 'Clover Exchange tickets', currency: 'support_ticket', amount: 2, cadence: 'monthly', start_date: '2025-06-26', day_of_month: 1, scenario_group: 'monthly_shop_tickets', scenario_option: 'include' },
      ] },
      rewards: { rewards: [] },
    };

    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    const monthlyShop = component.scenarioGroupOptions
      .find(group => group.id === 'monthly_shop_tickets');
    expect(monthlyShop).toEqual(jasmine.objectContaining({
      label: 'Monthly shop tickets',
      scheduleLabel: 'Monthly, choose which exchange currencies to spend',
      options: [
        { value: 'friend_points', label: 'Friend Points only', amountLabel: '+1 Uma + 1 support / mo' },
        { value: 'include', label: 'Friend Points + Clovers', amountLabel: '+3 Uma + 3 support / mo' },
      ],
    }));
    expect(monthlyShop?.helpText).toContain('costing 800 Clovers per month');
    expect(component.scenarioGroupIcon('monthly_shop_tickets')).toBe('storefront');
    expect(component.plan.scenarioSelections['monthly_shop_tickets']).toBeUndefined();

    component.cycleScenario(monthlyShop!, 1);
    expect(component.plan.scenarioSelections['monthly_shop_tickets']).toBe('friend_points');
    expect(component.plan.enabledIncomeRuleIds).toEqual([]);

    component.cycleScenario(monthlyShop!, 1);
    expect(component.plan.scenarioSelections['monthly_shop_tickets']).toBe('include');
  });

  it('summarizes only active assumptions and rewards', () => {
    const component = createComponent();
    component.data = {
      core: {},
      income: { rules: [
        { id: 'daily', label: 'Daily missions', currency: 'free_jewels', amount: 75, cadence: 'daily', start_date: '2030-01-01' },
        { id: 'class-2', label: 'Team Trials Class 2', currency: 'free_jewels', amount: 35, cadence: 'weekly', start_date: '2030-01-01', scenario_group: 'team_trials_class', scenario_option: 'class_2' },
        { id: 'class-6', label: 'Team Trials Class 6', currency: 'free_jewels', amount: 375, cadence: 'weekly', start_date: '2030-01-01', scenario_group: 'team_trials_class', scenario_option: 'class_6' },
      ] },
      rewards: { rewards: [
        { id: 'active', label: 'Active reward', event_id: 'event-a', currency: 'free_jewels', amount: 300, available_at: '2030-01-01' },
        { id: 'disabled', label: 'Disabled event reward', event_id: 'event-b', currency: 'free_jewels', amount: 500, available_at: '2030-01-02' },
        { id: 'unknown', label: 'Unknown reward', currency: 'free_jewels', amount: null, available_at: '2030-01-03' },
      ] },
    };
    component.plan.enabledIncomeRuleIds = ['daily', 'class-2', 'class-6'];
    component.plan.scenarioSelections = { team_trials_class: 'class_2' };
    component.plan.enabledRewardIds = ['active', 'disabled', 'unknown'];
    component.plan.disabledEventIds = ['event-b'];
    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    expect(component.activeIncomeAssumptionCount).toBe(2);
    expect(component.enabledIncomeTotalLabel).toBe('+75 / day · +35 / week');
    expect(component.activeRewardCount).toBe(2);
    expect(component.enabledRewardTotalLabel).toBe('300 Carats · 1 unknown');
  });

  it('summarizes generated income assumptions with the selected proposal', () => {
    const component = createComponent();
    component.events = [{
      id: 'campaign-632',
      title: 'Training Pass launch',
      type: 'campaign',
      globalReleaseDate: '2031-08-20',
    }];
    component.data = {
      core: {},
      income: { rules: [
        { id: 'daily', label: 'Daily missions', currency: 'free_jewels', amount: 75, cadence: 'daily', start_date: '2030-01-01' },
        { id: 'login', label: 'Login cycle', currency: 'free_jewels', amount: 150, cadence: 'weekly', start_date: '2030-01-01' },
        { id: 'club', label: 'Club rank', currency: 'free_jewels', amount: 225, cadence: 'monthly', start_date: '2030-01-01', scenario_group: 'club_rank', scenario_option: 'rank_d_plus' },
      ] },
      rewards: {
        rewards: [],
        global_reward_comparison: {
          speculative_monthly_carats: 1233,
          speculative_recent_median_monthly_carats: 775,
        } as never,
      },
    };
    component.plan.enabledIncomeRuleIds = ['daily', 'login', 'club'];
    component.plan.scenarioSelections = {
      club_rank: 'rank_d_plus',
      random_gameplay_income: 'high',
      training_pass: 'free',
      speculative_income: 'include',
    };

    expect(component.enabledIncomeTotalLabel).toBe(
      '+75 / day · +400 / week · +1,958 / month',
    );
  });

  it('groups event rewards with compact benefits in display priority order', () => {
    const component = createComponent();
    component.events = [{
      id: 'anniversary',
      title: '1.5th Anniversary',
      type: 'campaign',
      globalReleaseDate: '2030-08-01',
      imagePath: '/assets/anniversary.webp',
    }];
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: {
        rewards: [
          { id: 'jewels', label: 'Anniversary Carats', event_id: 'anniversary', currency: 'free_jewels', amount: 1500, available_at: '2030-08-01' },
          { id: 'ticket', label: 'Support ticket', event_id: 'anniversary', currency: 'support_ticket', amount: 2, available_at: '2030-08-01' },
        ],
        event_benefits: [
          { id: 'selector', event_id: 'anniversary', kind: 'trainee_selector', label: '3-star trainee selector', item_category: 41, item_id: 164, amount: 1, available_at: '2030-08-01', planner_effect: 'informational' },
          { id: 'pulls', event_id: 'anniversary', gacha_id: 30100, kind: 'free_pulls', label: 'Free pulls', amount: 100, available_at: '2030-08-01', planner_effect: 'target_free_pulls' },
        ],
      },
    };

    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    expect(component.displayedRewardGroups.length).toBe(1);
    const group = component.displayedRewardGroups[0];
    expect([group.title, group.imagePath, group.availableAt]).toEqual([
      '1.5th Anniversary', '/assets/anniversary.webp', '2030-08-01',
    ]);
    expect(group.benefits.map(benefit => [benefit.kind, benefit.text])).toEqual([
      ['free_pulls', '100 free pulls'],
      ['trainee_selector', '3-star trainee selector'],
      ['support_ticket', '2 Support tickets'],
      ['carats', '1,500 Carats'],
    ]);
    expect(group.benefits.map(benefit => [benefit.kind, benefit.iconPath])).toEqual([
      ['free_pulls', undefined],
      ['trainee_selector', 'assets/images/item/item_icon_00164.webp'],
      ['support_ticket', 'assets/images/item/item_icon_00111.webp'],
      ['carats', 'assets/images/item/item_icon_00043.webp'],
    ]);

    component.searchRewards('selector');
    expect(component.displayedRewardGroups.map(item => item.id)).toEqual(['event:anniversary']);
  });

  it('uses timeline names when reward event ids differ in case and punctuation', () => {
    const component = createComponent();
    component.events = [
      {
        id: 'champions-meeting-16',
        title: 'Virgo Cup',
        type: 'champions_meeting',
        globalReleaseDate: '2030-08-01',
      },
      {
        id: 'news-event-trainer-skills-test-2022-09-19',
        title: 'Trainer Skills Test',
        type: 'trainer_skills_test',
        globalReleaseDate: '2030-08-02',
      },
      {
        id: 'campaign-194',
        title: 'Fall G1 Celebration Missions, Part 1: Sprinters Stakes',
        type: 'campaign',
        globalReleaseDate: '2030-08-03',
      },
    ];
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: [
        { id: 'virgo-carats', event_id: 'champions_Meeting-16', label: 'Champions Meeting rewards', currency: 'free_jewels', amount: 100, available_at: '2030-08-01' },
        { id: 'virgo-ticket', event_id: 'champions_Meeting-16', label: 'Champions Meeting rewards', currency: 'uma_ticket', amount: 1, available_at: '2030-08-01' },
        { id: 'skills-carats', event_id: 'news-Event-Trainer-Skills-Test-2022-09-19', label: 'Trainer Skills Test score rewards', currency: 'free_jewels', amount: 800, available_at: '2030-08-02' },
        { id: 'skills-ticket', event_id: 'news-Event-Trainer-Skills-Test-2022-09-19', label: 'Trainer Skills Test exchange rewards', currency: 'support_ticket', amount: 3, available_at: '2030-08-02' },
        { id: 'campaign-carats', event_id: 'campaign-194', label: 'Limited-time mission rewards', currency: 'free_jewels', amount: 150, available_at: '2030-08-03' },
        { id: 'campaign-items', event_id: 'campaign-194', label: 'Limited-time mission rewards item details', currency: 'free_jewels', amount: null, available_at: '2030-08-03' },
      ] },
    };

    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    expect(component.displayedRewardGroups.map(group => group.title)).toEqual([
      'Virgo Cup',
      'Trainer Skills Test',
      'Fall G1 Celebration Missions, Part 1: Sprinters Stakes',
    ]);
  });

  it('shows a readable generic title when a grouped reward has no timeline event', () => {
    const component = createComponent();
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: [
        { id: 'campaign-carats', event_id: 'campaign-999', label: 'Limited-time mission rewards', currency: 'free_jewels', amount: 150, available_at: '2030-08-01' },
        { id: 'campaign-items', event_id: 'campaign-999', label: 'Limited-time mission rewards item details', currency: 'free_jewels', amount: null, available_at: '2030-08-01' },
      ] },
    };

    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    expect(component.displayedRewardGroups[0].title).toBe('Campaign rewards');
  });

  it('shows end-dated event rewards as an availability window from event start to event end', () => {
    const component = createComponent();
    component.plan.projectionStartDate = '2026-08-17';
    component.events = [{
      id: 'trainer-skills-test',
      title: 'Trainer Skills Test',
      type: 'trainer_skills_test',
      globalReleaseDate: '2026-08-12T22:00:00Z',
      estimatedEndDate: '2026-08-22T22:00:00Z',
    }];
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: [{
        id: 'skills-test-reward',
        event_id: 'trainer-skills-test',
        label: 'Trainer Skills Test rewards',
        currency: 'free_jewels',
        amount: 1250,
        available_at: '2026-08-22T22:00:00Z',
      }] },
    };

    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    expect(component.displayedRewardGroups.length).toBe(1);
    expect(component.displayedRewardGroups[0]).toEqual(jasmine.objectContaining({
      availableAt: '2026-08-12',
      availableUntil: '2026-08-22',
      isPast: false,
    }));
  });

  it('does not infer shared campaign totals from a news source alone', () => {
    const component = createComponent();
    component.events = [
      { id: 'support-a', title: 'Support A', type: 'support_banner', globalReleaseDate: '2030-08-01' },
      { id: 'support-b', title: 'Support B', type: 'support_banner', globalReleaseDate: '2030-08-02' },
      { id: 'trainee', title: 'Trainee', type: 'character_banner', globalReleaseDate: '2030-08-03' },
    ];
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: {
        rewards: [],
        event_benefits: [
          { id: 'support-40', event_id: 'support-a', kind: 'free_pulls', label: 'Free Support Card pulls', amount: 40, available_at: '2030-08-01', planner_effect: 'target_free_pulls', confidence: 'schedule_partitioned', source_url: 'https://umapyoi.net/news/902?lang=jp' },
          { id: 'support-60', event_id: 'support-b', kind: 'free_pulls', label: 'Free Support Card pulls', amount: 60, available_at: '2030-08-02', planner_effect: 'target_free_pulls', confidence: 'schedule_partitioned', source_url: 'https://umapyoi.net/news/902?lang=jp' },
          { id: 'trainee-100', event_id: 'trainee', kind: 'free_pulls', label: 'Free Trainee pulls', amount: 100, available_at: '2030-08-03', planner_effect: 'target_free_pulls', confidence: 'schedule_partitioned', source_url: 'https://umapyoi.net/news/902?lang=jp' },
        ],
      },
    };

    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    expect(component.displayedRewardGroups.map(group => group.benefits[0].text)).toEqual([
      '40 schedule-derived free pulls',
      '60 schedule-derived free pulls',
      '100 schedule-derived free pulls',
    ]);
  });

  it('presents an explicit shared free-pull campaign once and adds its JP schedule in one action', () => {
    const component = createComponent();
    component.events = [
      {
        id: 'light-hello',
        title: 'Light Hello + 2 more',
        type: 'support_banner',
        globalReleaseDate: '2031-08-24',
        estimatedEndDate: '2031-08-29',
        gachaId: 30111,
        relatedSupportCards: ['Light Hello', 'Agnes Tachyon'],
      },
      {
        id: 'tokai-teio',
        title: 'Tokai Teio + 1 more',
        type: 'support_banner',
        globalReleaseDate: '2031-08-29',
        estimatedEndDate: '2031-09-03',
        gachaId: 30113,
        relatedSupportCards: ['Tokai Teio', 'Twin Turbo'],
      },
    ];
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: {
        rewards: [],
        event_benefits: [
          { id: 'light-pulls', event_id: 'light-hello', gacha_id: 30111, campaign_id: 'anniversary-100', kind: 'free_pulls', label: 'Free pulls', amount: 60, available_at: '2031-08-24', planner_effect: 'target_free_pulls' },
          { id: 'teio-pulls', event_id: 'tokai-teio', gacha_id: 30113, campaign_id: 'anniversary-100', kind: 'free_pulls', label: 'Free pulls', amount: 40, available_at: '2031-08-29', planner_effect: 'target_free_pulls' },
        ],
        free_pull_campaigns: [{
          id: 'anniversary-100',
          label: '1.5 Anniversary free pulls',
          total_pulls: 100,
          pulls_per_day: 10,
          entitlement_days: 10,
          allocation_mode: 'daily_with_one_time_stock',
          default_allocations: [
            { event_id: 'light-hello', gacha_id: 30111, pulls: 60 },
            { event_id: 'tokai-teio', gacha_id: 30113, pulls: 40 },
          ],
          source_url: 'https://umapyoi.net/news/901?lang=jp',
        }],
      },
    };
    (component as unknown as { plannerDataReady: boolean }).plannerDataReady = true;
    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    expect(component.displayedFreePullCampaigns.length).toBe(1);
    expect(component.displayedRewardGroups).toEqual([]);
    const campaign = component.displayedFreePullCampaigns[0];
    expect(component.freePullCampaignScheduleLabel(campaign)).toBe(
      '60 Light Hello, Agnes Tachyon + 40 Tokai Teio, Twin Turbo',
    );
    expect(component.freePullCampaignStockLabel(campaign)).toBe('All 100 on Tokai Teio, Twin Turbo');
    expect(campaign.sourceUrl).toBe('https://umapyoi.net/news/901?lang=jp');

    component.selectFreePullCampaign(campaign, 'schedule');

    expect(component.plan.targets.map(target => target.eventId)).toEqual(['light-hello', 'tokai-teio']);
    expect(component.plan.freePullCampaignSelections).toEqual({
      'anniversary-100': '__default_schedule__',
    });
    expect(component.isFreePullCampaignChoiceSelected(campaign, 'schedule')).toBeTrue();
    expect(component.isFreePullCampaignChoiceReady(campaign, 'schedule')).toBeTrue();
    expect(component.enabledRewardTotalLabel).toBe('100 free pulls');

    const targetsBeforeExcluding = JSON.stringify(component.plan.targets);
    component.selectFreePullCampaign(campaign, 'schedule');
    expect(component.plan.freePullCampaignSelections).toEqual({
      'anniversary-100': '__excluded__',
    });
    expect(JSON.stringify(component.plan.targets)).toBe(targetsBeforeExcluding);
    expect(component.isFreePullCampaignChoiceSelected(campaign, 'schedule')).toBeFalse();
    expect(component.enabledRewardTotalLabel).toBe('');
  });

  it('adds the Gacha Stock destination directly without requiring a banner-picker step', () => {
    const component = createComponent();
    component.events = [
      { id: 'light-hello', title: 'Light Hello', type: 'support_banner', globalReleaseDate: '2031-08-24', gachaId: 30111 },
      { id: 'tokai-teio', title: 'Tokai Teio', type: 'support_banner', globalReleaseDate: '2031-08-29', gachaId: 30113 },
    ];
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: {
        rewards: [],
        event_benefits: [],
        free_pull_campaigns: [{
          id: 'anniversary-100',
          label: '1.5 Anniversary free pulls',
          total_pulls: 100,
          allocation_mode: 'daily_with_one_time_stock',
          default_allocations: [
            { event_id: 'light-hello', gacha_id: 30111, pulls: 60 },
            { event_id: 'tokai-teio', gacha_id: 30113, pulls: 40 },
          ],
        }],
      },
    };
    (component as unknown as { plannerDataReady: boolean }).plannerDataReady = true;
    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();
    const campaign = component.displayedFreePullCampaigns[0];

    component.selectFreePullCampaign(campaign, 'stock');

    expect(component.plan.targets.map(target => target.eventId)).toEqual(['tokai-teio']);
    expect(component.plan.freePullCampaignSelections).toEqual({
      'anniversary-100': 'tokai-teio',
    });
    expect(component.isFreePullCampaignChoiceSelected(campaign, 'stock')).toBeTrue();
    expect(component.isFreePullCampaignChoiceReady(campaign, 'stock')).toBeTrue();
    expect(component.enabledRewardTotalLabel).toBe('100 free pulls');
  });

  it('treats a partially selected reward group as an add action', () => {
    const component = createComponent();
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: {
        rewards: [
          { id: 'first', event_id: 'bundle', label: 'First reward', currency: 'free_jewels', amount: 100, available_at: '2030-08-01' },
          { id: 'second', event_id: 'bundle', label: 'Second reward', currency: 'free_jewels', amount: 200, available_at: '2030-08-01' },
        ],
        event_benefits: [
          { id: 'selector', event_id: 'bundle', kind: 'support_selector', label: 'SSR support selector', amount: 1, available_at: '2030-08-01', planner_effect: 'informational' },
        ],
      },
    };
    component.plan.enabledRewardIds = [];
    component.plan.disabledRewardIds = ['second'];
    component.plan.enabledRewardEventIds = ['bundle'];
    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();
    const group = component.displayedRewardGroups[0];

    expect(component.isRewardGroupActive(group)).toBeFalse();
    expect(component.rewardGroupActionLabel(group)).toBe('Add bundle rewards');

    component.toggleRewardGroupAction(group);
    expect(component.plan.enabledRewardIds).toEqual([]);
    expect(component.plan.disabledRewardIds).toEqual([]);
    expect(component.isRewardGroupActive(group)).toBeTrue();
  });

  it('shows usable rewards earliest first and keeps history in a separate newest-first view', () => {
    const component = createComponent();
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: [
        { id: 'past-old', label: 'Old reward', currency: 'free_jewels', amount: 100, available_at: '2028-01-01' },
        { id: 'future-late', label: 'Later reward', currency: 'free_jewels', amount: 300, available_at: '2031-02-01' },
        { id: 'past-new', label: 'Recent past reward', currency: 'free_jewels', amount: 200, available_at: '2029-12-31' },
        { id: 'current', label: 'Plan-start reward', currency: 'free_jewels', amount: 150, available_at: '2030-01-01' },
        { id: 'future-soon', label: 'Next reward', currency: 'free_jewels', amount: 250, available_at: '2031-01-01' },
      ] },
    };

    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    expect(component.showPastRewards).toBeFalse();
    expect(component.upcomingRewardGroupCount).toBe(3);
    expect(component.pastRewardGroupCount).toBe(2);
    expect(component.displayedRewardGroups.map(group => group.id)).toEqual([
      'reward:current', 'reward:future-soon', 'reward:future-late',
    ]);

    component.setPastRewardsVisible(true);

    expect(component.displayedRewardGroups.map(group => group.id)).toEqual([
      'reward:past-new', 'reward:past-old',
    ]);
    expect(component.displayedRewardGroups.every(group => component.isPastRewardGroup(group))).toBeTrue();
  });

  it('uses today as the upcoming boundary when a plan started in the past', () => {
    const component = createComponent();
    const dateAtOffset = (days: number): string => {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    };
    component.plan.projectionStartDate = dateAtOffset(-2);
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: [
        { id: 'already-earned', label: 'Already earned', currency: 'free_jewels', amount: 100, available_at: dateAtOffset(-1) },
        { id: 'available-today', label: 'Available today', currency: 'free_jewels', amount: 100, available_at: dateAtOffset(0) },
        { id: 'available-later', label: 'Available later', currency: 'free_jewels', amount: 100, available_at: dateAtOffset(1) },
      ] },
    };

    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    expect(component.displayedRewardGroups.map(group => group.rewards[0]?.id)).toEqual([
      'available-today', 'available-later',
    ]);
    component.setPastRewardsVisible(true);
    expect(component.displayedRewardGroups.map(group => group.rewards[0]?.id)).toContain('already-earned');
  });

  it('reclassifies rewards when the projection start date changes', () => {
    const component = createComponent();
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: [
        { id: 'first', label: 'First reward', currency: 'free_jewels', amount: 100, available_at: '2030-06-01' },
        { id: 'second', label: 'Second reward', currency: 'free_jewels', amount: 100, available_at: '2031-06-01' },
      ] },
    };
    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();
    expect(component.displayedRewardGroups.map(group => group.rewards[0]?.id)).toEqual(['first', 'second']);

    component.projectionStartChanged('2031-01-01');

    expect(component.plan.projectionStartDate).toBe('2031-01-01');
    expect(component.displayedRewardGroups.map(group => group.rewards[0]?.id)).toEqual(['second']);
    expect(component.pastRewardGroupCount).toBe(1);
  });

  it('tracks selector-only reward groups without adding informational items to balances', () => {
    const component = createComponent();
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: {
        rewards: [],
        event_benefits: [{
          id: 'support-choice',
          event_id: 'selector-campaign',
          kind: 'support_selector',
          label: 'SSR support selector',
          amount: 1,
          available_at: '2030-09-01',
          planner_effect: 'informational',
        }],
      },
    };
    component.plan.enabledRewardIds = [];
    component.plan.enabledRewardEventIds = [];
    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();
    const group = component.displayedRewardGroups[0];

    component.toggleRewardGroup(group, true);
    expect(component.plan.enabledRewardIds).toEqual([]);
    expect(component.plan.enabledRewardEventIds).toEqual(['selector-campaign']);
    expect(component.isRewardGroupActive(group)).toBeTrue();
    expect(component.enabledRewardTotalLabel).toBe('1 selector');

    component.toggleRewardGroup(group, false);
    expect(component.plan.enabledRewardIds).toEqual([]);
    expect(component.plan.enabledRewardEventIds).toEqual([]);
  });

  it('shows free-pull-only banners as automatic benefits alongside mixed campaign summaries', () => {
    const component = createComponent();
    component.events = [{
      id: 'banner-only',
      title: 'Free pull banner',
      type: 'character_banner',
      globalReleaseDate: '2030-01-01',
      estimatedEndDate: '2030-01-08',
      gachaId: 30100,
    }, {
      id: 'mixed-campaign',
      title: 'Mixed campaign banner',
      type: 'support_banner',
      globalReleaseDate: '2030-02-01',
      estimatedEndDate: '2030-02-08',
      gachaId: 30101,
    }];
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: {
        rewards: [],
        event_benefits: [
          { id: 'banner-pulls', event_id: 'banner-only', kind: 'free_pulls', label: 'Free pulls', amount: 80, available_at: '2030-01-01', planner_effect: 'target_free_pulls', provenance: 'jp_news', source_url: 'https://umapyoi.net/news/100?lang=jp' },
          { id: 'campaign-pulls', event_id: 'mixed-campaign', kind: 'free_pulls', label: 'Free pulls', amount: 10, available_at: '2030-02-01', planner_effect: 'target_free_pulls', provenance: 'jp_news', confidence: 'schedule_partitioned' },
          { id: 'campaign-selector', event_id: 'mixed-campaign', kind: 'support_selector', label: 'SSR support selector', amount: 1, available_at: '2030-02-01', planner_effect: 'informational' },
        ],
      },
    };

    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    expect(component.displayedRewardGroups.map(group => group.id)).toEqual([
      'event:banner-only', 'event:mixed-campaign',
    ]);
    expect(component.displayedRewardGroups[0].benefits.map(benefit => benefit.text)).toEqual([
      '80 free pulls',
    ]);
    expect(component.isAutomaticFreePullGroup(component.displayedRewardGroups[0])).toBeTrue();
    expect(component.isRewardGroupSelectable(component.displayedRewardGroups[0])).toBeFalse();
    expect(component.isRewardGroupBannerActionable(component.displayedRewardGroups[0])).toBeTrue();
    expect(component.displayedRewardGroups[0].sourceUrl).toBe('https://umapyoi.net/news/100?lang=jp');
    expect(component.displayedRewardGroups[0].sourceLabel).toBe('News post');
    expect(component.displayedRewardGroups[1].benefits.map(benefit => benefit.text)).toEqual([
      '10 predicted free pulls',
      'SSR support selector',
    ]);

    component.toggleRewardGroupAction(component.displayedRewardGroups[0]);
    expect(component.plan.targets.map(target => target.eventId)).toContain('banner-only');
    expect(component.isRewardGroupBannerPlanned(component.displayedRewardGroups[0])).toBeTrue();

    component.toggleRewardGroupAction(component.displayedRewardGroups[0]);
    expect(component.plan.disabledEventIds).toContain('banner-only');
    expect(component.plan.targets.map(target => target.eventId)).toContain('banner-only');

    const mixedGroup = component.displayedRewardGroups[1];
    expect(component.isRewardGroupSelectable(mixedGroup)).toBeTrue();
    expect(component.isRewardGroupBannerActionable(mixedGroup)).toBeTrue();
    component.toggleRewardGroupAction(mixedGroup);
    expect(component.plan.enabledRewardEventIds).toContain('mixed-campaign');
    expect(component.plan.targets.map(target => target.eventId)).toContain('mixed-campaign');
  });

  it('links a mixed reward group to its Global news source before a JP source', () => {
    const component = createComponent();
    component.events = [{
      id: 'anniversary',
      title: 'Anniversary campaign',
      type: 'character_banner',
      globalReleaseDate: '2030-01-01',
      estimatedEndDate: '2030-01-08',
    }];
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: {
        rewards: [{
          id: 'global-reward', event_id: 'anniversary', label: 'Global reward', currency: 'free_jewels',
          amount: 1500, available_at: '2030-01-01', provenance: 'global_news',
          source_url: 'https://example.com/news/global-anniversary',
        }],
        event_benefits: [{
          id: 'jp-pulls', event_id: 'anniversary', kind: 'free_pulls', label: 'JP pulls', amount: 80,
          available_at: '2030-01-01', planner_effect: 'target_free_pulls', provenance: 'jp_news',
          source_url: 'https://umapyoi.net/news/100?lang=jp',
        }],
      },
    };

    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    expect(component.displayedRewardGroups[0].sourceUrl).toBe('https://example.com/news/global-anniversary');
    expect(component.displayedRewardGroups[0].sourceLabel).toBe('News post');
  });

  it('shows every reward in the scroll list and filters it down immediately', () => {
    const component = createComponent();
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: Array.from({ length: 10 }, (_, index) => ({
        id: `reward-${index}`,
        label: `Reward ${index}`,
        currency: 'free_jewels',
        amount: 100,
        available_at: `2030-01-${String(index + 1).padStart(2, '0')}`,
      })) },
    };
    component.plan.enabledRewardIds = ['reward-2'];
    (component as unknown as { rebuildAssumptionViews: () => void }).rebuildAssumptionViews();

    expect(component.visibleRewardGroups.length).toBe(10);

    component.searchRewards('Reward 7');
    expect(component.visibleRewardGroups.map(group => group.id)).toEqual(['reward:reward-7']);

    component.searchRewards('');
    expect(component.visibleRewardGroups.length).toBe(10);

    component.setRewardSelectionFilter('included');
    expect(component.visibleRewardGroups.map(group => group.id)).toEqual(['reward:reward-2']);
  });

  it('renders large reward catalogues in batches and loads ahead while scrolling', () => {
    const component = createComponent();
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: Array.from({ length: 95 }, (_, index) => ({
        id: `reward-${index}`,
        label: `Reward ${index}`,
        currency: 'free_jewels' as const,
        amount: 100,
        available_at: `2030-03-${String(index % 28 + 1).padStart(2, '0')}`,
      })) },
    };
    (component as unknown as { rebuildAssumptionViews(): void }).rebuildAssumptionViews();

    expect(component.displayedRewardItems.length).toBe(95);
    expect(component.visibleRewardItems.length).toBe(40);
    expect(component.remainingRewardItemCount).toBe(55);

    component.onRewardViewportScroll({
      currentTarget: { scrollHeight: 1000, scrollTop: 100, clientHeight: 400 },
    } as unknown as Event);
    expect(component.visibleRewardItems.length).toBe(40);

    component.onRewardViewportScroll({
      currentTarget: { scrollHeight: 1000, scrollTop: 400, clientHeight: 400 },
    } as unknown as Event);
    expect(component.visibleRewardItems.length).toBe(80);

    component.showMoreRewardItems();
    expect(component.visibleRewardItems.length).toBe(95);
    expect(component.hasMoreRewardItems).toBeFalse();

    component.searchRewards('Reward 94');
    expect(component.visibleRewardGroups.map(group => group.rewards[0]?.id)).toEqual(['reward-94']);
    component.searchRewards('');
    expect(component.visibleRewardItems.length).toBe(40);
  });

  it('reuses the reward catalogue view while searching and filtering', () => {
    const component = createComponent();
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: Array.from({ length: 100 }, (_, index) => ({
        id: `reward-${index}`,
        label: `Reward ${index}`,
        currency: 'free_jewels' as const,
        amount: 100,
        available_at: `2030-02-${String(index % 28 + 1).padStart(2, '0')}`,
      })) },
    };
    const buildGroups = spyOn(
      component as unknown as { buildRewardGroups(): unknown },
      'buildRewardGroups',
    ).and.callThrough();

    (component as unknown as { rebuildAssumptionViews(): void }).rebuildAssumptionViews();
    component.searchRewards('Reward 7');
    component.searchRewards('');
    component.setRewardSelectionFilter('included');
    component.setRewardSelectionFilter('all');

    expect(buildGroups).toHaveBeenCalledTimes(1);

    component.plan.projectionStartDate = '2030-02-15';
    component.projectionStartChanged();
    expect(buildGroups).toHaveBeenCalledTimes(2);
  });

  it('shows exact and predicted campaign free pulls in the funding summary', () => {
    const component = createComponent();
    component.addEvent({
      id: 'free-pull-banner',
      title: 'Free pull banner',
      type: 'character_banner',
      globalReleaseDate: '2030-01-01',
    });
    const target = component.plan.targets[0];
    const result = {
      ticketPullsUsed: 10,
      freeJewelPulls: 180,
      paidJewelPulls: 0,
      freePullsAvailable: 10,
      freePullsUsed: 10,
      shortfallJewels: 0,
    } as Parameters<CaratPlannerComponent['fundingInlineLabel']>[1];

    component.gachaByTarget.set(target.id, {
      gacha_id: 30100,
      banner_kind: 'character',
      start_date: '2030-01-01',
      end_date: '2030-01-10',
      free_pulls: 10,
      free_pulls_provenance: 'global_master',
      free_pulls_confidence: 'exact',
    });
    expect(component.fundingInlineLabel(target, result)).toBe('190 from resources · 10 free');

    component.gachaByTarget.set(target.id, {
      ...component.gachaByTarget.get(target.id)!,
      free_pulls_provenance: 'jp_news',
      free_pulls_confidence: 'schedule_partitioned',
    });
    expect(component.fundingInlineLabel(target, result)).toBe('190 from resources · 10 predicted free');
  });

  it('bulk-updates only displayed rewards once and clears loaded reward event state', () => {
    const component = createComponent();
    const save = spyOn(component, 'save');
    component.data = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: [
        { id: 'shown', label: 'Shown reward', event_id: 'event-a', currency: 'free_jewels', amount: 300, available_at: '2030-01-01' },
        { id: 'hidden', label: 'Hidden reward', event_id: 'event-b', currency: 'free_jewels', amount: 500, available_at: '2030-01-02' },
      ] },
    };
    component.plan.enabledRewardIds = ['shown', 'hidden'];
    component.plan.enabledRewardEventIds = ['event-a', 'event-b', 'not-loaded'];
    component.displayedRewards = [component.data.rewards.rewards[0]];

    component.setDisplayedRewardsEnabled(false);

    expect(component.plan.enabledRewardIds).toEqual(['hidden']);
    expect(component.plan.enabledRewardEventIds).toEqual(['not-loaded']);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('opens the heavy pickup editor without saving planner state', () => {
    const component = createComponent();
    const save = spyOn(component, 'save');

    component.setPickupDetailsOpen('target-a', { currentTarget: { open: true } } as unknown as Event);
    expect(component.isPickupDetailsOpen('target-a')).toBeTrue();
    component.setPickupDetailsOpen('target-a', { currentTarget: { open: false } } as unknown as Event);

    expect(component.isPickupDetailsOpen('target-a')).toBeFalse();
    expect(save).not.toHaveBeenCalled();
  });

  it('uses one mutually selected setup workspace instead of stacked accordions', () => {
    const component = createComponent();

    expect(component.activeSetupPanel).toBeNull();
    component.toggleSetupPanel('resources');
    expect(component.activeSetupPanel).toBe('resources');
    component.toggleSetupPanel('income');
    expect(component.activeSetupPanel).toBe('income');
    component.toggleSetupPanel('income');
    expect(component.activeSetupPanel).toBeNull();
  });

  it('opens assumptions on balance and switches tabs without closing the workspace', () => {
    const component = createComponent();

    component.toggleAssumptions();
    expect(component.activeSetupPanel).toBe('resources');

    component.selectSetupPanel('rewards');
    expect(component.activeSetupPanel).toBe('rewards');

    component.toggleAssumptions();
    expect(component.activeSetupPanel).toBeNull();
  });

  it('keeps the complete funding breakdown in the compact summary tooltip', () => {
    const component = createComponent();

    const tooltip = component.fundingBreakdownTooltip({
      plannedPulls: 200,
      fundedPulls: 82,
      freePullsAvailable: 10,
      freePullsUsed: 10,
      ticketPullsUsed: 5,
      freeJewelPulls: 60,
      paidJewelPulls: 7,
      shortfallJewels: 17_700,
      balanceAfter: { freeJewels: 85, paidJewels: 1_500, umaTickets: 0, supportTickets: 0 },
    } as never);

    expect(tooltip).toBe(
      '82 of 200 planned pulls funded. 10 campaign free pulls. 5 tickets. '
      + '60 pulls from free Carats. 7 pulls from paid Carats. 17,700 Carats short. '
      + '85 free Carats after. 1,500 paid Carats after',
    );
  });
});

describe('CaratPlannerComponent active-plan resources', () => {
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const balances = {
    freeJewels: 0,
    paidJewels: 0,
    umaTickets: 0,
    supportTickets: 0,
    rainbowCrystals: 0,
    goldCrystals: 0,
  };
  const makePlan = (id: string, eventId: string): CaratPlan => ({
    id,
    name: id,
    createdAt: '2030-01-01T00:00:00Z',
    updatedAt: '2030-01-01T00:00:00Z',
    projectionStartDate: '2030-01-01',
    balances: { ...balances },
    enabledIncomeRuleIds: [],
    enabledRewardIds: [],
    enabledRewardEventIds: [],
    disabledEventIds: [],
    scenarioSelections: {},
    resourceDefaultsApplied: false,
    customIncome: [],
    targets: [{
      id: `target-${id}`,
      eventId,
      gachaId: id === 'plan-a' ? 30100 : 30200,
      title: eventId,
      bannerKind: 'character',
      bannerStart: '2031-01-01',
      bannerEnd: '2031-01-10',
      pullTiming: 'end',
      plannedPulls: 200,
      desiredCopies: 1,
      useTickets: true,
      allowPaidJewels: false,
    }],
  });

  it('applies defaults and loads shards again when the active plan changes', async () => {
    let plans = [makePlan('plan-a', 'banner-a'), makePlan('plan-b', 'banner-b')];
    let activePlan = clone(plans[0]);
    const collectionSubject = new BehaviorSubject<CaratPlanCollection>({
      version: 1,
      activePlanId: activePlan.id,
      plans: clone(plans),
    });
    const savePlan = jasmine.createSpy('savePlan').and.callFake((plan: CaratPlan) => {
      activePlan = clone(plan);
      plans = plans.map(item => item.id === plan.id ? clone(plan) : item);
      collectionSubject.next({ version: 1, activePlanId: plan.id, plans: clone(plans) });
    });
    const persistence = {
      collection$: collectionSubject.asObservable(),
      get activePlan(): CaratPlan { return clone(activePlan); },
      savePlan,
      compactResourceState: () => false,
    };
    const data: CaratPlannerDataBundle = {
      core: {},
      income: {
        rules: [{
          id: 'daily-income',
          label: 'Daily income',
          currency: 'free_jewels',
          amount: 10,
          cadence: 'daily',
          start_date: '2030-01-01',
          default_enabled: true,
        }],
      },
      rewards: {
        rewards: [{
          id: 'launch-reward',
          label: 'Launch reward',
          currency: 'free_jewels',
          amount: 100,
          available_at: '2030-01-02',
          default_enabled: true,
        }],
      },
    };
    const stateSubject = new BehaviorSubject({ loading: false, ready: false, usingCache: false, error: null });
    const rewardUpdatesSubject = new Subject<CaratPlannerDataBundle['rewards']>();
    const loadGachasForEvents = jasmine.createSpy('loadGachasForEvents').and.resolveTo([]);
    const resources = {
      state$: stateSubject.asObservable(),
      rewardUpdates$: rewardUpdatesSubject.asObservable(),
      loadInitial: jasmine.createSpy('loadInitial').and.resolveTo(data),
      loadGachasForEvents,
      loadedGachas: [],
    };
    const calculations = {
      project: (plan: CaratPlan) => ({
        planId: plan.id,
        targets: [],
        finalBalances: { ...plan.balances },
        unallocatedIncome: [],
      }),
      isTargetBeforeProjectionStart: () => false,
    };
    const cdr = { markForCheck: jasmine.createSpy('markForCheck') } as unknown as ChangeDetectorRef;
    const component = new CaratPlannerComponent(
      calculations as never,
      new CaratPullProbabilityService(),
      persistence as never,
      resources as never,
      new TimelineAvatarService(),
      cdr,
    );
    component.events = [
      { id: 'banner-a', title: 'Banner A', type: 'character_banner', globalReleaseDate: '2031-01-01', gachaId: 30100 },
      { id: 'banner-b', title: 'Banner B', type: 'character_banner', globalReleaseDate: '2031-02-01', gachaId: 30200 },
    ];

    component.ngOnInit();
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(component.plan.resourceDefaultsApplied).toBeTrue();
    expect(component.plan.enabledIncomeRuleIds).toEqual(['daily-income']);
    expect(component.plan.enabledRewardIds).toEqual([]);
    expect(loadGachasForEvents.calls.mostRecent().args[0][0].id).toBe('banner-a');

    rewardUpdatesSubject.next({
      rewards: [{
        id: 'hot-loaded-reward',
        label: 'Hot-loaded reward',
        currency: 'free_jewels',
        amount: 3300,
        available_at: '2030-12-23',
        default_enabled: true,
      }],
    });
    expect(component.data.rewards.rewards[0]?.id).toBe('hot-loaded-reward');

    activePlan = clone(plans[1]);
    collectionSubject.next({ version: 1, activePlanId: activePlan.id, plans: clone(plans) });
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(component.plan.id).toBe('plan-b');
    expect(component.plan.resourceDefaultsApplied).toBeTrue();
    expect(component.plan.enabledIncomeRuleIds).toEqual(['daily-income']);
    expect(loadGachasForEvents.calls.mostRecent().args[0][0].id).toBe('banner-b');
    component.ngOnDestroy();
  });
});
