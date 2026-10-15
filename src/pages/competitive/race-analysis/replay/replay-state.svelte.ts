import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/race-capture-parser';
import {
  raceFrameAtTime,
  raceReplayBounds,
  replayLaneMetres,
  raceTimeAtDistance
} from '@/lib/race/race-replay';
import {
  blockerAt,
  frontBlockingSpans,
  diagnosticHorse,
  detailedSample,
  runnerHpResult
} from '@/lib/race/race-diagnostics';
import type { RaceTrajectory } from '@/lib/race/race-ensemble';
import type { Course } from './replay-course';

interface ReplaySource {
  capture: () => ParsedRaceCapture;
  ensemble: () => RaceTrajectory[] | undefined;
  selected: () => string;
  course: () => Course | undefined;
  /** Course length from resources, before falling back to the captured race distance. */
  distance: () => number | undefined;
}

export class ReplayState {
  time = $state(0);
  playing = $state(false);
  speed = $state('1');

  #source: ReplaySource;
  #animationFrame: number | undefined;
  #lastTick: number | undefined;

  constructor(source: ReplaySource) {
    this.#source = source;
  }

  get capture() {
    return this.#source.capture();
  }

  get ensemble() {
    return this.#source.ensemble();
  }

  bounds = $derived.by(() =>
    raceReplayBounds(this.capture.frames, this.#source.distance() ?? this.capture.raceDistance)
  );
  frame = $derived(raceFrameAtTime(this.capture.frames, this.time));
  runner = $derived(
    this.capture.runners.find((r) => r.index === Number(this.#source.selected())) ??
      this.capture.runners[0]
  );
  leader = $derived(Math.max(0, ...(this.frame?.horses.map((h) => h.distance) ?? [])));
  laneWidth = $derived.by(() =>
    this.capture.laneDistanceMax && this.capture.laneDistanceMax > 0
      ? this.capture.laneDistanceMax > 3
        ? this.capture.laneDistanceMax
        : 11.25 * this.capture.laneDistanceMax
      : (this.#source.course()?.laneMax ?? 11250) / 1000
  );

  laneMetres = (value: number) => replayLaneMetres(value, this.laneWidth).toFixed(1);

  recentSkills = $derived(
    this.capture.events.filter(
      (e) => e.type === 3 && this.time >= e.frameTime && this.time - e.frameTime < 2
    )
  );
  diagnostic = $derived(diagnosticHorse(this.capture, this.runner?.index ?? 0));
  blockingSpans = $derived(frontBlockingSpans(this.capture));
  blockingNow = $derived(
    this.capture.runners.flatMap((r) => {
      const blockerHorseIndex =
        blockerAt(
          this.capture,
          r.index,
          this.time,
          this.frame?.horses[r.index]?.blockFrontHorseIndex
        ) ?? -1;
      return blockerHorseIndex >= 0 ? [{ horseIndex: r.index, blockerHorseIndex }] : [];
    })
  );
  blocker = $derived(
    blockerAt(
      this.capture,
      this.runner?.index ?? 0,
      this.time,
      this.frame?.horses[this.runner?.index ?? 0]?.blockFrontHorseIndex
    ) ?? -1
  );
  activations = $derived(
    this.capture.events
      .filter((e) => e.type === 3 && e.params[0] === this.runner?.index)
      .sort((a, b) => a.frameTime - b.frameTime)
  );
  currentHorse = $derived(this.frame?.horses[this.runner?.index ?? 0]);
  phase = $derived(
    !this.frame
      ? 'No telemetry'
      : this.time >= this.bounds.endTime
        ? 'Finished'
        : this.leader >= this.bounds.distanceMax
          ? 'Finishing'
          : this.leader < this.bounds.distanceMax / 6
            ? 'Early race'
            : this.leader < (this.bounds.distanceMax * 2) / 3
              ? 'Mid race'
              : this.leader < (this.bounds.distanceMax * 5) / 6
                ? 'Late race'
                : 'Final leg'
  );

  #teamKeys = $derived([
    ...new Set(
      this.capture.runners.map((r) =>
        String(r.raw.trainer_id ?? r.raw.team_id ?? r.trainerName ?? r.index)
      )
    )
  ]);

  teamColor = (r: RaceRunner) =>
    typeof r.raw.team_color === 'string' && /^#[0-9a-f]{6}$/i.test(r.raw.team_color)
      ? r.raw.team_color
      : ['#69b7ee', '#e69c72', '#c79be7', '#78bba3'][
          this.#teamKeys.indexOf(
            String(r.raw.trainer_id ?? r.raw.team_id ?? r.trainerName ?? r.index)
          ) % 4
        ]!;

  finishTimes = $derived(
    new Map(
      this.capture.runners.map((r) => {
        const recorded =
          r.result?.finishTimeRaw && r.result.finishTimeRaw > 0
            ? r.result.finishTimeRaw
            : r.result?.finishTime;
        return [
          r.index,
          recorded !== undefined && Number.isFinite(recorded) && recorded > 0
            ? recorded
            : this.runnerTimeAtDistance(this.bounds.distanceMax, r.index)
        ];
      })
    )
  );
  finishOrder = $derived(
    [...this.capture.runners].sort(
      (a, b) =>
        (a.result?.finishOrder ?? Infinity) - (b.result?.finishOrder ?? Infinity) ||
        (this.finishTimes.get(a.index) ?? Infinity) - (this.finishTimes.get(b.index) ?? Infinity) ||
        a.index - b.index
    )
  );
  finishRanks = $derived(
    new Map(
      this.finishOrder.map((r, i) => [
        r.index,
        r.result?.finishOrder ?? (this.finishTimes.get(r.index) !== undefined ? i + 1 : undefined)
      ])
    )
  );
  // Cache the final racing samples once; playback only looks up each runner's HP.
  finishFrames = $derived(
    new Map(
      this.capture.runners.map((r) => {
        const finish = this.finishTimes.get(r.index);
        return [
          r.index,
          finish === undefined ? undefined : this.capture.frames.findLast((f) => f.time < finish)
        ];
      })
    )
  );
  hpResults = $derived(
    new Map(this.capture.runners.map((r) => [r.index, runnerHpResult(this.capture, r.index)]))
  );

  fieldHp = (index: number, finished: boolean) => {
    const result = this.hpResults.get(index),
      hp = finished ? result?.finish : this.frame?.horses[index]?.hp;
    return hp !== undefined && result?.max
      ? Math.min(100, Math.max(0, (hp / result.max) * 100))
      : undefined;
  };

  hasFinished = (r: RaceRunner) => {
    const finish = this.finishTimes.get(r.index);
    return finish !== undefined
      ? this.time >= finish
      : (this.frame?.horses[r.index]?.distance ?? 0) >= this.bounds.distanceMax;
  };

  finishedCount = $derived(this.capture.runners.filter(this.hasFinished).length);
  fieldOrder = $derived(
    [...this.capture.runners].sort(
      (a, b) =>
        Number(this.hasFinished(b)) - Number(this.hasFinished(a)) ||
        (this.hasFinished(a) && this.hasFinished(b)
          ? (this.finishRanks.get(a.index) ?? Infinity) -
            (this.finishRanks.get(b.index) ?? Infinity)
          : (this.frame?.horses[b.index]?.distance ?? 0) -
            (this.frame?.horses[a.index]?.distance ?? 0))
    )
  );

  acceleration = (index: number) => {
    const exact = detailedSample(
      this.capture.detailed,
      diagnosticHorse(this.capture, index),
      this.time,
      'accelerationRates'
    );
    if (exact !== undefined) return exact;
    const source = this.frame?.sourceIndex ?? 0,
      left = this.capture.frames[source],
      right = this.capture.frames[source + 1];
    return left && right && right.time > left.time
      ? ((right.horses[index]?.speed ?? 0) - (left.horses[index]?.speed ?? 0)) /
          (right.time - left.time) /
          100
      : 0;
  };

  runnerTimeAtDistance = (distance: number, index = this.runner?.index ?? 0) => {
    const frames = this.capture.frames;
    if (distance <= (frames[0]?.horses[index]?.distance ?? 0)) return frames[0]?.time;
    const rightIndex = frames.findIndex(
      (frame) => (frame.horses[index]?.distance ?? 0) >= distance
    );
    if (rightIndex < 1) return undefined;
    const left = frames[rightIndex - 1]!,
      right = frames[rightIndex]!,
      start = left.horses[index]!.distance,
      end = right.horses[index]!.distance;
    return (
      left.time +
      ((right.time - left.time) * (distance - start)) / Math.max(Number.EPSILON, end - start)
    );
  };

  timeAtDistance = (distance: number) => raceTimeAtDistance(this.capture.frames, distance);

  pause = () => {
    if (this.#animationFrame !== undefined) cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = undefined;
    this.#lastTick = undefined;
    this.playing = false;
  };

  seek = (value: number) => {
    this.pause();
    this.time = Math.min(this.bounds.endTime, Math.max(this.bounds.startTime, value));
  };

  #tick = (timestamp: number) => {
    if (!this.playing) return;
    if (this.#lastTick !== undefined)
      this.time = Math.min(
        this.bounds.endTime,
        this.time + Math.min(0.1, (timestamp - this.#lastTick) / 1000) * Number(this.speed)
      );
    this.#lastTick = timestamp;
    if (this.time >= this.bounds.endTime) {
      this.pause();
      return;
    }
    this.#animationFrame = requestAnimationFrame(this.#tick);
  };

  play = () => {
    if (this.playing) {
      this.pause();
      return;
    }
    if (this.time >= this.bounds.endTime) this.time = this.bounds.startTime;
    this.playing = true;
    this.#lastTick = undefined;
    this.#animationFrame = requestAnimationFrame(this.#tick);
  };
}
