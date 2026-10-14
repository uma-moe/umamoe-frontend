import { contentUrl } from '@/lib/content-html';
import { loadCharacterNames } from '@/lib/catalog/character-catalog';
import { loadSupportCardCatalog } from '@/lib/catalog/support-card-catalog';
import { timelineImage } from '@/lib/catalog/timeline-artwork';
import { timelinePickups, type TimelinePickupCatalog } from '@/lib/timeline/timeline-pickups';
import { parseResourceDate, toTimelineCalculation, toTimelinePrediction, type TimelinePrediction } from '@/lib/timeline/timeline-prediction-types';
import { resourceRepository } from '@/lib/catalog/resource-repository';
import type { TimelineEventData } from '@/components/timeline-types';
import { compareTimelineEvents, type TimelineAnniversary } from '@/lib/timeline/timeline-layout';
import { QueryCache } from '@/services/data/query-cache';

const cache = new QueryCache();
resourceRepository.onUpdate(name => { if (['banner_timeline', 'character_names', 'support-cards-db'].includes(name)) cache.invalidate('timeline'); });

interface RawTimelineEvent {
  id?: string;
  type?: string;
  title?: string;
  description?: string;
  global_release_date?: string | null;
  estimated_global_date?: string | null;
  estimated_end_date?: string | null;
  jp_release_date?: string | null;
  is_confirmed?: boolean;
  image_path?: string | null;
  image?: string | null;
  gacha_id?: unknown;
  gacha_ids?: unknown;
  gacha_type?: unknown;
  gacha_type_name?: unknown;
  pickup_card_ids?: unknown;
  pick_up_card_ids?: unknown;
  pickupCardIds?: unknown;
  related_characters?: unknown;
  related_support_cards?: unknown;
  related_support_card_names?: unknown;
  planner_data_available?: boolean;
  planner_reward_available?: boolean;
  tags?: unknown;
  banner_duration_days?: number;
  gametora_url?: string;
  umapyoi_url?: string;
  prediction?: Parameters<typeof toTimelinePrediction>[0];
}
interface TimelineResource { events?: RawTimelineEvent[]; anniversaries?: { index?: number; label?: string; jp_date?: string; global_date?: string; source_event_id?: string; image_path?: string; image?: string; is_confirmed?: boolean }[]; calculation?: Parameters<typeof toTimelineCalculation>[0]; }

const typeLabels: Record<string, string> = {
  character_banner: 'Character scout', support_card_banner: 'Support scout', paid_banner: 'Paid scout', story_event: 'Story event', campaign: 'Mission campaign', scenario_release: 'Training scenario', champions_meeting: 'Champions Meeting', legend_race: 'Legend Race', league_of_heroes: 'League of Heroes', masters_challenge: 'Masters Challenge', trainer_skills_test: 'Trainer Skills Test', factor_research: 'Factor Research', strongest_team: 'Strongest Team', racing_carnival: 'Racing Carnival', event: 'Event'
};
const gachaLabels: Record<string, string> = { standard_pool: 'Standard pool', makeup_debut: 'Makeup debut', standard_pickup: '', guaranteed: 'Guaranteed', group_select: 'Group select', twinkle_collection: 'Twinkle collection', pick_2: 'Pick 2', select_pickup_rerun: 'Pick 2', special_guaranteed: 'Special guaranteed', select_step_up: 'Select step-up', stamp_sheet: 'Stamp sheet', select_pickup_stamp_sheet: 'Stamp sheet' };
const gachaTypes: Record<number, string> = { 1: 'Standard pool', 2: 'Makeup debut', 3: '', 5: 'Guaranteed', 10: 'Group select', 11: 'Twinkle collection', 12: 'Pick 2', 13: 'Special guaranteed', 14: 'Select step-up', 15: 'Stamp sheet' };
const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function numbers(value: unknown): number[] { return Array.isArray(value) ? value.map(Number).filter((item) => Number.isFinite(item)) : []; }
function optionalNumber(value: unknown): number | undefined { const parsed = Number(value); return value !== null && value !== '' && Number.isFinite(parsed) ? parsed : undefined; }
function dateValue(event: RawTimelineEvent): Date | undefined {
  const raw = event.global_release_date ?? event.estimated_global_date;
  if (!raw) return undefined;
  const value = new Date(raw);
  return Number.isNaN(value.getTime()) ? undefined : value;
}

export interface TimelineRecord extends TimelineEventData {
  date: Date;
  eventType: string;
  description?: string;
  estimatedEndDate?: Date;
  jpReleaseDate?: Date;
  gachaId?: number;
  gachaIds: number[];
  gachaType?: number;
  gachaTypeName?: string;
  pickupCardIds: number[];
  relatedCharacters: string[];
  relatedSupportCards: string[];
  relatedSupportCardNames: string[];
  plannerRewardAvailable: boolean;
  tags: string[];
  newsUrl?: string;
  gametoraUrl?: string;
  prediction?: TimelinePrediction;
}

export const timelineRepository = {
  load(refresh = false) {
    return cache.get('timeline', 24 * 60 * 60_000, async () => {
      const [resource, characters, supports] = await Promise.all([
        resourceRepository.load<TimelineResource>('banner_timeline', refresh), loadCharacterNames(), loadSupportCardCatalog()
      ]);
      const catalog: TimelinePickupCatalog = { characters, supports: new Map(supports.map(card => [Number(card.id), card])) };
      const events: TimelineRecord[] = (resource.events ?? []).flatMap((event) => {
        const date = dateValue(event);
        if (!event.id || !event.title || !date) return [];
        const relatedCharacters = strings(event.related_characters);
        const relatedSupportCardNames = strings(event.related_support_card_names);
        const context = [...relatedCharacters, ...relatedSupportCardNames].slice(0, 3).join(' · ');
        const estimatedEndDate = parseResourceDate(event.estimated_end_date) ?? (typeof event.banner_duration_days === 'number' ? new Date(date.getTime() + event.banner_duration_days * 86_400_000) : undefined);
        const jpReleaseDate = event.jp_release_date ? new Date(event.jp_release_date) : undefined;
        let dateLabel: string | undefined;
        return [{
          id: event.id,
          title: event.title,
          typeLabel: typeLabels[event.type ?? ''] ?? 'Event',
          eventType: event.type ?? 'event',
          date,
          // Only visible cards need presentation labels; keep the cached resource cheap to prepare.
          get dateLabel() { return dateLabel ??= dateFormatter.format(date) + (estimatedEndDate && estimatedEndDate > date ? ' – ' + dateFormatter.format(estimatedEndDate) : ''); },
          gachaLabel: (typeof event.gacha_type_name === 'string' ? gachaLabels[event.gacha_type_name] : '') || gachaTypes[Number(event.gacha_type)] || '',
          context,
          image: contentUrl(timelineImage(event.image_path, event.type, event.id, contentUrl(event.image), event.type !== 'champions_meeting' || event.is_confirmed === true)),
          predicted: !event.is_confirmed,
          canPlan: ['character_banner', 'support_card_banner', 'paid_banner'].includes(event.type ?? '') && Boolean(event.planner_data_available === true || event.gacha_id || numbers(event.gacha_ids).length),
          rerun: strings(event.tags).includes('rerun-banner'),
          newsUrl: contentUrl(event.umapyoi_url),
          gametoraUrl: contentUrl(event.gametora_url),
          prediction: toTimelinePrediction(event.prediction),
          description: event.description,
          estimatedEndDate: estimatedEndDate && !Number.isNaN(estimatedEndDate.getTime()) ? estimatedEndDate : undefined,
          jpReleaseDate: jpReleaseDate && !Number.isNaN(jpReleaseDate.getTime()) ? jpReleaseDate : undefined,
          gachaId: optionalNumber(event.gacha_id),
          gachaIds: numbers(event.gacha_ids),
          gachaType: optionalNumber(event.gacha_type),
          gachaTypeName: typeof event.gacha_type_name === 'string' ? event.gacha_type_name : undefined,
          pickupCardIds: numbers(event.pickup_card_ids ?? event.pick_up_card_ids ?? event.pickupCardIds),
          relatedCharacters,
          relatedSupportCards: strings(event.related_support_cards),
          relatedSupportCardNames,
          plannerRewardAvailable: event.planner_reward_available === true,
          tags: strings(event.tags)
        }];
      }).sort(compareTimelineEvents);
      const anniversaries: TimelineAnniversary[] = (resource.anniversaries ?? []).flatMap(item => {
        const date = parseResourceDate(item.global_date), jpDate = parseResourceDate(item.jp_date);
        if (!date || !jpDate || typeof item.index !== 'number' || typeof item.label !== 'string') return [];
        const phase = (title: string) => { const match = title.match(/(?:vol(?:ume)?\.?|part|phase)\s*([0-9]+)/i); return match ? Number(match[1]) === 1 ? 1 : 1 + Number(match[1]) : 0; };
        const source = events.find(event => event.id === item.source_event_id) ?? events.filter(event => event.eventType === 'campaign' && event.image && /anniversary/i.test(event.title) && event.jpReleaseDate && Math.abs(event.jpReleaseDate.getTime() - jpDate.getTime()) <= 14 * 86_400_000)
          .sort((a, b) => Math.abs(a.jpReleaseDate!.getTime() - jpDate.getTime()) - Math.abs(b.jpReleaseDate!.getTime() - jpDate.getTime()) || phase(a.title) - phase(b.title))[0];
        return [{ date, label: item.label, predicted: item.is_confirmed !== true, image: contentUrl(timelineImage(item.image_path, undefined, '', contentUrl(item.image))) ?? source?.image }];
      }).sort((a, b) => a.date.getTime() - b.date.getTime());
      for (const event of events) event.pickups = timelinePickups(event, catalog);
      return { events, anniversaries, calculation: toTimelineCalculation(resource.calculation), catalog };
    }, refresh);
  }
};
