import { describe, expect, it } from 'vitest';
import {
  toTimelinePreliminaryChanges,
  toTimelinePreliminarySummary
} from '@/lib/timeline/prediction/timeline-prediction-types';
import { buildPreliminaryEventSummary } from './timeline-preliminary';
import { timelineDisplayTitle, timelinePickups } from './timeline-pickups';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';

describe('timeline preliminary helpers', () => {
  it('parses preliminary summary and formats merged banner changes against estimates', () => {
    const summary = toTimelinePreliminarySummary({
      resource_version: '10008800',
      detected_at: '2026-11-24T19:35:00Z',
      cdn_last_modified: 'Tue, 24 Nov 2026 11:14:05 GMT',
      event_ids: ['support-banner-2023_30151'],
      merged_event_ids: ['support-banner-2023_30155']
    });

    expect(summary).toEqual({
      resourceVersion: '10008800',
      detectedAt: '2026-11-24T19:35:00Z',
      cdnLastModified: 'Tue, 24 Nov 2026 11:14:05 GMT',
      eventIds: ['support-banner-2023_30151'],
      mergedEventIds: ['support-banner-2023_30155']
    });

    const changes = toTimelinePreliminaryChanges({
      estimated_release_date: '2026-11-28T22:00:00Z',
      estimated_end_date: '2026-12-22T22:00:00Z',
      estimated_duration_days: 23,
      release_date_shift_days: 3,
      added_pickup_card_ids: [30137, 20060],
      merged_events: [
        {
          event_id: 'support-banner-2023_30155',
          gacha_id: 30155,
          title: 'Darley Arabian + 1 more',
          estimated_release_date: '2026-12-14T22:00:00Z',
          pickup_card_ids: [30137, 20060]
        }
      ],
      preliminary_free_pulls: 120
    });

    const event: TimelineRecord = {
      id: 'support-banner-2023_30151',
      title: 'Mejiro Ramonu + 9 more',
      typeLabel: 'Support scout',
      eventType: 'support_card_banner',
      date: new Date('2026-12-01T22:00:00Z'),
      estimatedEndDate: new Date('2026-12-25T22:00:00Z'),
      dateLabel: 'Dec 1, 2026 – Dec 25, 2026',
      predicted: true,
      preliminary: true,
      preliminaryChanges: changes,
      gachaId: 30151,
      gachaIds: [30151],
      pickupCardIds: [30134, 30137, 20060],
      relatedCharacters: [],
      relatedSupportCards: ['Mejiro Ramonu', 'Darley Arabian'],
      relatedSupportCardNames: ['Radiant', 'Chasing Eternal Glory'],
      plannerRewardAvailable: true,
      tags: ['support-banner']
    };

    const view = buildPreliminaryEventSummary(event, {
      characters: {},
      supports: new Map([
        [
          30137,
          {
            id: '30137',
            name: 'Darley Arabian',
            type: 'group',
            rarity: 3,
            release_date: '2023-03-20',
            cardName: 'Progenitors and Guides',
            cardTitle: '[Chasing Eternal Glory]'
          }
        ]
      ])
    });

    expect(view.shiftLabel).toBe('+3 days');
    expect(view.durationChangeLabel).toBe('23d → 24d');
    expect(view.freePulls).toBe(120);
    expect(view.mergedEvents).toHaveLength(1);
    expect(view.mergedEvents[0]?.gachaId).toBe(30155);
    expect(view.addedPickups[0]?.name).toBe('Progenitors and Guides');
    expect(view.addedPickups[0]?.rarityIcon).toContain('/ui/support-rarities/ssr.webp');
    expect(view.addedPickups[0]?.typeIcon).toContain('/ui/stats/group.webp');
  });

  it('sorts support pickups by rarity descending, puts both SSRs upfront, and maps icons', () => {
    const event: TimelineRecord = {
      id: 'support-banner-2023_30151',
      title: 'Mejiro Ramonu + 9 more',
      typeLabel: 'Support scout',
      eventType: 'support_card_banner',
      date: new Date('2026-12-01T22:00:00Z'),
      dateLabel: 'Dec 1, 2026',
      gachaId: 30151,
      gachaIds: [30151],
      pickupCardIds: [20056, 30134, 10088, 30137],
      relatedCharacters: [],
      relatedSupportCards: ['Jungle Pocket', 'Mejiro Ramonu', 'Mejiro Ramonu', 'Darley Arabian'],
      relatedSupportCardNames: [],
      plannerRewardAvailable: true,
      tags: ['support-banner']
    };

    const catalog = {
      characters: {},
      supports: new Map([
        [20056, { id: '20056', name: 'Jungle Pocket', type: 'speed', rarity: 2, release_date: '' }],
        [
          30134,
          { id: '30134', name: 'Mejiro Ramonu', type: 'intelligence', rarity: 3, release_date: '' }
        ],
        [
          10088,
          { id: '10088', name: 'Mejiro Ramonu', type: 'intelligence', rarity: 1, release_date: '' }
        ],
        [
          30137,
          {
            id: '30137',
            name: 'Darley Arabian',
            cardName: 'Progenitors and Guides',
            type: 'group',
            rarity: 3,
            release_date: ''
          }
        ]
      ])
    };

    event.pickups = timelinePickups(event, catalog);

    expect(event.pickups.map((pickup) => pickup.id)).toEqual(['30134', '30137', '20056', '10088']);
    expect(event.pickups[0]?.rarityIcon).toContain('/ui/support-rarities/ssr.webp');
    expect(event.pickups[0]?.typeIcon).toContain('/ui/stats/wit.webp');
    expect(event.pickups[0]?.supportType).toBe('Wit');
    expect(event.pickups[1]?.name).toBe('Progenitors and Guides');
    expect(event.pickups[1]?.searchTerms).toContain('Darley Arabian');
    expect(timelineDisplayTitle(event)).toBe('Mejiro Ramonu & Progenitors and Guides + 8 more');
  });
});
