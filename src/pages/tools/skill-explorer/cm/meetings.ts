import type { RaceCourse } from '@/lib/game-data/racing/courses';
import {
  cmPreset,
  meetingTiming,
  type MeetingTiming,
  type NumberedMeeting
} from '@/pages/simulator/courses/cm-presets';
import type { RaceDay } from './race-day';

/** A Champions Meeting the explorer can show: its course's values on its race day. */
export interface MeetingOption {
  number: number;
  timing: MeetingTiming;
  courseId: number;
  /** Its race day, from the timeline's announced conditions. */
  day?: RaceDay;
}

function dayOf(preset: ReturnType<typeof cmPreset>): RaceDay | undefined {
  const { season, weather, ground } = preset;
  if (season === undefined || weather === undefined || ground === undefined) return undefined;
  return { season: Number(season), weather: Number(weather), ground: Number(ground) };
}

/**
 * Every meeting worth picking: the timeline's meetings that name exactly one of our courses. Coming meetings first,
 * soonest at the top; then past ones, latest first.
 */
export function meetingOptions({
  meetings,
  courses,
  now
}: {
  meetings: NumberedMeeting[];
  courses: RaceCourse[];
  now: number;
}): MeetingOption[] {
  const options: MeetingOption[] = [];
  for (const meeting of meetings) {
    const preset = cmPreset(meeting.event, courses);
    const [course, ...others] = preset.candidates;
    if (course === undefined || others.length > 0) continue;

    options.push({
      number: meeting.number,
      timing: meetingTiming(meeting.event, now),
      courseId: course.course_id,
      day: dayOf(preset)
    });
  }

  const coming = options
    .filter((option) => option.timing !== 'past')
    .sort((left, right) => left.number - right.number);
  const past = options
    .filter((option) => option.timing === 'past')
    .sort((left, right) => right.number - left.number);
  return [...coming, ...past];
}
