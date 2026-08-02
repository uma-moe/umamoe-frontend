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
    expect(component.view?.raceLines.length).toBe(1);
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

  it('uses the character skin name as a bracketed variant', () => {
    const component = createComponent();
    setEvent(component, {
      type: EventType.CHARACTER_BANNER,
      pickupCardIds: [100102],
      relatedCharacters: ['Special Week']
    });

    expect(component.view?.avatars[0].displayName).toBe('Special Week [Summer]');
    expect(component.view?.title).toBe('Special Week [Summer]');
  });

  it('labels support cards with their training specialty', () => {
    const component = createComponent();
    setEvent(component, {
      type: EventType.SUPPORT_CARD_BANNER,
      pickupCardIds: [30001],
      relatedSupportCards: ['Special Week']
    });

    expect(component.view?.avatars[0].subLabel).toBe('SSR · Guts Support');
  });
});
