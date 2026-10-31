<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import { LAYOUT_NAMES, TURN_NAMES, type RaceCourse } from '@/lib/game-data/racing/courses';
  import { MAX_TRACKS } from '../../requests/optimize-request';
  import { courseGrid, defaultPool, teamTrialsCourses, type TeamTrialsMode } from './track-pool';

  /**
   * The Team Trials courses she races, as a grid of tracks and distances with a toggle per course: tracks across where
   * they fit, otherwise down. The game draws the course for each match from the distance's courses, so the search deals
   * these out over its races and weighs each by how often the game draws its distance (track-pool.ts).
   */
  let {
    mode,
    courseLookup,
    picked = $bindable()
  }: {
    mode: TeamTrialsMode;
    courseLookup: ReadonlyMap<number, RaceCourse>;
    /** Course ids switched on; undefined is the default pool, the JRA's courses. */
    picked?: number[];
  } = $props();

  /** The narrowest columns (track-pool.css): with tracks across, a label column and one per track. */
  const LABEL_COLUMN = 76;
  const TRACK_COLUMN = 64;

  let width = $state(0);

  const courses = $derived(teamTrialsCourses(courseLookup, mode));
  const grid = $derived(courseGrid(courses));
  const fallback = $derived(defaultPool(courses));
  const on = $derived(new Set(picked ?? fallback));
  const count = $derived(courses.filter((course) => on.has(course.course_id)).length);
  const changed = $derived(count !== fallback.length || fallback.some((course) => !on.has(course)));
  /** Every course here is the JRA's, so "JRA only" would be "All" again. */
  const onlyJra = $derived(fallback.length === courses.length);
  /** Tracks across where every track gets a column; unmeasured, it assumes so, as on most screens. */
  const tracksAcross = $derived(
    width === 0 || width >= LABEL_COLUMN + grid.tracks.length * TRACK_COLUMN
  );

  const formatDistance = (distance: number) => distance.toLocaleString('en-US') + ' m';

  /** The layout where the track runs two at the course's distance, and the straight course; '' for the rest. */
  function layoutText(course: RaceCourse, trackCourses: ReadonlyArray<RaceCourse>) {
    const twin = trackCourses.some(
      (other) => other.course_id !== course.course_id && other.distance === course.distance
    );

    if (twin) return LAYOUT_NAMES[course.course] ?? 'Course ' + course.course;
    if (course.turn === 4) return TURN_NAMES[course.turn] ?? 'Straight';
    return '';
  }

  function courseName(
    trackName: string,
    course: RaceCourse,
    trackCourses: ReadonlyArray<RaceCourse>
  ) {
    return [trackName, formatDistance(course.distance), layoutText(course, trackCourses)]
      .filter(Boolean)
      .join(' ');
  }

  function toggle(courseId: number) {
    const next = new Set(on);
    if (!next.delete(courseId)) next.add(courseId);
    picked = courses.filter((course) => next.has(course.course_id)).map((c) => c.course_id);
  }
</script>

{#snippet courseToggle(trackName: string, course: RaceCourse, cell: RaceCourse[])}
  {@const selected = on.has(course.course_id)}
  {@const text = layoutText(course, cell)}
  <button
    type="button"
    class="course"
    class:selected
    aria-label={courseName(trackName, course, cell)}
    aria-pressed={selected}
    onclick={() => toggle(course.course_id)}
  >
    <span
      class="check"
      aria-hidden="true"
    >
      {#if selected}
        <Icon
          name="check"
          size={12}
        />
      {/if}
    </span>
    {#if text}
      <span class="layout">{text}</span>
    {/if}
  </button>
{/snippet}

{#snippet courseCell(trackName: string, cell: RaceCourse[])}
  <td>
    {#if cell.length}
      <span class="cell">
        {#each cell as course (course.course_id)}
          {@render courseToggle(trackName, course, cell)}
        {/each}
      </span>
    {:else}
      <span
        class="none"
        aria-hidden="true"
      ></span>
    {/if}
  </td>
{/snippet}

<div
  class="track-pool"
  role="group"
  aria-labelledby="track-pool-label"
  bind:clientWidth={width}
>
  <div class="head">
    <span
      id="track-pool-label"
      class="label"
    >
      Tracks
    </span>
    <span
      class="count"
      class:over={count > MAX_TRACKS}
    >
      {count} of {courses.length} courses, one drawn per race
    </span>
    <span class="actions">
      <Button
        size="sm"
        variant="secondary"
        disabled={count === courses.length}
        onclick={() => (picked = courses.map((course) => course.course_id))}
      >
        All
      </Button>
      {#if !onlyJra}
        <Button
          size="sm"
          variant="secondary"
          disabled={!changed}
          onclick={() => (picked = undefined)}
        >
          JRA only
        </Button>
      {/if}
    </span>
  </div>
  {#if !courses.length}
    <p class="empty">The course data hasn’t loaded.</p>
  {:else if tracksAcross}
    <div class="frame">
      <table>
        <thead>
          <tr>
            <th
              scope="col"
              class="corner"
            >
              <span class="sr-only">Distance</span>
            </th>
            {#each grid.tracks as track (track.trackId)}
              <th scope="col">{track.name}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each grid.rows as row (row.distance)}
            <tr>
              <th scope="row">{formatDistance(row.distance)}</th>
              {#each row.cells as cell, index (grid.tracks[index]?.trackId)}
                {@render courseCell(grid.tracks[index]?.name ?? '', cell)}
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <!-- Too narrow for a column per track: a row per track and a column per distance. -->
    <div class="frame">
      <table
        class="tracks-down"
        style:--distances={grid.rows.length}
      >
        <thead>
          <tr>
            <th
              scope="col"
              class="corner"
            >
              <span class="sr-only">Track</span>
            </th>
            {#each grid.rows as row (row.distance)}
              <th scope="col">{formatDistance(row.distance)}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each grid.tracks as track, index (track.trackId)}
            <tr>
              <th scope="row">{track.name}</th>
              {#each grid.rows as row (row.distance)}
                {@render courseCell(track.name, row.cells[index] ?? [])}
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  @import './track-pool.css';
</style>
