import { EventType, TimelineEvent } from '../../models/timeline.model';
import { TimelineAvatarService } from '../../services/timeline-avatar.service';
import { TimelinePredictionService } from '../../services/timeline-prediction.service';
import { TimelineEventDetailsComponent, timelineRaceEventFacts } from './timeline-event-details.component';

function raceEvent(type: EventType, description: string): TimelineEvent {
  return {
    id: 'race-event',
    type,
    title: 'Race event',
    description,
    jpReleaseDate: new Date('2025-01-01T00:00:00Z'),
    isConfirmed: true
  };
}

describe('timelineRaceEventFacts', () => {
  it('separates Champions Meeting course, distance, and conditions', () => {
    const facts = timelineRaceEventFacts(raceEvent(
      EventType.CHAMPIONS_MEETING,
      'Tokyo - Turf<br>1600m - Mile - Counterclockwise<br>Firm - Spring - Sunny'
    ));

    expect(facts).toEqual([
      { label: 'Course', primary: 'Tokyo', secondary: 'Turf', icon: 'landscape' },
      { label: 'Distance', primary: '1600m', secondary: 'Mile · Counterclockwise', icon: 'straighten' },
      { label: 'Conditions', primary: 'Firm · Spring · Sunny', icon: 'partly_cloudy_day' }
    ]);
  });

  it('keeps a partial Legend Race course readable without inventing a venue', () => {
    const facts = timelineRaceEventFacts(raceEvent(
      EventType.LEGEND_RACE,
      '3200m - Long - Turf'
    ));

    expect(facts).toEqual([
      { label: 'Course', primary: 'Turf', secondary: undefined, icon: 'landscape' },
      { label: 'Distance', primary: '3200m', secondary: 'Long', icon: 'straighten' }
    ]);
  });

  it('extracts only the race setup from a long League of Heroes news post', () => {
    const facts = timelineRaceEventFacts(raceEvent(
      EventType.LEAGUE_OF_HEROES,
      '<h2 class="heading">Target Races</h2>Nakayama Turf 1200m (short distance), right, outside, winter, daytime<br>Weather and track conditions will be determined at random.<h2>Team Formation</h2>Long article body'
    ));

    expect(facts).toEqual([
      { label: 'Course', primary: 'Nakayama', secondary: 'Turf', icon: 'landscape' },
      { label: 'Distance', primary: '1200m', secondary: 'Short · Right · Outside', icon: 'straighten' },
      { label: 'Conditions', primary: 'Winter · Daytime', icon: 'partly_cloudy_day' }
    ]);
  });

  it('parses the space-delimited League of Heroes source shape', () => {
    const facts = timelineRaceEventFacts(raceEvent(
      EventType.LEAGUE_OF_HEROES,
      '<h2>Eligible Races</h2><p>Tokyo Turf 1600m (Mile) Left-handed Winter Daytime</p><h2>Team Formation</h2><p>Rules</p>'
    ));

    expect(facts).toEqual([
      { label: 'Course', primary: 'Tokyo', secondary: 'Turf', icon: 'landscape' },
      { label: 'Distance', primary: '1600m', secondary: 'Mile · Left', icon: 'straighten' },
      { label: 'Conditions', primary: 'Winter · Daytime', icon: 'partly_cloudy_day' }
    ]);
  });

  it('falls back to the normal description when race data cannot be parsed', () => {
    expect(timelineRaceEventFacts(raceEvent(
      EventType.CHAMPIONS_MEETING,
      'Course information will be announced later.'
    ))).toEqual([]);
  });

  it('does not reinterpret non-race descriptions', () => {
    expect(timelineRaceEventFacts(raceEvent(
      EventType.STORY_EVENT,
      'Tokyo Turf 1600m (mile), left, spring'
    ))).toEqual([]);
  });
});

describe('TimelineEventDetailsComponent planner action', () => {
  it('toggles planner membership in place without closing the dialog', () => {
    const event = raceEvent(EventType.CHARACTER_BANNER, 'Banner');
    event.gachaId = 30100;
    const close = jasmine.createSpy('close');
    const setEventActive = jasmine.createSpy('setEventActive');
    const component = new TimelineEventDetailsComponent(
      { event, plannerEnabled: true },
      { close } as never,
      new TimelineAvatarService(),
      new TimelinePredictionService(),
      { isEventActive: () => false } as never,
      { setEventActive } as never,
      { loadGachasForEvents: () => Promise.resolve([]) } as never,
      { markForCheck: () => undefined } as never,
    );

    component.togglePlanner();
    expect(component.planned).toBeTrue();
    expect(setEventActive).toHaveBeenCalledOnceWith(event, true);
    expect(close).not.toHaveBeenCalled();

    component.togglePlanner();
    expect(component.planned).toBeFalse();
    expect(setEventActive).toHaveBeenCalledWith(event, false);
    expect(close).not.toHaveBeenCalled();
  });

  it('allows locally summarized reward events even without a server eligibility flag', () => {
    const event = raceEvent(EventType.LEGEND_RACE, '3200m - Long - Turf');
    const setEventActive = jasmine.createSpy('setEventActive');
    const component = new TimelineEventDetailsComponent(
      { event, plannerEnabled: true, rewardSummary: { eventId: event.id } as never },
      { close: () => undefined } as never,
      new TimelineAvatarService(),
      new TimelinePredictionService(),
      { isEventActive: () => false } as never,
      { setEventActive } as never,
      {} as never,
      { markForCheck: () => undefined } as never,
    );

    expect(component.canPlan).toBeTrue();
    component.togglePlanner();
    expect(setEventActive).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ id: event.id, plannerRewardAvailable: true }),
      true,
    );
  });
});
