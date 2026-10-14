<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import FilterChip from '@/components/filters/FilterChip.svelte';
  import { trackName, type CourseCatalogEntry } from '@/lib/catalog/course-catalog';
  import { MAX_TRACKS } from '../requests/optimize-request';
  import { defaultPool, teamTrialsCourses, type TeamTrialsMode } from './track-pool';

  /**
   * The Team Trials tracks she races. The game draws the course for each match from every course of the distance, so
   * the search deals these out over its races and averages the time she gains.
   */
  let {
    mode,
    catalog,
    picked = $bindable()
  }: {
    mode: TeamTrialsMode;
    catalog: ReadonlyMap<number, CourseCatalogEntry>;
    /** Course ids switched on; undefined is the default pool, the JRA's courses. */
    picked?: number[];
  } = $props();

  const courses = $derived(teamTrialsCourses(catalog, mode));
  const fallback = $derived(defaultPool(courses));
  const on = $derived(new Set(picked ?? fallback));
  const count = $derived(courses.filter((course) => on.has(course.course_id)).length);
  const changed = $derived(count !== fallback.length || fallback.some((course) => !on.has(course)));
  const groups = $derived.by(() => {
    const byTrack = new Map<number, CourseCatalogEntry[]>();
    for (const course of courses)
      byTrack.set(course.race_track_id, [...(byTrack.get(course.race_track_id) ?? []), course]);
    return [...byTrack].map(([trackId, list]) => ({ trackId, name: trackName(trackId), list }));
  });

  /** `1,400 m`, with the layout when the track runs two at that distance and straight for Niigata's 1,000 m. */
  function label(course: CourseCatalogEntry, siblings: ReadonlyArray<CourseCatalogEntry>) {
    const twin = siblings.some(
      (other) => other.course_id !== course.course_id && other.distance === course.distance
    );
    return [
      course.distance.toLocaleString() + ' m',
      course.turn === 4 ? 'straight' : '',
      twin ? '(' + course.course + ')' : ''
    ]
      .filter(Boolean)
      .join(' ');
  }

  function toggle(courseId: number) {
    const next = new Set(on);
    if (!next.delete(courseId)) next.add(courseId);
    picked = courses.filter((course) => next.has(course.course_id)).map((c) => c.course_id);
  }
</script>

<div
  class="track-pool"
  role="group"
  aria-labelledby="track-pool-label"
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
      {count} of {courses.length} on · one drawn per race, as Team Trials does
    </span>
    <span class="actions">
      <Button
        size="sm"
        variant="ghost"
        disabled={count === courses.length}
        onclick={() => (picked = courses.map((course) => course.course_id))}
      >
        All
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={!changed}
        onclick={() => (picked = undefined)}
      >
        JRA only
      </Button>
    </span>
  </div>
  {#if courses.length}
    <ul>
      {#each groups as group (group.trackId)}
        <li>
          <span class="track">{group.name}</span>
          <span class="courses">
            {#each group.list as course (course.course_id)}
              <FilterChip
                label={label(course, group.list)}
                selected={on.has(course.course_id)}
                onclick={() => toggle(course.course_id)}
              />
            {/each}
          </span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">The course data hasn’t loaded.</p>
  {/if}
</div>

<style>
  .track-pool {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 10px;
  }
  .label {
    font-size: 12px;
    font-weight: 600;
  }
  .count {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .count.over {
    color: var(--accent-warning);
  }
  .actions {
    display: flex;
    gap: 2px;
    margin-left: auto;
  }
  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
    gap: 6px 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .track {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
  }
  .courses {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .courses :global(button) {
    min-height: 28px;
    padding: 0 10px;
    font-size: 12px;
    font-weight: 600;
  }
  .empty {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
  @media (max-width: 767px) {
    .courses :global(button) {
      min-height: 36px;
    }
  }
</style>
