export interface ClipRange {
  start: number;
  end: number;
}

export interface ClipTiming extends ClipRange {
  /** Replay seconds per video second. */
  speed: number;
  fps: number;
}

export interface ClipBounds {
  startTime: number;
  endTime: number;
}

export type ClipEdge = 'start' | 'end';

export const DEFAULT_CLIP_SECONDS = 10;
/** The shortest clip, which keeps the in point before the out point. */
export const MIN_CLIP_SECONDS = 0.1;

// Frame times accumulate float error; a last frame this close to the end still belongs to the clip.
const END_TOLERANCE = 1e-6;

/** A clip of the next ten seconds from the playhead, moved back where the race ends sooner. */
export function defaultClipRange(playhead: number, bounds: ClipBounds): ClipRange {
  const latestStart = Math.max(bounds.startTime, bounds.endTime - DEFAULT_CLIP_SECONDS);
  const start = Math.min(latestStart, Math.max(bounds.startTime, playhead));

  return { start, end: Math.min(bounds.endTime, start + DEFAULT_CLIP_SECONDS) };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Marks an in or out point; when the other point no longer fits, it moves to a default clip away. */
export function markClipEdge(
  edge: ClipEdge,
  time: number,
  range: ClipRange,
  bounds: ClipBounds
): ClipRange {
  if (edge === 'start') {
    const start = clamp(time, bounds.startTime, bounds.endTime - MIN_CLIP_SECONDS);
    const fits = range.end - start >= MIN_CLIP_SECONDS;

    return {
      start,
      end: fits ? range.end : Math.min(bounds.endTime, start + DEFAULT_CLIP_SECONDS)
    };
  }

  const end = clamp(time, bounds.startTime + MIN_CLIP_SECONDS, bounds.endTime);
  const fits = end - range.start >= MIN_CLIP_SECONDS;

  return {
    start: fits ? range.start : Math.max(bounds.startTime, end - DEFAULT_CLIP_SECONDS),
    end
  };
}

/** Trims one edge of the clip; it stops at the shortest clip rather than pushing the other edge. */
export function trimClipEdge(
  edge: ClipEdge,
  time: number,
  range: ClipRange,
  bounds: ClipBounds
): ClipRange {
  if (edge === 'start')
    return { start: clamp(time, bounds.startTime, range.end - MIN_CLIP_SECONDS), end: range.end };

  return { start: range.start, end: clamp(time, range.start + MIN_CLIP_SECONDS, bounds.endTime) };
}

/** The replay time of each video frame: one step of speed / fps apart, from the start up to the end. */
export function clipFrameTimes({ start, end, speed, fps }: ClipTiming): number[] {
  const step = speed / fps;
  const count = Math.floor((end - start) / step + END_TOLERANCE) + 1;

  return Array.from({ length: Math.max(1, count) }, (_, index) => start + index * step);
}

/** Video encoders need even dimensions, so a scaled stage rounds down to the nearest even pixel. */
export function clipSize(width: number, height: number, scale: number) {
  // The tolerance keeps a crop that is exactly an even width, read back from fractions, from losing two pixels.
  const even = (value: number) => Math.max(2, Math.floor((value * scale) / 2 + 1e-6) * 2);

  return { width: even(width), height: even(height) };
}

export interface ClipFrameSize {
  width: number;
  height: number;
}

/** How sharp the video is: a multiple of the cropped stage's screen size, or a chosen width. */
export type ClipResolution = { kind: 'scale'; scale: number } | { kind: 'width'; width: number };

export const MIN_CLIP_SIDE = 64;
/** 4K, the largest frame the browsers' hardware encoders take. */
export const MAX_CLIP_SIDE = 3840;

/** The video frame for a stretch of stage: the region's aspect at the chosen sharpness, within encoder limits. */
export function clipOutputSize(region: ClipFrameSize, resolution: ClipResolution): ClipFrameSize {
  if (region.width <= 0 || region.height <= 0) return { width: 0, height: 0 };

  const requested =
    resolution.kind === 'scale' ? resolution.scale : resolution.width / region.width;
  const smallest = MIN_CLIP_SIDE / Math.min(region.width, region.height);
  const largest = MAX_CLIP_SIDE / Math.max(region.width, region.height);

  return clipSize(region.width, region.height, clamp(requested, smallest, largest));
}

// Rendered frames wait in memory until their batch is encoded; this keeps a batch to a few hundred megabytes.
const BATCH_BYTES = 160 * 1024 * 1024;

/** How many frames to render at once: more for small frames, never fewer than two or more than twelve. */
export function clipBatchSize({ width, height }: ClipFrameSize) {
  const frameBytes = Math.max(1, width * height * 4);

  return clamp(Math.floor(BATCH_BYTES / frameBytes), 2, 12);
}

/** Names the clip after the race file and the stretch of race it shows, such as `race-80.0s-90.0s.mp4`. */
export function clipFileName(source: string, range: ClipRange, extension: string): string {
  const race =
    source
      .replace(/\..*$/, '')
      .replaceAll(/[^a-z0-9]+/gi, '-')
      .replaceAll(/^-|-$/g, '')
      .toLowerCase() || 'race';

  return `${race}-${range.start.toFixed(1)}s-${range.end.toFixed(1)}s.${extension}`;
}
