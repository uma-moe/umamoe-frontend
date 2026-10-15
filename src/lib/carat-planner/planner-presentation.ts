import { plannerCardKind } from './planner-paid-banners';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
import { bannerKind, enabledPlannerTargets, findPlannerEvent, plannerPickupGoals, resolvePlannerPullDate, type CaratPlan, type PlannerGachaEntry, type PlannerTarget } from './carat-planner';
import { timelinePickup, type TimelinePickupCatalog } from '../timeline/timeline-pickups';
import { normalizeRate } from './planner-pull-probability';
import { searchKey } from '../timeline/timeline-search';

/** Include unresolved saved goals so a missing rate never hides an editable goal. */
export function plannerPickupOptions(target: PlannerTarget, gacha: PlannerGachaEntry | undefined, events: TimelineRecord[], catalog: TimelinePickupCatalog) {
  const event = findPlannerEvent(target.eventId, events);
  const published = gacha?.pickups ?? gacha?.featured_pickups ?? [];
  const ids = [...new Set([...(published.length ? published.map(pickup => pickup.pickup_id) : event?.pickupCardIds ?? []), ...plannerPickupGoals(target).map(goal => goal.pickupId)])];
  return ids.filter(id => Number.isFinite(id) && id > 0).map(id => {
    const source = published.find(pickup => pickup.pickup_id === id);
    const index = event?.pickupCardIds.indexOf(id) ?? -1;
    const kind = plannerCardKind(target, gacha);
    const relatedName = (kind === 'support' ? event?.relatedSupportCards : event?.relatedCharacters)?.[index];
    const pickup = timelinePickup(id, catalog, relatedName ?? source?.label, kind);
    const title = kind === 'support' ? event?.relatedSupportCardNames[index] : undefined;
    const name = title && title.toLowerCase() !== pickup.name.toLowerCase() && !/^(?:unknown|support card)[_\s-]*\d+$/i.test(title) ? `${pickup.name} - ${title}` : pickup.name;
    return { ...pickup, name, pickupId: id, rate: normalizeRate(source?.rate ?? Number.NaN), exchangeable: source?.exchangeable !== false };
  });
}

/** Angular's token/name ranking, then upcoming-first and most-recent-past order. */
export function filterPlannerBanners(events: readonly TimelineRecord[], query: string, projectionStart: string, today = new Date().toISOString().slice(0, 10)): TimelineRecord[] {
  const needle = searchKey(query.trim());
  const tokens = query.trim().split(/[^\p{L}\p{N}]+/u).map(searchKey).filter(Boolean);
  const reference = [today, projectionStart].sort().at(-1)!;
  const ranks = new Map<string, number>();
  return events.filter(event => {
    const kind = bannerKind(event);
    if (kind !== 'character' && kind !== 'support' && kind !== 'paid') return false;
    if (!needle) return true;
    const rerun = [event.title, event.eventType, event.gachaTypeName, ...event.tags].some(value => /rerun|re-run|revival|returning|encore/i.test(value ?? ''));
    const values = [event.title, ...event.relatedCharacters, ...event.relatedSupportCards, ...event.relatedSupportCardNames,
      ...(event.pickups ?? []).flatMap(pickup => [pickup.name, pickup.subLabel ?? '', ...(pickup.searchTerms ?? [])]),
      ...event.tags, event.eventType, event.gachaTypeName ?? '', event.gachaLabel ?? '',
      kind === 'character' ? 'uma character trainee scout banner' : 'support card scout banner',
      rerun ? 'rerun re-run revival returning encore' : ''
    ].map(searchKey);
    if (!values.some(value => value.includes(needle)) && !tokens.every(token => values.some(value => value.includes(token)))) return false;
    const [title = '', ...participants] = values;
    ranks.set(event.id, title === needle ? 0 : participants.includes(needle) ? 1 : title.startsWith(needle) ? 2 : participants.some(value => value.startsWith(needle)) ? 3 : 4);
    return true;
  }).sort((left, right) => {
    const rank = (ranks.get(left.id) ?? 4) - (ranks.get(right.id) ?? 4);
    if (needle && rank) return rank;
    const leftDate = left.date.toISOString().slice(0, 10), rightDate = right.date.toISOString().slice(0, 10);
    const leftUpcoming = leftDate >= reference, rightUpcoming = rightDate >= reference;
    if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
    return (leftUpcoming ? leftDate.localeCompare(rightDate) : rightDate.localeCompare(leftDate)) || left.title.toLowerCase().localeCompare(right.title.toLowerCase());
  });
}

interface AnniversaryMarker { id: string; kind: 'anniversary'; date: string; label: string; }
export type PlannerPullPlanItem = AnniversaryMarker | { id: string; kind: 'target'; date: string; target: PlannerTarget; past: boolean; };

export function plannerPullPlanItems(plan: CaratPlan, events: readonly TimelineRecord[], today = new Date().toISOString().slice(0, 10)): PlannerPullPlanItem[] {
  const milestones = new Map<number, AnniversaryMarker>();
  for (const event of events) {
    const match = event.title.match(/\b(\d+(?:\.\d+)?)\s*(?:st|nd|rd|th)?(?:\s*-?\s*year)?\s+anniversary\b/i);
    const anniversary = /\bhalf[-\s]+anniversary\b/i.test(event.title) ? .5 : Number(match?.[1]);
    if (!Number.isFinite(anniversary) || anniversary <= 0) continue;
    const date = event.date.toISOString().slice(0, 10);
    if ((milestones.get(anniversary)?.date ?? '9999') <= date) continue;
    const remainder = anniversary % 100;
    const suffix = remainder >= 11 && remainder <= 13 ? 'th' : anniversary % 10 === 1 ? 'st' : anniversary % 10 === 2 ? 'nd' : anniversary % 10 === 3 ? 'rd' : 'th';
    milestones.set(anniversary, { id: `anniversary:${anniversary}`, kind: 'anniversary', date, label: Number.isInteger(anniversary) ? `${anniversary}${suffix} Anniversary` : `${anniversary}-Year Anniversary` });
  }
  const markers = [...milestones.values()].sort((a, b) => a.date.localeCompare(b.date));
  const targets = enabledPlannerTargets(plan).map(target => {
    const date = resolvePlannerPullDate(target, today);
    return { id: `target:${target.id}`, kind: 'target' as const, date, target, past: Boolean(plan.projectionStartDate && date < plan.projectionStartDate) };
  }).sort((a, b) => Number(a.past) - Number(b.past) || (a.past ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) || a.target.id.localeCompare(b.target.id));
  const items: PlannerPullPlanItem[] = [];
  let previousPullDate = '';
  for (const target of targets) {
    if (!target.past) {
      const preceding = markers.filter(marker => (!plan.projectionStartDate || marker.date >= plan.projectionStartDate) && (!previousPullDate || marker.date > previousPullDate) && marker.date <= target.date).at(-1);
      if (preceding) items.push(preceding);
      previousPullDate = target.date;
    }
    items.push(target);
  }
  return items;
}
