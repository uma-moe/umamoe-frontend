<script lang="ts">
  import { runnerColor } from './simulation-report';
  import { runnerStyle } from './runner-profile';
  import SimulatorRunnerFace from './SimulatorRunnerFace.svelte';
  import type { SimulatorUma } from '../simulator-uma';

  /** One tab per runner for the report sections that follow a single runner. */
  interface Props {
    /** Names the picker for its section, since a report can show more than one. */
    label: string;
    sources: number[];
    active: number;
    umas: SimulatorUma[];
    /** A short badge per runner, such as how far her measurements are. */
    summary?: (runner: number) => { badge: string; title: string } | undefined;
    onselect: (runner: number) => void;
  }

  let { label, sources, active, umas, summary: runnerSummary, onselect }: Props = $props();

  const activeSummary = $derived(runnerSummary?.(active));
</script>

<div
  class="runners"
  role="radiogroup"
  aria-label={label}
>
  {#each sources as runner (runner)}
    {@const summary = runnerSummary?.(runner)}
    <!-- A phone shows only her portrait, so the name, style and badge are also given as the label. -->
    <button
      type="button"
      role="radio"
      aria-checked={runner === active}
      aria-label={[umas[runner]!.name, runnerStyle(umas[runner]!), summary?.badge]
        .filter(Boolean)
        .join(', ')}
      class="runner"
      class:active={runner === active}
      style:--runner={runnerColor(runner)}
      title={summary?.title}
      onclick={() => onselect(runner)}
    >
      <i
        class="dot"
        aria-hidden="true"
      ></i>
      <SimulatorRunnerFace
        cardId={umas[runner]!.cardId}
        size={24}
      />
      <span class="runner-name">
        {umas[runner]!.name}
        <em>{runnerStyle(umas[runner]!)}</em>
      </span>
      {#if summary}
        <small>{summary.badge}</small>
      {/if}
    </button>
  {/each}
</div>
<p
  class="picked-runner"
  style:--runner={runnerColor(active)}
  aria-hidden="true"
>
  <i class="dot"></i>
  <strong>{umas[active]!.name}</strong>
  <em>{runnerStyle(umas[active]!)}</em>
  {#if activeSummary}
    <small title={activeSummary.title}>{activeSummary.badge}</small>
  {/if}
</p>

<style>
  /* Full-width runner picker in the same style as the report's other tab groups: one bar, the selected tab tinted. */
  .runners {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 4px;
    margin-bottom: 6px;
    padding: 4px;
    border: 1px solid var(--tab-bar-border, var(--border-subtle));
    border-radius: 10px;
    background: var(--tab-bar-bg, transparent);
  }
  .runner {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    min-height: 34px;
    padding: 0 8px 0 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--tab-btn-color, var(--text-secondary));
    font: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
  }
  .runner:hover,
  .runner:focus-visible {
    color: var(--text-primary);
    background: var(--tab-btn-hover-bg);
  }
  .runner.active {
    color: var(--accent-primary);
    background: rgb(var(--accent-primary-rgb) / 0.12);
    border-color: rgb(var(--accent-primary-rgb) / 0.3);
  }
  .runner-name {
    display: grid;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.2;
  }
  .runner-name em {
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-secondary);
    font-size: 10px;
    font-style: normal;
    font-weight: 400;
  }
  .runner small,
  .picked-runner small {
    display: inline-grid;
    place-items: center;
    flex: none;
    min-width: 18px;
    height: 18px;
    margin: 0 0 0 auto;
    padding: 0 6px;
    border: 1px solid var(--border-primary);
    border-radius: 9px;
    background: var(--surface-3);
    color: var(--text-primary);
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .runner.active small,
  .picked-runner small {
    color: var(--accent-primary);
    background: rgb(var(--accent-primary-rgb) / 0.12);
    border-color: rgb(var(--accent-primary-rgb) / 0.32);
  }
  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--runner);
  }
  .picked-runner {
    display: none;
  }
  /* A phone shows the runners as one row of portraits that fits the width, with the selected runner named beneath. */
  @media (max-width: 600px) {
    .runners {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      margin-bottom: 0;
    }
    .runner {
      flex: 1 0 30px;
      max-width: 48px;
      justify-content: center;
      min-height: 38px;
      padding: 0 0 3px;
      box-shadow: inset 0 -2px var(--runner);
    }
    .runner :global(.face) {
      width: 30px;
      height: 30px;
    }
    .runner > :is(.dot, .runner-name, small) {
      display: none;
    }
    .picked-runner {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      margin: 6px 2px 8px;
      font-size: 13px;
      white-space: nowrap;
    }
    .picked-runner strong {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 650;
    }
    .picked-runner em {
      color: var(--text-secondary);
      font-size: 11px;
      font-style: normal;
    }
  }
</style>
