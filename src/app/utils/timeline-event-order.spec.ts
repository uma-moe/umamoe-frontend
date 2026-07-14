import { EventType, TimelineEvent } from '../models/timeline.model';
import { compareTimelineEventsForDisplay } from './timeline-event-order';

describe('compareTimelineEventsForDisplay', () => {
  it('orders same-day events as character, support, paid, main events, and campaigns', () => {
    const events = [
      event('campaign', EventType.CAMPAIGN),
      event('story', EventType.STORY_EVENT),
      event('support', EventType.SUPPORT_CARD_BANNER),
      event('champions', EventType.CHAMPIONS_MEETING),
      event('character', EventType.CHARACTER_BANNER),
      event('paid', EventType.PAID_BANNER),
    ];

    expect(events.sort(compareTimelineEventsForDisplay).map(item => item.id)).toEqual([
      'character',
      'support',
      'paid',
      'story',
      'champions',
      'campaign',
    ]);
  });

  it('keeps chronological order before applying the same-day category order', () => {
    const laterCharacter = event('later-character', EventType.CHARACTER_BANNER, '2026-08-02');
    const earlierCampaign = event('earlier-campaign', EventType.CAMPAIGN, '2026-08-01');

    expect([laterCharacter, earlierCampaign].sort(compareTimelineEventsForDisplay).map(item => item.id))
      .toEqual(['earlier-campaign', 'later-character']);
  });

  it('applies category order before timestamp differences within one UTC day', () => {
    const campaign = event('campaign', EventType.CAMPAIGN);
    campaign.globalReleaseDate = new Date('2026-08-01T01:00:00Z');
    const character = event('character', EventType.CHARACTER_BANNER);
    character.globalReleaseDate = new Date('2026-08-01T23:00:00Z');

    expect([campaign, character].sort(compareTimelineEventsForDisplay).map(item => item.id))
      .toEqual(['character', 'campaign']);
  });
});

function event(id: string, type: EventType, date = '2026-08-01'): TimelineEvent {
  return {
    id,
    type,
    title: id,
    jpReleaseDate: new Date(`${date}T00:00:00Z`),
    globalReleaseDate: new Date(`${date}T00:00:00Z`),
    isConfirmed: true,
  };
}
