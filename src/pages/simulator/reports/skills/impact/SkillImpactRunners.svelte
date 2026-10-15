<script lang="ts">
  import { runnerColor } from '../../simulation-report';
  import SimulatorRunnerFace from '../../SimulatorRunnerFace.svelte';
  import type { SimulatorUma } from '../../../simulator-uma';

  interface Props {
    sources: number[];
    active: number;
    umas: SimulatorUma[];
    summary: (runner: number) => { badge: string; title: string };
    onselect: (runner: number) => void;
  }

  let { sources, active, umas, summary: runnerSummary, onselect }: Props = $props();
</script>

<div
  class="runners"
  role="radiogroup"
  aria-label="Runner"
>
  {#each sources as runner (runner)}
    {@const summary = runnerSummary(runner)}
    <button
      type="button"
      role="radio"
      aria-checked={runner === active}
      class="runner"
      class:active={runner === active}
      style:--runner={runnerColor(runner)}
      title={summary.title}
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
      <span class="runner-name">{umas[runner]!.name}</span>
      <small>{summary.badge}</small>
    </button>
  {/each}
</div>

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
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .runner small {
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
  .runner.active small {
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
  @media (max-width: 600px) {
    .runners {
      display: flex;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .runner {
      flex: none;
      max-width: 220px;
    }
  }
</style>
