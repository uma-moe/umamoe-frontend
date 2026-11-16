<script lang="ts">
  import { onMount } from 'svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import {
    createRacecourseScene,
    type RacecourseScene as RacecourseSceneView
  } from './racecourse-scene';
  import { hasWebGL2 } from './webgl';

  interface Props {
    /** The files of the course to draw: one whole-course model, or the prefabs it is assembled from. */
    urls?: string[];
    /** What the model shows, for the stage's accessible name and the loading line. */
    label: string;
  }

  let { urls = [], label }: Props = $props();

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

  async function show(scene: RacecourseSceneView, targets: string[]) {
    percent = 0;
    try {
      await scene.load(targets);
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
    const targets = urls;
    if (!scene || targets.length === 0) return;
    void show(scene, targets);
  });
</script>

<div
  class="racecourse-stage"
  bind:this={host}
>
  <p class="sr-only">
    Interactive 3D view of the {label}. Click to capture the pointer, then move the mouse to look
    and use W, A, S, D to fly, Q and E to drop and rise.
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
    <div
      class="racecourse-stage-loading"
      role="status"
    >
      <Spinner size={18} />
      <span>Loading {label}{percent > 0 ? ` · ${percent}%` : ''}</span>
    </div>
  {:else}
    <p class="racecourse-stage-hint">Click to look · WASD to fly · Q/E down and up</p>
  {/if}
</div>

<style>
  @import './racecourse-stage.css';
</style>
