import type { ClipFrameSize } from './clip-plan';
import { CLIP_CODECS, codecLabel, type ClipCodec, type ClipFormat } from './clip-format';

/** A reason a clip cannot be made that the reader can act on, shown as written. */
export class ClipUnavailableError extends Error {}

export interface ClipEncoder {
  /** Without the leading dot, such as `mp4`. */
  extension: string;
  add: (timestamp: number, duration: number) => Promise<void>;
  finish: () => Promise<Blob>;
  cancel: () => Promise<void>;
}

// The muxer and encoders load only when someone cuts a clip.
const loadMedia = () => import('mediabunny');

type Media = Awaited<ReturnType<typeof loadMedia>>;

function mediaQuality(media: Media, quality: ClipFormat['quality']) {
  switch (quality) {
    case 'very-high':
      return media.QUALITY_VERY_HIGH;
    case 'high':
      return media.QUALITY_HIGH;
    case 'medium':
      return media.QUALITY_MEDIUM;
    case 'low':
      return media.QUALITY_LOW;
    default: {
      const unknown: never = quality;
      throw new Error('Unknown clip quality: ' + String(unknown));
    }
  }
}

/** The offered codecs this browser can encode at a frame size; none where it has no video encoder. */
export async function encodableClipCodecs(size: ClipFrameSize): Promise<ClipCodec[]> {
  if (typeof VideoEncoder === 'undefined') return [];

  const media = await loadMedia();
  const codecs = await media.getEncodableVideoCodecs(
    CLIP_CODECS.map((option) => option.value),
    size
  );

  return CLIP_CODECS.map((option) => option.value).filter((codec) => codecs.includes(codec));
}

/** Encodes the canvas, frame by frame as it is drawn, in the chosen codec and its container. */
export async function createClipEncoder({
  canvas,
  fps,
  format
}: {
  canvas: HTMLCanvasElement;
  fps: number;
  format: ClipFormat;
}): Promise<ClipEncoder> {
  if (typeof VideoEncoder === 'undefined')
    throw new ClipUnavailableError('This browser cannot encode video.');

  const media = await loadMedia();
  const quality = mediaQuality(media, format.quality);
  const encodable = await media.canEncodeVideo(format.codec, {
    width: canvas.width,
    height: canvas.height,
    quality,
    frameRate: fps
  });
  if (!encodable)
    throw new ClipUnavailableError(
      `This browser cannot encode ${codecLabel(format.codec)} at ${canvas.width} × ${canvas.height}.`
    );

  const container =
    format.codec === 'vp9'
      ? new media.WebMOutputFormat()
      : new media.Mp4OutputFormat({ fastStart: 'in-memory' });
  const target = new media.BufferTarget();
  const output = new media.Output({ format: container, target });
  const source = new media.CanvasSource(canvas, {
    codec: format.codec,
    quality,
    keyFrameInterval: format.keyFrameInterval
  });

  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  return {
    extension: container.fileExtension.replace(/^\./, ''),
    add: (timestamp, duration) => source.add(timestamp, duration),
    finish: async () => {
      await output.finalize();
      if (target.buffer === null) throw new Error('The encoder produced no video.');

      return new Blob([target.buffer], { type: container.mimeType });
    },
    cancel: () => output.cancel()
  };
}
