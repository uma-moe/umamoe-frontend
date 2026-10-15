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
  import { simulatorCatalog } from '../../simulator-session.svelte';
  import TrackPool from './TrackPool.svelte';
  import type { TeamTrialsMode } from './track-pool';
  import { buildSearch } from './build-search.svelte';

  /** What the build is for and where she races: the mode, its tracks or course, conditions and search sizes. */
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
  note="What the build is for and where she races"
>
  {#snippet actions()}{#if !teamTrials}<CourseButtons />{/if}{/snippet}
  <div class="goal-mode">
    <SelectField
      id="build-mode"
      label="Optimize for"
      options={MODE_OPTIONS}
      bind:value={buildSearch.mode}
    />
  </div>
  <p class="goal-note">
    {#if teamTrials}
      She races with a fixed pack of eight runners without skills: one front runner, three pace
      chasers, three late surgers and one end closer, all with her stats. Every build meets the same
      pack, so each skill is judged by the time she actually runs.
    {:else}
      She races in real CM fields recorded in game, in place of a runner of her style, and each
      skill is judged by how many runners she beats, weighed with what recorded CM races say about
      it. On a course no recorded CM ran, the closest CM's runners are rebuilt for it. A simulator
      without CM data races her with a fixed pack instead.
    {/if}
  </p>
  {#if teamTrials}
    <TrackPool
      mode={buildSearch.mode as TeamTrialsMode}
      catalog={simulatorCatalog.courses}
      bind:picked={
        () => buildSearch.tracks[buildSearch.mode as TeamTrialsMode],
        (value) => (buildSearch.tracks[buildSearch.mode as TeamTrialsMode] = value)
      }
    />
    <RaceBar
      bare
      conditionsOnly
    />
  {:else}
    <RaceBar bare />
  {/if}
  <div class="goal-fields">
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
        icon="refresh"
        ariaLabel="Random seed"
        onclick={() => (buildSearch.seed = String(Math.floor(Math.random() * 2 ** 31)))}
      />
    </div>
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
      label="Builds to check again"
      type="number"
      min={1}
      max={MAX_FINALISTS}
      bind:value={buildSearch.finalists}
    />
    <TextField
      id="build-debuffs"
      label="HP debuffs taken"
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
</SimSection>

<style>
  .goal-mode {
    --control-height: var(--setup-control-height);
    display: grid;
    max-width: 420px;
  }
  .goal-mode :global(.field) {
    gap: 4px;
  }
  .goal-mode :global(label) {
    font-size: 12px;
    font-weight: 600;
  }
  .goal-mode :global(.select-control) {
    font-size: 13px;
  }
  .goal-note {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .goal-fields {
    --control-height: var(--setup-control-height);
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px 12px;
    align-items: start;
  }
  .goal-fields :global(.field) {
    gap: 4px;
  }
  .goal-fields :global(label) {
    font-size: 12px;
  }
  .goal-fields :global(input),
  .goal-fields :global(.select-control) {
    font-size: 13px;
  }
  .seed {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 36px;
    gap: 6px;
    align-items: start;
  }
  .seed > :global(.ui-button) {
    width: 36px;
    height: var(--setup-control-height);
    margin-top: 18px;
    padding: 0;
  }
  @container build-form (max-width: 700px) {
    .goal-fields {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .seed {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 767px) {
    .seed {
      grid-template-columns: minmax(0, 1fr) 44px;
    }
    .seed > :global(.ui-button) {
      width: 44px;
    }
  }
</style>
