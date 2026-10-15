<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Icon from '@/components/Icon.svelte';
  import SimulatorCoursePreview from '../courses/SimulatorCoursePreview.svelte';
  import {
    trackName,
    describeCourse,
    coursesForTrack,
    SURFACE_NAMES,
    DISTANCE_NAMES,
    TURN_NAMES
  } from '@/lib/game-data/racing/courses';
  import SimulatorCmPresets from '../courses/SimulatorCmPresets.svelte';
  import SimulatorCourseDetails from '../courses/SimulatorCourseDetails.svelte';
  import Combobox from '@/components/controls/Combobox.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import {
    GROUND_OPTIONS,
    SEASON_OPTIONS,
    TIME_OPTIONS,
    WEATHER_OPTIONS,
    courseOptions,
    selectTrack,
    selectedCourse,
    optionLabel,
    selectedTrackId,
    simulatorCourseData,
    simulatorSession,
    trackOptions
  } from '../simulator-session.svelte';

  let {
    note,
    workspace = false,
    sidebar = false,
    inlineConditions = false,
    bare = false,
    conditionsOnly = false,
    courseOnly = false,
    extra
  }: {
    note?: string;
    workspace?: boolean;
    sidebar?: boolean;
    inlineConditions?: boolean;
    /** No card or buttons of its own: track, course and conditions as fields of a form section. */
    bare?: boolean;
    /** In bare mode, the conditions without the track and course: for races whose course is drawn per race. */
    conditionsOnly?: boolean;
    /** In bare mode, the track and course alone, each a cell of the form's own grid. */
    courseOnly?: boolean;
    /** More fields after the conditions in bare mode. */
    extra?: Snippet;
  } = $props();

  let trackSelection = $state(''),
    presetsOpen = $state(false),
    detailsOpen = $state(false),
    conditionsOpen = $state(false);

  const tracks = $derived(trackOptions()),
    courses = $derived(courseOptions());

  const course = $derived(selectedCourse());

  let trackAnchor = $state<HTMLDivElement>(),
    courseAnchor = $state<HTMLDivElement>();

  const trackPreviews = $derived(
    new Map(
      tracks.map((track) => {
        const available = coursesForTrack(simulatorCourseData.courses, Number(track.value));
        return [
          track.value,
          {
            course:
              available.filter((course) => course.surface === 1 && course.turn !== 4).at(-1) ??
              available.at(-1),
            count: available.length
          }
        ];
      })
    )
  );

  $effect(() => {
    trackSelection = selectedTrackId() === undefined ? '' : String(selectedTrackId());
  });
</script>

{#snippet conditions()}
  <div class="conditions">
    <div class="ground">
      <SelectField
        id="sim-ground"
        label="Ground"
        options={GROUND_OPTIONS}
        bind:value={simulatorSession.ground}
      />
    </div>
    <div>
      <span class="label">Weather</span>
      <SegmentedControl
        label="Weather"
        options={WEATHER_OPTIONS}
        bind:value={simulatorSession.weather}
      />
    </div>
    <div>
      <span class="label">Season</span>
      <SegmentedControl
        label="Season"
        options={SEASON_OPTIONS}
        bind:value={simulatorSession.season}
      />
    </div>
    {#if sidebar || inlineConditions || bare}
      <div>
        <SelectField
          id="sim-time"
          label="Time of day"
          options={[{ value: '1', label: 'Morning' }, ...TIME_OPTIONS]}
          bind:value={simulatorSession.startTime}
        />
      </div>
    {:else}
      <div>
        <span class="label">Time</span>
        <SegmentedControl
          label="Time"
          options={TIME_OPTIONS}
          bind:value={simulatorSession.startTime}
        />
      </div>
    {/if}
    {#if note}
      <span class="note">{note}</span>
    {/if}
  </div>
{/snippet}
<section
  class="race-bar"
  class:course-card={workspace}
  class:sidebar
  class:inline-conditions={inlineConditions}
  class:bare
  class:course-only={bare && courseOnly}
  aria-label={bare && courseOnly ? 'Course' : 'Race conditions'}
>
  {#if workspace}
    <header>
      <h2>
        <Icon
          name="race"
          size={19}
        />Course
      </h2>
      <Button
        variant="secondary"
        size="sm"
        icon="calendar"
        onclick={() => (presetsOpen = true)}
      >
        CM presets
      </Button>
    </header>
  {/if}
  {#if simulatorCourseData.loading}
    <Spinner label="Loading courses…" />
  {:else}
    {#if workspace && !inlineConditions}
      <div class="course-visual">
        <SimulatorCoursePreview {course} />
        <div class="course-name">
          <strong>{course ? trackName(course.race_track_id) : 'Select a course'}</strong>
          <span>{course ? describeCourse(course) : 'Courses load from game resources'}</span>
        </div>
      </div>
    {/if}
    <div class="controls">
      {#if !(bare && conditionsOnly)}<div class="course-row">
          {#if !workspace && !sidebar && !bare}
            <Button
              variant="secondary"
              size="sm"
              icon="calendar"
              onclick={() => (presetsOpen = true)}
            >
              CM presets
            </Button>
          {/if}
          <div
            class="course-picker"
            bind:this={trackAnchor}
          >
            <Combobox
              id="sim-track"
              label="Track"
              options={tracks}
              placeholder="Search tracks…"
              disabled={!tracks.length}
              popupAnchor={trackAnchor}
              bind:value={trackSelection}
              onchange={selectTrack}
            >
              {#snippet optionContent(option)}
                {@const preview = trackPreviews.get(option.value)}
                <div class="track-option">
                  <SimulatorCoursePreview
                    course={preview?.course}
                    compact
                  />
                  <strong>{option.label}</strong>
                  <small>{preview?.count} {preview?.count === 1 ? 'course' : 'courses'}</small>
                </div>
              {/snippet}
            </Combobox>
            <span
              class="selected-outline"
              aria-hidden="true"
            >
              <SimulatorCoursePreview
                course={trackPreviews.get(trackSelection)?.course}
                compact
              />
            </span>
            <span
              class="picker-arrow"
              aria-hidden="true"
            >
              <Icon
                name="chevron"
                size={14}
              />
            </span>
          </div>
          <div
            class="course-picker"
            bind:this={courseAnchor}
          >
            <Combobox
              id="sim-course"
              label="Course"
              options={courses}
              placeholder="Search distances or surfaces…"
              emptyText="No courses on this track"
              popupAnchor={courseAnchor}
              bind:value={simulatorSession.courseId}
            >
              {#snippet optionContent(option)}
                {@const item = simulatorCourseData.courses.get(Number(option.value))}
                <div class="course-option">
                  <SimulatorCoursePreview
                    course={item}
                    compact
                  />
                  <span class="course-copy">
                    <strong>
                      {item
                        ? (SURFACE_NAMES[item.surface] ?? 'Unknown') +
                          ' ' +
                          item.distance.toLocaleString('en-US') +
                          ' m'
                        : option.label}
                    </strong>
                    <span class="course-meta">
                      {#if item}
                        <span>{DISTANCE_NAMES[item.distance_type]}</span>
                        <span>{TURN_NAMES[item.turn]}</span>
                        {#if option.label.includes('layout')}
                          <span>Layout {item.course}</span>
                        {/if}
                      {/if}
                    </span>
                  </span>
                </div>
              {/snippet}
            </Combobox>
            <span
              class="selected-outline"
              aria-hidden="true"
            >
              <SimulatorCoursePreview
                {course}
                compact
              />
            </span>
            <span
              class="picker-arrow"
              aria-hidden="true"
            >
              <Icon
                name="chevron"
                size={14}
              />
            </span>
          </div>
          {#if !workspace && !sidebar && !bare}
            <Button
              variant="ghost"
              size="sm"
              icon="chart"
              disabled={!simulatorSession.courseId}
              onclick={() => (detailsOpen = true)}
            >
              Course breakdown
            </Button>
          {/if}
        </div>{/if}
      {#if sidebar || inlineConditions}
        {@render conditions()}
      {:else if workspace}
        <div class="toolbar-actions">
          <button
            class="conditions-summary"
            onclick={() => (conditionsOpen = true)}
            aria-label="Edit race conditions"
          >
            <span>
              {optionLabel(GROUND_OPTIONS, simulatorSession.ground)}
              <span class="condition-label">ground</span>
            </span>
            {#each [[WEATHER_OPTIONS, simulatorSession.weather], [SEASON_OPTIONS, simulatorSession.season], [TIME_OPTIONS, simulatorSession.startTime]] as [options, value]}
              {@const selected = (options as typeof WEATHER_OPTIONS).find(
                (option) => option.value === value
              )}
              <span title={selected?.label ?? (value === '1' ? 'Morning' : 'Unspecified')}>
                {#if selected}
                  <img
                    src={selected.image}
                    alt={sidebar ? selected.label : ''}
                  />
                  <span class="condition-label">{selected.label}</span>
                {:else}
                  {value === '1' ? 'Morning' : 'Unspecified'}
                {/if}
              </span>
            {/each}<Icon
              name="tune"
              size={14}
            />
          </button>
          <Button
            variant="ghost"
            size="sm"
            icon="chart"
            ariaLabel="Course breakdown"
            disabled={!simulatorSession.courseId}
            onclick={() => (detailsOpen = true)}
          >
            Course breakdown
          </Button>
        </div>
      {:else if bare}
        {#if !courseOnly}
          {@render conditions()}
          {@render extra?.()}
        {/if}
      {:else}
        {@render conditions()}
      {/if}
    </div>
  {/if}
</section>

{#if !sidebar && !bare}
  <SimulatorCmPresets bind:open={presetsOpen} /><SimulatorCourseDetails bind:open={detailsOpen} />
{/if}
{#if !sidebar && !bare}
  <Dialog
    bind:open={conditionsOpen}
    title="Race conditions"
    maxWidth="540px"
  >
    {@render conditions()}{#snippet actions()}
      <Button onclick={() => (conditionsOpen = false)}>Done</Button>
    {/snippet}
  </Dialog>
{/if}

<style>
  @import './race-bar.css';
  /* The track and course alone: no box of their own, so each picker is a cell of the form's grid. Kept here rather
     than in the shared sheet, so it is never left behind when only one of the two files reloads. */
  .course-only,
  .course-only .controls,
  .course-only .course-row {
    display: contents;
  }
  /* The track already shows its shape; the course keeps its cell for the words. */
  .course-only .course-picker + .course-picker .selected-outline {
    display: none;
  }
  .course-only .course-picker + .course-picker :global(input) {
    padding-left: 10px;
  }
</style>
