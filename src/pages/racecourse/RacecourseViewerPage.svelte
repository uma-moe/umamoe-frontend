<script lang="ts">
  import { onMount } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import SelectField, { type SelectOption } from '@/components/controls/SelectField.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { loadRacecourseModels, type RacecourseModel } from '@/lib/game-assets/racecourse-models';
  import RacecourseScene from './scene/RacecourseScene.svelte';

  const TRACK_PARAM = 'track';

  // The pipeline publishes the whole courses; until that record lands, dev previews the one track
  // part that is already in the bucket so the renderer can be worked on.
  const developmentModels: RacecourseModel[] = import.meta.env.DEV
    ? [
        {
          trackId: 10006,
          name: 'Tokyo, track part',
          slug: 'dev-tokyo',
          url: 'https://assets.uma.moe/game-assets/3d/env/race/race10006/race10006_0000/pfb_env_race10006_0000_002.glb'
        }
      ]
    : [];

  let models = $state.raw<RacecourseModel[]>([]);
  let loading = $state(true);
  let failure = $state('');
  let selected = $state('');
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
      models = [...(await loadRacecourseModels()), ...developmentModels];
    } catch (error) {
      failure = error instanceof Error ? error.message : 'Course models are unavailable.';
      models = developmentModels;
    } finally {
      const linked = models.find((model) => model.slug === requested) ?? models[0];
      selected = linked?.slug ?? '';
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
    content="Explore the Umamusume racecourses in 3D: orbit the track, zoom into the corners and stands, and switch between the courses the game races on."
  />
</svelte:head>

<AppPage
  routeId="racecourse-viewer"
  title="Racecourse Viewer"
  description="The game's own racecourse models, to orbit and zoom."
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
    </div>

    <RacecourseScene
      url={current?.url}
      label={`${current?.name ?? 'Racecourse'} in 3D`}
    />
  {/if}
</AppPage>

<style>
  @import './racecourse-viewer.css';
</style>
