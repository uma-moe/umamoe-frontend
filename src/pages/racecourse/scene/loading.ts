// Fetching a course's files, and knowing when a fetch has lost the race to a newer one.

import { Group, LoadingManager, type Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

export type ProgressHandler = (loaded: number, total: number) => void;

export interface LoadedCourse {
  /** The load this arrived from; a token older than the latest load is stale. */
  token: number;
  gltfs: GLTF[];
}

export interface CourseLoader {
  /** Fetches every file of one course. Resolves nothing when a newer load replaced it mid-flight. */
  load(targets: string[]): Promise<LoadedCourse | undefined>;
  /** Whether a course that arrived is already out of date. */
  isStale(token: number): boolean;
  /** Makes every load in flight stale, so none of them can reach the stage. */
  dispose(): void;
}

export function createCourseLoader(onProgress: ProgressHandler): CourseLoader {
  let generation = 0;
  /** The files of the load the overlay is showing; the shared manager also counts older loads' files. */
  let tracked = new Set<string>();

  const manager = new LoadingManager();
  // Progress across the prefabs of one course: how many files are done, not how many bytes.
  manager.onProgress = (url, loaded, total) => {
    // A file of a course the reader already switched away from must not move the new course's bar.
    if (!tracked.has(url)) return;
    onProgress(loaded, total);
  };
  const loader = new GLTFLoader(manager);

  function load(targets: string[]): Promise<LoadedCourse | undefined> {
    const token = ++generation;
    tracked = new Set(targets);

    // Byte progress across the files of one course, so the overlay can show a real percentage.
    const progress = new Map<string, { loaded: number; total: number }>();
    const report = (): void => {
      let loaded = 0;
      let total = 0;
      for (const entry of progress.values()) {
        loaded += entry.loaded;
        total += entry.total;
      }
      if (token === generation) onProgress(loaded, total);
    };

    return Promise.all(
      targets.map(
        (target) =>
          new Promise<GLTF>((resolve, reject) => {
            loader.load(
              target,
              resolve,
              (event) => {
                const total = event.total || event.loaded;
                progress.set(target, { loaded: event.loaded, total });
                report();
              },
              (error) => reject(error instanceof Error ? error : new Error(String(error)))
            );
          })
      )
    )
      .then((gltfs): LoadedCourse => ({ token, gltfs }))
      .catch((error: unknown): LoadedCourse | undefined => {
        // A failure of a load nobody is waiting for any more is not the reader's problem.
        if (token !== generation) return undefined;
        throw error instanceof Error ? error : new Error(String(error));
      });
  }

  return {
    load,
    isStale: (token) => token !== generation,
    dispose() {
      generation += 1;
      tracked = new Set();
    }
  };
}

/**
 * A whole-course model arrives as one scene; a course assembled from prefabs arrives as several, all
 * modelled where they stand, so their root nodes are added side by side without a transform. Adding the
 * nodes rather than each file's scene wrapper keeps their names, which is how the sky and the racing
 * surface are told apart when framing.
 */
export function assembleCourse(gltfs: readonly GLTF[]): Object3D {
  const [only] = gltfs;
  if (gltfs.length === 1 && only) return only.scene;

  const root = new Group();
  for (const gltf of gltfs) for (const child of [...gltf.scene.children]) root.add(child);
  return root;
}
