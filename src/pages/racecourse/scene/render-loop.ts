// The one animation frame loop. It decides nothing about what a frame does.

/** Called once per frame with the time since the last one, in seconds, and the frame's own timestamp. */
export type FrameHandler = (deltaSeconds: number, now: number) => void;

export interface RenderLoop {
  start(): void;
  stop(): void;
}

export function createRenderLoop(onFrame: FrameHandler): RenderLoop {
  let last = performance.now();
  let handle = 0;
  let stopped = false;

  function tick(now: number): void {
    if (stopped) return;
    const delta = (now - last) / 1000;
    last = now;
    onFrame(delta, now);
    handle = requestAnimationFrame(tick);
  }

  return {
    start() {
      if (stopped) return;
      tick(performance.now());
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(handle);
    }
  };
}
