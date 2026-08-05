import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { EventType, TimelineEvent } from '../../models/timeline.model';
import { TimelineAvatar, TimelineAvatarService } from '../../services/timeline-avatar.service';
import { TimelineRewardItem, TimelineRewardSummary } from '../../utils/planner-reward-summary';

export interface TimelineCompactCardView {
  title: string;
  metadata: string;
  typeLabel: string;
  gachaLabel: string;
  isRerun: boolean;
  isPredicted: boolean;
  dateLabel: string;
  contextLabel: string;
  raceLines: string[];
  icon: string;
  avatars: TimelineAvatar[];
  visibleAvatars: TimelineAvatar[];
  hiddenAvatarCount: number;
  hasMedia: boolean;
  canPlan: boolean;
}

const GACHA_TYPE_LABELS: Record<string, string> = {
  standard_pool: 'Standard pool',
  makeup_debut: 'Makeup debut',
  standard_pickup: '',
  guaranteed: 'Guaranteed',
  group_select: 'Group select',
  twinkle_collection: 'Twinkle collection',
  pick_2: 'Pick 2',
  select_pickup_rerun: 'Pick 2',
  special_guaranteed: 'Special guaranteed',
  select_step_up: 'Select step-up',
  stamp_sheet: 'Stamp sheet',
  select_pickup_stamp_sheet: 'Stamp sheet'
};

const NUMERIC_GACHA_TYPE_LABELS: Record<number, string> = {
  1: 'Standard pool',
  2: 'Makeup debut',
  3: '',
  5: 'Guaranteed',
  10: 'Group select',
  11: 'Twinkle collection',
  12: 'Pick 2',
  13: 'Special guaranteed',
  14: 'Select step-up',
  15: 'Stamp sheet'
};

export function timelineEventTypeLabel(type?: EventType): string {
  switch (type) {
    case EventType.CHARACTER_BANNER: return 'Character scout';
    case EventType.SUPPORT_CARD_BANNER: return 'Support scout';
    case EventType.PAID_BANNER: return 'Paid scout';
    case EventType.STORY_EVENT: return 'Story event';
    case EventType.CHAMPIONS_MEETING: return 'Champions Meeting';
    case EventType.LEGEND_RACE: return 'Legend Race';
    case EventType.CAMPAIGN: return 'Mission campaign';
    case EventType.LEAGUE_OF_HEROES: return 'League of Heroes';
    case EventType.MASTERS_CHALLENGE: return 'Masters Challenge';
    case EventType.TRAINER_SKILLS_TEST: return 'Trainer Skills Test';
    case EventType.FACTOR_RESEARCH: return 'Factor Research';
    case EventType.STRONGEST_TEAM: return 'Strongest Team';
    case EventType.RACING_CARNIVAL: return 'Racing Carnival';
    case EventType.SCENARIO_RELEASE: return 'Training scenario';
    default: return 'Event';
  }
}

export function timelineEventIcon(type?: EventType): string {
  switch (type) {
    case EventType.CHARACTER_BANNER: return 'person';
    case EventType.SUPPORT_CARD_BANNER: return 'style';
    case EventType.PAID_BANNER: return 'payments';
    case EventType.STORY_EVENT: return 'auto_stories';
    case EventType.CHAMPIONS_MEETING: return 'emoji_events';
    case EventType.LEGEND_RACE: return 'sports_motorsports';
    case EventType.LEAGUE_OF_HEROES: return 'groups';
    case EventType.MASTERS_CHALLENGE: return 'military_tech';
    case EventType.TRAINER_SKILLS_TEST: return 'school';
    case EventType.FACTOR_RESEARCH: return 'science';
    case EventType.STRONGEST_TEAM: return 'group_work';
    case EventType.RACING_CARNIVAL: return 'sports_score';
    case EventType.SCENARIO_RELEASE: return 'landscape';
    default: return 'campaign';
  }
}

export function timelineGachaTypeLabel(event: TimelineEvent): string {
  if (event.gachaTypeName && GACHA_TYPE_LABELS[event.gachaTypeName]) {
    return GACHA_TYPE_LABELS[event.gachaTypeName];
  }

  return event.gachaType !== undefined ? NUMERIC_GACHA_TYPE_LABELS[event.gachaType] ?? '' : '';
}

export function timelineEventMetadata(event: TimelineEvent): string {
  const parts = [timelineEventTypeLabel(event.type)];
  const gachaLabel = timelineGachaTypeLabel(event);
  if (gachaLabel) parts.push(gachaLabel);
  if (event.tags?.includes('rerun-banner')) parts.push('Rerun');
  if (!event.isConfirmed) parts.push('Predicted');
  return parts.join(' · ');
}

export function timelineEventContextLabel(event: TimelineEvent): string {
  if (![EventType.CHAMPIONS_MEETING, EventType.LEGEND_RACE, EventType.LEAGUE_OF_HEROES].includes(event.type)) {
    return '';
  }

  const lines = (event.description ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:h[1-6]|p|li|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\n+/)
    .map(line => line.replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const distanceLine = lines.find(line => /\b\d{3,4}m\b/i.test(line));
  if (!distanceLine) return '';

  const compact = distanceLine.match(/^(.+?)\s+(Turf|Dirt)\s+(\d{3,4}\s*m)\s*(?:\(([^)]+)\))?/i);
  if (compact) {
    return [
      compact[1].replace(/[,:]+$/, '').trim(),
      compact[3].replace(/\s+/g, ''),
      compact[4]?.replace(/\s+distance$/i, ''),
      compact[2]
    ].filter((value): value is string => Boolean(value)).join(' · ');
  }

  const distanceParts = distanceLine.split(/\s+-\s+/).map(part => part.trim()).filter(Boolean);
  const courseParts = lines
    .find(line => line !== distanceLine && /\b(?:turf|dirt)\b/i.test(line))
    ?.split(/\s+-\s+/)
    .map(part => part.trim())
    .filter(Boolean) ?? [];
  const values = courseParts.length > 0
    ? [courseParts[0], distanceParts[0], distanceParts[1], courseParts[1]]
    : distanceParts.slice(0, 3);
  return values.filter((value): value is string => Boolean(value)).join(' · ');
}

export function timelineEventRaceLines(event: TimelineEvent): string[] {
  if (![EventType.CHAMPIONS_MEETING, EventType.LEAGUE_OF_HEROES, EventType.LEGEND_RACE].includes(event.type)) {
    return [];
  }

  const lines = (event.description ?? '')
    .replace(/<(?:script|style|figure)\b[^>]*>[\s\S]*?<\/(?:script|style|figure)>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:h[1-6]|p|li|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const raceLine = lines.find(line => /\b\d{3,4}\s*m\b/i.test(line));
  if (!raceLine) return [];

  const compact = raceLine.match(/^(.+?)\s+(Turf|Dirt)\s+(\d{3,4}\s*m)\s*(?:\(([^)]+)\))?\s*,?\s*(.*)$/i);
  if (compact) {
    const trailing = compact[5]
      .replace(/\s*[,/]\s*/g, ' ')
      .split(/\s+/)
      .map(part => part.trim().replace(/[.;]+$/, ''))
      .filter(Boolean);
    const directionPattern = /^(?:(?:right|left)(?:-handed)?|clockwise|counterclockwise|outer|outside|inner|inside)$/i;
    const directions = trailing
      .filter(part => directionPattern.test(part))
      .map(part => titleCaseRacePart(part.replace(/-handed$/i, '')));
    const conditions = trailing.filter(part => !directionPattern.test(part)).map(titleCaseRacePart);
    return [
      [compact[1].replace(/[,:]+$/, '').trim(), titleCaseRacePart(compact[2])].join(' · '),
      [compact[3].replace(/\s+/g, ''), compact[4]?.replace(/\s+distance$/i, ''), ...directions].filter(Boolean).join(' · '),
      conditions.join(' · ')
    ].filter(Boolean);
  }

  const split = (value: string): string[] => value
    .split(/\s+(?:-|\u2013|\u2014|·)\s+/)
    .map(part => part.trim())
    .filter(Boolean);
  const distanceParts = split(raceLine);
  const courseLine = lines.find(line => line !== raceLine && /\b(?:turf|dirt)\b/i.test(line));
  const courseParts = courseLine ? split(courseLine) : [];
  const conditionsLine = lines.find(line => line !== raceLine && line !== courseLine);

  return [
    courseParts.join(' · '),
    distanceParts.join(' · '),
    conditionsLine ? split(conditionsLine).join(' · ') : ''
  ].filter(Boolean);
}

function titleCaseRacePart(value: string): string {
  return value.trim().replace(/\b\w/g, letter => letter.toUpperCase());
}

export function timelineEventDateLabel(event: TimelineEvent): string {
  const start = event.globalReleaseDate ?? event.estimatedGlobalDate ?? event.jpReleaseDate;
  const end = event.estimatedEndDate;
  const full: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };

  if (!end || end.getTime() <= start.getTime()) {
    return start.toLocaleDateString(undefined, full);
  }

  return `${start.toLocaleDateString(undefined, full)} – ${end.toLocaleDateString(undefined, full)}`;
}

@Component({
  selector: 'app-timeline-event-card',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './timeline-event-card.component.html',
  styleUrls: ['./timeline-event-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimelineEventCardComponent implements OnChanges {
  @Input({ required: true }) event!: TimelineEvent;
  @Input() mobile = false;
  @Input() rewardSummary: TimelineRewardSummary | null = null;
  @Input() plannerEligible = false;
  @Input() planned = false;
  @Output() openDetails = new EventEmitter<TimelineEvent>();
  @Output() addToPlanner = new EventEmitter<TimelineEvent>();
  @Output() removeFromPlanner = new EventEmitter<TimelineEvent>();

  view: TimelineCompactCardView | null = null;
  planQueued = false;

  constructor(private readonly avatarService: TimelineAvatarService) {}

  ngOnChanges(): void {
    if (!this.event) return;
    this.planQueued = this.planned;
    const avatars = [
      ...this.avatarService.getCharacterAvatars(this.event),
      ...this.avatarService.getSupportAvatars(this.event)
    ];
    const showAllParticipants = this.event.type === EventType.LEGEND_RACE;
    const visibleAvatarCount = showAllParticipants ? avatars.length : 2;

    const displayTitle = this.avatarService.getEventDisplayTitle(this.event);
    const raceLines = this.event.type === EventType.LEGEND_RACE || avatars.length === 0
      ? timelineEventRaceLines(this.event)
      : [];

    this.view = {
      title: this.event.type === EventType.CHAMPIONS_MEETING && !/^champions meeting\b/i.test(displayTitle)
        ? `Champions Meeting: ${displayTitle}`
        : displayTitle,
      metadata: timelineEventMetadata(this.event),
      typeLabel: timelineEventTypeLabel(this.event.type),
      gachaLabel: timelineGachaTypeLabel(this.event),
      isRerun: this.event.tags?.includes('rerun-banner') === true,
      isPredicted: !this.event.isConfirmed,
      dateLabel: timelineEventDateLabel(this.event),
      contextLabel: timelineEventContextLabel(this.event),
      raceLines,
      icon: timelineEventIcon(this.event.type),
      avatars,
      visibleAvatars: avatars.slice(0, visibleAvatarCount),
      hiddenAvatarCount: Math.max(0, avatars.length - visibleAvatarCount),
      hasMedia: Boolean(this.event.imagePath),
      canPlan: this.plannerEligible
        && [EventType.CHARACTER_BANNER, EventType.SUPPORT_CARD_BANNER].includes(this.event.type)
        && Boolean(this.event.plannerDataAvailable || this.event.gachaId || this.event.gachaIds?.length)
    };
  }

  activate(): void {
    this.openDetails.emit(this.event);
  }

  plan(event: MouseEvent): void {
    event.stopPropagation();
    this.planQueued = !this.planQueued;
    if (this.planQueued) {
      this.addToPlanner.emit(this.event);
    } else {
      this.removeFromPlanner.emit(this.event);
    }
  }

  onImageError(event: Event): void {
    const image = event.target;
    if (image instanceof HTMLImageElement) image.style.display = 'none';
  }

  rewardIconPath(item: TimelineRewardItem): string {
    if (item.kind === 'free_pulls' && this.event.type === EventType.SUPPORT_CARD_BANNER) {
      return 'assets/images/item/item_icon_00111.webp';
    }
    return item.iconPath;
  }

  trackReward(_index: number, item: TimelineRewardItem): string {
    return item.key;
  }

  trackAvatar(_index: number, avatar: TimelineAvatar): string {
    return avatar.key;
  }
}
