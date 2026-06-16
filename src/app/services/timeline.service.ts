import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';
import { TimelineEvent, EventType, TimelineFilters, TimelineAnniversary } from '../models/timeline.model';
import { ResourceDataService, ResourceLoadError } from './resource-data.service';

const TIMELINE_RESOURCE_NAME = 'banner_timeline';

interface BannerTimelineResource {
  version?: number;
  anniversaries?: BannerTimelineResourceAnniversary[];
  events?: BannerTimelineResourceEvent[];
}

interface BannerTimelineResourceAnniversary {
  index?: number;
  label?: string;
  jp_date?: string | null;
  global_date?: string | null;
  is_confirmed?: boolean;
  schedule_adjustment_days?: number | null;
}

interface BannerTimelineResourceEvent {
  id?: string;
  type?: string;
  title?: string;
  description?: string;
  jp_release_date?: string | null;
  global_release_date?: string | null;
  estimated_end_date?: string | null;
  is_confirmed?: boolean;
  banner_duration_days?: number;
  tags?: unknown;
  related_characters?: unknown;
  related_support_cards?: unknown;
  image_path?: string | null;
  gametora_url?: string | null;
}

@Injectable({ providedIn: 'root' })
export class TimelineService {
  private readonly eventsSubject = new BehaviorSubject<TimelineEvent[]>([]);
  private readonly anniversariesSubject = new BehaviorSubject<TimelineAnniversary[]>([]);
  readonly events$ = this.eventsSubject.asObservable();
  readonly anniversaries$ = this.anniversariesSubject.asObservable();
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
    this.eventsSubject.next([...this.resourceEvents].sort((a, b) => this.compareTimelineEvents(a, b)));
  }

  private processBannerTimelineResource(resource: BannerTimelineResource | null): TimelineEvent[] {
    if (!resource || !Array.isArray(resource.events)) {
      return [];
    }

    return resource.events
      .map(event => this.toTimelineEvent(event))
      .filter((event): event is TimelineEvent => event !== null)
      .sort((a, b) => this.compareTimelineEvents(a, b));
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
      tags: this.toStringArray(event.tags),
      relatedCharacters: this.toStringArray(event.related_characters),
      relatedSupportCards: this.toStringArray(event.related_support_cards),
      imagePath: event.image_path || undefined,
      gametoraURL: event.gametora_url || undefined
    };
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

    return {
      index: anniversary.index,
      label: anniversary.label,
      jpDate,
      globalDate,
      isConfirmed: anniversary.is_confirmed === true,
      scheduleAdjustmentDays: typeof anniversary.schedule_adjustment_days === 'number'
        ? anniversary.schedule_adjustment_days
        : undefined
    };
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

  private compareTimelineEvents(a: TimelineEvent, b: TimelineEvent): number {
    const dateA = a.globalReleaseDate || a.estimatedGlobalDate || a.jpReleaseDate;
    const dateB = b.globalReleaseDate || b.estimatedGlobalDate || b.jpReleaseDate;
    return dateA.getTime() - dateB.getTime();
  }
}
