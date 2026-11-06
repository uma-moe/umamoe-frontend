<script lang="ts">
  import type { ComponentProps, Snippet } from 'svelte';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { formatRaceTime, trackDetailName } from '@/lib/race/replay/race-display';
  import Badge from '@/components/Badge.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { IconName } from '@/components/icon-types';
  import type { DetailedSimulation } from '../detailed-simulation';
  import type { Course, CourseData } from './replay-course';

  let {
    capture,
    course,
    courses,
    distance,
    endTime,
    trackOverride,
    simulation,
    hasSession,
    current,
    height = $bindable(0),
    headerActions,
    onjump
  }: {
    capture: ParsedRaceCapture;
    course?: Course;
    courses?: CourseData;
    distance: number;
    endTime: number;
    trackOverride: string;
    simulation: DetailedSimulation;
    hasSession: boolean;
    /** The section in view, which its tab marks. */
    current: string;
    height?: number;
    headerActions?: Snippet;
    onjump: (section: string) => void;
  } = $props();

  type BadgeTone = ComponentProps<typeof Badge>['tone'];

  const simulationBadges: Record<DetailedSimulation['status'], { tone: BadgeTone; label: string }> =
    {
      ready: { tone: 'success', label: 'Detailed resimulation' },
      queued: { tone: 'accent', label: 'Resimulation queued' },
      running: { tone: 'accent', label: 'Resimulating…' },
      failed: { tone: 'warning', label: 'Resimulation failed' },
      unavailable: { tone: 'neutral', label: 'Recorded race' }
    };

  const turnNames: Record<number, string> = { 1: 'Right-handed', 2: 'Left-handed' };

  /** A tab's `short` name is the one narrower screens show. */
  type ReportSection = { id: string; icon: IconName; label: string; short: string };

  const raceSections: ReportSection[] = [
    { id: 'results', icon: 'rankings', label: 'Race results', short: 'Results' },
    { id: 'replay', icon: 'race', label: 'Race replay', short: 'Replay' },
    { id: 'runner', icon: 'chart', label: 'Runner analysis', short: 'Runner' }
  ];

  const sessionSection: ReportSection = {
    id: 'session',
    icon: 'users',
    label: 'Session analysis',
    short: 'Session'
  };

  const trackName = $derived(
    course ? (courses?.names[course.raceTrackId] ?? 'Track') : 'Race capture'
  );
  const courseLength = $derived.by(() => {
    const metres = Math.round(distance).toLocaleString() + ' m';
    if (!course) return metres;

    return metres + (course.surface === 1 ? ' turf' : ' dirt');
  });
  const courseNote = $derived.by(() => {
    if (trackOverride) return 'Manual course';
    if (capture.courseId) return undefined;

    return 'Choose the course in Display options';
  });
  const raceFacts = $derived(
    [
      capture.track.condition
        ? trackDetailName('condition', capture.track.condition) + ' ground'
        : undefined,
      capture.track.weather ? trackDetailName('weather', capture.track.weather) : undefined,
      capture.track.season ? trackDetailName('season', capture.track.season) : undefined,
      course ? (turnNames[course.turn] ?? 'Straight') : undefined,
      capture.runners.length + ' runners',
      formatRaceTime(endTime),
      courseNote
    ].filter((fact) => fact !== undefined)
  );
  const simulationBadge = $derived(simulationBadges[simulation.status]);
  const sections = $derived(hasSession ? [...raceSections, sessionSection] : raceSections);
</script>

<header
  class="replay-header"
  bind:clientHeight={height}
>
  <div class="replay-title">
    <span class="replay-icon">
      <Icon
        name="course"
        size={18}
      />
    </span>
    <div class="title-text">
      <div class="title-line">
        <h2>
          {trackName}
          <span class="course-length">{courseLength}</span>
        </h2>
        <span role="status">
          <Badge tone={simulationBadge.tone}>{simulationBadge.label}</Badge>
        </span>
      </div>
      <p
        class="race-facts"
        title={raceFacts.join(' · ')}
      >
        {#each raceFacts as fact}
          <span>{fact}</span>
        {/each}
      </p>
    </div>
  </div>
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
  {#if headerActions}
    <div class="header-actions">{@render headerActions()}</div>
  {/if}
</header>

<style>
  @import './replay-report-header.css';
</style>
