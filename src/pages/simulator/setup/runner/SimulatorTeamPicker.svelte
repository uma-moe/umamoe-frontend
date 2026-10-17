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
      error = reason instanceof Error ? reason.message : 'Could not assign this team colour.';
    }
  }
</script>

<div class="team-picker">
  <InspectPopover
    {label}
    align="start"
  >
    {#snippet trigger()}
      <span
        class="team-indicator"
        class:no-team={!value}
        style:--team-color={simulatorTeamColor(value)}
        title={simulatorTeamLabel(value)}
      >
        <i>
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
    <!-- One slim row: the team colors, no team, then a color of your own. -->
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
        ></button>
      {/each}
      <button
        type="button"
        class="no-team-option"
        class:selected={!value}
        aria-label="No team"
        aria-pressed={!value}
        title="No team: she races on her own"
        onclick={(event) => select(0, event)}
      ></button>
      <label
        class="add-color"
        title="Add a custom team color"
      >
        <Icon
          name="add"
          size={14}
        />
        <input
          type="color"
          aria-label="Add team color"
          value="#62cfd2"
          onchange={add}
        />
      </label>
    </div>
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
    --swatch: 24px;
    --inspect-popover-width: calc(7 * var(--swatch) + 6 * 6px + 18px);
    --inspect-popover-padding: 8px;
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
  /* The slim row closes with Escape or a click outside, like a menu, so it carries no close button of its own. */
  .team-picker :global(.popover > .close) {
    display: none;
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
  /* No team: an empty swatch struck through, the usual mark for "no colour", so it never reads as a missing one. */
  .team-indicator.no-team > i,
  .no-team-option {
    background:
      linear-gradient(
        135deg,
        transparent calc(50% - 1px),
        var(--color-danger) calc(50% - 1px) calc(50% + 1px),
        transparent calc(50% + 1px)
      ),
      var(--surface-1);
    box-shadow: inset 0 0 0 1.5px var(--text-secondary);
  }
  .team-indicator:hover > i {
    filter: brightness(1.08);
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .swatch,
  .no-team-option,
  .add-color {
    position: relative;
    display: grid;
    place-items: center;
    width: var(--swatch);
    height: var(--swatch);
    padding: 0;
    border: 1px solid rgb(255 255 255 / 0.18);
    border-radius: 50%;
    cursor: pointer;
  }
  .swatch {
    background: var(--team-color);
  }
  .swatch:hover {
    filter: brightness(1.1);
  }
  .no-team-option {
    border: 0;
  }
  .no-team-option:hover {
    box-shadow: inset 0 0 0 1.5px var(--text-primary);
  }
  .add-color {
    border-style: dashed;
    border-color: var(--border-secondary);
    background: var(--surface-2);
    color: var(--text-secondary);
  }
  .add-color:hover {
    color: var(--accent-primary);
    border-color: var(--accent-primary);
  }
  .swatch.selected,
  .no-team-option.selected {
    outline: 2px solid var(--text-primary);
    outline-offset: 2px;
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
  .no-team-option:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }
  .picker-error {
    margin: 8px 0 0;
    font-size: 10px;
    line-height: 1.6;
    color: var(--color-danger);
  }
  @media (max-width: 767px) {
    .team-picker {
      --swatch: 36px;
    }
    .team-picker :global(.inspect > .trigger) {
      min-height: 44px;
    }
    .team-indicator {
      height: 40px;
    }
  }
</style>
