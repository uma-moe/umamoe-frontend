<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { formatRaceTime, trackDetailName } from '@/lib/race/replay/race-display';
  import Icon from '@/components/Icon.svelte';
  import type { IconName } from '@/components/icon-types';
  import type { Course, CourseData } from './replay-course';

  let {
    capture,
    course,
    courses,
    distance,
    endTime,
    trackOverride,
    hasSession,
    current,
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
    /** The section in view, which its tab marks. */
    current: string;
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

  /** A tab's `short` name is the one a phone shows, keeping the bar one row. */
  type ReportSection = { id: string; icon: IconName; label: string; short: string };

  const raceSections: ReportSection[] = [
    { id: 'replay', icon: 'race', label: 'Race replay', short: 'Replay' },
    { id: 'results', icon: 'rankings', label: 'Race results', short: 'Results' },
    { id: 'runner', icon: 'chart', label: 'Runner analysis', short: 'Runner' }
  ];

  const sessionSection: ReportSection = {
    id: 'session',
    icon: 'users',
    label: 'Session analysis',
    short: 'Session'
  };

  const sections = $derived(hasSession ? [...raceSections, sessionSection] : raceSections);
</script>

<header class="replay-header">
  <div class="replay-title">
    <span class="replay-icon">
      <Icon
        name="course"
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
    {#each sections as section}
      <button
        type="button"
        class="section-tab"
        aria-label={section.label}
        aria-current={current === section.id ? 'location' : undefined}
        onclick={() => onjump(section.id)}
      >
        <Icon
          name={section.icon}
          size={15}
        />
        <span class="tab-long">{section.label}</span>
        <span class="tab-short">{section.short}</span>
      </button>
    {/each}
  </div>
</nav>

<style>
  @import './replay-report-header.css';
</style>
