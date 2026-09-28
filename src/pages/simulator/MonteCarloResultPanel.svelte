<script lang="ts">
  import Disclosure from '@/components/Disclosure.svelte';
  import type { MonteCarloResult } from './simulator-repository';

  interface Props {
    result: MonteCarloResult;
    raw: string;
  }

  let { result, raw }: Props = $props();

  const runnerCount = $derived(
    result.finish_order.reduce((max, order) => Math.max(max, order.length), 0)
  );

  const rows = $derived.by(() => {
    const wins = Array.from({ length: runnerCount }, () => 0);
    for (const order of result.finish_order) {
      const winner = order[0];
      if (winner !== undefined && winner < wins.length) wins[winner] = (wins[winner] ?? 0) + 1;
    }
    return wins
      .map((count, source) => ({
        source,
        count,
        rate: result.runs > 0 ? count / result.runs : 0
      }))
      .sort((left, right) => right.count - left.count || left.source - right.source);
  });
</script>

<div class="result">
  <dl class="stats">
    <div><dt>Runs</dt><dd>{result.runs}</dd></div>
    <div><dt>Seeds</dt><dd>{result.seeds.length}</dd></div>
    <div><dt>Runners</dt><dd>{runnerCount}</dd></div>
    <div><dt>Schema</dt><dd>{result.schema_version}</dd></div>
  </dl>

  <table aria-label={`Wins per runner across ${result.runs} runs`}>
    <thead>
      <tr><th scope="col">Source</th><th scope="col">Wins</th><th scope="col">Win rate</th></tr>
    </thead>
    <tbody>
      {#each rows as row (row.source)}
        <tr>
          <td>{row.source}</td>
          <td>{row.count}</td>
          <td>{(row.rate * 100).toFixed(0)}%</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <Disclosure
    id="sim-raw"
    title="Raw response"
    description="Exactly what the simulator returned"
    icon="tools"
  >
    <pre>{raw}</pre>
  </Disclosure>

  <p class="build">{result.engine_build}</p>
</div>

<style>
  .result { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(88px, 1fr)); gap: var(--space-2); margin: 0; }
  .stats div { display: flex; flex-direction: column; gap: 2px; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: var(--color-surface-2); }
  .stats dt { color: var(--color-text-muted); font-size: var(--font-xs); }
  .stats dd { margin: 0; font-size: var(--font-md); font-weight: 700; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: var(--font-sm); }
  th, td { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-border); text-align: left; }
  th { color: var(--color-text-muted); font-size: var(--font-xs); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  td { font-variant-numeric: tabular-nums; }
  tbody tr:last-child td { border-bottom: 0; }
  pre { max-height: 420px; margin: 0; padding: var(--space-3); overflow: auto; border-radius: var(--radius-md); background: var(--factor-field-bg); color: var(--color-text); font-size: var(--font-xs); line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .build { margin: 0; color: var(--color-text-muted); font-size: var(--font-xs); word-break: break-all; }
</style>
