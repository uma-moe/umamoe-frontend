import { BoxGeometry, Mesh, MeshBasicMaterial, Texture, ShaderMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { disposeObjects, retain } from './dispose';

function tracked(): Texture {
  const texture = new Texture();
  vi.spyOn(texture, 'dispose');
  return texture;
}

describe('disposeObjects', () => {
  it('frees a texture two meshes share exactly once', () => {
    const texture = tracked();
    const material = new MeshBasicMaterial({ map: texture });
    const geometry = new BoxGeometry(1, 1, 1);
    vi.spyOn(geometry, 'dispose');
    const first = new Mesh(geometry, material);
    const second = new Mesh(geometry, material);

    disposeObjects(first, second);

    expect(texture.dispose).toHaveBeenCalledTimes(1);
    expect(geometry.dispose).toHaveBeenCalledTimes(1);
  });

  it('reaches the samplers a shader keeps in its uniforms', () => {
    const lightmap = tracked();
    const material = new ShaderMaterial({ uniforms: { uLightTex: { value: lightmap } } });
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), material);

    disposeObjects(mesh);

    expect(lightmap.dispose).toHaveBeenCalledTimes(1);
  });

  it('leaves a texture that outlives the model alone', () => {
    const shared = tracked();
    const material = new MeshBasicMaterial({ map: retain(shared) });

    disposeObjects(new Mesh(new BoxGeometry(1, 1, 1), material));

    expect(shared.dispose).not.toHaveBeenCalled();
  });

  it('walks the whole tree, not just its root', () => {
    const texture = tracked();
    const parent = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    parent.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ map: texture })));

    disposeObjects(parent);

    expect(texture.dispose).toHaveBeenCalledTimes(1);
  });
});
