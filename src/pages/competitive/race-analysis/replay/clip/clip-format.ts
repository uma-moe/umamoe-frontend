/** The video codecs offered, each in the container that plays it most widely. */
export type ClipCodec = 'avc' | 'hevc' | 'av1' | 'vp9';

export type ClipQuality = 'very-high' | 'high' | 'medium' | 'low';

export interface ClipFormat {
  codec: ClipCodec;
  quality: ClipQuality;
  /** Seconds between key frames; shorter seeks better in an editor but makes a larger file. */
  keyFrameInterval: number;
}

export const CLIP_CODECS: { value: ClipCodec; label: string }[] = [
  { value: 'avc', label: 'MP4 · H.264' },
  { value: 'hevc', label: 'MP4 · H.265' },
  { value: 'av1', label: 'MP4 · AV1' },
  { value: 'vp9', label: 'WebM · VP9' }
];

export const CLIP_QUALITIES: { value: ClipQuality; label: string }[] = [
  { value: 'very-high', label: 'Very high' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' }
];

export const KEY_FRAME_INTERVALS = ['0.5', '1', '2', '5'];

export function isClipCodec(value: string): value is ClipCodec {
  return CLIP_CODECS.some((option) => option.value === value);
}

export function isClipQuality(value: string): value is ClipQuality {
  return CLIP_QUALITIES.some((option) => option.value === value);
}

export function codecLabel(codec: ClipCodec) {
  return CLIP_CODECS.find((option) => option.value === codec)?.label ?? codec;
}
