<script lang="ts">
  import { onMount } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import SelectField, { type SelectOption } from '@/components/controls/SelectField.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { loadRacecourseModels, type RacecourseModel } from '@/lib/game-assets/racecourse-models';
  import RacecourseScene from './scene/RacecourseScene.svelte';
  import type { CameraMode } from './scene/racecourse-scene';

  const TRACK_PARAM = 'track';

  let models = $state.raw<RacecourseModel[]>([]);
  let loading = $state(true);
  let failure = $state('');
  let selected = $state('');
  let mode = $state<CameraMode>('overview');
  /** The track the URL asks for, so a link opens the course it names. */
  const requested = new URLSearchParams(location.search).get(TRACK_PARAM);

  const current = $derived(
    models.find((model) => model.slug === selected) ??
      models.find((model) => model.slug === requested) ??
      models[0]
  );
  const options = $derived<SelectOption[]>(
    models.map((model) => ({ value: model.slug, label: model.name }))
  );

  onMount(async () => {
    try {
      models = await loadRacecourseModels();
    } catch (error) {
      failure = error instanceof Error ? error.message : 'Course models are unavailable.';
    } finally {
      selected = (models.find((model) => model.slug === requested) ?? models[0])?.slug ?? '';
      loading = false;
    }
  });

  $effect(() => {
    const slug = current?.slug;
    if (!slug) return;
    const params = new URLSearchParams(location.search);
    if (params.get(TRACK_PARAM) === slug) return;
    params.set(TRACK_PARAM, slug);
    history.replaceState(history.state, '', `${location.pathname}?${params}`);
  });
</script>

<svelte:head>
  <title>Umamusume Racecourse Viewer | uma.moe</title>
  <meta
    name="description"
    content="Explore the Umamusume racecourses in 3D: orbit the track, stand on it at a horsegirl's height, and switch between the courses the game races on."
  />
</svelte:head>

<AppPage
  routeId="racecourse-viewer"
  title="Racecourse Viewer"
  description="The game's own racecourse models, to orbit, zoom and walk."
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
          { value: 'walk', label: 'At eye level', short: 'Walk' }
        ]}
      />
    </div>

    <RacecourseScene
      url={current?.url}
      label={`${current?.name ?? 'Racecourse'} in 3D`}
      {mode}
    />
  {/if}
</AppPage>

<style>
  @import './racecourse-viewer.css';
</style>
