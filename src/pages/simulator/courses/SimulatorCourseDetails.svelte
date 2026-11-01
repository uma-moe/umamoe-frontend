<script lang="ts">
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Button from '@/components/controls/Button.svelte';
  import DataTable from '@/components/data/DataTable.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import SimulatorCourseProfile from './SimulatorCourseProfile.svelte';
  import {
    loadReplayCourses,
    courseSegments,
    type Course
  } from '@/pages/competitive/race-analysis/replay/replay-course';
  import { selectedCourse } from '../simulator-session.svelte';
  import { describeCourse, trackName } from '@/lib/game-data/racing/courses';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let course = $state.raw<Course>(),
    error = $state(''),
    loading = $state(false);

  const selected = $derived(selectedCourse());

  const courseLabel = $derived(selected ? describeCourse(selected) : undefined);
  const trackLabel = $derived(selected ? trackName(selected.race_track_id) : 'Course breakdown');

  $effect(() => {
    if (!open || !selected) return;
    const id = selected.course_id;
    let active = true;
    loading = true;
    error = '';
    void loadReplayCourses()
      .then((data) => {
        if (active) course = data.courses[id];
      })
      .catch((reason) => {
        if (active)
          error = reason instanceof Error ? reason.message : 'Could not load course details.';
      })
      .finally(() => {
        if (active) loading = false;
      });

    return () => {
      active = false;
    };
  });

  const segments = $derived(courseSegments(course));
  const rows = $derived(
    course
      ? [
          ...segments.map((segment, index) => ({
            id: 's' + index,
            section: segment.label,
            start: segment.start,
            end: segment.end,
            slope: '—'
          })),
          ...course.slopes
            .filter((slope) => slope.slope)
            .map((slope, index) => ({
              id: 'h' + index,
              section: slope.slope > 0 ? 'Uphill' : 'Downhill',
              start: slope.start,
              end: slope.start + slope.length,
              slope: slope.slope / 10000 + '%'
            }))
        ].sort((a, b) => a.start - b.start)
      : []
  );
</script>

<Dialog
  bind:open
  title={trackLabel}
  description={courseLabel}
  maxWidth="1000px"
  maxHeight="90dvh"
>
  {#if loading}
    <Spinner
      centered
      label="Loading course profile…"
    />
  {:else if error}
    <p role="alert">{error}</p>
  {:else if course}
    <SimulatorCourseProfile
      course={selected}
      embedded
    />
    <div class="sections">
      <DataTable
        caption="Course sections and slopes"
        plain
        compact
        {rows}
        columns={[
          { key: 'section', label: 'Section' },
          { key: 'start', label: 'Start (m)', numeric: true },
          { key: 'end', label: 'End (m)', numeric: true },
          { key: 'slope', label: 'Slope', numeric: true }
        ]}
      />
    </div>
  {:else}
    <p>Course details are unavailable.</p>
  {/if}
  {#snippet actions()}
    <Button
      variant="secondary"
      onclick={() => (open = false)}
    >
      Close
    </Button>
  {/snippet}
</Dialog>

<style>
  .sections {
    margin-top: 8px;
  }
  p {
    font-size: 11px;
    color: var(--text-secondary);
    line-height: 1.6;
  }
</style>
