<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { formatRaceTime, trackDetailName } from '@/lib/race/replay/race-display';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { Course, CourseData } from './replay-course';

  let {
    capture,
    course,
    courses,
    distance,
    endTime,
    trackOverride,
    hasSession,
    headerActions,
    onjump
  }: {
    capture: ParsedRaceCapture;
    course?: Course;
    courses?: CourseData;
    distance: number;
    endTime: number;
    trackOverride: string;
    hasSession: boolean;
    headerActions?: Snippet;
    onjump: (section: string) => void;
  } = $props();

  const conditions = $derived(
    [
      capture.track.condition
        ? trackDetailName('condition', capture.track.condition) + ' ground'
        : undefined,
      capture.track.weather ? trackDetailName('weather', capture.track.weather) : undefined,
      capture.track.season ? trackDetailName('season', capture.track.season) : undefined,
      course
        ? course.turn === 1
          ? 'Right-handed'
          : course.turn === 2
            ? 'Left-handed'
            : 'Straight'
        : undefined
    ]
      .filter(Boolean)
      .join(', ') || 'Conditions were not included in this capture'
  );
</script>

<header class="replay-header">
  <div class="replay-title">
    <span class="replay-icon">
      <Icon
        name="race"
        size={22}
      />
    </span>
    <div>
      <div class="course-heading">
        <h2>
          {(course ? (courses?.names[course.raceTrackId] ?? 'Track') : 'Race capture') +
            ', ' +
            Math.round(distance).toLocaleString() +
            ' m' +
            (course ? ', ' + (course.surface === 1 ? 'Turf' : 'Dirt') : '')}
        </h2>
        <div class="capture-summary">
          <span>{capture.runners.length} runners, {formatRaceTime(endTime)}</span>
          <strong>{capture.detailed ? 'Detailed resimulation' : 'Recorded race'}</strong>
        </div>
      </div>
      <p>
        {conditions}
        <span class="course-source">
          {trackOverride
            ? 'Manual course'
            : capture.courseId
              ? 'Course detected'
              : 'Select a course in Display options'}
        </span>
      </p>
    </div>
  </div>
  {#if headerActions}
    <div class="header-actions">{@render headerActions()}</div>
  {/if}
</header>
<nav
  class="report-navigation"
  aria-label="Jump to analysis section"
>
  <div class="report-links">
    <Button
      variant="secondary"
      size="sm"
      icon="race"
      onclick={() => onjump('replay')}
    >
      Race replay
    </Button><Button
      variant="secondary"
      size="sm"
      icon="rankings"
      onclick={() => onjump('results')}
    >
      Race results
    </Button><Button
      variant="secondary"
      size="sm"
      icon="chart"
      onclick={() => onjump('runner')}
    >
      Runner analysis
    </Button>{#if hasSession}
      <Button
        variant="secondary"
        size="sm"
        icon="users"
        onclick={() => onjump('session')}
      >
        Session analysis
      </Button>
    {/if}
  </div>
</nav>

<style>
  @import './replay-report-header.css';
</style>
