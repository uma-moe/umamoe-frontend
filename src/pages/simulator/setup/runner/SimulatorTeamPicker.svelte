<script lang="ts">
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import Icon from '@/components/Icon.svelte';
  import {
    simulatorRoster,
    simulatorTeamColors,
    simulatorTeamColor,
    simulatorTeamLabel,
    addSimulatorTeamColor
  } from '../../simulator-roster.svelte';

  let {
    value = 0,
    label = 'Team color',
    onchange
  }: { value?: number; label?: string; onchange: (id: number) => void } = $props();

  let error = $state('');

  const ids = $derived(
    [
      ...new Set([
        ...Object.keys(simulatorTeamColors).map(Number),
        ...simulatorRoster.umas.map((uma) => uma.teamId ?? 0),
        value
      ])
    ]
      .filter((id) => id > 0)
      .sort((a, b) => a - b)
  );

  function select(id: number, event: Event) {
    onchange(id);
    error = '';
    const panel = (event.currentTarget as HTMLElement).closest<HTMLElement>('[popover]');
    panel?.hidePopover();
    panel?.parentElement
      ?.querySelector<HTMLButtonElement>('.trigger')
      ?.focus({ preventScroll: true });
  }

  function add(event: Event) {
    try {
      select(addSimulatorTeamColor((event.currentTarget as HTMLInputElement).value), event);
    } catch (reason) {
      error = (reason as Error).message;
    }
  }
</script>

<div class="team-picker">
  <InspectPopover
    {label}
    align="end"
  >
    {#snippet trigger()}
      <span
        class="team-indicator"
        class:independent={!value}
        style:--team-color={simulatorTeamColor(value)}
        title={simulatorTeamLabel(value)}
      >
        <i>
          {#if !value}
            <Icon
              name="users"
              size={14}
            />
          {/if}
          <span class="swatch-arrow">
            <Icon
              name="chevron"
              size={12}
            />
          </span>
        </i>
        <span class="sr-only">{simulatorTeamLabel(value)}</span>
      </span>
    {/snippet}
    <div class="picker-heading">
      <strong>Team color</strong>
      <p>Runners with the same color race together.</p>
    </div>
    <div
      class="swatches"
      role="group"
      aria-label="Available team colors"
    >
      {#each ids as id}
        <button
          type="button"
          class="swatch"
          class:selected={value === id}
          style:--team-color={simulatorTeamColor(id)}
          aria-label={simulatorTeamLabel(id)}
          aria-pressed={value === id}
          title={simulatorTeamLabel(id) +
            ' · ' +
            simulatorRoster.umas.filter((uma) => uma.teamId === id).length +
            ' runners'}
          onclick={(event) => select(id, event)}
        >
          {#if value === id}
            <span class="selected-mark">
              <Icon
                name="check"
                size={14}
              />
            </span>
          {/if}
        </button>
      {/each}
      <label
        class="add-color"
        title="Add a custom team color"
      >
        <Icon
          name="add"
          size={19}
        />
        <input
          type="color"
          aria-label="Add team color"
          value="#62cfd2"
          onchange={add}
        />
      </label>
    </div>
    <button
      type="button"
      class="independent-option"
      aria-pressed={!value}
      onclick={(event) => select(0, event)}
    >
      <Icon
        name="users"
        size={15}
      />Independent runner{#if !value}
        <Icon
          name="check"
          size={15}
        />
      {/if}
    </button>
    <p class="picker-hint">Choose a color, or use + to add your own.</p>
    {#if error}
      <p
        class="picker-error"
        role="alert"
      >
        {error}
      </p>
    {/if}
  </InspectPopover>
</div>

<style>
  .team-picker {
    --inspect-popover-width: 320px;
    --inspect-popover-padding: 14px;
    display: flex;
    min-width: 0;
  }
  .team-picker :global(.inspect) {
    display: flex;
  }
  .team-picker :global(.inspect > .trigger) {
    display: flex;
    min-width: 44px;
    min-height: 32px;
    border-radius: var(--radius-sm);
  }
  .team-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 32px;
    color: var(--text-primary);
  }
  .team-indicator > i {
    position: relative;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--border-subtle);
    border-radius: 5px;
    background: var(--team-color);
  }
  .swatch-arrow {
    position: absolute;
    right: 2px;
    bottom: 2px;
    display: flex;
    color: white;
    filter: drop-shadow(0 0 1px #141414);
  }
  .team-indicator.independent > i {
    border: 1px dashed var(--border-secondary);
    background: var(--surface-2);
    color: var(--text-secondary);
  }
  .team-indicator:hover > i {
    filter: brightness(1.08);
  }
  .picker-heading {
    padding-right: 30px;
  }
  .picker-heading strong {
    font-size: 13px;
  }
  .picker-heading p {
    font-size: 11px;
    line-height: 1.6;
    color: var(--text-secondary);
    margin: 6px 0 14px;
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(38px, 1fr));
    gap: 8px;
  }
  .swatch,
  .add-color {
    position: relative;
    display: grid;
    place-items: center;
    min-width: 0;
    height: 42px;
    padding: 0;
    border: 1px solid var(--border-secondary);
    border-radius: var(--radius-md);
  }
  .swatch {
    background: var(--team-color);
    cursor: pointer;
  }
  .swatch.selected {
    outline: 2px solid var(--text-primary);
    outline-offset: 2px;
  }
  .swatch:hover {
    filter: brightness(1.1);
  }
  .selected-mark {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #141414;
    color: white;
  }
  .add-color {
    border-style: dashed;
    background: var(--surface-2);
    color: var(--text-secondary);
    cursor: pointer;
  }
  .add-color:hover {
    color: var(--accent-primary);
    border-color: var(--accent-primary);
  }
  .add-color input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }
  .swatch:focus-visible,
  .add-color:focus-within,
  .independent-option:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 3px;
  }
  .independent-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 38px;
    padding: 8px 0 0;
    margin-top: 12px;
    border: 0;
    border-top: 1px solid var(--border-subtle);
    background: transparent;
    color: var(--text-secondary);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    text-align: left;
  }
  .independent-option :global(svg:last-child:not(:first-child)) {
    margin-left: auto;
  }
  .picker-hint,
  .picker-error {
    margin: 10px 0 0;
    font-size: 10px;
    line-height: 1.6;
    color: var(--text-secondary);
  }
  .picker-error {
    color: var(--color-danger);
  }
  @media (max-width: 767px) {
    .team-picker :global(.inspect > .trigger) {
      min-height: 44px;
    }
    .team-indicator {
      height: 40px;
    }
    .swatch,
    .add-color {
      height: 44px;
    }
  }
</style>
