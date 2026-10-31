import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
export interface TimelineEventFact {
  label: string;
  primary: string;
  secondary?: string;
  icon: string;
}

const RACE_EVENT_TYPES = ['champions_meeting', 'league_of_heroes', 'legend_race'];
const COURSE_DIRECTIONS =
  /^(?:(?:right|left)(?:-handed)?|clockwise|counterclockwise|outer|outside|inner|inside)$/i;

const DISTANCE_CATEGORIES =
  /^(?:sprint|short(?:\s+distance)?|mile|medium(?:\s+distance)?|middle(?:\s+distance)?|long(?:\s+distance)?)$/i;

export function timelineCardRaceLines(event: TimelineRecord): string[] {
  if (!event.description || !RACE_EVENT_TYPES.includes(event.eventType)) return [];
  const lines = descriptionLines(event.description);
  const raceLine = lines.find((line) => /\b\d{3,4}\s*m\b/i.test(line));
  if (!raceLine) return [];
  const compact = parseCompactRaceLine(raceLine);
  if (compact)
    return buildRaceFacts(compact).map((fact) =>
      [fact.primary, fact.secondary].filter(Boolean).join(', ')
    );
  const courseLine = lines.find((line) => line !== raceLine && /\b(?:turf|dirt)\b/i.test(line));
  const conditions = lines.find((line) => line !== raceLine && line !== courseLine);
  return [courseLine, raceLine, conditions]
    .filter((line): line is string => Boolean(line))
    .map((line) => splitRaceParts(line).join(', '));
}

export function timelineCardContext(event: TimelineRecord): string {
  if (!event.description || !RACE_EVENT_TYPES.includes(event.eventType)) return '';
  const lines = descriptionLines(event.description);
  const raceLine = lines.find((line) => /\b\d{3,4}m\b/i.test(line));
  if (!raceLine) return '';
  const compact = parseCompactRaceLine(raceLine);
  if (compact)
    return [
      compact.venue,
      compact.distance.replace(/\s+/g, ''),
      compact.distanceCategory,
      compact.surface
    ]
      .filter(Boolean)
      .join(', ');
  const distance = splitRaceParts(raceLine);
  const course = splitRaceParts(
    lines.find((line) => line !== raceLine && /\b(?:turf|dirt)\b/i.test(line)) ?? ''
  );

  return (course.length ? [course[0], distance[0], distance[1], course[1]] : distance.slice(0, 3))
    .filter(Boolean)
    .join(', ');
}

export function timelineRaceEventFacts(event: TimelineRecord): TimelineEventFact[] {
  if (!event.description || !RACE_EVENT_TYPES.includes(event.eventType)) return [];

  const lines =
    event.eventType === 'league_of_heroes'
      ? extractLeagueRaceLines(event.description)
      : descriptionLines(event.description);

  const raceLine = lines.find((line) => /\b\d{3,4}\s*m\b/i.test(line));
  if (!raceLine) return [];

  const compact = parseCompactRaceLine(raceLine);
  if (compact) return buildRaceFacts(compact);

  const distanceParts = splitRaceParts(raceLine);
  const distanceIndex = distanceParts.findIndex((part) => /^\d{3,4}\s*m$/i.test(part));
  if (distanceIndex < 0) return [];

  const courseLine = lines.find((line) => line !== raceLine && /\b(?:turf|dirt)\b/i.test(line));
  const courseParts = courseLine ? splitRaceParts(courseLine) : [];
  const surface = [...courseParts, ...distanceParts].find((part) => /^(?:turf|dirt)$/i.test(part));
  const venue = courseParts.find((part) => part !== surface);
  const distance = distanceParts[distanceIndex]!;
  const distanceCategory = distanceParts.find((part) => DISTANCE_CATEGORIES.test(part));
  const direction = distanceParts.find((part) => COURSE_DIRECTIONS.test(part));
  const conditionsLine = lines.find((line) => line !== raceLine && line !== courseLine);
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
  const distanceSecondary = [info.distanceCategory, info.direction].filter(Boolean).join(', ');

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
      primary: info.conditions.map(titleCase).join(', '),
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

  const trailing = match[5]!
    .replace(/\s*[,/]\s*/g, ' ')
    .split(/\s+/)
    .map((part) => part.trim().replace(/[.;]+$/, ''))
    .filter(Boolean);

  const directions: string[] = [];
  const conditions: string[] = [];
  trailing.forEach((part) =>
    (COURSE_DIRECTIONS.test(part) ? directions : conditions).push(
      COURSE_DIRECTIONS.test(part) ? normalizeDirection(part) : titleCase(part)
    )
  );

  return {
    venue: match[1]!.replace(/[,:]+$/, '').trim(),
    surface: titleCase(match[2]!),
    direction: directions.join(', ') || undefined,
    distance: match[3]!,
    distanceCategory: match[4] ? normalizeDistanceCategory(match[4]) : undefined,
    conditions
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
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function splitRaceParts(value: string): string[] {
  return value
    .split(/\s+(?:-|\u2013|\u2014|·)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeDistanceCategory(value: string): string {
  return titleCase(value.replace(/\s+distance$/i, ''));
}

function normalizeDirection(value: string): string {
  return titleCase(value.replace(/-handed$/i, ''));
}

function titleCase(value: string): string {
  return value.trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
