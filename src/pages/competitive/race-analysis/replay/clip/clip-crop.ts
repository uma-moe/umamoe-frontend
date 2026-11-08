/** A crop window as fractions of the stage, so it keeps its place when the stage resizes. */
export interface ClipCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageSize {
  width: number;
  height: number;
}

/** A rectangle in pixels. */
export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a pointer drags: the whole window, or one of its edges or corners. */
export type CropHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export type CropAspect = 'free' | '16:9' | '9:16' | '1:1';

export const CROP_ASPECTS: Record<CropAspect, number | undefined> = {
  free: undefined,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1
};

export function isCropAspect(value: string): value is CropAspect {
  return Object.hasOwn(CROP_ASPECTS, value);
}

export const FULL_CROP: ClipCrop = { x: 0, y: 0, width: 1, height: 1 };

/** The smallest window side in stage pixels, still large enough to grab. */
export const MIN_CROP_PIXELS = 48;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function isFullCrop(crop: ClipCrop) {
  return crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1;
}

export function cropPixels(crop: ClipCrop, stage: StageSize): PixelBox {
  return {
    x: crop.x * stage.width,
    y: crop.y * stage.height,
    width: crop.width * stage.width,
    height: crop.height * stage.height
  };
}

function cropFromPixels(box: PixelBox, stage: StageSize): ClipCrop {
  return {
    x: box.x / stage.width,
    y: box.y / stage.height,
    width: box.width / stage.width,
    height: box.height / stage.height
  };
}

/** Holds an aspect after an edge or corner moved: the moved side sets the size, the opposite side stays put. */
function lockAspect(
  edges: { left: number; top: number; right: number; bottom: number },
  handle: Exclude<CropHandle, 'move'>,
  aspect: number,
  stage: StageSize
): ClipCrop {
  const vertical = handle === 'n' || handle === 's';
  let width = edges.right - edges.left;
  let height = edges.bottom - edges.top;

  if (vertical) width = height * aspect;
  else height = width / aspect;

  const grow = Math.max(1, MIN_CROP_PIXELS / width, MIN_CROP_PIXELS / height);
  const shrink = Math.min(1, stage.width / (width * grow), stage.height / (height * grow));
  width *= grow * shrink;
  height *= grow * shrink;

  const centreX = (edges.left + edges.right) / 2;
  const centreY = (edges.top + edges.bottom) / 2;
  let x = centreX - width / 2;
  let y = centreY - height / 2;

  if (handle.includes('w')) x = edges.right - width;
  else if (handle.includes('e')) x = edges.left;
  if (handle.includes('n')) y = edges.bottom - height;
  else if (handle.includes('s')) y = edges.top;

  const box = {
    x: clamp(x, 0, stage.width - width),
    y: clamp(y, 0, stage.height - height),
    width,
    height
  };

  return cropFromPixels(box, stage);
}

/** The window after dragging a handle by dx, dy stage pixels from where the drag began. */
export function dragCrop({
  start,
  handle,
  dx,
  dy,
  stage,
  aspect
}: {
  start: ClipCrop;
  handle: CropHandle;
  dx: number;
  dy: number;
  stage: StageSize;
  /** Width over height to hold, if any. */
  aspect?: number;
}): ClipCrop {
  const box = cropPixels(start, stage);

  if (handle === 'move') {
    const moved = {
      x: clamp(box.x + dx, 0, stage.width - box.width),
      y: clamp(box.y + dy, 0, stage.height - box.height),
      width: box.width,
      height: box.height
    };

    return cropFromPixels(moved, stage);
  }

  let left = box.x;
  let top = box.y;
  let right = box.x + box.width;
  let bottom = box.y + box.height;

  if (handle.includes('w')) left = clamp(left + dx, 0, right - MIN_CROP_PIXELS);
  if (handle.includes('e')) right = clamp(right + dx, left + MIN_CROP_PIXELS, stage.width);
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - MIN_CROP_PIXELS);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + MIN_CROP_PIXELS, stage.height);

  if (aspect !== undefined) return lockAspect({ left, top, right, bottom }, handle, aspect, stage);

  return cropFromPixels({ x: left, y: top, width: right - left, height: bottom - top }, stage);
}

/** The largest window of an aspect on the stage, centred where the current window is as far as it fits. */
export function fitCropAspect(crop: ClipCrop, aspect: number, stage: StageSize): ClipCrop {
  const box = cropPixels(crop, stage);
  const width = Math.min(stage.width, stage.height * aspect);
  const height = width / aspect;
  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;

  return cropFromPixels(
    {
      x: clamp(centreX - width / 2, 0, stage.width - width),
      y: clamp(centreY - height / 2, 0, stage.height - height),
      width,
      height
    },
    stage
  );
}

/**
 * Where a layer lands in the video: the part of it inside the cropped region, in the layer's own
 * pixels (`view`) and in the frame's (`target`). A layer outside the region is not drawn.
 */
export function layerPlacement({
  layer,
  region,
  frame
}: {
  /** The layer's box relative to the stage. */
  layer: PixelBox;
  /** The cropped region of the stage. */
  region: PixelBox;
  frame: StageSize;
}): { view: PixelBox; target: PixelBox } | undefined {
  const left = Math.max(layer.x, region.x);
  const top = Math.max(layer.y, region.y);
  const right = Math.min(layer.x + layer.width, region.x + region.width);
  const bottom = Math.min(layer.y + layer.height, region.y + region.height);
  if (right <= left || bottom <= top) return undefined;

  const scaleX = frame.width / region.width;
  const scaleY = frame.height / region.height;

  return {
    view: { x: left - layer.x, y: top - layer.y, width: right - left, height: bottom - top },
    target: {
      x: (left - region.x) * scaleX,
      y: (top - region.y) * scaleY,
      width: (right - left) * scaleX,
      height: (bottom - top) * scaleY
    }
  };
}
