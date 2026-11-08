import { flushSync, tick } from 'svelte';
import type { ReplayState } from '../replay-state.svelte';
import type { CanvasClipLayer, ClipLayerDraw } from './canvas-clip';
import { cropPixels, type ClipCrop } from './clip-crop';
import type { ClipFormat } from './clip-format';
import { clipBatchSize, clipFrameTimes, type ClipFrameSize, type ClipRange } from './clip-plan';
import { ClipUnavailableError, createClipEncoder, type ClipEncoder } from './clip-encoder';
import { StageRasterizer, type ClipLayers } from './stage-rasterizer';

export interface ClipSettings {
  range: ClipRange;
  speed: number;
  fps: number;
  crop: ClipCrop;
  frame: ClipFrameSize;
  format: ClipFormat;
}

export interface RecordedClip {
  blob: Blob;
  extension: string;
}

/** The replay view inside the layout, and the panels marked as floating over it. */
export function findClipLayers(container: HTMLElement | undefined): ClipLayers | undefined {
  const stage = container?.querySelector<HTMLElement>('[data-clip-layer="stage"]');
  if (!container || !stage) return undefined;

  const overlays = [...container.querySelectorAll<HTMLElement>('[data-clip-layer="overlay"]')];

  return { stage, overlays };
}

/** Draws a batch of frames, adding each to the encoder as soon as it is drawn. */
type FrameBatch = (times: number[], first: number) => Promise<void>;

/**
 * Views that draw themselves render each frame straight onto the clip canvas: the replay is set to the
 * frame's time and the layers read it afresh, without updating the page.
 */
async function canvasFrames({
  layers,
  replay,
  stage,
  crop,
  frame,
  context,
  encoder,
  fps
}: {
  layers: CanvasClipLayer[];
  replay: ReplayState;
  stage: HTMLElement;
  crop: ClipCrop;
  frame: ClipFrameSize;
  context: CanvasRenderingContext2D;
  encoder: ClipEncoder;
  fps: number;
}): Promise<FrameBatch> {
  const stageBox = stage.getBoundingClientRect();
  const prepared = await Promise.all(layers.map((layer) => layer.prepareClip(stageBox)));
  const draws = prepared.filter((draw): draw is ClipLayerDraw => draw !== undefined);
  const region = cropPixels(crop, stageBox);
  const scaleX = frame.width / region.width;
  const scaleY = frame.height / region.height;

  return async (times, first) => {
    // The encoder copies the canvas as each frame is added, so the batch queues up and waits once.
    const added = times.map((time, offset) => {
      replay.seek(time);
      context.setTransform(scaleX, 0, 0, scaleY, -region.x * scaleX, -region.y * scaleY);
      for (const draw of draws) draw(context);

      return encoder.add((first + offset) / fps, 1 / fps);
    });

    await Promise.all(added);
  };
}

/**
 * Other views are copied from the page: the replay is set to each frame's time and the stage copied
 * without yielding or laying out the page, which then repaints only on the batch's last frame. The
 * copies render together and are encoded in order.
 */
function copiedFrames({
  layers,
  replay,
  crop,
  frame,
  context,
  encoder,
  fps
}: {
  layers: ClipLayers;
  replay: ReplayState;
  crop: ClipCrop;
  frame: ClipFrameSize;
  context: CanvasRenderingContext2D;
  encoder: ClipEncoder;
  fps: number;
}): FrameBatch {
  const rasterizer = new StageRasterizer(layers, crop, frame);

  return async (times, first) => {
    const placed = rasterizer.placeLayers();
    const captures = times.map((time) => {
      replay.seek(time);
      flushSync();

      return rasterizer.capture(placed);
    });
    const rendered = await Promise.all(captures.map((capture) => rasterizer.render(capture)));

    const added = rendered.map((renderedFrame, offset) => {
      rasterizer.draw(context, renderedFrame);
      return encoder.add((first + offset) / fps, 1 / fps);
    });
    await Promise.all(added);
  };
}

/**
 * Records a clip offline, a batch of frames at a time, yielding between batches so the page shows
 * progress and the stage advances. The playhead returns where it was.
 */
export async function recordClip({
  replay,
  container,
  canvasLayers,
  settings,
  signal,
  onprogress
}: {
  replay: ReplayState;
  container: HTMLElement | undefined;
  /** Present when the shown view draws its own frames. */
  canvasLayers: CanvasClipLayer[] | undefined;
  settings: ClipSettings;
  signal: AbortSignal;
  onprogress: (done: number, total: number) => void;
}): Promise<RecordedClip> {
  const layers = findClipLayers(container);
  if (!layers) throw new ClipUnavailableError('The replay is still loading.');

  const { range, speed, fps, crop, frame, format } = settings;
  const times = clipFrameTimes({ ...range, speed, fps });
  const batchSize = clipBatchSize(frame);
  const playhead = replay.time;
  let encoderToCancel: ClipEncoder | undefined;

  replay.pause();
  replay.recording = true;

  try {
    // Springs and stage positions switch to their exact recording values first.
    await tick();

    const canvas = document.createElement('canvas');
    canvas.width = frame.width;
    canvas.height = frame.height;

    const context = canvas.getContext('2d');
    if (!context) throw new ClipUnavailableError('This browser cannot draw the replay.');

    const encoder = await createClipEncoder({ canvas, fps, format });
    encoderToCancel = encoder;

    const shared = { replay, crop, frame, context, encoder, fps };
    const drawBatch = canvasLayers
      ? await canvasFrames({ ...shared, layers: canvasLayers, stage: layers.stage })
      : copiedFrames({ ...shared, layers });

    for (let first = 0; first < times.length; first += batchSize) {
      signal.throwIfAborted();

      const batch = times.slice(first, first + batchSize);
      await drawBatch(batch, first);
      onprogress(first + batch.length, times.length);
    }

    signal.throwIfAborted();

    return { blob: await encoder.finish(), extension: encoder.extension };
  } catch (error) {
    await encoderToCancel?.cancel().catch(() => {});
    // A browser that taints a canvas drawn from an SVG image refuses to hand its pixels to the encoder.
    if (error instanceof DOMException && error.name === 'SecurityError')
      throw new ClipUnavailableError('This browser cannot capture the replay.');
    throw error;
  } finally {
    replay.recording = false;
    replay.seek(playhead);
  }
}
