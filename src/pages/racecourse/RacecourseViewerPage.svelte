<script lang="ts">
  import { onMount } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import SelectField, { type SelectOption } from '@/components/controls/SelectField.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { loadRacecourseModels, type RacecourseModel } from '@/lib/game-assets/racecourse-models';
  import {
    coursesForTrack,
    describeCourse,
    loadCourses,
    type RaceCourse
  } from '@/lib/game-data/racing/courses';
  import {
    loadReplayGeometry,
    type CourseShape
  } from '@/pages/competitive/race-analysis/replay/replay-course';
  import RacecourseScene from './scene/RacecourseScene.svelte';

  const TRACK_PARAM = 'track';
  const COURSE_PARAM = 'course';

  let models = $state.raw<RacecourseModel[]>([]);
  let courses = $state.raw<Map<number, RaceCourse>>(new Map());
  let shapes = $state.raw<Record<number, CourseShape>>({});
  let loading = $state(true);
  let failure = $state('');
  let selected = $state('');
  let courseId = $state('');
  /** The track the URL asks for, so a link opens the course it names. */
  const requested = new URLSearchParams(location.search).get(TRACK_PARAM);
  const requestedCourse = new URLSearchParams(location.search).get(COURSE_PARAM);

  const current = $derived(
    models.find((model) => model.slug === selected) ??
      models.find((model) => model.slug === requested) ??
      models[0]
  );
  const options = $derived<SelectOption[]>(
    models.map((model) => ({ value: model.slug, label: model.name }))
  );
  const trackCourses = $derived(
    current ? coursesForTrack(courses, current.trackId) : ([] as RaceCourse[])
  );
  const courseOptions = $derived<SelectOption[]>(
    trackCourses.map((course) => ({
      value: String(course.course_id),
      label: describeCourse(course)
    }))
  );
  /** The whole course when it is published as one file, otherwise the prefabs it was assembled from. */
  const files = $derived(current ? (current.url ? [current.url] : current.parts) : []);
  /** The racing line to mark on the model, once its geometry is in. */
  const line = $derived(shapes[Number(courseId)]?.points as [number, number][] | undefined);

  /** The course geometry is 16 MB, so it is fetched the first time a course is asked for. */
  async function ensureGeometry(): Promise<void> {
    if (Object.keys(shapes).length > 0) return;
    try {
      shapes = await loadReplayGeometry();
    } catch {
      // Marking a course is a bonus: the viewer still works without it.
    }
  }

  onMount(async () => {
    try {
      models = await loadRacecourseModels();
      courses = await loadCourses();
    } catch (error) {
      failure = error instanceof Error ? error.message : 'Course models are unavailable.';
    } finally {
      selected = (models.find((model) => model.slug === requested) ?? models[0])?.slug ?? '';
      loading = false;
    }
  });

  // Keep the course selection valid for the track on screen.
  $effect(() => {
    const list = trackCourses;
    if (list.length === 0) return;
    const wanted = list.find((course) => String(course.course_id) === requestedCourse);
    if (!list.some((course) => String(course.course_id) === courseId))
      courseId = String((wanted ?? list[0])!.course_id);
  });

  $effect(() => {
    if (!courseId) return;
    void ensureGeometry();
  });

  $effect(() => {
    const slug = current?.slug;
    if (!slug) return;
    const params = new URLSearchParams(location.search);
    if (params.get(TRACK_PARAM) !== slug) params.set(TRACK_PARAM, slug);
    if (courseId && params.get(COURSE_PARAM) !== courseId) params.set(COURSE_PARAM, courseId);
    const next = `${location.pathname}?${params}`;
    if (next !== `${location.pathname}${location.search}`)
      history.replaceState(history.state, '', next);
  });
</script>

<svelte:head>
  <title>Umamusume Racecourse Viewer | uma.moe</title>
  <meta
    name="description"
    content="Explore the Umamusume racecourses in 3D: fly over the track, drop to the rail, and see exactly which stretch of it each course races."
  />
</svelte:head>

<AppPage
  routeId="racecourse-viewer"
  title="Racecourse Viewer"
  description="The game's own racecourse models, to fly through."
  width="wide"
  heading={false}
  fill
  flush
>
  <div class="racecourse-page">
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
        <label
          class="racecourse-toolbar-label"
          for="racecourse-track"
        >
          Track
        </label>
        <SelectField
          id="racecourse-track"
          label="Track"
          hideLabel
          {options}
          bind:value={selected}
          onchange={(value) => (selected = value)}
        />

        {#if courseOptions.length > 0}
          <label
            class="racecourse-toolbar-label"
            for="racecourse-course"
          >
            Course
          </label>
          <SelectField
            id="racecourse-course"
            label="Course"
            hideLabel
            options={courseOptions}
            bind:value={courseId}
            onchange={(value) => (courseId = value)}
          />
        {/if}
      </div>

      <RacecourseScene
        urls={files}
        {line}
        label={current?.name ?? 'Racecourse'}
      />
    {/if}
  </div>
</AppPage>

<style>
  @import './racecourse-viewer.css';
</style>
