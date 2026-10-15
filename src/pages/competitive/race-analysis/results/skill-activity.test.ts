import { describe, expect, it } from 'vitest';
import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import type { HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';
import { makeDemoRaces } from '@/pages/competitive/demo-races';
import { skillActivityRows, skillIconGroups } from './skill-activity';

const base = makeDemoRaces(1)[0]!;
function capture(
  spans?: HorseDiagnostics['activeSkillSpans'],
  events: ParsedRaceCapture['events'] = []
): ParsedRaceCapture {
  return {
    ...base,
    events,
    detailed:
      spans === undefined
        ? undefined
        : {
            engineBuild: 'test',
            seed: 1,
            replay: { data: '' },
            annotations: {
              schemaVersion: 7,
              flags: {},
              horses: [{ horseIndex: 0, spans: [], activeSkillSpans: spans }]
            }
          }
  };
}

describe('skill activity periods', () => {
  it('groups overlapping icons without losing activation times or duration details', () => {
    const groups = skillIconGroups(
      [
        { id: 10, periods: [{ start: 0 }, { start: 60, end: 65 }] },
        { id: 20, periods: [{ start: 1 }, { start: 100 }] }
      ],
      0,
      100,
      200
    );

    expect(groups.map((group) => group.events.map((event) => event.period.start))).toEqual([
      [0, 1],
      [60],
      [100]
    ]);
    expect(groups[1]!.events[0]!.period.end).toBe(65);
    [7, 60, 93].forEach((left, index) => expect(groups[index]!.left).toBeCloseTo(left));
  });

  it('combines overlapping effects without double-counting and keeps later activations separate', () => {
    const rows = skillActivityRows(
      capture([
        { skillId: 10, detailIndex: 0, startTime: 2, endTime: 5 },
        { skillId: 10, detailIndex: 1, startTime: 3, endTime: 7 },
        { skillId: 10, detailIndex: 0, startTime: 12, endTime: 14 }
      ]),
      0
    );

    expect(rows).toEqual([
      {
        id: 10,
        totalActive: 7,
        periods: [
          { start: 2, end: 7 },
          { start: 12, end: 14 }
        ]
      }
    ]);
  });

  it('retains activation times without inventing a duration and excludes other runners', () => {
    expect(
      skillActivityRows(
        capture(undefined, [
          { type: 3, frameTime: 20.5, params: [0, 10] },
          { type: 3, frameTime: 30, params: [0, 10] },
          { type: 3, frameTime: 25, params: [1, 20] }
        ]),
        0
      )
    ).toEqual([{ id: 10, totalActive: undefined, periods: [{ start: 20.5 }, { start: 30 }] }]);
  });

  it('keeps activations missing from the annotations and avoids duplicating the onset of a known period', () => {
    expect(
      skillActivityRows(
        capture(
          [{ skillId: 10, detailIndex: 0, startTime: 10, endTime: 12 }],
          [
            { type: 3, frameTime: 10, params: [0, 10] },
            { type: 3, frameTime: 20, params: [0, 10] }
          ]
        ),
        0
      )
    ).toEqual([{ id: 10, totalActive: 2, periods: [{ start: 10, end: 12 }, { start: 20 }] }]);
  });

  it('handles empty and instantaneous annotations', () => {
    expect(skillActivityRows(capture([]), 0)).toEqual([]);
    expect(
      skillActivityRows(capture([{ skillId: 10, detailIndex: 0, startTime: 1, endTime: 1 }]), 0)
    ).toEqual([{ id: 10, totalActive: 0, periods: [{ start: 1, end: 1 }] }]);
  });
});
