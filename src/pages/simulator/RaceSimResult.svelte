<script lang="ts">
  import Banner from '@/components/Banner.svelte';
  import Disclosure from '@/components/Disclosure.svelte';
  import type { MonteCarloResult } from './simulator-repository';

  interface Props {
    result: MonteCarloResult;
    raw: string;
    /** Names by `source_input_index`; missing entries fall back to `Runner n`. */
    labels?: Array<string>;
  }

  let { result, raw, labels = [] }: Props = $props();

  interface RunnerRow {
    source: number;
    label: string;
    wins: number;
    winRate: number;
    meanTime: number | null;
  }

  /** Wins, win rate and mean finish time per source, best record first. */
  const rows = $derived.by<Array<RunnerRow>>(() => {
    const runners = result.finish_order.reduce((max, order) => Math.max(max, order.length), 0);
    const wins = new Array<number>(runners).fill(0);
    const timeTotals = new Array<number>(runners).fill(0);
    const timeSamples = new Array<number>(runners).fill(0);

    for (const race of result.finish_times) {
      for (let source = 0; source < runners; source += 1) {
        const time = race[source];
        if (time === undefined || !Number.isFinite(time)) continue;
        timeTotals[source] = (timeTotals[source] ?? 0) + time;
        timeSamples[source] = (timeSamples[source] ?? 0) + 1;
      }
    }

    for (const order of result.finish_order) {
      const winner = order[0];
      if (winner === undefined || winner < 0 || winner >= runners) continue;
      wins[winner] = (wins[winner] ?? 0) + 1;
    }

    return Array.from({ length: runners }, (_, source) => {
      const count = wins[source] ?? 0;
      const samples = timeSamples[source] ?? 0;
      const total = timeTotals[source] ?? 0;
      return {
        source,
        label: labels[source] ?? `Runner ${source + 1}`,
        wins: count,
        winRate: result.runs > 0 ? count / result.runs : 0,
        meanTime: samples > 0 ? total / samples : null
      };
    }).sort(
      (left, right) =>
        right.wins - left.wins ||
        (left.meanTime ?? Infinity) - (right.meanTime ?? Infinity) ||
        left.source - right.source
    );
  });

  const seconds = (value: number) => `${value.toFixed(2)}s`;
</script>

<div class="race">
  <Banner title="A sample, not a guarantee" tone="info" reportable={false}>
    Each run is one roll of the simulator from a fresh seed. Win rates and mean times are
    estimates from this sample only; a different seed or another batch will shift them.
  </Banner>

  <dl class="stats">
    <div><dt>Runs</dt><dd>{result.runs}</dd></div>
    <div><dt>Runners</dt><dd>{rows.length}</dd></div>
    <div><dt>Seeds</dt><dd>{result.seeds.length}</dd></div>
  </dl>

  {#if rows.length > 0}
    <table aria-label={`Per-runner results across ${result.runs} runs`}>
      <thead>
        <tr>
          <th scope="col">Runner</th>
          <th scope="col">Wins</th>
          <th scope="col">Win rate</th>
          <th scope="col">Mean finish time</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.source)}
          <tr>
            <td>{row.label}</td>
            <td>{row.wins}</td>
            <td>{(row.winRate * 100).toFixed(0)}%</td>
            <td>{row.meanTime === null ? '—' : seconds(row.meanTime)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <p class="hint">The simulator returned no finishing orders for this run.</p>
  {/if}

  <Disclosure id="race-raw" title="Raw response" description="Exactly what the simulator returned" icon="tools">
    <pre>{raw}</pre>
  </Disclosure>

  <p class="build">{result.engine_build}</p>
</div>

<style>
  .race { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(88px, 1fr)); gap: var(--space-2); margin: 0; }
  .stats div { display: flex; flex-direction: column; gap: 2px; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: var(--color-surface-2); }
  .stats dt { color: var(--color-text-muted); font-size: var(--font-xs); }
  .stats dd { margin: 0; font-size: var(--font-md); font-weight: 700; font-variant-numeric: tabular-nums; }
  .hint { margin: 0; color: var(--color-text-muted); font-size: var(--font-xs); }
  table { width: 100%; border-collapse: collapse; font-size: var(--font-sm); }
  th, td { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-border); text-align: left; }
  th { color: var(--color-text-muted); font-size: var(--font-xs); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  td { font-variant-numeric: tabular-nums; }
  tbody tr:last-child td { border-bottom: 0; }
  pre { max-height: 420px; margin: 0; padding: var(--space-3); overflow: auto; border-radius: var(--radius-md); background: var(--factor-field-bg); color: var(--color-text); font-size: var(--font-xs); line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .build { margin: 0; color: var(--color-text-muted); font-size: var(--font-xs); word-break: break-all; }
</style>
