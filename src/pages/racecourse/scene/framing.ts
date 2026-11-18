// Where the opening view stands and how far back it has to be. Plain numbers in, plain numbers out, so
// the framing can be checked without a GPU.

import { Vector3 } from 'three';

/** The vertical field of view the stage has always used, in degrees. */
export const CAMERA_FOV = 50;
/** Close enough to the ground that the track surface stays in front of the near plane. */
export const NEAR_PLANE = 0.1;
/** How far the camera can ever see. Only the far scenery needs it. */
export const FAR_LIMIT = 20000;
/** Where the camera starts before a course is loaded, so the first frame is not at the origin. */
export const OPENING_DISTANCE = 1200;

/** Leave the course inside the frame with a little air around it. */
export const FRAME_MARGIN = 1.12;
/**
 * The opening view looks down at the course rather than across it: a shallow angle projects the
 * infield's depth into the frame, which pushes the camera far enough back that a wide, short stage
 * shows a small ring in the middle.
 */
export const OPENING_DIRECTION = new Vector3(0.4, 0.85, 0.45).normalize();
/** A phone is taller than the course is wide: look down more so the ring uses the height. */
export const PORTRAIT_DIRECTION = new Vector3(0.25, 0.93, 0.28).normalize();
/**
 * Where the fly camera starts, read off a view worth keeping: low over the infield, looking at the course.
 * It is in the model's own space, so it is a spot on one course rather than a rule for all of them.
 */
export const FLY_START = new Vector3(16, 13, -11);

/** The camera's far plane reaches past the frame by this many course radii. */
const FAR_REACH = 4;
/** A zoom step is this share of the distance to what the camera is looking at. */
const ZOOM_SPAN = 0.25;
/** Unless that is tiny, in which case it is this many metres. */
const ZOOM_MINIMUM = 4;

export interface BoxSize {
  x: number;
  y: number;
  z: number;
}

export interface ViewGeometry {
  /** World-space size of what has to fit in the frame. */
  size: BoxSize;
  aspect: number;
  /** Unit vector pointing from the subject towards the camera. */
  direction: { x: number; y: number; z: number };
  fov: number;
}

/**
 * How far the camera has to stand from the centre to fit the box's silhouette, the way a model viewer
 * does, rather than all eight corners.
 */
export function fitDistance({ size, aspect, direction, fov }: ViewGeometry): number {
  const tanVertical = Math.tan((fov * Math.PI) / 360);
  const tanHorizontal = tanVertical * aspect;

  // The view's right and up, from the up axis alone: `right = up x direction`, `up = direction x right`.
  // A direction straight down has no right, and both extents then collapse to zero, as they did when
  // this was a cross product of two three vectors.
  const rightLength = Math.hypot(direction.z, direction.x) || 1;
  const rightX = direction.z / rightLength;
  const rightZ = -direction.x / rightLength;
  const upX = direction.y * rightZ;
  const upY = direction.z * rightX - direction.x * rightZ;
  const upZ = -direction.y * rightX;

  const halfLateral = (Math.abs(size.x * rightX) + Math.abs(size.z * rightZ)) / 2;
  const halfVertical =
    (Math.abs(size.x * upX) + Math.abs(size.y * upY) + Math.abs(size.z * upZ)) / 2;

  return Math.max(halfLateral / tanHorizontal, halfVertical / tanVertical) * FRAME_MARGIN;
}

/**
 * How far above the centre the straight-down shot stands. Screen vertical is the course's north-south
 * span, screen horizontal its east-west span.
 */
export function topDownDistance({ size, aspect, fov }: Omit<ViewGeometry, 'direction'>): number {
  const tanVertical = Math.tan((fov * Math.PI) / 360);
  const tanHorizontal = tanVertical * aspect;
  return Math.max(size.z / 2 / tanVertical, size.x / 2 / tanHorizontal) * FRAME_MARGIN;
}

/** The far plane for a camera standing `distance` from a course of `sceneRadius`. */
export function farFor(distance: number, sceneRadius: number): number {
  return distance + sceneRadius * FAR_REACH;
}

/**
 * Zoom, Google-Maps style: a step along the line of sight, sized by how far the camera already is
 * from what it is looking at.
 */
export function zoomStep(span: number, direction: 1 | -1): number {
  return Math.max(span * ZOOM_SPAN, ZOOM_MINIMUM) * direction;
}
