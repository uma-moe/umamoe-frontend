<script lang="ts">
  import type { ComponentProps, Snippet } from 'svelte';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { formatRaceTime, trackDetailName } from '@/lib/race/replay/race-display';
  import Badge from '@/components/Badge.svelte';
  import Button from '@/components/controls/Button.svelte';
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
    headerActions,
    raceTools,
    onjump,
    onrecorded
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
    headerActions?: Snippet;
    /** Controls for the whole race, after its section tabs. */
    raceTools?: Snippet;
    onjump: (section: string) => void;
    /** Shows the recorded race again in place of a rerun. */
    onrecorded?: () => void;
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

  /** A tab's `short` name is the one a phone shows. */
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
  const rerun = $derived(simulation.status === 'ready' ? simulation.rerun : undefined);
  const rerunSeating = $derived.by(() => {
    if (!rerun?.newGates) return undefined;

    return rerun.newMoods ? 'New gates and moods' : 'New gates';
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
      rerun ? 'Seed ' + rerun.seed : undefined,
      rerunSeating,
      courseNote
    ].filter((fact) => fact !== undefined)
  );
  const simulationBadge = $derived(
    rerun ? { tone: 'accent' as const, label: 'Rerun' } : simulationBadges[simulation.status]
  );
  const sections = $derived(hasSession ? [...raceSections, sessionSection] : raceSections);
</script>

<header class="replay-header">
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
  <div class="report-bar">
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
    {#if raceTools}
      <div class="race-tools">{@render raceTools()}</div>
    {/if}
  </div>
  {#if headerActions || (rerun && onrecorded)}
    <div class="header-actions">
      {#if rerun && onrecorded}
        <Button
          variant="secondary"
          size="sm"
          icon="restart"
          ariaLabel="Return to original race"
          title="Return to original race"
          onclick={onrecorded}
        >
          <span class="recorded-label">
            <span class="label-long">Return to original race</span>
            <span class="label-short">Original race</span>
          </span>
        </Button>
      {/if}
      {#if headerActions}
        <div class="header-source">{@render headerActions()}</div>
      {/if}
    </div>
  {/if}
</header>

<style>
  @import './replay-report-header.css';
</style>
