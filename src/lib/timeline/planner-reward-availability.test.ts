import { expect, it } from 'vitest';
import { findPlannerEvent } from './carat-planner';
import { plannerRewardAvailabilityWindow, timelineEventIndex } from './planner-reward-availability';
import { normalizedRewardEvents } from '../../../tests/e2e/fixtures/planner-rewards-data';

it('indexes each timeline snapshot and preserves exact IDs, normalized aliases and refreshed dates', () => {
  const sample = normalizedRewardEvents()[0]!;
  const event = { ...sample, id: 'event-one', date: new Date('2026-08-01'), estimatedEndDate: new Date('2026-08-10') };
  const events = [event, { ...event, title: 'duplicate' }];
  expect(timelineEventIndex(events)).toBe(timelineEventIndex(events));
  expect(findPlannerEvent('event-one', events)).toBe(event);
  expect(findPlannerEvent(' EVENT_ONE ', events)).toBe(event);
  expect(findPlannerEvent('missing', events)).toBeUndefined();
  expect(plannerRewardAvailabilityWindow(event.id, ['2026-08-10'], events)).toEqual({ startsAt: '2026-08-01', endsAt: '2026-08-10' });
  const refreshed = [{ ...event, estimatedEndDate: new Date('2026-08-12') }];
  expect(plannerRewardAvailabilityWindow(event.id, ['2026-08-12'], refreshed)).toEqual({ startsAt: '2026-08-01', endsAt: '2026-08-12' });
});
