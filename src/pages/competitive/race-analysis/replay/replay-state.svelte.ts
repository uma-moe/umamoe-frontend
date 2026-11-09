import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/capture/race-capture-parser';
import {
  smoothRaceFrameAtTime,
  raceReplayBounds,
  replayLaneMetres,
  raceTimeAtDistance
} from '@/lib/race/replay/race-replay';
import {
  blockerAt,
  activeSpan,
  frontBlockingSpans,
  diagnosticHorse,
  detailedSample,
  runnerHpResult
} from '@/lib/race/capture/race-diagnostics';
import type { RaceTrajectory } from '@/lib/race/replay/race-ensemble';
import type { Course } from './replay-course';
import { adjacentFrameTime } from './replay-timeline';
import { teamColors } from './team-colors';
import { RUNAWAY_SKILL_ID, speedUpCheckRanges } from './speed-up-check';

const READOUTS_PER_SECOND = 10;

/** Team ring colors for captures without a team color; fixed so they read on both themes. */

/** The game's recorded finish time; frames only approximate when a runner crosses the line. */
export function recordedFinishTime(runner: RaceRunner): number | undefined {
  const recorded =
    runner.result?.finishTimeRaw && runner.result.finishTimeRaw > 0
      ? runner.result.finishTimeRaw
      : runner.result?.finishTime;

  return recorded !== undefined && Number.isFinite(recorded) && recorded > 0 ? recorded : undefined;
}

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
  /** A clip is being drawn frame by frame from this replay. */
  recording = $state(false);
  /** Where playback started by playRange stops, such as a clip's out point. */
  #stopAt: number | undefined;

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

  frame = $derived(smoothRaceFrameAtTime(this.capture.frames, this.time));
  /** The recorded frame the playhead sits on or last passed. */
  frameIndex = $derived(this.frame?.sourceIndex ?? 0);
  /** Playback and clip recording move the stage every frame, so it keeps sub-pixel positions. */
  moving = $derived(this.playing || this.recording);
  runner = $derived(
    this.capture.runners.find((r) => r.index === Number(this.#source.selected())) ??
      this.capture.runners[0]
  );

  leader = $derived(Math.max(0, ...(this.frame?.horses.map((h) => h.distance) ?? [])));

  // While playing, text readouts change ten times a second: every text change costs the page a
  // layout, and digits cannot be read at the display's frame rate anyway.
  readoutTime = $derived(
    this.playing ? Math.floor(this.time * READOUTS_PER_SECOND) / READOUTS_PER_SECOND : this.time
  );

  readoutFrame = $derived(smoothRaceFrameAtTime(this.capture.frames, this.readoutTime));
  readoutLeader = $derived(
    Math.max(0, ...(this.readoutFrame?.horses.map((h) => h.distance) ?? []))
  );
  laneWidth = $derived.by(() => {
    const capturedWidth = this.capture.laneDistanceMax;
    if (capturedWidth !== undefined && capturedWidth > 0)
      return capturedWidth > 3 ? capturedWidth : 11.25 * capturedWidth;
    return (this.#source.course()?.laneMax ?? 11250) / 1000;
  });

  laneMetres = (value: number) => replayLaneMetres(value, this.laneWidth).toFixed(1);

  recentSkills = $derived(
    this.capture.events.filter(
      (e) => e.type === 3 && this.time >= e.frameTime && this.time - e.frameTime < 2
    )
  );

  diagnostic = $derived(diagnosticHorse(this.capture, this.runner?.index ?? 0));
  pacemaker = $derived.by(() => {
    const index = activeSpan(
      this.capture.detailed?.annotations.paceMakerSpans,
      this.time
    )?.horseIndex;
    return this.capture.runners.some((runner) => runner.index === index) ? index : undefined;
  });

  /** Where the keep zones are measured from: the pacemaker when known, else the front runner. */
  paceReference = $derived(
    (this.pacemaker !== undefined ? this.frame?.horses[this.pacemaker]?.distance : undefined) ??
      this.leader
  );

  #runaways = $derived(
    new Set(
      this.capture.events
        .filter((e) => e.type === 3 && e.params[1] === RUNAWAY_SKILL_ID)
        .map((e) => e.params[0])
    )
  );

  /** Rear Speed Up check range per runner that can enter it now, in metres. */
  speedUpRanges = $derived.by(() => {
    if (!this.frame || this.time <= 0) return new Map<number, number>();

    const runners = this.capture.runners.flatMap((runner) => {
      const horse = this.frame?.horses[runner.index];
      if (!horse) return [];

      const spans = diagnosticHorse(this.capture, runner.index)?.temptationSpans;
      const runningStyle =
        runner.result?.runningStyle ||
        Number(runner.raw.running_style ?? runner.raw.runningStyle) ||
        1;
      return [
        {
          index: runner.index,
          distance: horse.distance,
          runningStyle,
          isRunaway: this.#runaways.has(runner.index) || runningStyle === 5,
          temptationMode:
            spans !== undefined
              ? (activeSpan(spans, this.time)?.mode ?? 0)
              : (horse.temptationMode ?? 0)
        }
      ];
    });

    return speedUpCheckRanges(runners, this.bounds.distanceMax);
  });

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
  phase = $derived.by(() => {
    if (!this.frame) return 'No telemetry';
    if (this.time >= this.bounds.endTime) return 'Finished';
    if (this.leader >= this.bounds.distanceMax) return 'Finishing';
    if (this.leader < this.bounds.distanceMax / 6) return 'Early race';
    if (this.leader < (this.bounds.distanceMax * 2) / 3) return 'Mid race';
    if (this.leader < (this.bounds.distanceMax * 5) / 6) return 'Late race';
    return 'Final leg';
  });

  #teamColor = $derived(teamColors(this.capture.runners));

  teamColor = (r: RaceRunner) => this.#teamColor(r);

  finishTimes = $derived(
    new Map(
      this.capture.runners.map((r) => [
        r.index,
        recordedFinishTime(r) ?? this.runnerTimeAtDistance(this.bounds.distanceMax, r.index)
      ])
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
      hp = finished ? result?.finish : this.readoutFrame?.horses[index]?.hp;

    return hp !== undefined && result?.max
      ? Math.min(100, Math.max(0, (hp / result.max) * 100))
      : undefined;
  };

  hasFinished = (r: RaceRunner) => {
    const finish = this.finishTimes.get(r.index);
    return finish !== undefined
      ? this.readoutTime >= finish
      : (this.readoutFrame?.horses[r.index]?.distance ?? 0) >= this.bounds.distanceMax;
  };

  finishedCount = $derived(this.capture.runners.filter(this.hasFinished).length);
  fieldOrder = $derived(
    [...this.capture.runners].sort(
      (a, b) =>
        Number(this.hasFinished(b)) - Number(this.hasFinished(a)) ||
        (this.hasFinished(a) && this.hasFinished(b)
          ? (this.finishRanks.get(a.index) ?? Infinity) -
            (this.finishRanks.get(b.index) ?? Infinity)
          : (this.readoutFrame?.horses[b.index]?.distance ?? 0) -
            (this.readoutFrame?.horses[a.index]?.distance ?? 0))
    )
  );

  acceleration = (index: number) => {
    const exact = detailedSample(
      this.capture.detailed,
      diagnosticHorse(this.capture, index),
      this.readoutTime,
      'accelerationRates'
    );

    if (exact !== undefined) return exact;
    const source = this.readoutFrame?.sourceIndex ?? 0,
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
    const left = frames[rightIndex - 1];
    const right = frames[rightIndex];
    const start = left?.horses[index]?.distance;
    const end = right?.horses[index]?.distance;
    if (!left || !right || start === undefined || end === undefined) return undefined;
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
    this.#stopAt = undefined;
    this.playing = false;
  };

  seek = (value: number) => {
    this.pause();
    this.time = Math.min(this.bounds.endTime, Math.max(this.bounds.startTime, value));
  };

  stepFrame = (direction: 1 | -1) => {
    const time = adjacentFrameTime(this.capture.frames, this.time, direction);
    if (time !== undefined) this.seek(time);
    else this.pause();
  };

  #tick = (timestamp: number) => {
    if (!this.playing) return;

    const stop = Math.min(this.bounds.endTime, this.#stopAt ?? Infinity);
    if (this.#lastTick !== undefined)
      this.time = Math.min(
        stop,
        this.time + Math.min(0.1, (timestamp - this.#lastTick) / 1000) * Number(this.speed)
      );
    this.#lastTick = timestamp;
    if (this.time >= stop) {
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

  /** Plays from start and stops at end. */
  playRange = (start: number, end: number) => {
    this.seek(start);
    this.play();
    this.#stopAt = end;
  };
}
