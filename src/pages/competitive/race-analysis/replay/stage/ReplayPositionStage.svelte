<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { loadSkills, type SkillData } from '@/lib/game-data/skills/skills';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { theme } from '@/stores/theme';
  import type { Course, CourseShape } from '../replay-course';
  import type { ReplayState } from '../replay-state.svelte';
  import type { ReplayToggles } from '../replay-display';
  import type { RunnerCallout } from '../replay-callouts';
  import type { ClipLayerDraw } from '../clip/canvas-clip';
  import { replayTrack } from '../replay-track';
  import ReplayBrandMark, { BRAND_INSET } from '../ReplayBrandMark.svelte';
  import { courseFeatures, courseScene, keepZonesFor, stageGeometry } from './position-scene';
  import { stageMarkers } from './stage-markers';
  import { minimapScene, trackBounds } from './minimap-scene';
  import { BRAND_LOGO_URL, drawBrandMark } from './canvas/draw-brand-mark';
  import { drawPositionStage, type PositionFrame } from './canvas/draw-position-stage';
  import type { MarkerFocus } from './canvas/draw-markers';
  import { StageImages } from './canvas/stage-images';
  import { readStagePalette, type StagePalette } from './canvas/stage-palette';

  let {
    replay,
    course,
    toggles,
    callouts,
    shape,
    laneMax,
    laneTarget,
    positionViewport,
    finishFocus,
    visibility,
    fieldInset = 0,
    selected = $bindable('0'),
    overlay
  }: {
    replay: ReplayState;
    course?: Course;
    toggles: ReplayToggles;
    callouts: Map<number, RunnerCallout[]>;
    shape?: CourseShape;
    laneMax: number;
    laneTarget: number;
    positionViewport: { min: number; max: number };
    /** 0 to 1 as the camera turns to rest on the finish, centred on the whole stage. */
    finishFocus: number;
    visibility: Record<number, number>;
    /** Width covered by the race field overlay at the right edge, kept clear of runners. */
    fieldInset?: number;
    selected?: string;
    /** Drawn over the stage and left out of clips, such as the clip's crop window. */
    overlay?: Snippet;
  } = $props();

  let planeBox = $state.raw<DOMRectReadOnly>(),
    pixelRatio = $state(globalThis.devicePixelRatio || 1),
    brandWidth = $state(0),
    brandHeight = $state(0);

  let target = $state<HTMLDivElement>(),
    canvas = $state<HTMLCanvasElement>(),
    palette = $state.raw<StagePalette>(),
    skills = $state.raw(new Map<number, SkillData>());

  let hovered = $state<number>(),
    focused = $state<number>();

  let redrawFrame = 0;
  const images = new StageImages(requestRedraw);
  const compactMarkers = new MediaQuery('max-width: 700px');
  const compactBrand = new MediaQuery('max-width: 640px');

  // Track colours follow the theme and the course's surface, so either change re-reads them.
  const tokenScope = $derived({ dark: $theme === 'dark', dirt: course?.surface === 2 });
  const raceDistance = $derived(replay.bounds.distanceMax);
  const features = $derived(courseFeatures({ course, raceDistance, toggles }));
  const snap = $derived({ moving: replay.moving, pixelRatio });

  // The canvas covers whole device pixels, so the browser shows it 1:1 instead of resampling it.
  const backing = $derived({
    width: Math.floor((planeBox?.width ?? 1000) * pixelRatio + 0.001),
    height: Math.floor((planeBox?.height ?? 400) * pixelRatio + 0.001)
  });
  const stageSize = $derived({
    width: backing.width / pixelRatio,
    height: backing.height / pixelRatio
  });

  const brandBox = $derived({
    right: BRAND_INSET.left + brandWidth,
    top: stageSize.height - BRAND_INSET.bottom - brandHeight,
    bottom: stageSize.height - BRAND_INSET.bottom
  });

  const geometry = $derived(
    stageGeometry({
      size: stageSize,
      viewport: positionViewport,
      finishFocus,
      fieldInset,
      snap
    })
  );

  const startLanes = $derived(
    replay.capture.frames[0]?.horses.map((horse) => horse.lanePosition) ?? []
  );

  const gateOpen = $derived((replay.frame?.time ?? 0) > (replay.capture.frames[0]?.time ?? 0));
  const track = $derived(shape ? replayTrack(shape) : []);
  const bounds = $derived(trackBounds(track));

  const markers = $derived(
    stageMarkers({
      replay,
      geometry,
      laneMax,
      visibility,
      toggles,
      callouts,
      skills,
      snap,
      dark: $theme === 'dark'
    })
  );

  const frame: PositionFrame = $derived({
    geometry,
    course: courseScene({
      features,
      geometry,
      keepZones: keepZonesFor(replay.paceReference, raceDistance, toggles.positionKeep),
      laneMax,
      laneLabel: replay.laneMetres,
      startLanes,
      gateOpen,
      brand: brandBox
    }),
    markers,
    minimap: toggles.minimap
      ? minimapScene({
          points: track,
          bounds,
          stage: geometry.size,
          compact: compactMarkers.current,
          frame: replay.frame,
          runners: replay.capture.runners,
          viewport: positionViewport,
          selected: replay.runner?.index ?? -1,
          visibility,
          teamColor: replay.teamColor
        })
      : undefined,
    compactMarkers: compactMarkers.current
  });

  function paint() {
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !palette) return;

    if (canvas.width !== backing.width || canvas.height !== backing.height) {
      canvas.width = backing.width;
      canvas.height = backing.height;
    }

    const focus: MarkerFocus = { hovered, focused };
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    drawPositionStage(context, frame, focus, { palette, images });
  }

  // Images arrive outside any reactive change, so their redraw waits for the next frame.
  function requestRedraw() {
    if (redrawFrame) return;

    redrawFrame = requestAnimationFrame(() => {
      redrawFrame = 0;
      paint();
    });
  }

  /**
   * Loads what clip frames draw, so runners entering the view mid-clip have their portraits, and
   * returns the frame drawing. It reads the replay afresh, so a seek just before needs no flush, and
   * leaves hover and focus out.
   */
  export async function prepareClip(): Promise<ClipLayerDraw | undefined> {
    skills = await loadSkills().catch(() => skills);
    const portraits = replay.capture.runners.flatMap((runner) => {
      const url = portrait(runner.cardId);
      return url === undefined ? [] : [url];
    });

    await images.preload([BRAND_LOGO_URL, ...portraits]);

    return (context) => {
      if (!palette) return;

      drawPositionStage(context, frame, {}, { palette, images });
      drawBrandMark(context, {
        left: BRAND_INSET.left,
        bottom: brandBox.bottom,
        compact: compactBrand.current,
        palette,
        images
      });
    };
  }

  function hover(index: number) {
    hovered = index;
  }

  function leave(index: number) {
    if (hovered === index) hovered = undefined;
  }

  function focusMarker(event: FocusEvent, index: number) {
    if (event.currentTarget instanceof HTMLElement && event.currentTarget.matches(':focus-visible'))
      focused = index;
  }

  function blurMarker(index: number) {
    if (focused === index) focused = undefined;
  }

  $effect(() => {
    if (!target) return;

    palette = readStagePalette(target, tokenScope.dark);
    images.clearTiles();
  });

  // A runner leaving the view takes its button with it, without a pointer or focus event.
  $effect(() => {
    const shown = (index: number | undefined) => markers.some((marker) => marker.index === index);
    if (hovered !== undefined && !shown(hovered)) hovered = undefined;
    if (focused !== undefined && !shown(focused)) focused = undefined;
  });

  $effect(() => {
    paint();
  });

  onMount(() => {
    void loadSkills()
      .then((catalog) => (skills = catalog))
      .catch(() => {});

    return () => cancelAnimationFrame(redrawFrame);
  });
</script>

<svelte:window onresize={() => (pixelRatio = globalThis.devicePixelRatio || 1)} />

<div
  class="positions-target fullscreen-target"
  data-clip-layer="stage"
  bind:this={target}
>
  <div
    class="race-stage"
    data-lane-max={laneMax}
    data-lane-target={laneTarget}
    role="group"
    aria-label="Runner positions by distance and lane"
  >
    <div
      class="track-plane"
      bind:contentRect={planeBox}
    >
      <canvas
        class="stage-canvas"
        style:width={stageSize.width + 'px'}
        style:height={stageSize.height + 'px'}
        bind:this={canvas}
        aria-hidden="true"
      ></canvas>
      <ReplayBrandMark
        bind:width={brandWidth}
        bind:height={brandHeight}
      />
      <div class="marker-buttons">
        {#each markers as marker (marker.index)}
          <button
            class="marker-button"
            class:selected={marker.readout.selected}
            style:transform={'translate3d(' + marker.x + 'px, ' + marker.y + 'px, 0)'}
            data-runner-index={marker.index}
            aria-label={'Inspect ' + marker.name}
            aria-pressed={marker.readout.selected}
            title={marker.readout.description}
            onclick={() => (selected = String(marker.index))}
            onpointerenter={() => hover(marker.index)}
            onpointerleave={() => leave(marker.index)}
            onfocus={(event) => focusMarker(event, marker.index)}
            onblur={() => blurMarker(marker.index)}
          ></button>
        {/each}
      </div>
    </div>
  </div>
  {@render overlay?.()}
</div>

<style>
  @import './replay-position-stage.css';
</style>
