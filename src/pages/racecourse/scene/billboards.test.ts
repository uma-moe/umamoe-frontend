import { Box3, BoxGeometry, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { collectBillboards, facingAngle } from './billboards';

function tree(name: string, span: number, x: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(span, 8, span), new MeshBasicMaterial());
  mesh.name = name;
  mesh.position.set(x, 4, z);
  return mesh;
}

const COURSE = new Box3(new Vector3(-100, 0, -100), new Vector3(100, 10, 100));

describe('collectBillboards', () => {
  it('takes a single infield tree and leaves the merged tree line alone', () => {
    const before = tree('treeA018', 10, 0, 0);
    const merged = tree('tree_alpha', 1500, 0, 0);
    const model = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    model.add(before, merged);

    const trees = collectBillboards(model, COURSE);

    expect(trees.map((entry) => entry.node)).toEqual([before]);
    expect(trees[0]?.x).toBe(0);
  });

  it('leaves out a tree past the course box, and anything that is not a tree', () => {
    const far = tree('tree_', 10, 400, 0);
    const near = tree('sotetsu01', 10, 60, 0);
    const stand = tree('stand', 10, 0, 0);
    const model = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    model.add(far, near, stand);

    expect(collectBillboards(model, COURSE).map((entry) => entry.node)).toEqual([near]);
  });

  it('has nothing to turn without a course box', () => {
    expect(collectBillboards(tree('tree_', 10, 0, 0), undefined)).toEqual([]);
  });
});

describe('facingAngle', () => {
  it('turns a tree towards the camera', () => {
    expect(facingAngle({ x: 0, z: 0 }, { x: 0, z: 10 })).toBeCloseTo(0, 6);
    expect(facingAngle({ x: 0, z: 0 }, { x: 10, z: 0 })).toBeCloseTo(Math.PI / 2, 6);
    expect(facingAngle({ x: 0, z: 0 }, { x: 0, z: -10 })).toBeCloseTo(Math.PI, 6);
  });

  it('has no angle when the camera stands on top of the tree, so the last one holds', () => {
    expect(facingAngle({ x: 0, z: 0 }, { x: 0.5, z: 0.5 })).toBeUndefined();
  });
});
