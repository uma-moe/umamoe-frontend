// What the game calls the parts of a course model. Every pattern here is a fact about the files the
// game ships, not a choice this viewer made, so they live together and away from the numbers we tuned.

/**
 * The racing surface, which is what the opening view frames: the track and turf lightmapped meshes. The
 * track part also carries the far scenery and the cloud ring, so framing its whole box opens too wide.
 */
export const SURFACE_MESH = /^(turf|dirt)_lm/;
/**
 * The trees: flat quads the game turns towards the camera. Courses name them by tree type (`tree_`,
 * `treeA018`, `treeE_1_23`, and Hanshin's `_tree_H_39`), and the infield adds `sotetsu` palms and a
 * planted `center_tree`.
 */
export const TREE_NODE = /^_?(tree|sotetsu|center_tree)/i;
/** The numbered parts a course is cut into, which is the fallback frame when no surface can be found. */
export const TRACK_PART = /_000[01]_/;
/**
 * The shared sky dome that is part of every course model, `pfb_env_race00000_9000_112`. It is drawn
 * from inside, and it never decides the framing or the ground.
 */
export const SKY_NODE = /race00000/;

/** A node the model uses for the racing surface: track and turf, track and dirt. */
export function isSurfaceMesh(part: { name: string }): boolean {
  return SURFACE_MESH.test(part.name);
}

/** A node the game draws as a camera-facing tree. */
export function isTreeMesh(part: { name: string }): boolean {
  return TREE_NODE.test(part.name);
}

/** A node that is one of the numbered parts of the course. */
export function isTrackPart(part: { name: string }): boolean {
  return TRACK_PART.test(part.name);
}

/** A node the model uses for the sky dome. */
export function isSkyNode(part: { name: string }): boolean {
  return SKY_NODE.test(part.name);
}
