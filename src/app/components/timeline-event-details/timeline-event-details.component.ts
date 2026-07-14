import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { EventType, TimelineCalculation, TimelineEvent } from '../../models/timeline.model';
import { TimelineAvatar, TimelineAvatarService } from '../../services/timeline-avatar.service';
import {
  TimelinePredictionInsight,
  TimelinePredictionMetric,
  TimelinePredictionService
} from '../../services/timeline-prediction.service';
import { CaratPlannerPersistenceService } from '../../services/carat-planner-persistence.service';
import { CaratPlannerTimelineService } from '../../services/carat-planner-timeline.service';
import { CaratPlannerResourceService } from '../../services/carat-planner-resource.service';
import { PlannerGachaEntry } from '../../models/carat-planner.model';
import { TimelineRewardItem, TimelineRewardSummary } from '../../utils/planner-reward-summary';
import {
  timelineEventDateLabel,
  timelineEventIcon,
  timelineEventMetadata
} from '../timeline-event-card/timeline-event-card.component';

export interface TimelineEventDetailsData {
  event: TimelineEvent;
  calculation?: TimelineCalculation | null;
  rewardSummary?: TimelineRewardSummary | null;
}

export interface TimelineEventFact {
  label: string;
  primary: string;
  secondary?: string;
  icon: string;
}

export interface TimelinePickupRateView {
  avatar: TimelineAvatar;
  rateLabel: string | null;
}

export interface TimelinePredictionMetricGroup {
  key: 'model' | 'schedule' | 'calendar';
  label: string;
  icon: string;
  metrics: TimelinePredictionMetric[];
}

const RACE_EVENT_TYPES = [
  EventType.CHAMPIONS_MEETING,
  EventType.LEAGUE_OF_HEROES,
  EventType.LEGEND_RACE
];

const COURSE_DIRECTIONS = /^(?:(?:right|left)(?:-handed)?|clockwise|counterclockwise|outer|outside|inner|inside)$/i;
const DISTANCE_CATEGORIES = /^(?:sprint|short(?:\s+distance)?|mile|medium(?:\s+distance)?|middle(?:\s+distance)?|long(?:\s+distance)?)$/i;

/**
 * Turns the two public race-description shapes into one compact, semantic summary.
 * Returns no rows when there is not enough information to improve on the original
 * description, allowing the dialog to retain its normal description fallback.
 */
export function timelineRaceEventFacts(event: TimelineEvent): TimelineEventFact[] {
  if (!event.description || !RACE_EVENT_TYPES.includes(event.type)) return [];

  const lines = event.type === EventType.LEAGUE_OF_HEROES
    ? extractLeagueRaceLines(event.description)
    : descriptionLines(event.description);
  const raceLine = lines.find(line => /\b\d{3,4}\s*m\b/i.test(line));
  if (!raceLine) return [];

  const compact = parseCompactRaceLine(raceLine);
  if (compact) return buildRaceFacts(compact);

  const distanceParts = splitRaceParts(raceLine);
  const distanceIndex = distanceParts.findIndex(part => /^\d{3,4}\s*m$/i.test(part));
  if (distanceIndex < 0) return [];

  const courseLine = lines.find(line => line !== raceLine && /\b(?:turf|dirt)\b/i.test(line));
  const courseParts = courseLine ? splitRaceParts(courseLine) : [];
  const surface = [...courseParts, ...distanceParts].find(part => /^(?:turf|dirt)$/i.test(part));
  const venue = courseParts.find(part => part !== surface);
  const distance = distanceParts[distanceIndex];
  const distanceCategory = distanceParts.find(part => DISTANCE_CATEGORIES.test(part));
  const direction = distanceParts.find(part => COURSE_DIRECTIONS.test(part));
  const conditionsLine = lines.find(line => line !== raceLine && line !== courseLine);
  const conditions = conditionsLine ? splitRaceParts(conditionsLine) : [];

  return buildRaceFacts({
    venue,
    surface,
    direction: direction ? titleCase(direction) : undefined,
    distance,
    distanceCategory: distanceCategory ? normalizeDistanceCategory(distanceCategory) : undefined,
    conditions
  });
}

interface ParsedRaceInformation {
  venue?: string;
  surface?: string;
  direction?: string;
  distance: string;
  distanceCategory?: string;
  conditions: string[];
}

function buildRaceFacts(info: ParsedRaceInformation): TimelineEventFact[] {
  const facts: TimelineEventFact[] = [];
  const distanceSecondary = [info.distanceCategory, info.direction].filter(Boolean).join(' · ');

  if (info.venue || info.surface) {
    facts.push({
      label: 'Course',
      primary: info.venue || info.surface!,
      secondary: info.venue ? info.surface : undefined,
      icon: 'landscape'
    });
  }

  facts.push({
    label: 'Distance',
    primary: info.distance.replace(/\s+/g, ''),
    secondary: distanceSecondary || undefined,
    icon: 'straighten'
  });

  if (info.conditions.length) {
    facts.push({
      label: 'Conditions',
      primary: info.conditions.map(titleCase).join(' · '),
      icon: 'partly_cloudy_day'
    });
  }

  // A lone distance is less readable than the original description and is not
  // considered a successful structured parse.
  return facts.length >= 2 ? facts : [];
}

function parseCompactRaceLine(line: string): ParsedRaceInformation | null {
  const normalized = line.replace(/\s+/g, ' ').trim();
  const match = normalized.match(
    /^(.+?)\s+(Turf|Dirt)\s+(\d{3,4}\s*m)\s*(?:\(([^)]+)\))?\s*,?\s*(.*)$/i
  );
  if (!match) return null;

  const trailing = match[5]
    .replace(/\s*[,/]\s*/g, ' ')
    .split(/\s+/)
    .map(part => part.trim().replace(/[.;]+$/, ''))
    .filter(Boolean);
  const directions: string[] = [];
  const conditions: string[] = [];
  trailing.forEach(part => (COURSE_DIRECTIONS.test(part) ? directions : conditions)
    .push(COURSE_DIRECTIONS.test(part) ? normalizeDirection(part) : titleCase(part)));

  return {
    venue: match[1].replace(/[,:]+$/, '').trim(),
    surface: titleCase(match[2]),
    direction: directions.join(' · ') || undefined,
    distance: match[3],
    distanceCategory: match[4] ? normalizeDistanceCategory(match[4]) : undefined,
    conditions,
  };
}

function extractLeagueRaceLines(description: string): string[] {
  const raceSection = description.match(
    /<h2\b[^>]*>\s*(?:eligible|target)\s+races?\s*<\/h2>([\s\S]*?)(?=<h2\b|$)/i
  )?.[1];
  return descriptionLines(raceSection || description);
}

function descriptionLines(description: string): string[] {
  return description
    .replace(/<(?:script|style|figure)\b[^>]*>[\s\S]*?<\/(?:script|style|figure)>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:h[1-6]|p|li|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&gt;/gi, '>')
    .replace(/&lt;/gi, '<')
    .replace(/&quot;|&#34;/gi, '"')
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function splitRaceParts(value: string): string[] {
  return value
    .split(/\s+(?:-|\u2013|\u2014|·)\s+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function normalizeDistanceCategory(value: string): string {
  return titleCase(value.replace(/\s+distance$/i, ''));
}

function normalizeDirection(value: string): string {
  return titleCase(value.replace(/-handed$/i, ''));
}

function titleCase(value: string): string {
  return value.trim().replace(/\b\w/g, letter => letter.toUpperCase());
}

@Component({
  selector: 'app-timeline-event-details',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './timeline-event-details.component.html',
  styleUrls: ['./timeline-event-details.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimelineEventDetailsComponent implements OnInit {
  readonly event = this.data.event;
  readonly title: string;
  readonly metadata: string;
  readonly dateLabel: string;
  readonly icon: string;
  readonly characterAvatars: TimelineAvatar[];
  readonly supportAvatars: TimelineAvatar[];
  readonly prediction: TimelinePredictionInsight | null;
  readonly predictionDateLabel: string;
  readonly predictionMetricGroups: TimelinePredictionMetricGroup[];
  readonly eventFacts: TimelineEventFact[];
  readonly descriptionIsRepresentedByFacts: boolean;
  readonly descriptionIsExcerpt: boolean;
  readonly showAdditionalEventInformation: boolean;
  readonly highlightEventInformation: boolean;
  readonly canPlan: boolean;
  readonly rewardSummary: TimelineRewardSummary | null;
  readonly hasBannerRates: boolean;
  planned: boolean;
  gacha: PlannerGachaEntry | null = null;
  pickupRates: TimelinePickupRateView[] = [];
  ratesLoading = false;
  ratesUnavailable = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) readonly data: TimelineEventDetailsData,
    private readonly dialogRef: MatDialogRef<TimelineEventDetailsComponent>,
    private readonly avatarService: TimelineAvatarService,
    private readonly predictionService: TimelinePredictionService,
    private readonly plannerPersistence: CaratPlannerPersistenceService,
    private readonly plannerTimeline: CaratPlannerTimelineService,
    private readonly plannerResources: CaratPlannerResourceService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.title = this.avatarService.getEventDisplayTitle(this.event);
    this.metadata = timelineEventMetadata(this.event);
    this.dateLabel = timelineEventDateLabel(this.event);
    this.icon = timelineEventIcon(this.event.type);
    this.characterAvatars = this.avatarService.getCharacterAvatars(this.event);
    this.supportAvatars = this.avatarService.getSupportAvatars(this.event);
    this.prediction = this.predictionService.buildInsight(this.event, this.data.calculation);
    this.predictionDateLabel = this.formatPredictionDate();
    this.predictionMetricGroups = this.buildPredictionMetricGroups(this.prediction?.metrics ?? []);
    this.rewardSummary = this.data.rewardSummary ?? null;
    this.eventFacts = timelineRaceEventFacts(this.event);
    this.descriptionIsRepresentedByFacts = this.eventFacts.length > 0;
    this.descriptionIsExcerpt = /(?:\.\.\.|\u2026)\s*$/.test(descriptionLines(this.event.description ?? '').join(' '));
    this.showAdditionalEventInformation = this.event.type === EventType.LEAGUE_OF_HEROES
      && this.descriptionIsRepresentedByFacts
      && /<(?:h[1-6]|p|li|div)\b/i.test(this.event.description ?? '');
    this.canPlan = ([EventType.CHARACTER_BANNER, EventType.SUPPORT_CARD_BANNER].includes(this.event.type)
      && Boolean(this.event.plannerDataAvailable || this.event.gachaId || this.event.gachaIds?.length))
      || this.event.plannerRewardAvailable === true;
    this.planned = this.plannerPersistence.isEventActive(this.event.id);
    this.hasBannerRates = [EventType.CHARACTER_BANNER, EventType.SUPPORT_CARD_BANNER].includes(this.event.type)
      && Boolean(this.event.plannerDataAvailable || this.event.gachaId || this.event.gachaIds?.length);
    this.pickupRates = this.hasBannerRates ? this.buildPickupRates(null) : [];
    this.highlightEventInformation = [
      EventType.CHAMPIONS_MEETING,
      EventType.LEAGUE_OF_HEROES,
      EventType.LEGEND_RACE,
      EventType.MASTERS_CHALLENGE,
      EventType.TRAINER_SKILLS_TEST
    ].includes(this.event.type);
  }

  ngOnInit(): void {
    if (!this.hasBannerRates) return;
    this.ratesLoading = true;
    void this.plannerResources.loadGachasForEvents([this.event])
      .then(([gacha]) => {
        this.gacha = gacha ?? null;
        this.pickupRates = this.buildPickupRates(gacha ?? null);
        this.ratesUnavailable = !gacha;
      })
      .catch(() => {
        this.ratesUnavailable = true;
      })
      .finally(() => {
        this.ratesLoading = false;
        this.cdr.markForCheck();
      });
  }

  close(): void {
    this.dialogRef.close();
  }

  togglePlanner(): void {
    this.planned = !this.planned;
    this.plannerTimeline.setEventActive(this.event, this.planned);
  }

  onImageError(event: Event): void {
    const image = event.target;
    if (image instanceof HTMLImageElement) image.style.display = 'none';
  }

  trackAvatar(_index: number, avatar: TimelineAvatar): string {
    return avatar.key;
  }

  trackMetric(_index: number, metric: { label: string }): string {
    return metric.label;
  }

  trackMetricGroup(_index: number, group: TimelinePredictionMetricGroup): string {
    return group.key;
  }

  trackFact(_index: number, fact: TimelineEventFact): string {
    return fact.label;
  }

  trackReward(_index: number, reward: TimelineRewardItem): string {
    return reward.key;
  }

  trackPickupRate(_index: number, pickup: TimelinePickupRateView): string {
    return pickup.avatar.key;
  }

  rewardIconPath(item: TimelineRewardItem): string {
    if (item.kind === 'free_pulls' && this.event.type === EventType.SUPPORT_CARD_BANNER) {
      return 'assets/images/item/item_icon_00111.webp';
    }
    return item.iconPath;
  }

  get displayedRewards(): TimelineRewardItem[] {
    const items = [...(this.rewardSummary?.items ?? [])];
    const freePulls = Math.max(0, Number(this.gacha?.free_pulls) || 0);
    if (freePulls > 0 && !items.some(item => item.kind === 'free_pulls')) {
      items.push({
        key: 'gacha-free-pulls',
        kind: 'free_pulls',
        amount: freePulls,
        label: `${freePulls} free pulls`,
        countLabel: `${freePulls}`,
        iconPath: this.event.type === EventType.SUPPORT_CARD_BANNER
          ? 'assets/images/item/item_icon_00111.webp'
          : 'assets/images/item/item_icon_00041.webp',
      });
    }
    return items;
  }

  get topRarityLabel(): string | null {
    const rate = [...(this.gacha?.rarity_rates ?? [])]
      .sort((left, right) => right.rarity - left.rarity)[0]?.rate;
    if (!Number.isFinite(rate)) return null;
    const rarity = this.event.type === EventType.SUPPORT_CARD_BANNER ? 'SSR pool' : '3★ pool';
    return `${rarity} ${this.formatRate(rate!)}`;
  }

  get rateSourceLabel(): string {
    return this.gacha?.rates_confidence === 'inferred_standard'
      ? 'Standard rates (estimated)'
      : 'Published banner rates';
  }

  get rateSummaryLabel(): string {
    return [this.topRarityLabel, this.rateSourceLabel].filter(Boolean).join(' · ');
  }

  get freePullSourceUrl(): string | null {
    const source = this.gacha?.free_pulls_source_url?.trim();
    return source && source !== this.event.umapyoiURL ? source : null;
  }

  private buildPickupRates(gacha: PlannerGachaEntry | null): TimelinePickupRateView[] {
    const avatars = this.event.type === EventType.SUPPORT_CARD_BANNER
      ? this.supportAvatars
      : this.characterAvatars;
    const pickupIds = this.event.pickupCardIds ?? [];
    const rates = gacha?.pickups ?? [];
    const byId = new Map(rates.map(rate => [rate.pickup_id, rate.rate]));

    const mapped = avatars.map((avatar, index) => {
      const exact = pickupIds[index] === undefined ? undefined : byId.get(pickupIds[index]);
      const rate = exact ?? rates[index]?.rate;
      return {
        avatar,
        rateLabel: Number.isFinite(rate) ? `${this.formatRate(rate!)} per pull` : null,
      };
    });

    // Related-card metadata can include lower-rarity variants. Once the
    // protected banner rates are loaded, retain only actual featured pickups.
    return gacha?.pickups?.length ? mapped.filter(pickup => pickup.rateLabel !== null) : mapped;
  }

  private formatRate(rate: number): string {
    return new Intl.NumberFormat(undefined, {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 3,
    }).format(rate);
  }

  private formatPredictionDate(): string {
    const date = this.event.globalReleaseDate ?? this.event.estimatedGlobalDate ?? this.event.jpReleaseDate;
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  private buildPredictionMetricGroups(metrics: TimelinePredictionMetric[]): TimelinePredictionMetricGroup[] {
    const definitions: Array<TimelinePredictionMetricGroup & { labels: Set<string> }> = [
      {
        key: 'model',
        label: 'Model',
        icon: 'schema',
        labels: new Set(['Source']),
        metrics: [],
      },
      {
        key: 'schedule',
        label: 'Schedule',
        icon: 'timeline',
        labels: new Set(['Schedule shift', 'Catch-up rate', 'Global anchor', 'JP anchor']),
        metrics: [],
      },
      {
        key: 'calendar',
        label: 'Calendar fit',
        icon: 'calendar_month',
        labels: new Set(['Month shape', 'Weekday', 'Month day', 'Prev char gap', 'Next char gap']),
        metrics: [],
      },
    ];

    metrics.forEach(metric => {
      const group = definitions.find(definition => definition.labels.has(metric.label)) ?? definitions[2];
      group.metrics.push(metric);
    });

    return definitions
      .filter(group => group.metrics.length > 0)
      .map(({ labels: _labels, ...group }) => group);
  }

}
