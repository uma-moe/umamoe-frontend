import type { TimelinePickup } from '@/components/cards/timeline-types';
import {
  pickupRarityRank,
  timelineDisplayTitle,
  timelinePickup,
  type TimelinePickupCatalog
} from './timeline-pickups';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';

export interface PreliminaryMergedItem {
  eventId: string;
  gachaId?: number;
  title: string;
  estimatedDateLabel?: string;
}

export interface PreliminaryEventSummary {
  event: TimelineRecord;
  title: string;
  releaseDateLabel: string;
  estimatedDateLabel?: string;
  shiftLabel?: string;
  durationChangeLabel?: string;
  mergedEvents: PreliminaryMergedItem[];
  addedPickups: TimelinePickup[];
  removedPickups: TimelinePickup[];
  freePulls?: number;
}

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC'
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short'
});

export function formatPreliminaryDate(date?: Date): string | undefined {
  if (!date || Number.isNaN(date.getTime())) return undefined;
  return shortDateFormatter.format(date);
}

export function formatPreliminaryTimestamp(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return dateTimeFormatter.format(parsed);
}

export function formatShiftDays(shiftDays?: number): string | undefined {
  if (typeof shiftDays !== 'number' || shiftDays === 0) return undefined;
  const abs = Math.abs(shiftDays);
  const unit = abs === 1 ? 'day' : 'days';
  return `${shiftDays > 0 ? '+' : '-'}${abs} ${unit}`;
}

export function buildPreliminaryEventSummary(
  event: TimelineRecord,
  catalog: TimelinePickupCatalog
): PreliminaryEventSummary {
  const changes = event.preliminaryChanges;
  const kind = event.eventType === 'support_card_banner' ? 'support' : 'character';
  const resolveCards = (cardIds: number[]): TimelinePickup[] =>
    cardIds
      .map((cardId, order) => ({
        pickup: timelinePickup(cardId, catalog, undefined, kind),
        rarity: pickupRarityRank(cardId, kind, catalog),
        order
      }))
      .sort((left, right) => right.rarity - left.rarity || left.order - right.order)
      .map((entry) => entry.pickup);

  const actualDurationDays =
    event.estimatedEndDate && event.estimatedEndDate > event.date
      ? Math.round((event.estimatedEndDate.getTime() - event.date.getTime()) / 86_400_000)
      : undefined;

  const durationChangeLabel =
    typeof changes?.estimatedDurationDays === 'number' &&
    typeof actualDurationDays === 'number' &&
    changes.estimatedDurationDays !== actualDurationDays
      ? `${changes.estimatedDurationDays}d → ${actualDurationDays}d`
      : undefined;

  return {
    event,
    title: timelineDisplayTitle(event),
    releaseDateLabel: shortDateFormatter.format(event.date),
    estimatedDateLabel: formatPreliminaryDate(changes?.estimatedReleaseDate),
    shiftLabel: formatShiftDays(changes?.releaseDateShiftDays),
    durationChangeLabel,
    mergedEvents: (changes?.mergedEvents ?? []).map((merged) => ({
      eventId: merged.eventId,
      gachaId: merged.gachaId,
      title: merged.title,
      estimatedDateLabel: formatPreliminaryDate(merged.estimatedReleaseDate)
    })),
    addedPickups: resolveCards(changes?.addedPickupCardIds ?? []),
    removedPickups: resolveCards(changes?.removedPickupCardIds ?? []),
    freePulls:
      typeof changes?.preliminaryFreePulls === 'number' && changes.preliminaryFreePulls > 0
        ? changes.preliminaryFreePulls
        : undefined
  };
}
