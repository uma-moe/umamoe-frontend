import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';
import englishTimelineImagePathsJson from '../../assets/timeline-images/en/manifest.json';
import japaneseTimelineImagePathsJson from '../../assets/timeline-images/jp/manifest.json';
import {
  EventType,
  TimelineAnniversary,
  TimelineCalculation,
  TimelineCalendarLikelihood,
  TimelineCountLikelihood,
  TimelineEvent,
  TimelineEventTypeCalendarLikelihood,
  TimelineFilters,
  TimelineNamedLikelihood,
  TimelinePrediction
} from '../models/timeline.model';
import { ResourceDataService, ResourceLoadError } from './resource-data.service';
import { compareTimelineEventsForDisplay } from '../utils/timeline-event-order';

const TIMELINE_RESOURCE_NAME = 'banner_timeline';
const ENGLISH_TIMELINE_IMAGE_PATHS = englishTimelineImagePathsJson as Record<string, string>;
const JAPANESE_TIMELINE_IMAGE_PATHS = japaneseTimelineImagePathsJson as Record<string, string>;

interface BannerTimelineResource {
  version?: number;
  calculation?: BannerTimelineResourceCalculation;
  anniversaries?: BannerTimelineResourceAnniversary[];
  events?: BannerTimelineResourceEvent[];
}

interface BannerTimelineResourceCalculation {
  jp_launch_date?: string | null;
  global_launch_date?: string | null;
  fallback_acceleration_rate?: number;
  observed_acceleration_rate?: number;
  confirmed_anchor_count?: number;
  character_banner_month_count_likelihoods?: unknown;
  character_banner_gap_likelihoods?: unknown;
  character_banner_weekday_likelihoods?: unknown;
  character_banner_month_day_likelihoods?: unknown;
  event_type_calendar_likelihoods?: unknown;
  latest_closed_global_month?: string | null;
  unconfirmed_schedule_floor?: string | null;
  latest_confirmed_jp_date?: string | null;
  latest_confirmed_global_date?: string | null;
}

interface BannerTimelineResourceAnniversary {
  index?: number;
  label?: string;
  jp_date?: string | null;
  global_date?: string | null;
  is_confirmed?: boolean;
  schedule_adjustment_days?: number | null;
  image_path?: string | null;
  source_event_id?: string | null;
}

interface BannerTimelineResourceEvent {
  id?: string;
  gacha_id?: unknown;
  gacha_ids?: unknown;
  gacha_type?: unknown;
  gacha_type_name?: unknown;
  planner_data_available?: unknown;
  planner_reward_available?: unknown;
  type?: string;
  title?: string;
  description?: string;
  jp_release_date?: string | null;
  global_release_date?: string | null;
  estimated_end_date?: string | null;
  is_confirmed?: boolean;
  banner_duration_days?: number;
  tags?: unknown;
  pickup_card_ids?: unknown;
  pick_up_card_ids?: unknown;
  pickupCardIds?: unknown;
  related_characters?: unknown;
  related_support_cards?: unknown;
  related_support_card_names?: unknown;
  image_path?: string | null;
  gametora_url?: string | null;
  umapyoi_url?: string | null;
  prediction?: BannerTimelineResourcePrediction;
}

interface BannerTimelineResourcePrediction {
  kind?: string;
  acceleration_rate?: number;
  schedule_adjustment_days?: number;
  calendar_likelihood?: BannerTimelineResourceCalendarLikelihood;
  anchor_jp_date?: string | null;
  anchor_global_date?: string | null;
}

interface BannerTimelineResourceCalendarLikelihood {
  month_character_banner_count?: number;
  month_character_banner_count_probability?: number;
  weekday?: string;
  weekday_probability?: number;
  day_of_month?: number;
  day_of_month_probability?: number;
  previous_character_gap_days?: number;
  previous_character_gap_probability?: number;
  next_character_gap_days?: number;
  next_character_gap_probability?: number;
  score?: number;
}

@Injectable({ providedIn: 'root' })
export class TimelineService {
  private readonly eventsSubject = new BehaviorSubject<TimelineEvent[]>([]);
  private readonly anniversariesSubject = new BehaviorSubject<TimelineAnniversary[]>([]);
  private readonly calculationSubject = new BehaviorSubject<TimelineCalculation | null>(null);
  readonly events$ = this.eventsSubject.asObservable();
  readonly anniversaries$ = this.anniversariesSubject.asObservable();
  readonly calculation$ = this.calculationSubject.asObservable();
  readonly loading$: Observable<boolean>;
  readonly error$: Observable<ResourceLoadError | null>;

  private resourceEvents: TimelineEvent[] = [];

  constructor(private resourceData: ResourceDataService) {
    this.error$ = this.resourceData.resourceError(TIMELINE_RESOURCE_NAME);
    this.loading$ = combineLatest([
      this.resourceData.resourcePending(TIMELINE_RESOURCE_NAME),
      this.resourceData.resourceUsingCachedData(TIMELINE_RESOURCE_NAME),
      this.error$
    ]).pipe(
      map(([pending, usingCachedData, error]) => pending && !usingCachedData && !error)
    );

    this.resourceData.watchResource<BannerTimelineResource | null>(
      TIMELINE_RESOURCE_NAME,
      null,
      { useWarmupProof: true }
    ).pipe(
      debounceTime(0)
    ).subscribe(resource => {
      this.resourceEvents = this.processBannerTimelineResource(resource);
      this.calculationSubject.next(this.toTimelineCalculation(resource?.calculation));
      this.anniversariesSubject.next(this.processBannerTimelineAnniversaries(resource));
      this.publishEvents();
    });
  }

  generateTimeline(): void {
    this.publishEvents();
  }

  updateConfirmedEvent(eventId: string, confirmedDate: Date): void {
    if (!this.resourceEvents.some(event => event.id === eventId)) {
      return;
    }

    this.resourceEvents = this.resourceEvents.map(event => {
      if (event.id !== eventId) {
        return event;
      }

      return {
        ...event,
        globalReleaseDate: confirmedDate,
        isConfirmed: true
      };
    });
    this.publishEvents();
  }

  filterEvents(filters: TimelineFilters): Observable<TimelineEvent[]> {
    return this.events$.pipe(
      map(events => {
        let filtered = events;

        if (filters.eventTypes?.length) {
          filtered = filtered.filter(event => filters.eventTypes!.includes(event.type));
        }

        if (filters.showConfirmed !== undefined || filters.showEstimated !== undefined) {
          filtered = filtered.filter(event => {
            if (filters.showConfirmed === false && event.isConfirmed) return false;
            if (filters.showEstimated === false && !event.isConfirmed) return false;
            return true;
          });
        }

        if (filters.searchTerm) {
          const searchLower = filters.searchTerm.toLowerCase();
          filtered = filtered.filter(event =>
            event.title.toLowerCase().includes(searchLower) ||
            event.description?.toLowerCase().includes(searchLower) ||
            event.tags?.some(tag => tag.toLowerCase().includes(searchLower))
          );
        }

        if (filters.dateRange) {
          filtered = filtered.filter(event => {
            const eventDate = event.globalReleaseDate || event.jpReleaseDate;
            return eventDate >= filters.dateRange!.start && eventDate <= filters.dateRange!.end;
          });
        }

        return filtered;
      })
    );
  }

  calculateEndDate(globalDate: Date, durationInDays: number): Date {
    const endDate = new Date(globalDate.getTime());
    endDate.setUTCDate(endDate.getUTCDate() + durationInDays);
    endDate.setUTCHours(22, 0, 0, 0);
    return endDate;
  }

  private publishEvents(): void {
    this.eventsSubject.next([...this.resourceEvents].sort(compareTimelineEventsForDisplay));
  }

  private processBannerTimelineResource(resource: BannerTimelineResource | null): TimelineEvent[] {
    if (!resource || !Array.isArray(resource.events)) {
      return [];
    }

    return resource.events
      .map(event => this.toTimelineEvent(event))
      .filter((event): event is TimelineEvent => event !== null)
      .sort(compareTimelineEventsForDisplay);
  }

  private processBannerTimelineAnniversaries(resource: BannerTimelineResource | null): TimelineAnniversary[] {
    if (!resource || !Array.isArray(resource.anniversaries)) {
      return [];
    }

    return resource.anniversaries
      .map(anniversary => this.toTimelineAnniversary(anniversary))
      .filter((anniversary): anniversary is TimelineAnniversary => anniversary !== null)
      .sort((a, b) => a.globalDate.getTime() - b.globalDate.getTime());
  }

  private toTimelineEvent(event: BannerTimelineResourceEvent): TimelineEvent | null {
    const type = this.toEventType(event.type);
    const jpReleaseDate = this.parseResourceDate(event.jp_release_date);
    const globalReleaseDate = this.parseResourceDate(event.global_release_date);

    if (!event.id || !type || !event.title || !jpReleaseDate) {
      return null;
    }

    const bannerDuration = typeof event.banner_duration_days === 'number'
      ? event.banner_duration_days
      : undefined;
    const estimatedEndDate = this.parseResourceDate(event.estimated_end_date)
      ?? (globalReleaseDate && bannerDuration !== undefined
        ? this.calculateEndDate(globalReleaseDate, bannerDuration)
        : undefined);

    return {
      id: event.id,
      type,
      title: event.title,
      description: typeof event.description === 'string' ? event.description : undefined,
      jpReleaseDate,
      globalReleaseDate,
      estimatedEndDate,
      isConfirmed: event.is_confirmed === true,
      bannerDuration,
      gachaId: this.toOptionalNumber(event.gacha_id),
      gachaIds: this.toNumberArray(event.gacha_ids),
      gachaType: typeof event.gacha_type === 'number' ? event.gacha_type : undefined,
      gachaTypeName: typeof event.gacha_type_name === 'string' ? event.gacha_type_name : undefined,
      plannerDataAvailable: event.planner_data_available === true,
      plannerRewardAvailable: event.planner_reward_available === true,
      tags: this.toStringArray(event.tags),
      pickupCardIds: this.resolvePickupCardIds(event),
      relatedCharacters: this.toStringArray(event.related_characters),
      relatedSupportCards: this.toStringArray(event.related_support_cards),
      relatedSupportCardNames: this.toStringArray(event.related_support_card_names),
      imagePath: this.resolveTimelineImagePath(event.image_path),
      gametoraURL: event.gametora_url || undefined,
      umapyoiURL: event.umapyoi_url || undefined,
      prediction: this.toTimelinePrediction(event.prediction)
    };
  }

  private resolvePickupCardIds(event: BannerTimelineResourceEvent): number[] {
    return this.toNumberArray(
      event.pickup_card_ids
      ?? event.pick_up_card_ids
      ?? event.pickupCardIds
    ) ?? [];
  }

  private toOptionalNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }

  private toTimelineCalculation(calculation?: BannerTimelineResourceCalculation): TimelineCalculation | null {
    if (!calculation) {
      return null;
    }

    return {
      jpLaunchDate: this.parseResourceDate(calculation.jp_launch_date),
      globalLaunchDate: this.parseResourceDate(calculation.global_launch_date),
      fallbackAccelerationRate: typeof calculation.fallback_acceleration_rate === 'number'
        ? calculation.fallback_acceleration_rate
        : undefined,
      observedAccelerationRate: typeof calculation.observed_acceleration_rate === 'number'
        ? calculation.observed_acceleration_rate
        : undefined,
      confirmedAnchorCount: typeof calculation.confirmed_anchor_count === 'number'
        ? calculation.confirmed_anchor_count
        : undefined,
      characterBannerMonthCountLikelihoods: this.toCountLikelihoodArray(calculation.character_banner_month_count_likelihoods),
      characterBannerGapLikelihoods: this.toCountLikelihoodArray(calculation.character_banner_gap_likelihoods),
      characterBannerWeekdayLikelihoods: this.toNamedLikelihoodArray(calculation.character_banner_weekday_likelihoods),
      characterBannerMonthDayLikelihoods: this.toCountLikelihoodArray(calculation.character_banner_month_day_likelihoods),
      eventTypeCalendarLikelihoods: this.toEventTypeCalendarLikelihoods(calculation.event_type_calendar_likelihoods),
      latestClosedGlobalMonth: calculation.latest_closed_global_month || undefined,
      unconfirmedScheduleFloor: this.parseResourceDate(calculation.unconfirmed_schedule_floor),
      latestConfirmedJpDate: this.parseResourceDate(calculation.latest_confirmed_jp_date),
      latestConfirmedGlobalDate: this.parseResourceDate(calculation.latest_confirmed_global_date)
    };
  }

  private toTimelinePrediction(prediction?: BannerTimelineResourcePrediction): TimelinePrediction | undefined {
    if (!prediction || !this.isPredictionKind(prediction.kind)) {
      return undefined;
    }

    return {
      kind: prediction.kind,
      accelerationRate: typeof prediction.acceleration_rate === 'number'
        ? prediction.acceleration_rate
        : undefined,
      scheduleAdjustmentDays: typeof prediction.schedule_adjustment_days === 'number'
        ? prediction.schedule_adjustment_days
        : undefined,
      calendarLikelihood: this.toCalendarLikelihood(prediction.calendar_likelihood),
      anchorJpDate: this.parseResourceDate(prediction.anchor_jp_date),
      anchorGlobalDate: this.parseResourceDate(prediction.anchor_global_date)
    };
  }

  private isPredictionKind(value: string | undefined): value is TimelinePrediction['kind'] {
    return value === 'confirmed'
      || value === 'interpolated'
      || value === 'extrapolated'
      || value === 'fallback';
  }

  private toCalendarLikelihood(value?: BannerTimelineResourceCalendarLikelihood): TimelineCalendarLikelihood | undefined {
    if (
      !value ||
      typeof value.month_character_banner_count !== 'number' ||
      typeof value.month_character_banner_count_probability !== 'number' ||
      typeof value.weekday !== 'string' ||
      typeof value.weekday_probability !== 'number' ||
      typeof value.day_of_month !== 'number' ||
      typeof value.day_of_month_probability !== 'number' ||
      typeof value.score !== 'number'
    ) {
      return undefined;
    }

    return {
      monthCharacterBannerCount: value.month_character_banner_count,
      monthCharacterBannerCountProbability: value.month_character_banner_count_probability,
      weekday: value.weekday,
      weekdayProbability: value.weekday_probability,
      dayOfMonth: value.day_of_month,
      dayOfMonthProbability: value.day_of_month_probability,
      previousCharacterGapDays: typeof value.previous_character_gap_days === 'number'
        ? value.previous_character_gap_days
        : undefined,
      previousCharacterGapProbability: typeof value.previous_character_gap_probability === 'number'
        ? value.previous_character_gap_probability
        : undefined,
      nextCharacterGapDays: typeof value.next_character_gap_days === 'number'
        ? value.next_character_gap_days
        : undefined,
      nextCharacterGapProbability: typeof value.next_character_gap_probability === 'number'
        ? value.next_character_gap_probability
        : undefined,
      score: value.score
    };
  }

  private toEventTypeCalendarLikelihoods(value: unknown): TimelineEventTypeCalendarLikelihood[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map(item => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const record = item as Record<string, unknown>;
        const type = this.toEventType(typeof record['type'] === 'string' ? record['type'] : undefined);
        const samples = record['samples'];
        if (!type || typeof samples !== 'number') {
          return null;
        }

        return {
          type,
          samples,
          weekdayLikelihoods: this.toNamedLikelihoodArray(record['weekday_likelihoods']),
          monthDayLikelihoods: this.toCountLikelihoodArray(record['month_day_likelihoods'])
        };
      })
      .filter((item): item is TimelineEventTypeCalendarLikelihood => item !== null);
  }

  private toCountLikelihoodArray(value: unknown): TimelineCountLikelihood[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map(item => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const record = item as Record<string, unknown>;
        return typeof record['value'] === 'number' &&
          typeof record['samples'] === 'number' &&
          typeof record['probability'] === 'number'
          ? {
            value: record['value'],
            samples: record['samples'],
            probability: record['probability']
          }
          : null;
      })
      .filter((item): item is TimelineCountLikelihood => item !== null);
  }

  private toNamedLikelihoodArray(value: unknown): TimelineNamedLikelihood[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map(item => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const record = item as Record<string, unknown>;
        return typeof record['value'] === 'string' &&
          typeof record['samples'] === 'number' &&
          typeof record['probability'] === 'number'
          ? {
            value: record['value'],
            samples: record['samples'],
            probability: record['probability']
          }
          : null;
      })
      .filter((item): item is TimelineNamedLikelihood => item !== null);
  }

  private toTimelineAnniversary(anniversary: BannerTimelineResourceAnniversary): TimelineAnniversary | null {
    const jpDate = this.parseResourceDate(anniversary.jp_date);
    const globalDate = this.parseResourceDate(anniversary.global_date);

    if (
      typeof anniversary.index !== 'number' ||
      typeof anniversary.label !== 'string' ||
      !jpDate ||
      !globalDate
    ) {
      return null;
    }

    const explicitSource = anniversary.source_event_id
      ? this.resourceEvents.find(event => event.id === anniversary.source_event_id)
      : undefined;
    const inferredSource = this.inferAnniversarySource(jpDate);
    const source = explicitSource ?? inferredSource;

    return {
      index: anniversary.index,
      label: anniversary.label,
      jpDate,
      globalDate,
      isConfirmed: anniversary.is_confirmed === true,
      scheduleAdjustmentDays: typeof anniversary.schedule_adjustment_days === 'number'
        ? anniversary.schedule_adjustment_days
        : undefined,
      imagePath: this.resolveTimelineImagePath(anniversary.image_path) ?? source?.imagePath,
      sourceEventId: anniversary.source_event_id || source?.id
    };
  }

  private inferAnniversarySource(jpDate: Date): TimelineEvent | undefined {
    const targetTime = jpDate.getTime();
    const maximumDistance = 14 * 24 * 60 * 60 * 1000;
    const phaseRank = (title: string): number => {
      const match = title.match(/(?:vol(?:ume)?\.?|part|phase)\s*([0-9]+)/i);
      if (!match) return 0;
      const phase = Number(match[1]);
      return phase === 1 ? 1 : 1 + phase;
    };

    return this.resourceEvents
      .filter(event =>
        event.type === EventType.CAMPAIGN
        && Boolean(event.imagePath)
        && /anniversary/i.test(event.title)
        && Math.abs(event.jpReleaseDate.getTime() - targetTime) <= maximumDistance
      )
      .sort((left, right) => {
        const phaseDifference = phaseRank(left.title) - phaseRank(right.title);
        if (phaseDifference !== 0) return phaseDifference;
        const distanceDifference = Math.abs(left.jpReleaseDate.getTime() - targetTime)
          - Math.abs(right.jpReleaseDate.getTime() - targetTime);
        if (distanceDifference !== 0) return distanceDifference;
        return left.jpReleaseDate.getTime() - right.jpReleaseDate.getTime();
      })[0];
  }

  private resolveTimelineImagePath(imagePath: string | null | undefined): string | undefined {
    return imagePath
      ? ENGLISH_TIMELINE_IMAGE_PATHS[imagePath]
        ?? JAPANESE_TIMELINE_IMAGE_PATHS[imagePath]
        ?? imagePath
      : undefined;
  }

  private toEventType(type: string | undefined): EventType | null {
    switch (type) {
      case EventType.CHARACTER_BANNER:
      case EventType.SUPPORT_CARD_BANNER:
      case EventType.PAID_BANNER:
      case EventType.STORY_EVENT:
      case EventType.TRAINING_EVENT:
      case EventType.CAMPAIGN:
      case EventType.SCENARIO_RELEASE:
      case EventType.GAME_UPDATE:
      case EventType.ANNIVERSARY:
      case EventType.COLLABORATION:
      case EventType.CHAMPIONS_MEETING:
      case EventType.LEGEND_RACE:
      case EventType.LEAGUE_OF_HEROES:
      case EventType.MASTERS_CHALLENGE:
      case EventType.TRAINER_SKILLS_TEST:
      case EventType.FACTOR_RESEARCH:
      case EventType.STRONGEST_TEAM:
      case EventType.RACING_CARNIVAL:
      case EventType.EVENT:
        return type;
      default:
        return null;
    }
  }

  private parseResourceDate(value: string | null | undefined): Date | undefined {
    if (!value) {
      return undefined;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private toStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  private toNumberArray(value: unknown): number[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const numbers = value
      .map(item => typeof item === 'number' ? item : Number(item))
      .filter((item): item is number => Number.isFinite(item));
    return numbers.length > 0 ? numbers : undefined;
  }

}
