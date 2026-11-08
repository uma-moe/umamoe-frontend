import { tick } from 'svelte';
import type { ReplayState } from '../replay-state.svelte';
import {
  clipFileName,
  clipOutputSize,
  defaultClipRange,
  markClipEdge,
  MIN_CLIP_SECONDS,
  trimClipEdge,
  type ClipEdge,
  type ClipResolution
} from './clip-plan';
import {
  CROP_ASPECTS,
  cropPixels,
  fitCropAspect,
  FULL_CROP,
  isFullCrop,
  type ClipCrop,
  type CropAspect
} from './clip-crop';
import type { ClipCodec, ClipQuality } from './clip-format';
import { ClipUnavailableError, encodableClipCodecs } from './clip-encoder';
import type { CanvasClipLayer } from './canvas-clip';
import { findClipLayers, recordClip } from './record-clip';

export type ClipStatus =
  | { kind: 'idle' }
  | { kind: 'recording'; done: number; total: number }
  | { kind: 'ready'; url: string; fileName: string; megabytes: number }
  | { kind: 'failed'; message: string };

/** A size choice: a multiple of the cropped stage's screen size, or a width typed in. */
export type ClipSizeChoice = '1' | '2' | 'custom';

export function isClipSizeChoice(value: string): value is ClipSizeChoice {
  return value === '1' || value === '2' || value === 'custom';
}

/** Cutting a clip from the replay: in and out points, a crop window, export settings and the recording. */
export class ReplayClip {
  editing = $state(false);
  start = $state(0);
  end = $state(0);
  speed = $state('1');
  fps = $state('60');
  status = $state<ClipStatus>({ kind: 'idle' });

  cropping = $state(false);
  crop = $state<ClipCrop>(FULL_CROP);
  aspect = $state<CropAspect>('free');

  size = $state<ClipSizeChoice>('1');
  customWidth = $state(1280);
  codec = $state<ClipCodec>('avc');
  quality = $state<ClipQuality>('high');
  keyFrameInterval = $state('2');
  /** The codecs this browser encodes, once checked. */
  encodable = $state<ClipCodec[]>();

  #replay: ReplayState;
  #container: () => HTMLElement | undefined;
  #canvasLayers: () => CanvasClipLayer[] | undefined;
  #recording: AbortController | undefined;
  #stage = $state({ width: 0, height: 0 });

  constructor({
    replay,
    container,
    canvasLayers
  }: {
    replay: ReplayState;
    /** The replay layout holding the stage to record. */
    container: () => HTMLElement | undefined;
    /** The layers of the shown view, when it draws its own frames. */
    canvasLayers: () => CanvasClipLayer[] | undefined;
  }) {
    this.#replay = replay;
    this.#container = container;
    this.#canvasLayers = canvasLayers;
  }

  range = $derived({ start: this.start, end: this.end });
  recording = $derived(this.status.kind === 'recording');
  /** Length of the exported video, which the speed shortens or stretches. */
  videoSeconds = $derived((this.end - this.start) / Number(this.speed));
  cropped = $derived(!isFullCrop(this.crop));
  /** The cropped part of the stage in screen pixels. */
  region = $derived(cropPixels(this.crop, this.#stage));
  resolution = $derived<ClipResolution>(
    this.size === 'custom'
      ? { kind: 'width', width: this.customWidth }
      : { kind: 'scale', scale: Number(this.size) }
  );
  frame = $derived(clipOutputSize(this.region, this.resolution));
  sizes = $derived([
    ...(['1', '2'] as const).map((value) => {
      const size = clipOutputSize(this.region, { kind: 'scale', scale: Number(value) });
      return { value, label: `${size.width} × ${size.height}` };
    }),
    { value: 'custom', label: 'Custom' }
  ]);

  /** Starts a clip at the playhead. */
  edit = () => {
    const range = defaultClipRange(this.#replay.time, this.#replay.bounds);

    this.start = range.start;
    this.end = range.end;
    this.speed = this.#replay.speed;
    if (this.size !== 'custom') this.size = devicePixelRatio >= 1.5 ? '2' : '1';
    this.discard();
    this.editing = true;
    // The clip bar takes room from the stage, so it is measured once the bar shows.
    void tick().then(() => {
      this.measureStage();
      void this.#checkCodecs();
    });
  };

  close = () => {
    this.cancel();
    this.discard();
    this.cropping = false;
    this.editing = false;
  };

  /** Marks the in or out point at the playhead. */
  mark = (edge: ClipEdge) => {
    this.#set(markClipEdge(edge, this.#replay.time, this.range, this.#replay.bounds));
  };

  /** Drags an edge to a time; the stage shows the frame being cut at. */
  trim = (edge: ClipEdge, time: number) => {
    const range = trimClipEdge(edge, time, this.range, this.#replay.bounds);

    this.#set(range);
    this.#replay.seek(edge === 'start' ? range.start : range.end);
  };

  /** Plays on to the out point, or the whole clip again from a playhead at or past it. */
  play = () => {
    if (this.#replay.playing) {
      this.#replay.pause();
      return;
    }

    const time = this.#replay.time;
    const beforeOut = time < this.end - MIN_CLIP_SECONDS / 2;

    this.#replay.playRange(beforeOut ? time : this.start, this.end);
  };

  startCrop = () => {
    this.measureStage();
    this.cropping = true;
  };

  endCrop = () => {
    this.cropping = false;
  };

  resetCrop = () => {
    this.aspect = 'free';
    this.crop = FULL_CROP;
  };

  chooseAspect = (aspect: CropAspect) => {
    const ratio = CROP_ASPECTS[aspect];

    this.aspect = aspect;
    if (ratio !== undefined) this.crop = fitCropAspect(this.crop, ratio, this.#stage);
  };

  /** Switching to a custom size starts from the size chosen so far. */
  chooseSize = (size: ClipSizeChoice) => {
    if (size === 'custom' && this.size !== 'custom') this.customWidth = this.frame.width;
    this.size = size;
  };

  /** A typed height sets the width that gives it at the crop's aspect. */
  setCustomHeight = (height: number) => {
    if (this.region.height <= 0) return;
    this.customWidth = (height * this.region.width) / this.region.height;
  };

  export = async () => {
    const controller = new AbortController();
    const range = this.range;

    this.#recording = controller;
    this.cropping = false;
    this.discard();
    this.measureStage();
    this.status = { kind: 'recording', done: 0, total: 1 };

    try {
      const clip = await recordClip({
        replay: this.#replay,
        container: this.#container(),
        canvasLayers: this.#canvasLayers(),
        settings: {
          range,
          speed: Number(this.speed),
          fps: Number(this.fps),
          crop: this.crop,
          frame: this.frame,
          format: {
            codec: this.codec,
            quality: this.quality,
            keyFrameInterval: Number(this.keyFrameInterval)
          }
        },
        signal: controller.signal,
        onprogress: (done, total) => (this.status = { kind: 'recording', done, total })
      });

      this.status = {
        kind: 'ready',
        url: URL.createObjectURL(clip.blob),
        fileName: clipFileName(this.#replay.capture.fileName, range, clip.extension),
        megabytes: clip.blob.size / 1024 / 1024
      };
    } catch (error) {
      if (controller.signal.aborted) {
        this.status = { kind: 'idle' };
        return;
      }

      if (!(error instanceof ClipUnavailableError)) console.error(error);
      this.status = {
        kind: 'failed',
        message:
          error instanceof ClipUnavailableError ? error.message : 'The clip could not be recorded.'
      };
    } finally {
      if (this.#recording === controller) this.#recording = undefined;
    }
  };

  cancel = () => {
    this.#recording?.abort();
  };

  /** Drops a finished clip or failure, so the bar describes the next export. */
  discard = () => {
    if (this.status.kind === 'ready') URL.revokeObjectURL(this.status.url);
    if (this.status.kind !== 'recording') this.status = { kind: 'idle' };
  };

  /** Reads the stage's size, which sets the crop's pixels and the sizes offered. */
  measureStage = () => {
    const box = findClipLayers(this.#container())?.stage.getBoundingClientRect();
    const width = box?.width ?? 0;
    const height = box?.height ?? 0;

    if (width !== this.#stage.width || height !== this.#stage.height)
      this.#stage = { width, height };
  };

  #set(range: { start: number; end: number }) {
    this.start = range.start;
    this.end = range.end;
    if (this.status.kind === 'failed') this.discard();
  }

  /** Disables the codecs this browser cannot encode, and moves off one it cannot. */
  async #checkCodecs() {
    if (this.encodable !== undefined) return;

    try {
      const typical = { width: 1280, height: 720 };
      const codecs = await encodableClipCodecs(this.frame.width > 0 ? this.frame : typical);
      const [fallback] = codecs;

      this.encodable = codecs;
      if (fallback !== undefined && !codecs.includes(this.codec)) this.codec = fallback;
    } catch (error) {
      // Every codec stays offered; an export in one the browser lacks says so then.
      console.error(error);
    }
  }
}
