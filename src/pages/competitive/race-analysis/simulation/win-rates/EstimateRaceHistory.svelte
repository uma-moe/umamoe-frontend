<script lang="ts">
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import { ordinalPlace } from '@/lib/race/replay/race-display';
  import Button from '@/components/controls/Button.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import type { MonteCarloResult } from '@/pages/simulator/simulator-repository';
  import { runnerName, type OddsGroup, type RunnerOdds } from './estimate-groups';
  import { placeIn } from './estimate-races';

  let {
    groups,
    result,
    teamColor,
    watchingRun,
    onwatch
  }: {
    groups: OddsGroup[];
    result: MonteCarloResult;
    teamColor: (runner: RaceRunner) => string;
    /** The race being raced again to watch. */
    watchingRun?: number;
    onwatch: (run: number, runner: number) => void;
  } = $props();

  const id = $props.id();

  const PODIUM = 3;

  let open = $state(true);

  function groupColor(group: OddsGroup) {
    const member = group.runners[0]?.runner;

    return group.kind === 'team' && member ? teamColor(member) : undefined;
  }

  /** The runners a race shows for a group: a team's members, or the podium of a race without teams. */
  function raceRunners(group: OddsGroup, run: number): RunnerOdds[] {
    if (group.kind === 'team') return group.runners;

    const podium = (result.finish_order[run] ?? []).slice(0, PODIUM);
    return podium.flatMap((source) => group.runners.filter((odds) => odds.source === source));
  }
</script>

<section class="race-history-card">
  <Disclosure
    {id}
    title="Race history"
    description={result.finish_order.length + ' races'}
    compact
    bind:open
  >
    <ol class="race-history">
      {#each result.finish_order as order, run (run)}
        {@const winner = order[0]}
        <li
          class="race-row"
          class:watching={watchingRun === run}
        >
          <span class="race-number">#{run + 1}</span>
          <span class="race-groups">
            {#each groups as group (group.kind === 'team' ? group.team : 'field')}
              <span
                class="race-group"
                class:won={group.kind === 'team' &&
                  group.runners.some((odds) => odds.source === winner)}
                style:--team={groupColor(group)}
              >
                {#each raceRunners(group, run) as odds (odds.source)}
                  {@const place = placeIn({ result, run, source: odds.source })}
                  {@const podium = place !== undefined && place <= PODIUM}
                  <span
                    class="race-runner"
                    class:podium
                    title={runnerName(odds) +
                      (place === undefined ? '' : ', ' + ordinalPlace(place))}
                  >
                    <Artwork
                      src={portrait(odds.runner?.cardId)}
                      alt=""
                      size="xs"
                    />
                    {#if podium}
                      <b class="race-place race-place-{place}">{ordinalPlace(place)}</b>
                    {/if}
                  </span>
                {/each}
              </span>
            {/each}
          </span>
          {#if winner !== undefined}
            <Button
              variant="secondary"
              size="sm"
              icon="play"
              ariaLabel={'Watch race ' + (run + 1)}
              title="Watch this race"
              loading={watchingRun === run}
              onclick={() => onwatch(run, winner)}
            />
          {/if}
        </li>
      {/each}
    </ol>
  </Disclosure>
</section>

<style>
  @import './estimate-race-history.css';
</style>
