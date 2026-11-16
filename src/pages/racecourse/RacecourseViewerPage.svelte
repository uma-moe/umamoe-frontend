<script lang="ts">
  import { onMount } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import SelectField, { type SelectOption } from '@/components/controls/SelectField.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { loadRacecourseModels, type RacecourseModel } from '@/lib/game-assets/racecourse-models';
  import { loadUmaModels, type UmaModel } from '@/lib/game-assets/uma-models';
  import { loadUmaMotions, type UmaMotion } from '@/lib/game-assets/uma-motions';
  import RacecourseScene from './scene/RacecourseScene.svelte';
  import type { CameraMode } from './scene/racecourse-scene';
  import {
    loadReplayCourses,
    loadReplayGeometry
  } from '@/pages/competitive/race-analysis/replay/replay-course';

  const TRACK_PARAM = 'track';
  const UMA_PARAM = 'uma';
  const MOTION_PARAM = 'motion';
  /** An empty value lets her motion follow her speed: gate waiting, then running. */
  const DEFAULT_MOTION = '';
  /** The outfit the page opens with. */
  const DEFAULT_UMA = 'special-week/special-dreamer';

  let models = $state.raw<RacecourseModel[]>([]);
  let umas = $state.raw<UmaModel[]>([]);
  let motions = $state.raw<UmaMotion[]>([]);
  let loading = $state(true);
  let failure = $state('');
  let selected = $state('');
  let umaSlug = $state('');
  let motionSlug = $state(DEFAULT_MOTION);
  let trackStart = $state<{ x: number; z: number }>();
  let mode = $state<CameraMode>('overview');
  /** The track, outfit and clip the URL asks for, so a link opens what it names. */
  const params = new URLSearchParams(location.search);
  const requested = params.get(TRACK_PARAM);
  const requestedUma = params.get(UMA_PARAM) ?? '';
  const requestedMotion = params.get(MOTION_PARAM);

  const current = $derived(
    models.find((model) => model.slug === selected) ??
      models.find((model) => model.slug === requested) ??
      models[0]
  );
  const options = $derived<SelectOption[]>(
    models.map((model) => ({ value: model.slug, label: model.name }))
  );
  const umaOptions = $derived<SelectOption[]>([
    { value: '', label: 'None' },
    ...umas.map((uma) => ({ value: uma.slug, label: `${uma.character} · ${uma.outfit}` }))
  ]);
  const character = $derived(umas.find((uma) => uma.slug === umaSlug));
  const motionOptions = $derived<SelectOption[]>([
    { value: '', label: 'Follow her speed' },
    ...motions.map((motion) => ({ value: motion.slug, label: motion.name }))
  ]);
  const motion = $derived(motions.find((entry) => entry.slug === motionSlug));
  const motionUrls = $derived(motions.map((entry) => entry.url));

  onMount(async () => {
    const [courses, outfits, clips] = await Promise.allSettled([
      loadRacecourseModels(),
      loadUmaModels(),
      loadUmaMotions()
    ]);
    if (courses.status === 'fulfilled') models = courses.value;
    else
      failure = courses.reason instanceof Error ? courses.reason.message : 'Courses unavailable.';
    if (outfits.status === 'fulfilled') umas = outfits.value;
    if (clips.status === 'fulfilled') motions = clips.value;

    selected = (models.find((model) => model.slug === requested) ?? models[0])?.slug ?? '';
    umaSlug = umas.some((uma) => uma.slug === requestedUma)
      ? requestedUma
      : (umas.find((uma) => uma.slug === DEFAULT_UMA)?.slug ?? '');
    motionSlug = motions.some((entry) => entry.slug === requestedMotion)
      ? (requestedMotion ?? '')
      : DEFAULT_MOTION;
    loading = false;
  });

  // The lane path the simulator already loads puts the start line in the same space as the course
  // model, so the outfit stands where a race would begin.
  $effect(() => {
    const trackId = current?.trackId;
    trackStart = undefined;
    if (!trackId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [shapes, courses] = await Promise.all([loadReplayGeometry(), loadReplayCourses()]);
        if (cancelled) return;
        const candidates = Object.entries(courses.courses)
          .filter(([, course]) => course.raceTrackId === trackId)
          .sort((left, right) => left[1].distance - right[1].distance);
        const [courseId] = candidates[0] ?? [];
        const start = courseId ? shapes[courseId]?.points[0] : undefined;
        if (start) trackStart = { x: start[0], z: start[1] };
      } catch {
        // Without the lane path she stands in the middle of the course, which is still useful.
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    const next = new URLSearchParams(location.search);
    if (current?.slug) next.set(TRACK_PARAM, current.slug);
    if (umaSlug) next.set(UMA_PARAM, umaSlug);
    else next.delete(UMA_PARAM);
    if (motionSlug && motionSlug !== DEFAULT_MOTION) next.set(MOTION_PARAM, motionSlug);
    else next.delete(MOTION_PARAM);
    if (next.toString() === location.search.replace(/^\?/, '')) return;
    history.replaceState(history.state, '', `${location.pathname}?${next}`);
  });
</script>

<svelte:head>
  <title>Umamusume Racecourse Viewer | uma.moe</title>
  <meta
    name="description"
    content="Explore the Umamusume racecourses in 3D: orbit the track, walk an uma around it in third person, and switch between the courses the game races on."
  />
</svelte:head>

<AppPage
  routeId="racecourse-viewer"
  title="Racecourse Viewer"
  description="The game's own racecourse models, to orbit, zoom and follow."
  width="wide"
>
  {#if loading}
    <div class="racecourse-status">
      <Spinner size={20} />
      <span>Loading courses…</span>
    </div>
  {:else if !models.length}
    <EmptyState
      icon="stadium"
      title="No racecourses to draw yet"
      description={failure ||
        'The course models have not been published yet. The simulator still has every course layout.'}
    />
  {:else}
    <div class="racecourse-toolbar">
      <SelectField
        id="racecourse-track"
        label="Track"
        {options}
        bind:value={selected}
        onchange={(value) => (selected = value)}
      />
      <SegmentedControl
        label="Camera"
        bind:value={mode}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'third', label: 'Third person', short: 'Follow' }
        ]}
        onchange={(value) => {
          // Third person needs somebody to follow, so it picks the first outfit rather than dead-ending.
          if (value === 'third' && !umaSlug) umaSlug = umas[0]?.slug ?? '';
        }}
      />
      <SelectField
        id="racecourse-uma"
        label="Uma"
        options={umaOptions}
        bind:value={umaSlug}
        onchange={(value) => (umaSlug = value)}
      />
      <SelectField
        id="racecourse-motion"
        label="Motion"
        options={motionOptions}
        bind:value={motionSlug}
        onchange={(value) => (motionSlug = value)}
        disabled={!umaSlug}
      />
    </div>

    <RacecourseScene
      url={current?.url}
      characterUrl={character?.url}
      motionUrl={motion?.url}
      {motionUrls}
      startPoint={trackStart}
      label={`${current?.name ?? 'Racecourse'} in 3D`}
      {mode}
    />
  {/if}
</AppPage>

<style>
  @import './racecourse-viewer.css';
</style>
