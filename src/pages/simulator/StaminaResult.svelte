<script lang="ts">
  import Banner from '@/components/Banner.svelte';
  import Disclosure from '@/components/Disclosure.svelte';
  import type { StaminaResult } from './simulator-repository';

  interface Props {
    result: StaminaResult;
    raw: string;
  }

  let { result, raw }: Props = $props();

  /** The engine's `1/2/4/8` spurt codes, spelled out. */
  const DECISION_LABELS: Record<number, string> = {
    1: 'True (exceeds max HP)',
    2: 'True',
    4: 'False (below minimum HP)',
    8: 'False'
  };

  const hp = (value: number) => Math.round(value).toLocaleString();
  const metres = (value: number) => `${Math.round(value).toLocaleString()} m`;
</script>

<div class="stamina">
  {#if result.survived}
    <Banner title="Finishes with HP to spare" tone="success" reportable={false}>
      Ended with {hp(result.remaining_hp)} of {hp(result.max_hp)} HP.
    </Banner>
  {:else}
    <Banner title="Runs out of HP" tone="danger" reportable={false}>
      {#if result.exhausted_at}
        First exhaustion at {metres(result.exhausted_at.distance_m)}
        ({result.exhausted_at.time_seconds.toFixed(1)}s).
      {:else}
        The run exceeded the available HP.
      {/if}
    </Banner>
  {/if}

  <dl class="stats">
    <div><dt>Max HP</dt><dd>{hp(result.max_hp)}</dd></div>
    <div><dt>Remaining</dt><dd>{hp(result.remaining_hp)}</dd></div>
    <div><dt>HP deficit</dt><dd>{hp(result.hp_deficit)}</dd></div>
    <div><dt>Minimum</dt><dd>{hp(result.minimum_hp)}</dd></div>
    <div><dt>Consumed</dt><dd>{hp(result.consumed_hp)}</dd></div>
    <div><dt>Recovered</dt><dd>{hp(result.recovered_hp)}</dd></div>
    <div><dt>Debuff loss</dt><dd>{hp(result.debuff_hp_loss)}</dd></div>
    <div><dt>Wasted heal</dt><dd>{hp(result.wasted_recovery_hp)}</dd></div>
  </dl>

  <dl class="stats">
    <div><dt>Finish time</dt><dd>{result.finish_time_seconds.toFixed(2)}s</dd></div>
    <div>
      <dt>Spurt start</dt>
      <dd>{result.last_spurt_start_distance_m === null ? '—' : metres(result.last_spurt_start_distance_m)}</dd>
    </div>
    <div>
      <dt>Spurt plan</dt>
      <dd>{DECISION_LABELS[result.last_spurt_decision] ?? '—'}</dd>
    </div>
  </dl>

  {#if result.spurt_calculation_times.length > 0}
    <table aria-label="Spurt feasibility per calculation">
      <thead>
        <tr>
          <th scope="col">Time</th>
          <th scope="col">Distance</th>
          <th scope="col">HP at check</th>
          <th scope="col">Full spurt needs</th>
          <th scope="col">Decision</th>
        </tr>
      </thead>
      <tbody>
        {#each result.spurt_calculation_times as time, index (index)}
          <tr>
            <td>{time.toFixed(1)}s</td>
            <td>{metres(result.spurt_calculation_distances[index] ?? 0)}</td>
            <td>{hp(result.check_hp[index] ?? 0)}</td>
            <td>{hp(result.full_spurt_need_hp[index] ?? 0)}</td>
            <td>{DECISION_LABELS[result.spurt_calculation_results[index] ?? 0] ?? '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <Disclosure id="stamina-raw" title="Raw response" description="Exactly what the simulator returned" icon="tools">
    <pre>{raw}</pre>
  </Disclosure>

  <p class="model">{result.model} · seed {result.seed} · course {result.course_id}</p>
</div>

<style>
  .stamina { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: var(--space-2); margin: 0; }
  .stats div { display: flex; flex-direction: column; gap: 2px; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: var(--color-surface-2); }
  .stats dt { color: var(--color-text-muted); font-size: var(--font-xs); }
  .stats dd { margin: 0; font-size: var(--font-md); font-weight: 700; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: var(--font-sm); }
  th, td { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-border); text-align: left; }
  th { color: var(--color-text-muted); font-size: var(--font-xs); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  td { font-variant-numeric: tabular-nums; }
  tbody tr:last-child td { border-bottom: 0; }
  pre { max-height: 360px; margin: 0; padding: var(--space-3); overflow: auto; border-radius: var(--radius-md); background: var(--factor-field-bg); color: var(--color-text); font-size: var(--font-xs); line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .model { margin: 0; color: var(--color-text-muted); font-size: var(--font-xs); word-break: break-all; }
</style>
