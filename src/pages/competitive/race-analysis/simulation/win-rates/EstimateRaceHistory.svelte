<script lang="ts">
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import { ordinalPlace } from '@/lib/race/replay/race-display';
  import Button from '@/components/controls/Button.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import type { MonteCarloResult } from '@/pages/simulator/simulator-repository';
  import { runnerName, type OddsGroup, type RunnerOdds } from './estimate-groups';
  import { formatHpMargin, hpMargin, passesHpCheck, type HpCheck } from './estimate-hp';
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
  const VIEWS = [
    { value: 'places', label: 'Places' },
    { value: 'hp', label: 'Spurt and survival', short: 'HP' }
  ];
  const HP_CHECKS: { check: HpCheck; label: string }[] = [
    { check: 'spurt', label: 'Spurt' },
    { check: 'survival', label: 'Survival' }
  ];

  let open = $state(true);
  let view = $state('places');

  const hasHp = $derived(Boolean(result.final_hp ?? result.check_hp));
  const showsHp = $derived(hasHp && view === 'hp');

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

  function hpCheckTitle(check: HpCheck, run: number, source: number, margin: number) {
    if (check === 'spurt') {
      const available = Math.round(result.check_hp?.[run]?.[source]?.[0] ?? 0);
      const required = Math.round(result.full_spurt_need_hp?.[run]?.[source]?.[0] ?? 0);

      return `First spurt check: ${available} HP available, ${required} HP required.`;
    }

    return margin > 0
      ? `Finished with ${Math.round(margin)} HP.`
      : `Needed ${Math.round(-margin)} more HP to survive.`;
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
    {#if hasHp}
      <div class="history-view">
        <SegmentedControl
          label="Race history view"
          options={VIEWS}
          compact
          bind:value={view}
        />
      </div>
    {/if}
    <ol
      class="race-history"
      class:detailed={showsHp}
      style:--group-count={groups.length}
    >
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
                  <span class="race-entry">
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
                    {#if showsHp}
                      <span class="hp-margins">
                        {#each HP_CHECKS as { check, label } (check)}
                          {@const margin = hpMargin(check, { result, run, source: odds.source })}
                          {#if margin !== undefined}
                            {@const passed = passesHpCheck(check, margin)}
                            <span
                              class="hp-margin"
                              class:passed
                              title={hpCheckTitle(check, run, odds.source, margin)}
                            >
                              <span class="hp-label">{label}</span>
                              <b>{formatHpMargin(margin)}</b>
                              <span class="sr-only">HP, {passed ? 'enough' : 'not enough'}</span>
                            </span>
                          {/if}
                        {/each}
                      </span>
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
