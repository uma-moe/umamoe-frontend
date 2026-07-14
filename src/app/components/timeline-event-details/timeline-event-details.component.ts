import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { EventType, TimelineCalculation, TimelineEvent } from '../../models/timeline.model';
import { TimelineAvatar, TimelineAvatarService } from '../../services/timeline-avatar.service';
import { TimelinePredictionInsight, TimelinePredictionService } from '../../services/timeline-prediction.service';
import { CaratPlannerPersistenceService } from '../../services/carat-planner-persistence.service';
import { CaratPlannerTimelineService } from '../../services/carat-planner-timeline.service';
import {
  timelineEventDateLabel,
  timelineEventIcon,
  timelineEventMetadata
} from '../timeline-event-card/timeline-event-card.component';

export interface TimelineEventDetailsData {
  event: TimelineEvent;
  calculation?: TimelineCalculation | null;
}

export interface TimelineEventFact {
  label: string;
  primary: string;
  secondary?: string;
  icon: string;
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
export class TimelineEventDetailsComponent {
  readonly event = this.data.event;
  readonly title: string;
  readonly metadata: string;
  readonly dateLabel: string;
  readonly icon: string;
  readonly characterAvatars: TimelineAvatar[];
  readonly supportAvatars: TimelineAvatar[];
  readonly prediction: TimelinePredictionInsight | null;
  readonly eventFacts: TimelineEventFact[];
  readonly descriptionIsRepresentedByFacts: boolean;
  readonly showAdditionalEventInformation: boolean;
  readonly highlightEventInformation: boolean;
  readonly canPlan: boolean;
  planned: boolean;
  predictionExpanded = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) readonly data: TimelineEventDetailsData,
    private readonly dialogRef: MatDialogRef<TimelineEventDetailsComponent>,
    private readonly avatarService: TimelineAvatarService,
    private readonly predictionService: TimelinePredictionService,
    private readonly plannerPersistence: CaratPlannerPersistenceService,
    private readonly plannerTimeline: CaratPlannerTimelineService
  ) {
    this.title = this.avatarService.getEventDisplayTitle(this.event);
    this.metadata = timelineEventMetadata(this.event);
    this.dateLabel = timelineEventDateLabel(this.event);
    this.icon = timelineEventIcon(this.event.type);
    this.characterAvatars = this.avatarService.getCharacterAvatars(this.event);
    this.supportAvatars = this.avatarService.getSupportAvatars(this.event);
    this.prediction = this.predictionService.buildInsight(this.event, this.data.calculation);
    this.eventFacts = timelineRaceEventFacts(this.event);
    this.descriptionIsRepresentedByFacts = this.eventFacts.length > 0;
    this.showAdditionalEventInformation = this.event.type === EventType.LEAGUE_OF_HEROES
      && this.descriptionIsRepresentedByFacts
      && /<(?:h[1-6]|p|li|div)\b/i.test(this.event.description ?? '');
    this.canPlan = ([EventType.CHARACTER_BANNER, EventType.SUPPORT_CARD_BANNER].includes(this.event.type)
      && Boolean(this.event.plannerDataAvailable || this.event.gachaId || this.event.gachaIds?.length))
      || this.event.plannerRewardAvailable === true;
    this.planned = this.plannerPersistence.isEventActive(this.event.id);
    this.highlightEventInformation = [
      EventType.CHAMPIONS_MEETING,
      EventType.LEAGUE_OF_HEROES,
      EventType.LEGEND_RACE,
      EventType.MASTERS_CHALLENGE,
      EventType.TRAINER_SKILLS_TEST
    ].includes(this.event.type);
  }

  close(): void {
    this.dialogRef.close();
  }

  togglePrediction(): void {
    this.predictionExpanded = !this.predictionExpanded;
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

  trackFact(_index: number, fact: TimelineEventFact): string {
    return fact.label;
  }

}
