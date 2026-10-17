<script lang="ts">
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Button from '@/components/controls/Button.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { timelineRepository, type TimelineRecord } from '@/pages/timeline/timeline-repository';
  import {
    DISTANCE_NAMES,
    SURFACE_NAMES,
    TURN_NAMES,
    describeCourse,
    trackName,
    type RaceCourse
  } from '@/lib/game-data/racing/courses';
  import {
    GROUND_OPTIONS,
    SEASON_OPTIONS,
    WEATHER_OPTIONS,
    simulatorCourseData,
    simulatorSession
  } from '../simulator-session.svelte';
  import SimulatorCoursePreview from './SimulatorCoursePreview.svelte';
  import {
    cmPreset,
    meetingTiming,
    numberMeetings,
    type CmPreset,
    type MeetingTiming,
    type NumberedMeeting
  } from './cm-presets';

  interface PresetItem extends NumberedMeeting {
    preset: CmPreset;
    timing: MeetingTiming;
    /** The meeting to draw: its exact course, or the first of the layouts it could be. */
    course?: RaceCourse;
  }

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let meetings = $state.raw<NumberedMeeting[]>([]),
    error = $state(''),
    loading = $state(false),
    query = $state(''),
    selected = $state<TimelineRecord>(),
    courseId = $state('');

  const presets = $derived.by((): PresetItem[] => {
    const now = Date.now();
    const courses = [...simulatorCourseData.courses.values()];
    return meetings.map((meeting) => {
      const preset = cmPreset(meeting.event, courses);
      return {
        ...meeting,
        preset,
        timing: meetingTiming(meeting.event, now),
        course: preset.candidates[0]
      };
    });
  });

  const matches = $derived(
    presets.filter(({ event, preset, number }) =>
      ['CM ' + number, event.title, event.dateLabel, ...preset.facts.map((fact) => fact.primary)]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase())
    )
  );

  // Coming meetings first, soonest at the top; then past ones, latest first.
  const upcoming = $derived(matches.filter((item) => item.timing !== 'past'));
  const past = $derived(matches.filter((item) => item.timing === 'past').reverse());
  const nextId = $derived(
    presets.find((item) => item.timing === 'upcoming' || item.timing === 'live')?.event.id
  );

  const chosen = $derived(presets.find((item) => item.event.id === selected?.id));

  $effect(() => {
    if (!open) return;
    let active = true;
    loading = true;
    error = '';
    selected = undefined;
    void timelineRepository
      .load()
      .then((data) => {
        if (active) meetings = numberMeetings(data.events);
      })
      .catch((reason) => {
        if (active) error = reason instanceof Error ? reason.message : 'Could not load CM presets.';
      })
      .finally(() => {
        if (active) loading = false;
      });

    return () => {
      active = false;
    };
  });

  /** Where the meeting is raced, in one line; what the schedule says when no course of ours matches. */
  function courseLine(item: PresetItem): string {
    const { course, preset } = item;
    if (!course) {
      return (
        preset.facts
          .map((fact) => [fact.primary, fact.secondary].filter(Boolean).join(' '))
          .join(' · ') || 'Course not announced yet'
      );
    }

    return [
      trackName(course.race_track_id),
      (SURFACE_NAMES[course.surface] ?? 'Unknown') +
        ' ' +
        course.distance.toLocaleString('en-US') +
        ' m',
      DISTANCE_NAMES[course.distance_type],
      TURN_NAMES[course.turn],
      preset.candidates.length > 1 ? preset.candidates.length + ' layouts' : undefined
    ]
      .filter(Boolean)
      .join(' · ');
  }

  function choose(event: TimelineRecord) {
    selected = event;
    const preset = presets.find((item) => item.event.id === event.id)!.preset;
    courseId = preset.candidates.length === 1 ? String(preset.candidates[0]!.course_id) : '';
  }

  function apply() {
    if (!chosen) return;
    simulatorSession.courseId = courseId;
    simulatorSession.sourceCourseId = '';
    simulatorSession.raceInstanceId = 0;
    if (chosen.preset.season) simulatorSession.season = chosen.preset.season;
    if (chosen.preset.weather) simulatorSession.weather = chosen.preset.weather;
    if (chosen.preset.ground) simulatorSession.ground = chosen.preset.ground;
    // Only what still needs doing; the dates already say in the list whether they are estimates.
    simulatorSession.importNotice = (
      (!courseId ? 'Select the CM course before running. ' : '') +
      (!chosen.preset.ground ? 'Review the ground condition before running.' : '')
    ).trim();
    open = false;
  }
</script>

{#snippet conditions(preset: CmPreset)}
  {@const ground = GROUND_OPTIONS.find((option) => option.value === preset.ground)}
  {@const season = SEASON_OPTIONS.find((option) => option.value === preset.season)}
  {@const weather = WEATHER_OPTIONS.find((option) => option.value === preset.weather)}
  {#if ground || season || weather}
    <span class="conditions">
      {#if ground}
        <span class="ground">{ground.label}</span>
      {/if}
      {#each [season, weather] as condition}
        {#if condition}
          <img
            src={condition.image}
            alt={condition.label}
            title={condition.label}
          />
        {/if}
      {/each}
    </span>
  {/if}
{/snippet}

{#snippet presetRow(item: PresetItem)}
  <button
    class="preset"
    class:past={item.timing === 'past'}
    class:selected={selected?.id === item.event.id}
    aria-pressed={selected?.id === item.event.id}
    onclick={() => choose(item.event)}
  >
    <span class="number">CM {item.number}</span>
    <span
      class="outline"
      aria-hidden="true"
    >
      {#if item.course}
        <SimulatorCoursePreview
          course={item.course}
          compact
        />
      {/if}
    </span>
    <span class="copy">
      <span class="title-line">
        <strong>{item.event.title}</strong>
        {#if item.timing === 'live'}
          <span class="badge">Now</span>
        {:else if item.event.id === nextId}
          <span class="badge">Next</span>
        {/if}
      </span>
      <span
        class="course-line"
        class:unknown={!item.course}
      >
        {courseLine(item)}
      </span>
    </span>
    <span class="when">
      <span class="date">
        {item.event.dateLabel}{#if item.event.predicted}
          <span class="estimated">estimated</span>
        {/if}
      </span>
      {@render conditions(item.preset)}
    </span>
  </button>
{/snippet}

<Dialog
  bind:open
  title="Champions Meeting presets"
  maxWidth="820px"
  maxHeight="90dvh"
>
  <TextField
    id="cm-preset-search"
    label="Find a meeting"
    hideLabel
    placeholder="Search CM number, meeting, track or date…"
    bind:value={query}
  />
  {#if loading}
    <Spinner
      centered
      label="Loading meeting schedule…"
    />
  {:else if error}
    <p role="alert">{error}</p>
  {:else if !matches.length}
    <p class="empty">No meeting matches “{query}”.</p>
  {:else}
    {#each [{ label: 'Upcoming', items: upcoming }, { label: 'Past meetings', items: past }] as group (group.label)}
      {#if group.items.length}
        <section
          class="group"
          aria-label={group.label}
        >
          <h3>{group.label}</h3>
          <div class="presets">
            {#each group.items as item (item.event.id)}
              {@render presetRow(item)}
            {/each}
          </div>
        </section>
      {/if}
    {/each}
  {/if}
  {#if chosen}
    {#if chosen.preset.candidates.length > 1}
      <SelectField
        id="cm-preset-course"
        label="Course layout"
        bind:value={courseId}
        options={chosen.preset.candidates.map((course) => ({
          value: String(course.course_id),
          label: describeCourse(course)
        }))}
      />
    {/if}
    {#if !chosen.preset.candidates.length}
      <p class="hint">
        An exact course could not be resolved from the published description. The preset loads its
        available conditions; choose the course manually.
      </p>
    {/if}
  {/if}
  {#snippet actions()}
    <Button
      variant="secondary"
      onclick={() => (open = false)}
    >
      Cancel
    </Button><Button
      disabled={!chosen || (chosen.preset.candidates.length > 1 && !courseId)}
      onclick={apply}
    >
      Use meeting
    </Button>
  {/snippet}
</Dialog>

<style>
  @import './simulator-cm-presets.css';
</style>
