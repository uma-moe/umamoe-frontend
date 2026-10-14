import { expect, it } from 'vitest';
import { buildTimelineFeed, buildTimelineLanes, timelineEndDate, timelineMonths, timelinePosition } from './timeline-layout';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';

const event = (id: string, day: string, eventType = 'character_banner'): TimelineRecord => ({ id, date: new Date(day), eventType, title: id, dateLabel: '', typeLabel: '', gachaIds: [], pickupCardIds: [], relatedCharacters: [], relatedSupportCards: [], relatedSupportCardNames: [], plannerRewardAvailable: false, tags: [] });

it('packs compact lanes while preserving calendar spacing, ordering and marker interpolation', () => {
  const events = [event('campaign', '2026-09-01T00:00:00Z', 'campaign'), event('support', '2026-09-01T22:00:00Z', 'support_card_banner'), event('character', '2026-09-01T23:00:00Z'), event('next', '2026-12-01T00:00:00Z')];
  const compact = buildTimelineLanes(events, [], timelineEndDate(events), true, true);
  expect(compact.map(lane => lane.position)).toEqual([24, 325]);
  expect(compact[0]!.events.map(item => item.id)).toEqual(['character', 'support', 'campaign']);
  const date = compact[0]!.date;
  expect(compact[0]!.label).toBe(date.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }).replace(/[.,]+$/u, '') + '\u2003' + date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).replace(/,/gu, ''));
  const calendar = buildTimelineLanes(events, [], timelineEndDate(events), false, true);
  expect(calendar[1]!.position).toBe(1585);
  expect(calendar[1]!.gapDays).toBe(91);
  expect(timelinePosition(calendar, new Date('2026-10-16T12:00:00Z'))).toBe(804.5);
  expect(timelineMonths(calendar).spans.map(month => month.key)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
  expect(timelineMonths(compact,true).spans.map(month => month.key)).toEqual(['2026-09', '2026-12']);
  // A release on the first belongs inside its own month, including the card's left edge.
  expect(timelineMonths(compact).spans.at(-1)!.position).toBe(compact.at(-1)!.position);
  const anniversary = { date: events[0]!.date, label: 'Anniversary', predicted: true };
  expect(buildTimelineLanes(events, [anniversary], timelineEndDate(events), true, false).map(lane => lane.markers.map(marker => marker.type))).toEqual([['launch'], ['anniversary'], []]);
  expect(compact.every(lane => !lane.markers.length)).toBe(true);
});

it('keeps mobile year/today/anniversary rows and UTC rollover while placing ads only after event groups', () => {
  const events = Array.from({ length: 30 }, (_, index) => event(String(index), `2026-09-${String(index + 1).padStart(2, '0')}T22:00:00Z`));
  const anniversary = { date: events[0]!.date, label: 'Anniversary', predicted: false };
  const rows = buildTimelineFeed(events, [anniversary], timelineEndDate(events, true), new Date('2026-09-01T12:00:00Z'));
  expect(rows.filter(row => row.key.startsWith('2026-09-01')).map(row => row.marker?.type ?? 'event')).toEqual(['today', 'event', 'anniversary']);
  expect(rows.find(row => row.events[0]?.id === '0')!.days).toBe(1);
  expect(rows.find(row => row.marker?.type === 'today')!.days).toBe(0);
  expect(rows.filter(row => row.adIndex).map(row => [row.events[0]!.id, row.adIndex])).toEqual([['4', 1], ['12', 2], ['20', 3], ['28', 4]]);
  expect(rows.some(row => row.marker?.type === 'year' && row.marker.label === '2026')).toBe(true);
  expect(buildTimelineFeed([], [anniversary], timelineEndDate(events, true), new Date('2026-09-01T22:00:00Z')).every(row => row.marker)).toBe(true);
});

it('uses each configured timeline ad once and keeps placements near Today in a long feed', () => {
  const events = Array.from({ length: 200 }, (_, index) => event(String(index), new Date(Date.UTC(2026, 0, 1 + index, 22)).toISOString()));
  const now = events[150]!.date;
  const ads = buildTimelineFeed(events, [], timelineEndDate(events, true), now).filter(row => row.adIndex);
  expect(ads.map(row => row.adIndex)).toEqual([1, 2, 3, 4]);
  expect(ads.every(row => Math.abs(row.date.getTime() - now.getTime()) <= 16 * 86_400_000)).toBe(true);
});
