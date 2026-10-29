<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import { OPTIMIZE_MODES, type OptimizeMode } from '../../requests/optimize-request';
  import CourseButtons from '../../shell/CourseButtons.svelte';
  import RaceBar from '../../shell/RaceBar.svelte';
  import SimSection from '../../shell/SimSection.svelte';
  import ToggleField from '../../shell/ToggleField.svelte';
  import {
    GROUND_OPTIONS,
    SEASON_OPTIONS,
    simulatorCourseData,
    simulatorSession,
    TIME_OPTIONS,
    WEATHER_OPTIONS
  } from '../../simulator-session.svelte';
  import BuildBudget from './BuildBudget.svelte';
  import TrackPool from './TrackPool.svelte';
  import type { TeamTrialsMode } from './track-pool';
  import { buildSearch } from './build-search.svelte';

  /**
   * The setup: where she races, the course (or, in Team Trials, the pool of tracks) and its conditions; then, when the
   * row has room, her SP, fans and Fast Learner, followed by what the build is for, the HP she loses to debuffs and the
   * search's seed. How many builds it tries is the service's.
   */
  interface Props {
    teamTrials: boolean;
    invalidSeed: boolean;
    /** Her SP, fans and Fast Learner are in the second row here; narrower, they stay above the skills on offer. */
    budgetHere?: boolean;
  }

  let { teamTrials, invalidSeed, budgetHere = $bindable(false) }: Props = $props();

  /** From this width the grid is ten columns (build-goal.css), with room for her SP and fans in the second row. */
  const TEN_COLUMNS = 1300;

  let width = $state(0);

  $effect(() => {
    budgetHere = width >= TEN_COLUMNS;
  });

  const MODE_LABELS: Record<OptimizeMode, string> = {
    cm: 'Champions Meeting',
    tt_sprint: 'Team Trials · Sprint',
    tt_mile: 'Team Trials · Mile',
    tt_medium: 'Team Trials · Medium',
    tt_long: 'Team Trials · Long',
    tt_dirt: 'Team Trials · Dirt'
  };

  const MODE_OPTIONS = OPTIMIZE_MODES.map((mode) => ({ value: mode, label: MODE_LABELS[mode] }));
</script>

<SimSection
  number={2}
  title="Setup"
  note="The race, her SP and the search"
>
  {#snippet actions()}{#if !teamTrials}<CourseButtons />{/if}{/snippet}
  <!-- One grid on the runner's columns, so every field lines up with the stats above it: the race first, then what the
       search plans for and how it runs. -->
  <div
    class="goal"
    class:team-trials={teamTrials}
    bind:clientWidth={width}
  >
    {#if !teamTrials}
      <RaceBar
        bare
        courseOnly
      />
    {/if}
    <ToggleField
      id="build-ground"
      label="Ground"
      options={GROUND_OPTIONS}
      bind:value={simulatorSession.ground}
    />
    <ToggleField
      id="build-weather"
      label="Weather"
      options={WEATHER_OPTIONS}
      bind:value={simulatorSession.weather}
    />
    <ToggleField
      id="build-season"
      label="Season"
      options={SEASON_OPTIONS}
      bind:value={simulatorSession.season}
    />
    <ToggleField
      id="build-time"
      label="Time of day"
      options={TIME_OPTIONS}
      bind:value={simulatorSession.startTime}
    />
    {#if budgetHere}<BuildBudget />{/if}
    <SelectField
      id="build-mode"
      label="Plan for"
      options={MODE_OPTIONS}
      bind:value={buildSearch.mode}
    />
    <div class="pair">
      <TextField
        id="build-debuffs"
        label="HP debuffs"
        type="number"
        min={0}
        max={256}
        bind:value={buildSearch.debuffs.count}
      />
      <TextField
        id="build-debuff-percent"
        label="% HP each"
        type="number"
        min={0.1}
        max={100}
        step={0.5}
        bind:value={buildSearch.debuffs.percent}
      />
    </div>
    <div class="seed">
      <TextField
        id="build-seed"
        label="Seed"
        type="number"
        error={invalidSeed ? 'Enter a whole number.' : undefined}
        bind:value={buildSearch.seed}
      />
      <Button
        variant="secondary"
        size="sm"
        icon="dice"
        ariaLabel="Random seed"
        onclick={() => (buildSearch.seed = String(Math.floor(Math.random() * 2 ** 31)))}
      />
    </div>
    {#if teamTrials}
      <div class="pool">
        <TrackPool
          mode={buildSearch.mode as TeamTrialsMode}
          courseLookup={simulatorCourseData.courses}
          bind:picked={
            () => buildSearch.tracks[buildSearch.mode as TeamTrialsMode],
            (value) => (buildSearch.tracks[buildSearch.mode as TeamTrialsMode] = value)
          }
        />
      </div>
    {/if}
  </div>
</SimSection>

<style>
  @import './build-goal.css';
</style>
