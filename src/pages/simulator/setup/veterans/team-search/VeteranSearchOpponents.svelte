<script lang="ts">
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import SimulatorRunnerFace from '../../../reports/SimulatorRunnerFace.svelte';
  import { simulatorRoster } from '../../../simulator-roster.svelte';
  import type { CmBenchmark } from '../../../courses/cm-benchmark';
  import CmOpponents from '../../../shell/CmOpponents.svelte';

  interface Props {
    source: string;
    snapshotId: string;
    benchmark?: CmBenchmark;
    benchmarkLoading: boolean;
    opponentIds: string[];
    opponentCount: number;
    initialSnapshot: string;
    disabled: boolean;
  }

  let {
    source = $bindable(),
    snapshotId = $bindable(),
    benchmark = $bindable(),
    benchmarkLoading = $bindable(),
    opponentIds = $bindable(),
    opponentCount,
    initialSnapshot,
    disabled
  }: Props = $props();

  const SOURCES = [
    { value: 'cm', label: 'Top CM teams' },
    { value: 'field', label: 'Race field' }
  ];

  function toggleOpponent(id: string) {
    opponentIds = opponentIds.includes(id)
      ? opponentIds.filter((item) => item !== id)
      : opponentIds.length < 6
        ? [...opponentIds, id]
        : opponentIds;
  }
</script>

<section
  class="panel against"
  aria-label="Opponents"
>
  <header>
    <h3>Against</h3>
    <SegmentedControl
      label="Opponents"
      compact
      options={SOURCES}
      bind:value={source}
    />
  </header>
  {#if source === 'cm'}
    <CmOpponents
      bind:snapshotId
      bind:benchmark
      bind:loading={benchmarkLoading}
      {initialSnapshot}
      {disabled}
      note={'Your team races two of these ' +
        (benchmark ? benchmark.teams.length + ' ' : '') +
        'leading teams at a time, on the CM’s course, conditions and mood.'}
    />
  {:else if simulatorRoster.umas.length < 6}
    <p class="note">The race field needs six runners to race against.</p>
  {:else}
    <ul
      class="field-picks"
      aria-label="Opponents from the race field"
    >
      {#each simulatorRoster.umas as uma (uma.id)}
        {@const order = opponentIds.indexOf(uma.id)}
        <li>
          <button
            type="button"
            class="pick"
            class:on={order >= 0}
            aria-pressed={order >= 0}
            disabled={disabled || (order < 0 && opponentIds.length >= 6)}
            onclick={() => toggleOpponent(uma.id)}
          >
            <SimulatorRunnerFace
              cardId={uma.cardId}
              size={24}
            />
            <span>{uma.name}</span>
            {#if order >= 0}<small>Team {order < 3 ? 'A' : 'B'}</small>{/if}
          </button>
        </li>
      {/each}
    </ul>
    <p class="note">
      {opponentCount} of 6 picked. The first three race as one team, the next three as another.
    </p>
  {/if}
</section>

<style>
  @import './veteran-search-panel.css';

  .against header :global(.segments) {
    margin-left: auto;
  }

  .field-picks {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 4px;
    margin: 0 0 6px;
    padding: 0;
    list-style: none;
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-height: 34px;
    padding: 3px 8px 3px 4px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .pick span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pick small {
    font-size: 10px;
    font-weight: 700;
    color: var(--accent-primary);
  }
  .pick.on {
    border-color: color-mix(in srgb, var(--accent-primary) 45%, transparent);
    background: color-mix(in srgb, var(--accent-primary) 8%, transparent);
  }
  .pick:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
