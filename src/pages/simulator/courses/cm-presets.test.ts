import { describe, expect, it } from 'vitest';
import type { RaceCourse } from '@/lib/game-data/racing/courses';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
import { meetingTiming, nextMeeting, numberMeetings, raceConditions } from './cm-presets';

const chukyo: RaceCourse = {
  course_id: 10701,
  distance: 1200,
  distance_type: 1,
  surface: 1,
  race_track_id: 10007,
  turn: 2,
  course: 1
};

const meeting = (
  id: string,
  start: string,
  end: string | undefined,
  description?: string
): TimelineRecord =>
  ({
    id,
    title: id,
    eventType: 'champions_meeting',
    date: new Date(start),
    estimatedEndDate: end ? new Date(end) : undefined,
    description
  }) as TimelineRecord;

const now = new Date('2026-10-17T12:00:00Z').getTime();

describe('CM presets', () => {
  it('numbers meetings in schedule order, whatever order the timeline lists them in', () => {
    const events = [
      meeting('third', '2026-10-27', undefined),
      { ...meeting('banner', '2026-01-01', undefined), eventType: 'character_banner' },
      meeting('first', '2026-09-15', undefined),
      meeting('second', '2026-10-07', undefined)
    ];

    const numbered = numberMeetings(events).map((item) => [item.event.id, item.number]);
    expect(numbered).toEqual([
      ['first', 1],
      ['second', 2],
      ['third', 3]
    ]);
  });

  it('tells a running meeting from one still to come or over', () => {
    expect(meetingTiming(meeting('live', '2026-10-15', '2026-10-20'), now)).toBe('live');
    expect(meetingTiming(meeting('soon', '2026-10-27', '2026-11-05'), now)).toBe('upcoming');
    expect(meetingTiming(meeting('over', '2026-10-07', '2026-10-16'), now)).toBe('past');
  });

  it('starts on the next meeting whose announced course is one of ours', () => {
    const meetings = numberMeetings([
      meeting(
        'over',
        '2026-10-07',
        '2026-10-16',
        'Chukyo - Turf<br>1200m - Short - Counterclockwise'
      ),
      meeting('unannounced', '2026-10-20', '2026-10-25'),
      meeting(
        'next',
        '2026-10-27',
        '2026-11-05',
        'Chukyo - Turf<br>1200m - Short - Counterclockwise<br>Firm - Winter - Sunny'
      )
    ]);

    const next = nextMeeting(meetings, [chukyo], now);
    expect(next).toMatchObject({ number: 3, course: { course_id: 10701 } });
    expect(next?.preset).toMatchObject({ ground: '1', season: '4', weather: '1' });
  });

  it('reads Good as the second going, after Firm, as the English game names them', () => {
    const scheduled = raceConditions('Nakayama Turf 2500m Long Clockwise Good Winter Cloudy');
    const captured = raceConditions('Good ground - Cloudy - Winter - Great mood');

    expect(scheduled).toEqual({ ground: '2', season: '4', weather: '2' });
    expect(captured.ground).toBe('2');
    expect(raceConditions('Firm ground').ground).toBe('1');
    expect(raceConditions('Yielding').ground).toBe('2');
  });

  it('has no next meeting when none to come names a course', () => {
    const meetings = numberMeetings([meeting('unannounced', '2026-10-27', '2026-11-05')]);
    expect(nextMeeting(meetings, [chukyo], now)).toBeUndefined();
  });
});
