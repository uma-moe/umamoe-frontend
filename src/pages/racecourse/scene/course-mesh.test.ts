import { describe, expect, it } from 'vitest';
import { isSkyNode, isSurfaceMesh, isTrackPart, isTreeMesh } from './course-mesh';

describe('course mesh names', () => {
  it('finds the racing surface by its lightmapped parts', () => {
    expect(isSurfaceMesh({ name: 'turf_lm_0000_0' })).toBe(true);
    expect(isSurfaceMesh({ name: 'dirt_lm_0001_0' })).toBe(true);
    expect(isSurfaceMesh({ name: 'turf_0000_0' })).toBe(false);
  });

  it('finds the trees by every name the courses use for them', () => {
    for (const name of [
      'tree_',
      'treeA018',
      'treeE_1_23',
      '_tree_H_39',
      'sotetsu01',
      'center_tree'
    ])
      expect(isTreeMesh({ name })).toBe(true);

    expect(isTreeMesh({ name: 'stand_roof' })).toBe(false);
  });

  it('finds the numbered parts of a course', () => {
    expect(isTrackPart({ name: 'track_0000_2' })).toBe(true);
    expect(isTrackPart({ name: 'track_0001_2' })).toBe(true);
    expect(isTrackPart({ name: 'track_0002_2' })).toBe(false);
  });

  it('finds the shared sky dome', () => {
    expect(isSkyNode({ name: 'pfb_env_race00000_9000_112' })).toBe(true);
    expect(isSkyNode({ name: 'turf_lm_0000_0' })).toBe(false);
  });
});
