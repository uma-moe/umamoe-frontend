<script lang="ts">
  import Combobox from '@/components/Combobox.svelte';
  import Icon from '@/components/Icon.svelte';
  import SegmentedControl from '@/components/SegmentedControl.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import Spinner from '@/components/Spinner.svelte';
  import { coursesForTrack, describeCourse, trackName } from '@/lib/catalog/course-catalog';
  import {
    GROUND_OPTIONS,
    SEASON_OPTIONS,
    TIME_OPTIONS,
    WEATHER_OPTIONS,
    courseOptions,
    optionLabel,
    selectTrack,
    selectedCourse,
    selectedTrackId,
    simulatorCatalog,
    simulatorSession,
    trackOptions
  } from '../simulator-session.svelte';

  interface Props {
    /** Shown after the conditions, e.g. the race type a mode fixes for itself. */
    note?: string;
  }

  let { note }: Props = $props();

  const tracks = $derived(trackOptions());
  const courses = $derived(courseOptions());

  // The track is derived from the course, so the select is a view onto that,
  // not a second copy of the truth.
  let trackSelection = $state('');
  $effect(() => {
    trackSelection = selectedTrackId() === undefined ? '' : String(selectedTrackId());
  });

  // One line that reads like a racing form, kept visible while the bar is shut.
  const summary = $derived.by(() => {
    const course = selectedCourse();
    if (!course) return simulatorCatalog.loading ? 'Loading courses…' : 'Pick a course';
    // Siblings so a two-layout course shows the same qualifier as the picker.
    const siblings = coursesForTrack(simulatorCatalog.courses, course.race_track_id);
    return [
      trackName(course.race_track_id),
      describeCourse(course, siblings),
      optionLabel(GROUND_OPTIONS, simulatorSession.ground),
      optionLabel(SEASON_OPTIONS, simulatorSession.season),
      optionLabel(WEATHER_OPTIONS, simulatorSession.weather)
    ].join(' · ');
  });
</script>

<details class="race-bar">
  <summary>
    <Icon name="tune" size={18} />
    <strong>Race</strong>
    <span class="summary">{summary}</span>
    <span class="chevron"><Icon name="chevron" size={18} /></span>
  </summary>

  <div class="fields surface">
    {#if simulatorCatalog.loading}
      <Spinner />
    {:else}
      <!-- Where the race is, then what the conditions are. -->
      <div class="row">
        <SelectField
          id="sim-track"
          label="Track"
          options={tracks}
          disabled={tracks.length === 0}
          bind:value={trackSelection}
          onchange={selectTrack}
        />
        <Combobox
          id="sim-course"
          label="Course"
          options={courses}
          placeholder="Search courses…"
          emptyText="No courses on this track"
          bind:value={simulatorSession.courseId}
        />
      </div>

      <div class="row row--conditions">
        <div class="ground">
          <SelectField
            id="sim-ground"
            label="Ground"
            options={GROUND_OPTIONS}
            bind:value={simulatorSession.ground}
          />
        </div>

        <div class="group">
          <span class="group-label">Time</span>
          <SegmentedControl label="Time" options={TIME_OPTIONS} bind:value={simulatorSession.startTime} />
        </div>

        <div class="group">
          <span class="group-label">Season</span>
          <SegmentedControl label="Season" options={SEASON_OPTIONS} bind:value={simulatorSession.season} />
        </div>

        <div class="group">
          <span class="group-label">Weather</span>
          <SegmentedControl label="Weather" options={WEATHER_OPTIONS} bind:value={simulatorSession.weather} />
        </div>
      </div>
    {/if}

    {#if note}<p class="note">{note}</p>{/if}
  </div>
</details>

<style>
  .race-bar > summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--touch-target);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--surface-2);
    cursor: pointer;
    list-style: none;
  }
  .race-bar > summary::-webkit-details-marker { display: none; }
  .race-bar > summary:hover { border-color: var(--color-border-strong); }
  .race-bar :global(summary > svg) { flex: none; color: var(--color-accent); }
  strong { font-size: var(--font-sm); white-space: nowrap; }

  /* Wraps to its own line on phones; truncates once there is room beside the title. */
  .summary {
    flex: 1 1 100%;
    min-width: 0;
    color: var(--color-text-muted);
    font-size: var(--font-sm);
  }
  .chevron { display: grid; margin-left: auto; color: var(--color-text-muted); }
  .race-bar[open] .chevron { transform: rotate(180deg); }

  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-top: var(--space-2);
    padding: var(--space-4);
  }

  /* Where the race is: two controls sharing the row. */
  .row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--space-3);
    align-items: end;
  }

  /* The conditions: every control sized to its content, so the row packs from
     the left instead of one select swallowing the slack. Ground is pinned to a
     fixed width the way the compare page pins it. */
  .row--conditions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-5);
  }
  .row--conditions .ground { flex: 0 0 auto; width: 112px; }
  .row--conditions .group { flex: 0 0 auto; }

  .group { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
  /* Matches SelectField's own label so the row reads as one line of controls. */
  .group-label {
    color: var(--color-text);
    font-size: var(--font-sm);
    font-weight: 600;
    line-height: 1.2;
  }

  .note { margin: 0; color: var(--color-text-muted); font-size: var(--font-xs); }

  @media (min-width: 768px) {
    .summary { flex: 1 1 auto; }
    .race-bar > summary { min-height: 40px; }
  }
</style>
