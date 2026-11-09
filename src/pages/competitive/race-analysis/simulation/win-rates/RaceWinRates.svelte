<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import Button from '@/components/controls/Button.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import InfoIcon from '@/components/feedback/InfoIcon.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import { teamColors } from '../../replay/team-colors';
  import { WIN_RATE_RACES, type EstimateSeating } from '../race-simulation';
  import type { EstimateState } from '../race-simulation.svelte';
  import EstimateRaceHistory from './EstimateRaceHistory.svelte';
  import EstimateTeams from './EstimateTeams.svelte';
  import { oddsGroups } from './estimate-groups';
  import type { RaceContext } from '@/pages/competitive/runners/race-aptitudes';

  let {
    capture,
    raceContext,
    estimate,
    watchingSeed,
    onwatch,
    onopen,
    onclose
  }: {
    /** The recorded race the estimate raced. */
    capture: ParsedRaceCapture;
    /** The course's track and distance, which pick the aptitudes that count in this race. */
    raceContext: RaceContext;
    estimate: EstimateState;
    /** The seed of the estimated race being raced again to watch. */
    watchingSeed?: number;
    onwatch: (run: number, runner: number) => void;
    onopen: () => void;
    onclose: () => void;
  } = $props();

  const headingId = $props.id();

  const ready = $derived(estimate.status === 'ready' ? estimate.estimate : undefined);
  const seating: EstimateSeating = $derived(
    estimate.status === 'ready' ? estimate.estimate : estimate
  );
  const groups = $derived(ready ? oddsGroups(capture, ready.result) : []);
  const teamColor = $derived(teamColors(capture.runners));
  const watchingRun = $derived.by(() => {
    if (!ready || watchingSeed === undefined) return undefined;

    const run = ready.result.seeds.indexOf(watchingSeed);
    return run === -1 ? undefined : run;
  });
</script>

<section
  class="win-rates"
  aria-labelledby={headingId}
>
  <header class="win-rates-head">
    <div class="win-rates-title">
      <h2 id={headingId}>Estimated win rate</h2>
      <InspectPopover label="Reading the win rate estimate">
        {#snippet trigger()}
          <InfoIcon />
        {/snippet}
        <h3>Reading the win rate estimate</h3>
        <p>
          The field raced this course {WIN_RATE_RACES} times, each race on its own seed. A team wins a
          race when any of its runners does; top 3 is how often a runner finished on the podium.
        </p>
        <p>
          With random gates every race draws its own gates. Champions Meeting and Team Trials races,
          and room matches with random moods, also deal their moods. Watch a runner's first win, or
          any race from the race history.
        </p>
      </InspectPopover>
    </div>
    <p class="facts">
      {#if ready}
        <span>{ready.result.runs} races</span>
      {:else}
        <span class="pending">
          <Spinner
            size={14}
            showLabel
            label={'Racing the field ' + WIN_RATE_RACES + ' times…'}
          />
        </span>
      {/if}
      {#if seating.gateOrder === 'randomized'}
        <span>{seating.moodDeal === 'sent' ? 'Random gates' : 'Random gates and moods'}</span>
      {/if}
      {#if ready}
        <span class="seed">Starting seed {ready.seed}</span>
      {/if}
    </p>
    <div class="actions">
      {#if ready}
        <Button
          variant="secondary"
          size="sm"
          icon="external"
          ariaLabel="Open in race simulator"
          onclick={onopen}
        >
          <span class="label-long">Open in race simulator</span>
          <span class="label-short">Simulator</span>
        </Button>
      {/if}
      <IconButton
        icon="close"
        size="sm"
        label={ready ? 'Close the win rates' : 'Cancel the estimate'}
        onclick={onclose}
      />
    </div>
  </header>
  {#if ready}
    <EstimateTeams
      {groups}
      result={ready.result}
      {raceContext}
      {teamColor}
      {watchingRun}
      {onwatch}
    />
    <EstimateRaceHistory
      {groups}
      result={ready.result}
      {teamColor}
      {watchingRun}
      {onwatch}
    />
  {/if}
</section>

<style>
  @import './race-win-rates.css';
</style>
