import { describe, expect, it } from 'vitest';
import {
  clipBatchSize,
  clipFileName,
  clipFrameTimes,
  clipOutputSize,
  clipSize,
  defaultClipRange,
  markClipEdge,
  trimClipEdge
} from './clip-plan';

const bounds = { startTime: 0, endTime: 120 };

describe('defaultClipRange', () => {
  it('starts at the playhead', () => {
    expect(defaultClipRange(40, bounds)).toEqual({ start: 40, end: 50 });
  });

  it('moves back to fit before the finish', () => {
    expect(defaultClipRange(116, bounds)).toEqual({ start: 110, end: 120 });
  });

  it('covers a race shorter than a clip', () => {
    expect(defaultClipRange(3, { startTime: 0, endTime: 6 })).toEqual({ start: 0, end: 6 });
  });
});

describe('markClipEdge', () => {
  const range = { start: 40, end: 50 };

  it('keeps the other point when it still fits', () => {
    expect(markClipEdge('start', 45, range, bounds)).toEqual({ start: 45, end: 50 });
    expect(markClipEdge('end', 48, range, bounds)).toEqual({ start: 40, end: 48 });
  });

  it('moves the out point a default clip after an in point marked past it', () => {
    expect(markClipEdge('start', 70, range, bounds)).toEqual({ start: 70, end: 80 });
  });

  it('moves the in point a default clip before an out point marked ahead of it', () => {
    expect(markClipEdge('end', 30, range, bounds)).toEqual({ start: 20, end: 30 });
  });

  it('keeps an in point marked at the finish a moment before it', () => {
    const marked = markClipEdge('start', 120, range, bounds);

    expect(marked.start).toBeCloseTo(119.9);
    expect(marked.end).toBe(120);
  });
});

describe('trimClipEdge', () => {
  const range = { start: 40, end: 50 };

  it('stops an edge dragged across the other at the shortest clip', () => {
    expect(trimClipEdge('start', 55, range, bounds).start).toBeCloseTo(49.9);
    expect(trimClipEdge('end', 10, range, bounds).end).toBeCloseTo(40.1);
  });

  it('keeps an edge inside the race', () => {
    expect(trimClipEdge('start', -5, range, bounds)).toEqual({ start: 0, end: 50 });
    expect(trimClipEdge('end', 130, range, bounds)).toEqual({ start: 40, end: 120 });
  });
});

describe('clipFrameTimes', () => {
  it('steps the replay by the speed over the frame rate, ending on the end', () => {
    const times = clipFrameTimes({ start: 10, end: 11, speed: 2, fps: 10 });

    expect(times).toHaveLength(6);
    expect(times[1]).toBeCloseTo(10.2);
    expect(times.at(-1)).toBeCloseTo(11);
  });

  it('keeps a last frame that float error puts just past the end', () => {
    const times = clipFrameTimes({ start: 0, end: 1, speed: 1, fps: 30 });

    expect(times).toHaveLength(31);
  });

  it('draws one frame for an empty range', () => {
    expect(clipFrameTimes({ start: 5, end: 5, speed: 1, fps: 30 })).toEqual([5]);
  });
});

describe('clipSize', () => {
  it('scales and rounds down to even pixels', () => {
    expect(clipSize(1541.6, 503.2, 1)).toEqual({ width: 1540, height: 502 });
    expect(clipSize(375.5, 210, 2)).toEqual({ width: 750, height: 420 });
  });
});

describe('clipOutputSize', () => {
  const region = { width: 800, height: 450 };

  it('scales the region for a multiple', () => {
    expect(clipOutputSize(region, { kind: 'scale', scale: 2 })).toEqual({
      width: 1600,
      height: 900
    });
  });

  it('keeps the region aspect for a chosen width', () => {
    expect(clipOutputSize(region, { kind: 'width', width: 1280 })).toEqual({
      width: 1280,
      height: 720
    });
  });

  it('stays within the encoder limits', () => {
    const tooLarge = clipOutputSize(region, { kind: 'width', width: 10_000 });
    const tooSmall = clipOutputSize(region, { kind: 'width', width: 10 });

    expect(tooLarge).toEqual({ width: 3840, height: 2160 });
    expect(tooSmall.height).toBe(64);
  });

  it('has no frame before the stage is measured', () => {
    expect(clipOutputSize({ width: 0, height: 0 }, { kind: 'scale', scale: 1 })).toEqual({
      width: 0,
      height: 0
    });
  });
});

describe('clipBatchSize', () => {
  it('renders more small frames at once than large ones', () => {
    const small = clipBatchSize({ width: 1280, height: 720 });
    const large = clipBatchSize({ width: 3840, height: 2160 });

    expect(small).toBe(12);
    expect(large).toBe(5);
  });
});

describe('clipFileName', () => {
  it('names the race file and the range', () => {
    const range = { start: 80, end: 90.25 };

    expect(clipFileName('123456_Room Match.json.gz', range, 'mp4')).toBe(
      '123456-room-match-80.0s-90.3s.mp4'
    );
  });

  it('falls back to a generic name', () => {
    expect(clipFileName('.json', { start: 0, end: 1 }, 'webm')).toBe('race-0.0s-1.0s.webm');
  });
});
