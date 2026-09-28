<script module lang="ts">
  import { MAX_STATE_WINDOWS, type StaminaStateInput } from './stamina-request';

  /** One state window as the form holds it; every numeric leaf is a string for the fields. */
  export interface StaminaStateRow {
    /** Stable key, so removing a row cannot shuffle values into another row. */
    id: string;
    /** Metres from the start. */
    startDistanceM: string;
    /** Real seconds; not distance-scaled. */
    durationSeconds: string;
    spotStruggle: boolean;
    rushed: boolean;
    paceDown: boolean;
    downhill: boolean;
    dueling: boolean;
    /** Added to target speed; blank leaves it unchanged. */
    targetSpeedAddMps: string;
    currentSpeedAddMps: string;
    accelerationAddMps2: string;
    /** Blank leaves the multiplier at the engine default of 1. */
    hpConsumptionMultiplier: string;
  }

  let sequence = 0;

  /** A blank window with a stable id; the owner keeps the array. */
  export function createStateRow(): StaminaStateRow {
    sequence += 1;
    return {
      id: `state-${sequence}`,
      startDistanceM: '600',
      durationSeconds: '5',
      spotStruggle: false,
      rushed: false,
      paceDown: false,
      downhill: false,
      dueling: false,
      targetSpeedAddMps: '',
      currentSpeedAddMps: '',
      accelerationAddMps2: '',
      hpConsumptionMultiplier: '1'
    };
  }

  /** Parses a bound string field, returning NaN for blank input so the request builder omits it. */
  export function numberOrNaN(value: string): number {
    const trimmed = value.trim();
    return trimmed === '' ? Number.NaN : Number(trimmed);
  }

  /** Turns form rows into the request shape; blank additions and windows stay NaN and are dropped. */
  export function stateRowsToInputs(rows: Array<StaminaStateRow>): Array<StaminaStateInput> {
    return rows.map((row) => ({
      startDistanceM: numberOrNaN(row.startDistanceM),
      durationSeconds: numberOrNaN(row.durationSeconds),
      spotStruggle: row.spotStruggle,
      rushed: row.rushed,
      paceDown: row.paceDown,
      downhill: row.downhill,
      dueling: row.dueling,
      targetSpeedAddMps: numberOrNaN(row.targetSpeedAddMps),
      currentSpeedAddMps: numberOrNaN(row.currentSpeedAddMps),
      accelerationAddMps2: numberOrNaN(row.accelerationAddMps2),
      hpConsumptionMultiplier: numberOrNaN(row.hpConsumptionMultiplier)
    }));
  }
</script>

<script lang="ts">
  import Button from '@/components/Button.svelte';
  import Checkbox from '@/components/Checkbox.svelte';
  import IconButton from '@/components/IconButton.svelte';
  import TextField from '@/components/TextField.svelte';

  interface Props {
    states?: Array<StaminaStateRow>;
  }

  let { states = $bindable<Array<StaminaStateRow>>([]) }: Props = $props();

  const uid = $props.id();

  const atLimit = $derived(states.length >= MAX_STATE_WINDOWS);
  const addDisabled = $derived(atLimit);

  function add(): void {
    if (addDisabled) return;
    states.push(createStateRow());
  }

  function remove(index: number): void {
    states.splice(index, 1);
  }
</script>

<section class="panel" aria-labelledby="{uid}-title">
  <div class="panel-head">
    <h2 id="{uid}-title">State windows</h2>
    <Button size="sm" variant="secondary" icon="add" disabled={addDisabled} onclick={add}>
      Add window
    </Button>
  </div>

  <p class="hint">
    Scheduled windows the engine applies from the start distance for the given real seconds,
    not real skill casts. Up to {MAX_STATE_WINDOWS} windows.
  </p>

  {#if atLimit}
    <p class="hint">You reached the {MAX_STATE_WINDOWS}-window limit; remove a window to add another.</p>
  {/if}

  {#if states.length === 0}
    <p class="hint">No state windows. The run uses the plain race state.</p>
  {:else}
    {#each states as row, index (row.id)}
      <div class="row" role="group" aria-label="State window {index + 1}">
        <div class="row-head">
          <span class="row-title">Window {index + 1}</span>
          <IconButton
            icon="trash"
            label="Remove state window {index + 1}"
            size="sm"
            onclick={() => remove(index)}
          />
        </div>
        <div class="grid">
          <TextField
            id="{uid}-{row.id}-start"
            type="number"
            min={0}
            label="Start (m)"
            bind:value={row.startDistanceM}
          />
          <TextField
            id="{uid}-{row.id}-duration"
            type="number"
            min={0.001}
            max={1200}
            step={0.1}
            label="Duration (s)"
            help="Real seconds, up to 1200."
            bind:value={row.durationSeconds}
          />
        </div>

        <div class="flags">
          <Checkbox id="{uid}-{row.id}-spot" label="Spot struggle" bind:checked={row.spotStruggle} />
          <Checkbox id="{uid}-{row.id}-rushed" label="Rushed" bind:checked={row.rushed} />
          <Checkbox id="{uid}-{row.id}-pace" label="Pace down" bind:checked={row.paceDown} />
          <Checkbox id="{uid}-{row.id}-downhill" label="Downhill" bind:checked={row.downhill} />
          <Checkbox id="{uid}-{row.id}-dueling" label="Dueling" bind:checked={row.dueling} />
        </div>

        <div class="grid">
          <TextField
            id="{uid}-{row.id}-target"
            type="number"
            min={-30}
            max={30}
            step={0.1}
            label="Target speed (m/s)"
            help="Blank leaves it unchanged."
            bind:value={row.targetSpeedAddMps}
          />
          <TextField
            id="{uid}-{row.id}-current"
            type="number"
            min={-30}
            max={30}
            step={0.1}
            label="Current speed (m/s)"
            help="Blank leaves it unchanged."
            bind:value={row.currentSpeedAddMps}
          />
          <TextField
            id="{uid}-{row.id}-accel"
            type="number"
            min={-30}
            max={30}
            step={0.1}
            label="Acceleration (m/s²)"
            help="Blank leaves it unchanged."
            bind:value={row.accelerationAddMps2}
          />
          <TextField
            id="{uid}-{row.id}-hp"
            type="number"
            min={0}
            max={10}
            step={0.1}
            label="HP use ×"
            help="1 is normal; 0 stops HP drain in the window."
            bind:value={row.hpConsumptionMultiplier}
          />
        </div>
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
  .flags { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--space-1); }
</style>
