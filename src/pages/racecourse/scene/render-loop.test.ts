import { afterEach, expect, it, vi } from 'vitest';
import { createRenderLoop } from './render-loop';

/** A requestAnimationFrame queue the test drives by hand. */
function fakeFrames() {
  const pending = new Map<number, FrameRequestCallback>();
  let next = 1;

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const handle = next++;
    pending.set(handle, callback);
    return handle;
  });
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    pending.delete(handle);
  });

  return {
    /** Runs every frame waiting to run, as the browser would once per tick. */
    run(time: number) {
      const due = [...pending];
      pending.clear();
      for (const [, callback] of due) callback(time);
    },
    get waiting() {
      return pending.size;
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('draws the first frame straight away, then one per animation frame', () => {
  const frames = fakeFrames();
  const deltas: number[] = [];
  const loop = createRenderLoop((delta) => deltas.push(delta));

  loop.start();

  expect(deltas).toHaveLength(1);
  expect(deltas[0]).toBeLessThan(0.05);
  expect(frames.waiting).toBe(1);

  frames.run(performance.now() + 16);
  expect(deltas).toHaveLength(2);
  expect(deltas[1]).toBeCloseTo(0.016, 3);
});

it('stops asking for frames once it is stopped', () => {
  const frames = fakeFrames();
  let drawn = 0;
  const loop = createRenderLoop(() => (drawn += 1));

  loop.start();
  frames.run(performance.now() + 16);
  expect(drawn).toBe(2);

  loop.stop();
  expect(frames.waiting).toBe(0);

  loop.start();
  expect(drawn).toBe(2);
});
