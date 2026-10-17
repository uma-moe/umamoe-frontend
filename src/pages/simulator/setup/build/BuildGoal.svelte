<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import {
    MAX_CANDIDATES,
    MAX_FINALISTS,
    OPTIMIZE_MODES,
    type OptimizeMode
  } from '../../requests/optimize-request';
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
  import TrackPool from './TrackPool.svelte';
  import type { TeamTrialsMode } from './track-pool';
  import { buildSearch } from './build-search.svelte';

  /**
   * What the build is for and where she races: the mode, its course (or, in Team Trials, the pool of tracks) and the
   * conditions, then the HP she loses to debuffs and the size of the search.
   */
  interface Props {
    teamTrials: boolean;
    invalidSeed: boolean;
  }

  let { teamTrials, invalidSeed }: Props = $props();

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
  title="Goal"
  note="Where she races"
>
  {#snippet actions()}{#if !teamTrials}<CourseButtons />{/if}{/snippet}
  <!-- One grid on the runner's columns, so every field lines up with the stats above it. -->
  <div
    class="goal"
    class:team-trials={teamTrials}
  >
    <SelectField
      id="build-mode"
      label="Plan for"
      options={MODE_OPTIONS}
      bind:value={buildSearch.mode}
    />
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
    <div class="pair">
      <TextField
        id="build-candidates"
        label="Builds to try"
        type="number"
        min={1}
        max={MAX_CANDIDATES}
        bind:value={buildSearch.candidates}
      />
      <TextField
        id="build-finalists"
        label="Builds to compare"
        type="number"
        min={1}
        max={MAX_FINALISTS}
        bind:value={buildSearch.finalists}
      />
    </div>
  </div>
</SimSection>

<style>
  @import './build-goal.css';
</style>
