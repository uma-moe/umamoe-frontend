import type { RaceCourse } from '@/lib/game-data/racing/courses';
import { trackName } from '@/lib/game-data/racing/courses';
import { timelineRaceEventFacts } from '@/lib/timeline/events/timeline-race-facts';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';

export function raceConditions(text: string) {
  const find = (pattern: RegExp, values: Record<string, string>) =>
    values[text.match(pattern)?.[0].toLowerCase() ?? ''];

  return {
    season: find(/spring|summer|autumn|fall|winter/i, {
      spring: '1',
      summer: '2',
      autumn: '3',
      fall: '3',
      winter: '4'
    }),
    weather: find(/sunny|cloudy|rainy|rain|snowy|snow/i, {
      sunny: '1',
      cloudy: '2',
      rain: '3',
      rainy: '3',
      snow: '4',
      snowy: '4'
    }),
    // The English game calls the second going Good, after Firm; Yielding is the same going by another name.
    ground: find(/\b(?:firm|good|yielding|soft|heavy)\b/i, {
      firm: '1',
      good: '2',
      yielding: '2',
      soft: '3',
      heavy: '4'
    })
  };
}

export function cmPreset(event: TimelineRecord, courses: RaceCourse[]) {
  const facts = timelineRaceEventFacts(event);
  const course = facts.find((fact) => fact.label === 'Course'),
    distance = facts.find((fact) => fact.label === 'Distance');

  const text = facts
    .map((fact) => [fact.primary, fact.secondary].filter(Boolean).join(' '))
    .join(' ');

  const metres = Number(distance?.primary.replace(/[^0-9]/g, ''));
  let surface: number | undefined;
  if (/\bDirt\b/i.test(text)) surface = 2;
  else if (/\bTurf\b/i.test(text)) surface = 1;
  let turn: number | undefined;
  if (/counterclockwise|left(?:-handed)?/i.test(text)) turn = 2;
  else if (/clockwise|right(?:-handed)?/i.test(text)) turn = 1;
  const candidates = courses.filter(
    (candidate) =>
      trackName(candidate.race_track_id).toLowerCase() === course?.primary.toLowerCase() &&
      candidate.distance === metres &&
      candidate.surface === surface &&
      (turn === undefined || candidate.turn === turn)
  );

  return { facts, candidates, ...raceConditions(text) };
}

export type CmPreset = ReturnType<typeof cmPreset>;

export interface NumberedMeeting {
  event: TimelineRecord;
  /** Its place in the global schedule: the first Champions Meeting is CM 1. */
  number: number;
}

/** Every Champions Meeting on the timeline, oldest first, with its number. */
export function numberMeetings(events: TimelineRecord[]): NumberedMeeting[] {
  return events
    .filter((event) => event.eventType === 'champions_meeting')
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((event, index) => ({ event, number: index + 1 }));
}

/** Whether a meeting is running, still to come, or over; one without an end date lasts its first day. */
export type MeetingTiming = 'live' | 'upcoming' | 'past';

export function meetingTiming(event: TimelineRecord, now: number): MeetingTiming {
  const end = (event.estimatedEndDate ?? event.date).getTime();
  if (end < now) return 'past';

  return event.date.getTime() <= now ? 'live' : 'upcoming';
}

export interface NextMeeting extends NumberedMeeting {
  preset: CmPreset;
  course: RaceCourse;
}

/**
 * The meeting a player prepares for: the running or next one whose announced course names exactly one of ours. A
 * meeting with no course yet, or with two layouts to choose between, is passed over.
 */
export function nextMeeting(
  meetings: NumberedMeeting[],
  courses: RaceCourse[],
  now: number
): NextMeeting | undefined {
  for (const meeting of meetings) {
    if (meetingTiming(meeting.event, now) === 'past') continue;

    const preset = cmPreset(meeting.event, courses);
    const [course] = preset.candidates;
    if (course && preset.candidates.length === 1) return { ...meeting, preset, course };
  }

  return undefined;
}
