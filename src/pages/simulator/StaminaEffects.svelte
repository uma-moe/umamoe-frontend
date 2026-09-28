<script module lang="ts">
  import {
    MAX_EFFECT_GROUPS,
    MAX_EFFECT_TRIGGERS,
    type StaminaEffectInput
  } from './stamina-request';

  /** One scheduled HP-change row as the form holds it; every leaf is a string for the fields. */
  export interface StaminaEffectRow {
    /** Stable key, so removing a row cannot shuffle values into another row. */
    id: string;
    /** Number of triggers; 1 … 1024. */
    count: string;
    /** Percent of max HP; positive heals, negative drains. */
    hpPercent: string;
    /** Metres from the start. */
    startDistanceM: string;
    /** Empty fires every trigger at the start; otherwise spread them across the window. */
    endDistanceM: string;
  }

  let sequence = 0;

  /** A blank row with a stable id; the owner keeps the array. */
  export function createEffectRow(): StaminaEffectRow {
    sequence += 1;
    return { id: `effect-${sequence}`, count: '1', hpPercent: '-5', startDistanceM: '600', endDistanceM: '' };
  }

  /** Parses a bound string field, returning NaN for blank input so the request builder drops it. */
  export function numberOrNaN(value: string): number {
    const trimmed = value.trim();
    return trimmed === '' ? Number.NaN : Number(trimmed);
  }

  /** Turns form rows into the request shape; rows the builder cannot use stay NaN and are dropped. */
  export function effectRowsToInputs(rows: Array<StaminaEffectRow>): Array<StaminaEffectInput> {
    return rows.map((row) => {
      const input: StaminaEffectInput = {
        count: numberOrNaN(row.count),
        hpPercent: numberOrNaN(row.hpPercent),
        startDistanceM: numberOrNaN(row.startDistanceM)
      };
      const end = numberOrNaN(row.endDistanceM);
      if (Number.isFinite(end)) input.endDistanceM = end;
      return input;
    });
  }
</script>

<script lang="ts">
  import Button from '@/components/Button.svelte';
  import IconButton from '@/components/IconButton.svelte';
  import TextField from '@/components/TextField.svelte';

  interface Props {
    effects?: Array<StaminaEffectRow>;
    /** Course length; rows at or past it are dropped, so the summary says so. */
    courseDistanceM?: number;
  }

  let { effects = $bindable<Array<StaminaEffectRow>>([]), courseDistanceM }: Props = $props();

  const uid = $props.id();

  const totalTriggers = $derived(effects.reduce((total, row) => total + triggersOf(row), 0));
  const atGroupLimit = $derived(effects.length >= MAX_EFFECT_GROUPS);
  const atTriggerLimit = $derived(totalTriggers >= MAX_EFFECT_TRIGGERS);
  const addDisabled = $derived(atGroupLimit || atTriggerLimit);

  /** Trigger count a row contributes, ignoring empty or invalid input. */
  function triggersOf(row: StaminaEffectRow): number {
    const count = Math.round(numberOrNaN(row.count));
    return Number.isFinite(count) && count > 0 ? count : 0;
  }

  function add(): void {
    if (addDisabled) return;
    effects.push(createEffectRow());
  }

  function remove(index: number): void {
    effects.splice(index, 1);
  }

  /** Plain-language reading of a row, e.g. "heals 5.5% three times, spread 400 to 800 m". */
  function summary(row: StaminaEffectRow): string {
    const count = Math.round(numberOrNaN(row.count));
    const hp = numberOrNaN(row.hpPercent);
    const start = numberOrNaN(row.startDistanceM);
    const end = numberOrNaN(row.endDistanceM);

    if (!Number.isFinite(count) || count < 1) return 'Set how many triggers this change has.';
    if (!Number.isFinite(hp)) return 'Set the HP change as a percent of max HP.';
    if (!Number.isFinite(start) || start < 0) return 'Set a start distance in metres.';

    const verb = hp < 0 ? 'drains' : 'heals';
    const amount = `${formatNumber(Math.abs(hp))}%`;
    const times = count === 1 ? '' : count === 2 ? ' twice' : count === 3 ? ' three times' : ` ${count} times`;
    const spread =
      Number.isFinite(end) && end > start
        ? `, spread ${formatNumber(start)} to ${formatNumber(end)} m`
        : ` at ${formatNumber(start)} m`;
    // The builder drops the spread when the end reaches the finish and the whole
    // row when the start does, so the summary names whichever happens.
    const pastFinish =
      courseDistanceM === undefined
        ? ''
        : start >= courseDistanceM
          ? ' (past the finish, so it will be dropped)'
          : Number.isFinite(end) && end >= courseDistanceM
            ? ' (past the finish, so the spread is dropped)'
            : '';
    return `${verb} ${amount}${times}${spread}${pastFinish}`;
  }

  function formatNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
  }
</script>

<section class="panel" aria-labelledby="{uid}-title">
  <div class="panel-head">
    <h2 id="{uid}-title">Scheduled HP changes</h2>
    <Button size="sm" variant="secondary" icon="add" disabled={addDisabled} onclick={add}>
      Add effect
    </Button>
  </div>

  <p class="hint">
    Scheduled approximations the engine applies at the given distances, not real skill casts.
    Up to {MAX_EFFECT_GROUPS} groups and {MAX_EFFECT_TRIGGERS} triggers in total.
  </p>

  {#if atGroupLimit}
    <p class="hint">You reached the {MAX_EFFECT_GROUPS}-group limit; remove a row to add another.</p>
  {:else if atTriggerLimit}
    <p class="hint">
      You scheduled {totalTriggers} triggers; the limit is {MAX_EFFECT_TRIGGERS}.
      Lower a count or remove a row to add another.
    </p>
  {/if}

  {#if effects.length === 0}
    <p class="hint">No scheduled changes. The run uses the plain HP model.</p>
  {:else}
    {#each effects as row, index (row.id)}
      <div class="row" role="group" aria-label="Effect {index + 1}">
        <div class="row-head">
          <span class="row-title">Effect {index + 1}</span>
          <IconButton
            icon="trash"
            label="Remove effect {index + 1}"
            size="sm"
            onclick={() => remove(index)}
          />
        </div>
        <div class="grid">
          <TextField
            id="{uid}-{row.id}-count"
            type="number"
            min={1}
            max={1024}
            label="Triggers"
            bind:value={row.count}
          />
          <TextField
            id="{uid}-{row.id}-hp"
            type="number"
            min={-100}
            max={100}
            step={0.1}
            label="HP change (%)"
            bind:value={row.hpPercent}
          />
          <TextField
            id="{uid}-{row.id}-start"
            type="number"
            min={0}
            label="Start (m)"
            bind:value={row.startDistanceM}
          />
          <TextField
            id="{uid}-{row.id}-end"
            type="number"
            min={0}
            label="End (m, optional)"
            help="Empty fires all triggers at the start; set it to spread them evenly."
            bind:value={row.endDistanceM}
          />
        </div>
        <p class="summary">{summary(row)}</p>
      </div>
    {/each}
  {/if}
</section>

<style>
  .panel { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface-2); }
  .panel h2 { margin: 0; font-size: var(--font-md); }
  .panel-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--space-3); }
  .hint { margin: 0; color: var(--color-text-muted); font-size: var(--font-xs); }
  .row { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-1); }
  .row-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
  .row-title { font-size: var(--font-sm); font-weight: 600; color: var(--color-text); }
  .summary { margin: 0; color: var(--color-text-muted); font-size: var(--font-xs); }
</style>
