import { describe, expect, it } from 'vitest';
import type { RaceCourse } from '@/lib/game-data/racing/courses';
import type { NumberedMeeting } from '@/pages/simulator/courses/cm-presets';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
import { meetingOptions } from './meetings';

const kyoto2200: RaceCourse = {
  course_id: 10808,
  distance: 2200,
  distance_type: 3,
  surface: 1,
  race_track_id: 10008,
  turn: 1,
  course: 1
};

function meeting(number: number, date: string): NumberedMeeting {
  const event = {
    id: `cm-${number}`,
    title: `Champions Meeting ${number}`,
    eventType: 'champions_meeting',
    date: new Date(date),
    description: 'Kyoto - Turf<br>2200m - Medium - Clockwise<br>Firm - Fall - Sunny'
  } as TimelineRecord;
  return { event, number };
}

describe('meeting options', () => {
  const now = new Date('2026-10-20').getTime();

  it('lists coming meetings first, then past ones, on their own course and day', () => {
    const options = meetingOptions({
      meetings: [meeting(19, '2026-08-20'), meeting(21, '2026-11-20'), meeting(20, '2026-09-20')],
      courses: [kyoto2200],
      now
    });

    expect(options.map((option) => option.number)).toEqual([21, 20, 19]);
    expect(options[0]).toMatchObject({
      courseId: 10808,
      timing: 'upcoming',
      day: { season: 3, weather: 1, ground: 1, time: 2 }
    });
    expect(options[1]).toMatchObject({ courseId: 10808, timing: 'past' });
  });

  it('leaves out a meeting whose course the timeline does not pin down', () => {
    const options = meetingOptions({ meetings: [meeting(21, '2026-11-20')], courses: [], now });

    expect(options).toEqual([]);
  });
});
