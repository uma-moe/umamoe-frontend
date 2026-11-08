import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import type { DetailedReplay } from '@/lib/race/capture/race-diagnostics';
import { measureSkillImpact, type RaceSkillImpact } from '@/services/race/race-skill-impact';
import { fieldSkills, type SkillImpactRace } from './skill-impact';

export type SkillImpactState =
  | { status: 'running' }
  | { status: 'ready'; impact: RaceSkillImpact }
  | { status: 'failed'; reason: string };

interface Measurement {
  race: SkillImpactRace;
  state: SkillImpactState;
}

const contextKey = Symbol('race skill impacts');

/** What each skill did in the simulated races on screen: one request measures a race's whole field. */
export class RaceSkillImpacts {
  /** Keyed by the simulator's replay, so a recorded race and each of its reruns keep their own. */
  #races = new SvelteMap<DetailedReplay, SkillImpactRace>();
  #measurements = new SvelteMap<DetailedReplay, Measurement>();
  #controller = new AbortController();

  of(race: ParsedRaceCapture): SkillImpactState | undefined {
    if (race.detailed === undefined) return undefined;

    return this.#measurements.get(race.detailed)?.state;
  }

  /** Remembers how to measure a race on screen; the request waits until a runner analysis shows it. */
  prepare(race: SkillImpactRace) {
    const replay = race.shown.detailed;
    if (replay !== undefined && !this.#races.has(replay)) this.#races.set(replay, race);
  }

  measurableRace(capture: ParsedRaceCapture): SkillImpactRace | undefined {
    if (capture.detailed === undefined) return undefined;

    return this.#races.get(capture.detailed);
  }

  async measure(race: SkillImpactRace) {
    const replay = race.shown.detailed;
    if (replay === undefined || this.#measurements.has(replay)) return;

    const { signal } = this.#controller;
    this.#measurements.set(replay, { race, state: { status: 'running' } });

    const { recorded, settings } = race;
    try {
      const impact = await measureSkillImpact(
        recorded,
        recorded.courseId ?? 0,
        fieldSkills(recorded),
        { ...settings, signal }
      );
      if (!signal.aborted)
        this.#measurements.set(replay, { race, state: { status: 'ready', impact } });
    } catch (error) {
      if (signal.aborted) return;

      const reason = error instanceof Error ? error.message : 'Skill impact could not be measured.';
      this.#measurements.set(replay, { race, state: { status: 'failed', reason } });
    }
  }

  retry(race: ParsedRaceCapture) {
    const replay = race.detailed;
    const measurement = replay === undefined ? undefined : this.#measurements.get(replay);
    if (replay === undefined || measurement?.state.status !== 'failed') return;

    this.#measurements.delete(replay);
    void this.measure(measurement.race);
  }

  /** Forgets every race, for a new set of uploads. */
  reset() {
    this.#controller.abort();
    this.#controller = new AbortController();
    this.#races.clear();
    this.#measurements.clear();
  }
}

export function provideSkillImpacts(impacts: RaceSkillImpacts) {
  setContext(contextKey, impacts);
}

/** The page's skill impacts, where a race analysis page measures them. */
export function skillImpactsInContext(): RaceSkillImpacts | undefined {
  return getContext<RaceSkillImpacts | undefined>(contextKey);
}
