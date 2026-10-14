import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
import { trackName } from '@/lib/catalog/course-catalog';
import { timelineRaceEventFacts } from '@/lib/timeline/timeline-race-facts';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';

export function raceConditions(text: string) {
  const find = (pattern: RegExp, values: Record<string,string>) => values[text.match(pattern)?.[0].toLowerCase() ?? ''];
  return {
    season: find(/spring|summer|autumn|fall|winter/i, {spring:'1',summer:'2',autumn:'3',fall:'3',winter:'4'}),
    weather: find(/sunny|cloudy|rainy|rain|snowy|snow/i, {sunny:'1',cloudy:'2',rain:'3',rainy:'3',snow:'4',snowy:'4'}),
    ground: find(/\b(?:firm|good|yielding|soft|heavy)\b/i, {firm:'1',good:'1',yielding:'2',soft:'3',heavy:'4'})
  };
}

export function cmPreset(event: TimelineRecord, courses: CourseCatalogEntry[]) {
  const facts = timelineRaceEventFacts(event);
  const course = facts.find(fact => fact.label === 'Course'), distance = facts.find(fact => fact.label === 'Distance');
  const text = facts.map(fact => [fact.primary, fact.secondary].filter(Boolean).join(' ')).join(' ');
  const metres = Number(distance?.primary.replace(/[^0-9]/g, ''));
  const surface = /\bDirt\b/i.test(text) ? 2 : /\bTurf\b/i.test(text) ? 1 : undefined;
  const turn = /counterclockwise|left(?:-handed)?/i.test(text) ? 2 : /clockwise|right(?:-handed)?/i.test(text) ? 1 : undefined;
  const candidates = courses.filter(candidate => trackName(candidate.race_track_id).toLowerCase() === course?.primary.toLowerCase()
    && candidate.distance === metres && candidate.surface === surface && (turn === undefined || candidate.turn === turn));
  return { facts, candidates, ...raceConditions(text) };
}
