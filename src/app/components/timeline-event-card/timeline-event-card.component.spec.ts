import { EventType, TimelineEvent } from '../../models/timeline.model';
import { TimelineAvatarService } from '../../services/timeline-avatar.service';
import { TimelineEventCardComponent } from './timeline-event-card.component';

describe('TimelineEventCardComponent', () => {
  function createComponent(): TimelineEventCardComponent {
    return new TimelineEventCardComponent(new TimelineAvatarService());
  }

  function setEvent(
    component: TimelineEventCardComponent,
    overrides: Partial<TimelineEvent> = {}
  ): TimelineEvent {
    const event: TimelineEvent = {
      id: 'timeline-card',
      type: EventType.STORY_EVENT,
      title: 'Timeline event',
      jpReleaseDate: new Date('2021-03-16T03:00:00Z'),
      isConfirmed: true,
      ...overrides
    };
    component.event = event;
    component.ngOnChanges();
    return event;
  }

  it('emits the event when the dedicated details action activates', () => {
    const component = createComponent();
    const event = setEvent(component);
    const openDetails = spyOn(component.openDetails, 'emit');

    component.activate();

    expect(openDetails).toHaveBeenCalledOnceWith(event);
  });

  it('offers supported character and support banners to the pull planner', () => {
    const component = createComponent();

    setEvent(component, { type: EventType.CHARACTER_BANNER, gachaId: 10001 });
    expect(component.view?.canPlan).toBeTrue();

    setEvent(component, { type: EventType.SUPPORT_CARD_BANNER, gachaIds: [20001] });
    expect(component.view?.canPlan).toBeTrue();

    setEvent(component, { type: EventType.CHARACTER_BANNER, plannerDataAvailable: true });
    expect(component.view?.canPlan).toBeTrue();
  });

  it('does not offer unsupported or data-less banners to the pull planner', () => {
    const component = createComponent();

    setEvent(component, {
      type: EventType.PAID_BANNER,
      gachaId: 50001,
      plannerDataAvailable: true
    });
    expect(component.view?.canPlan).toBeFalse();

    setEvent(component, { type: EventType.CHARACTER_BANNER });
    expect(component.view?.canPlan).toBeFalse();
  });

  it('offers reward-bearing events supplied by the planner index', () => {
    const component = createComponent();
    component.plannerEligible = true;

    setEvent(component, { type: EventType.CAMPAIGN, plannerRewardAvailable: true });

    expect(component.view?.canPlan).toBeTrue();
    expect(component.view?.isRewardOnly).toBeTrue();
  });

  it('renders persisted planner membership immediately', () => {
    const component = createComponent();
    component.planned = true;

    setEvent(component, { type: EventType.CHARACTER_BANNER, gachaId: 10001 });

    expect(component.planQueued).toBeTrue();
  });

  it('toggles planner membership without opening details', () => {
    const component = createComponent();
    const event = setEvent(component, { type: EventType.CHARACTER_BANNER, gachaId: 10001 });
    const stopPropagation = jasmine.createSpy('stopPropagation');
    const mouseEvent = { stopPropagation } as unknown as MouseEvent;
    const addToPlanner = spyOn(component.addToPlanner, 'emit');
    const removeFromPlanner = spyOn(component.removeFromPlanner, 'emit');
    const openDetails = spyOn(component.openDetails, 'emit');

    component.plan(mouseEvent);
    expect(component.planQueued).toBeTrue();

    component.plan(mouseEvent);

    expect(stopPropagation).toHaveBeenCalledTimes(2);
    expect(component.planQueued).toBeFalse();
    expect(addToPlanner).toHaveBeenCalledOnceWith(event);
    expect(removeFromPlanner).toHaveBeenCalledOnceWith(event);
    expect(openDetails).not.toHaveBeenCalled();
  });

  it('emits removal immediately for persisted planner membership', () => {
    const component = createComponent();
    component.planned = true;
    const event = setEvent(component, { type: EventType.CHARACTER_BANNER, gachaId: 10001 });
    const removeFromPlanner = spyOn(component.removeFromPlanner, 'emit');

    component.plan({ stopPropagation: () => undefined } as unknown as MouseEvent);

    expect(component.planQueued).toBeFalse();
    expect(removeFromPlanner).toHaveBeenCalledOnceWith(event);
  });

  it('clears queued planner state when the input event changes', () => {
    const component = createComponent();
    setEvent(component, { id: 'first', type: EventType.CHARACTER_BANNER, gachaId: 10001 });
    component.plan({ stopPropagation: () => undefined } as unknown as MouseEvent);
    expect(component.planQueued).toBeTrue();

    setEvent(component, { id: 'second', type: EventType.SUPPORT_CARD_BANNER, gachaId: 20001 });
    expect(component.planQueued).toBeFalse();
  });

  it('marks cards without an image as having no media', () => {
    const component = createComponent();

    setEvent(component, { imagePath: undefined });
    expect(component.view?.hasMedia).toBeFalse();

    setEvent(component, { imagePath: '/assets/timeline-images/event.webp' });
    expect(component.view?.hasMedia).toBeTrue();
  });

  it('exposes rerun and predicted status in the subdued metadata', () => {
    const component = createComponent();
    setEvent(component, {
      type: EventType.CHARACTER_BANNER,
      isConfirmed: false,
      gachaTypeName: 'group_select',
      tags: ['rerun-banner']
    });

    expect(component.view?.typeLabel).toBe('Character scout');
    expect(component.view?.gachaLabel).toBe('Group select');
    expect(component.view?.isRerun).toBeTrue();
    expect(component.view?.isPredicted).toBeTrue();
    expect(component.view?.metadata).toContain('Character scout');
    expect(component.view?.metadata).toContain('Group select');
    expect(component.view?.metadata).toContain('Rerun');
    expect(component.view?.metadata).toContain('Predicted');
  });

  it('exposes compact track context for race events', () => {
    const component = createComponent();
    setEvent(component, {
      type: EventType.CHAMPIONS_MEETING,
      description: 'Tokyo - Turf<br>2400m - Medium - Counterclockwise<br>Firm - Spring - Sunny'
    });
    expect(component.view?.contextLabel).toBe('Tokyo · 2400m · Medium · Turf');
    expect(component.view?.title).toBe('Champions Meeting: Timeline event');
    expect(component.view?.raceLines).toEqual([
      'Tokyo · Turf',
      '2400m · Medium · Counterclockwise',
      'Firm · Spring · Sunny'
    ]);

    setEvent(component, {
      type: EventType.LEGEND_RACE,
      description: '3200m - Long - Turf'
    });
    expect(component.view?.contextLabel).toBe('3200m · Long · Turf');
    expect(component.view?.raceLines).toEqual([]);
  });

  it('shows the full League of Heroes race setup in the reserved footer', () => {
    const component = createComponent();
    setEvent(component, {
      type: EventType.LEAGUE_OF_HEROES,
      description: '<h2>Target Races</h2><p>Nakayama Turf 1200m (Short) Right Outside Winter Daytime</p>'
    });

    expect(component.view?.raceLines).toEqual([
      'Nakayama · Turf',
      '1200m · Short · Right · Outside',
      'Winter · Daytime'
    ]);
  });

  it('shows two banner pickups and reports the remaining overflow', () => {
    const component = createComponent();
    setEvent(component, {
      type: EventType.SUPPORT_CARD_BANNER,
      pickupCardIds: [30001, 30002, 30003, 30004],
      relatedSupportCards: ['Support A', 'Support B', 'Support C', 'Support D']
    });

    expect(component.view?.avatars.length).toBe(4);
    expect(component.view?.visibleAvatars.length).toBe(2);
    expect(component.view?.visibleAvatars.every(avatar => avatar.kind === 'support')).toBeTrue();
    expect(component.view?.hiddenAvatarCount).toBe(2);
  });

  it('shows every Legend Race participant without an overflow count', () => {
    const component = createComponent();
    setEvent(component, {
      type: EventType.LEGEND_RACE,
      pickupCardIds: [101401, 100101, 101701, 102401],
      relatedCharacters: ['Grass Wonder', 'Special Week', 'Symboli Rudolf', 'Mayano Top Gun']
    });

    expect(component.view?.avatars.length).toBe(4);
    expect(component.view?.visibleAvatars.length).toBe(4);
    expect(component.view?.visibleAvatars.every(avatar => avatar.kind === 'character')).toBeTrue();
    expect(component.view?.hiddenAvatarCount).toBe(0);
  });
});
