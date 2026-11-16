<script lang="ts">
  import { onMount } from 'svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import {
    createRacecourseScene,
    type CameraMode,
    type RacecourseScene as RacecourseSceneView,
    type StartPoint
  } from './racecourse-scene';
  import { hasWebGL2 } from './webgl';

  interface Props {
    /** The course model to draw. Changing it swaps the model without rebuilding the canvas. */
    url?: string;
    /** An outfit to stand on the course; `undefined` shows none. */
    characterUrl?: string;
    /** A race clip to play on that outfit; `undefined` lets her motion follow her speed. */
    motionUrl?: string;
    /** Every published clip, so switching between them never waits on the network. */
    motionUrls?: string[];
    /** Where the track starts, so she stands at the line rather than the middle. */
    startPoint?: StartPoint;
    /** What the model shows, for the stage's accessible name and the loading line. */
    label: string;
    /** Overview orbits the course; walk stands on it at a horsegirl's height. */
    mode?: CameraMode;
  }

  let {
    url = '',
    characterUrl,
    motionUrl,
    motionUrls,
    startPoint,
    label,
    mode = 'overview'
  }: Props = $props();

  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let view = $state.raw<RacecourseSceneView>();
  let unsupported = $state(false);
  let failure = $state('');
  let percent = $state<number | null>(null);

  function onProgress(loaded: number, total: number) {
    percent = total > 0 ? Math.round((loaded / total) * 100) : null;
  }

  function onFailure(message: string) {
    failure = message;
    percent = null;
  }

  async function show(scene: RacecourseSceneView, target: string) {
    percent = 0;
    try {
      await scene.load(target);
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
    view = createRacecourseScene({ canvas, host, handlers: { onProgress, onFailure } });
    return () => {
      view?.dispose();
      view = undefined;
    };
  });

  $effect(() => {
    const scene = view;
    const target = url;
    if (!scene || !target) return;
    void show(scene, target);
  });

  $effect(() => {
    view?.setMode(mode);
  });

  $effect(() => {
    void view?.setCharacter(characterUrl);
  });

  $effect(() => {
    view?.setMotionCatalog(motionUrls ?? []);
  });

  $effect(() => {
    void view?.setMotion(motionUrl);
  });

  $effect(() => {
    view?.setTrackStart(startPoint);
  });
</script>

<div
  class="racecourse-stage"
  bind:this={host}
>
  <p class="sr-only">Interactive 3D view of the {label}. Drag to orbit it and scroll to zoom.</p>

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
    <div
      class="racecourse-stage-loading"
      role="status"
    >
      <Spinner size={18} />
      <span>Loading {label}{percent > 0 ? ` · ${percent}%` : ''}</span>
    </div>
  {:else if mode === 'third'}
    <p class="racecourse-stage-hint">WASD to walk · Shift to run · drag to orbit</p>
  {/if}
</div>

<style>
  @import './racecourse-stage.css';
</style>
