<script lang="ts">
  import { runnerColor } from './simulation-report';

  /**
   * Names each runner's line under a report chart, so a line is never told apart by its colour alone. It sits below
   * the canvas and wraps, where a legend drawn inside the chart would cover the axis once it needs a second line.
   */
  let { runners }: { runners: { source: number; name: string }[] } = $props();
</script>

{#if runners.length > 1}
  <ul
    class="legend"
    aria-label="Chart legend"
  >
    {#each runners as runner (runner.source)}
      <li style:--runner={runnerColor(runner.source)}>
        <i aria-hidden="true"></i>
        {runner.name}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px 14px;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
    font-size: 10px;
    color: var(--text-secondary);
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }
  .legend i {
    width: 12px;
    height: 3px;
    border-radius: 2px;
    background: var(--runner);
  }
</style>
