import { describe, expect, it } from 'vitest';
import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import type { HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';
import { makeDemoRaces } from '@/pages/competitive/demo-races';
import { runnerCallouts, skillWindows, wholeRaceSkillIds } from './replay-callouts';

const base = makeDemoRaces(1)[0]!;

function capture(spans: HorseDiagnostics['activeSkillSpans']): ParsedRaceCapture {
  return {
    ...base,
    events: [],
    detailed: {
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

describe('whole-race skills', () => {
  const race = capture([
    { skillId: 10, detailIndex: 0, startTime: 0, endTime: 108.36 },
    { skillId: 20, detailIndex: 0, startTime: 26.2, endTime: 32.9 },
    { skillId: 30, detailIndex: 0, startTime: 40, endTime: 108.36 }
  ]);

  it('lists only skills active from the gate for longer than a timed effect', () => {
    expect(wholeRaceSkillIds(race, 0)).toEqual([10]);
  });

  it('keeps them out of the course labels while timed skills are labelled', () => {
    const labelsAt = (time: number) =>
      runnerCallouts({
        capture: race,
        windows: skillWindows(race),
        frame: undefined,
        time,
        skillNames: new Map(),
        skills: true,
        modes: false
      }).get(0) ?? [];

    expect(labelsAt(0.5)).toEqual([]);

    const midRace = labelsAt(30);
    expect(midRace.map((callout) => callout.kind === 'skill' && callout.skillId)).toEqual([20]);
  });
});
