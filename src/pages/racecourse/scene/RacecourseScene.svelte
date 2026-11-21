<script lang="ts">
  import { onMount } from 'svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import {
    createRacecourseScene,
    type CameraMode,
    type RacecourseScene as RacecourseSceneView
  } from './racecourse-scene';
  import { hasWebGL2 } from './webgl';

  interface Props {
    /** The files of the course to draw: one whole-course model, or the prefabs it is assembled from. */
    urls?: string[];
    /** The racing line of the selected course, in simulator coordinates, to mark on the track. */
    line?: readonly (readonly [number, number])[];
    /** What the model shows, for the stage's accessible name and the loading card. */
    label: string;
  }

  let { urls = [], line, label }: Props = $props();

  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let view = $state.raw<RacecourseSceneView>();
  let unsupported = $state(false);
  let failure = $state('');
  let percent = $state<number | null>(null);
  /** How the camera is driven, which decides what the controls and the hint offer. */
  let mode = $state<CameraMode>('fly');
  /** Whether the racing surface's edges are drawn over the course. */
  let rails = $state(false);
  /** Where the fly camera is, shown so a view can be quoted and reproduced. */
  let spot = $state<{ x: number; y: number; z: number }>();

  function onProgress(loaded: number, total: number) {
    percent = total > 0 ? Math.round((loaded / total) * 100) : null;
  }

  function onFailure(message: string) {
    failure = message;
    percent = null;
  }

  async function show(scene: RacecourseSceneView, targets: string[]) {
    percent = 0;
    try {
      await scene.load(targets);
      // A new model drops the marked line; put back whatever course is selected.
      scene.highlight(line);
    } catch {
      failure = 'This course model could not be loaded. Check the connection and try again.';
    } finally {
      percent = null;
    }
  }

  onMount(() => {
    if (!hasWebGL2()) {
      unsupported = true;
      return;
    }
    view = createRacecourseScene({
      canvas,
      host,
      handlers: {
        onProgress,
        onFailure,
        onViewChange: (next) => (mode = next),
        onCameraMove: (x, y, z) => (spot = { x, y, z })
      }
    });
    return () => {
      view?.dispose();
      view = undefined;
    };
  });

  $effect(() => {
    const scene = view;
    const targets = urls;
    if (!scene || targets.length === 0) return;
    void show(scene, targets);
  });

  // The marked line follows the course selection.
  $effect(() => {
    const scene = view;
    const points = line;
    if (!scene) return;
    scene.highlight(points);
  });

  // The rail outline follows the toggle; a new course redraws it from the scene itself.
  $effect(() => {
    const scene = view;
    const on = rails;
    if (!scene) return;
    scene.rails(on);
  });
</script>

<div
  class="racecourse-stage"
  bind:this={host}
>
  <p class="sr-only">
    Interactive 3D view of the {label} course. Click to capture the pointer, then move the mouse to look
    and use W, A, S, D to fly, Q and E to drop and rise. The buttons zoom, frame the course again, and
    look straight down at it.
  </p>

  <canvas
    bind:this={canvas}
    aria-hidden="true"
  ></canvas>

  {#if unsupported}
    <p
      class="racecourse-stage-message"
      role="alert"
    >
      This browser cannot draw 3D. Use a current browser, or open the course details in the
      simulator instead.
    </p>
  {:else if failure}
    <p
      class="racecourse-stage-message"
      role="alert"
    >
      {failure}
    </p>
  {:else if percent !== null}
    <!-- Switching courses keeps the old one on screen; this says what is happening over it. -->
    <div
      class="racecourse-stage-loading"
      role="status"
      aria-live="polite"
    >
      <div class="racecourse-stage-loading-card">
        <Spinner size={22} />
        <span class="racecourse-stage-loading-label">Loading {label}</span>
        <span class="racecourse-stage-loading-bar">
          <span
            class="racecourse-stage-loading-fill"
            style:width={`${percent}%`}
          ></span>
        </span>
      </div>
    </div>
  {:else}
    <p class="racecourse-stage-hint">
      {#if mode === 'topDown'}
        Straight down
      {:else}
        Click to look · WASD to fly · Q/E down and up
      {/if}
    </p>
    {#if mode === 'fly' && spot}
      <p class="racecourse-stage-spot">
        {spot.x.toFixed(0)} · {spot.y.toFixed(0)} · {spot.z.toFixed(0)}
      </p>
    {/if}
  {/if}

  {#if !unsupported && !failure}
    <!-- Google-Maps style: a small stack in the corner for the things a mouse-less reader needs. -->
    <div class="racecourse-stage-controls">
      <IconButton
        icon="add"
        label="Zoom in"
        size="sm"
        onclick={() => view?.zoom(1)}
      />
      <IconButton
        icon="minus"
        label="Zoom out"
        size="sm"
        onclick={() => view?.zoom(-1)}
      />
      <IconButton
        icon="compass"
        label="Free camera"
        size="sm"
        onclick={() => view?.freeCamera()}
      />
      <IconButton
        icon="grid"
        label="Look straight down"
        size="sm"
        onclick={() => view?.topDown()}
      />
      <IconButton
        icon="eye"
        label="Show the rails"
        selected={rails}
        size="sm"
        onclick={() => (rails = !rails)}
      />
    </div>
  {/if}
</div>

<style>
  @import './racecourse-stage.css';
</style>
