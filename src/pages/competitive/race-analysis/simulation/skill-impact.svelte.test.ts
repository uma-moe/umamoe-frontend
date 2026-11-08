import { beforeEach, describe, expect, it, vi } from 'vitest';
import { measureSkillImpact, type RaceSkillImpact } from '@/services/race/race-skill-impact';
import { capture, runner, simulated } from './race-simulation-fixtures';
import { recordedImpactRace } from './skill-impact';
import { RaceSkillImpacts } from './skill-impact.svelte';

vi.mock('@/services/race/race-skill-impact', () => ({ measureSkillImpact: vi.fn() }));

function impactFinishing(finishOrder: number[]): RaceSkillImpact {
  return { finishOrder, skills: [] };
}

function measurable() {
  const race = recordedImpactRace(simulated(capture([runner(0), runner(1)])));
  if (!race) throw Error('The fixture race should be measurable.');

  return race;
}

describe('the skill impacts of the races on screen', () => {
  beforeEach(() => {
    vi.mocked(measureSkillImpact).mockReset();
  });

  it('waits to measure a prepared race until its runner analysis asks', () => {
    const race = measurable();
    const impacts = new RaceSkillImpacts();

    impacts.prepare(race);

    expect(impacts.measurableRace(race.shown)).toBe(race);
    expect(measureSkillImpact).not.toHaveBeenCalled();
  });

  it('keeps each race’s measurement while another race is measured', async () => {
    const first = measurable();
    const second = measurable();
    vi.mocked(measureSkillImpact)
      .mockResolvedValueOnce(impactFinishing([0, 1]))
      .mockResolvedValueOnce(impactFinishing([1, 0]));
    const impacts = new RaceSkillImpacts();

    await impacts.measure(first);
    await impacts.measure(second);

    expect(impacts.of(first.shown)).toEqual({ status: 'ready', impact: impactFinishing([0, 1]) });
    expect(impacts.of(second.shown)).toEqual({ status: 'ready', impact: impactFinishing([1, 0]) });
  });

  it('measures a race once, however often its details open', async () => {
    const race = measurable();
    vi.mocked(measureSkillImpact).mockResolvedValue(impactFinishing([0, 1]));
    const impacts = new RaceSkillImpacts();

    await impacts.measure(race);
    await impacts.measure(race);

    expect(measureSkillImpact).toHaveBeenCalledTimes(1);
  });

  it('measures a failed race again on retry', async () => {
    const race = measurable();
    vi.mocked(measureSkillImpact)
      .mockRejectedValueOnce(Error('Simulator busy'))
      .mockResolvedValueOnce(impactFinishing([0, 1]));
    const impacts = new RaceSkillImpacts();
    await impacts.measure(race);

    impacts.retry(race.shown);
    await vi.waitFor(() => expect(impacts.of(race.shown)?.status).toBe('ready'));

    expect(measureSkillImpact).toHaveBeenCalledTimes(2);
  });
});
