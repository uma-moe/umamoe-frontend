<script lang="ts">
  import { onMount } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import SelectField, { type SelectOption } from '@/components/controls/SelectField.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { loadRacecourseModels, type RacecourseModel } from '@/lib/game-assets/racecourse-models';
  import { loadUmaModels, type UmaModel } from '@/lib/game-assets/uma-models';
  import RacecourseScene from './scene/RacecourseScene.svelte';
  import type { CameraMode } from './scene/racecourse-scene';

  const TRACK_PARAM = 'track';
  const UMA_PARAM = 'uma';

  let models = $state.raw<RacecourseModel[]>([]);
  let umas = $state.raw<UmaModel[]>([]);
  let loading = $state(true);
  let failure = $state('');
  let selected = $state('');
  let umaSlug = $state('');
  let mode = $state<CameraMode>('overview');
  /** The track and the outfit the URL asks for, so a link opens what it names. */
  const params = new URLSearchParams(location.search);
  const requested = params.get(TRACK_PARAM);
  const requestedUma = params.get(UMA_PARAM) ?? '';

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

  onMount(async () => {
    const [courses, outfits] = await Promise.allSettled([loadRacecourseModels(), loadUmaModels()]);
    if (courses.status === 'fulfilled') models = courses.value;
    else
      failure = courses.reason instanceof Error ? courses.reason.message : 'Courses unavailable.';
    if (outfits.status === 'fulfilled') umas = outfits.value;

    selected = (models.find((model) => model.slug === requested) ?? models[0])?.slug ?? '';
    umaSlug = umas.some((uma) => uma.slug === requestedUma) ? requestedUma : '';
    loading = false;
  });

  $effect(() => {
    const next = new URLSearchParams(location.search);
    if (current?.slug) next.set(TRACK_PARAM, current.slug);
    if (umaSlug) next.set(UMA_PARAM, umaSlug);
    else next.delete(UMA_PARAM);
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
    </div>

    <RacecourseScene
      url={current?.url}
      characterUrl={character?.url}
      label={`${current?.name ?? 'Racecourse'} in 3D`}
      {mode}
    />
  {/if}
</AppPage>

<style>
  @import './racecourse-viewer.css';
</style>
