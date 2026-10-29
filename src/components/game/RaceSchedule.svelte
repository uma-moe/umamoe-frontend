<script lang="ts">
  import Dialog from '../overlays/Dialog.svelte';
  import Button from '../controls/Button.svelte';
  import RaceBadge from './RaceBadge.svelte';
  import type { RaceBadgeData, RaceScheduleYear, RaceScheduleSlot } from './race-types';

  interface Props {
    years: RaceScheduleYear[];
    label?: string;
    selectable?: boolean;
    selectedIds?: string[];
    selectedKeys?: string[];
    onselect?: (race: RaceBadgeData, slotId: string, yearId: string) => void;
  }

  let {
    years,
    label = 'Race schedule',
    selectable = false,
    selectedIds = [],
    selectedKeys = [],
    onselect
  }: Props = $props();

  let picker = $state<{ year: RaceScheduleYear; slot: RaceScheduleSlot }>();
  let pickerOpen = $state(false);

  const instanceId = $props.id();

  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ];

  function selected(race: RaceBadgeData, slot: RaceScheduleSlot): boolean {
    return selectedIds.includes(race.id) || selectedKeys.includes(`${slot.id}:${race.id}`);
  }

  function cellSlots(year: RaceScheduleYear, month: number, half: number): RaceScheduleSlot[] {
    return year.slots.filter(
      (slot) =>
        slot.id === `${year.id}-${month}-${half}` ||
        slot.id.startsWith(`${year.id}-${month}-${half}-`)
    );
  }

  function openSlot(year: RaceScheduleYear, slot: RaceScheduleSlot): void {
    picker = { year, slot };

    pickerOpen = true;
  }
</script>

{#snippet openRace(race: RaceBadgeData, slot: RaceScheduleSlot, year: RaceScheduleYear)}
  {#if onselect}
    <button
      class="race-open"
      type="button"
      aria-label={`Open ${race.name}`}
      onclick={() => onselect?.(race, slot.id, year.id)}
    >
      <RaceBadge
        {race}
        compact
      />
    </button>
  {:else}
    <RaceBadge
      {race}
      compact
    />
  {/if}
{/snippet}

<div
  class="race-schedule-container"
  class:selectable
>
  <section
    class="race-schedule"
    aria-label={label}
  >
    {#each years as year, yearIndex (year.id)}
      <section class="year year--{year.id}">
        <h4>
          {#if selectable}
            <span
              class="year-number"
              aria-hidden="true"
            >
              0{yearIndex + 1}
            </span>
          {/if}{year.label}
        </h4>
        {#if selectable}
          <div
            class="calendar-head"
            aria-hidden="true"
          >
            <span>Month</span>
            <span>Early</span>
            <span>Late</span>
          </div>
        {/if}
        <div class="calendar">
          {#each months as monthName, index}
            {#if selectable}
              <span class="month-label">{monthName}</span>
            {/if}
            {#each [1, 2] as half}
              {@const slots = cellSlots(year, index + 1, half)}
              {@const slot = slots[0]}
              <div class="calendar-cell">
                <div
                  class="cell-races"
                  class:unavailable={selectable && !slot?.races.length}
                >
                  {#each slots as entry (entry.id)}
                    {#each entry.races.filter((race) => !selectable || selected(race, entry)) as race (race.id)}
                      {#if selectable}
                        <RaceBadge
                          {race}
                          compact
                          presentation="inline"
                          removable
                          onremove={() => onselect?.(race, entry.id, year.id)}
                        />
                      {:else}
                        {@render openRace(race, entry, year)}
                      {/if}
                    {/each}
                  {/each}
                  {#if selectable && slot?.races.length && !slot.races.some( (race) => selected(race, slot) )}
                    <span class="add-race">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="add"
                        ariaLabel={`Add race: ${year.label}, ${monthName} ${half === 1 ? 'Early' : 'Late'}`}
                        onclick={() => openSlot(year, slot)}
                      />
                    </span>
                  {:else if selectable && !slot?.races.length}
                    <span
                      class="unavailable-mark"
                      aria-label="No races available"
                    >
                      -
                    </span>
                  {/if}
                </div>
                {#if !selectable}
                  <time>{monthName} {half === 1 ? 'Early' : 'Late'}</time>
                {/if}
              </div>
            {/each}
          {/each}
        </div>
        {#if !selectable}
          <div class="mobile-races">
            {#each year.slots as slot (slot.id)}
              {#each slot.races as race (race.id)}
                <div class="mobile-race">
                  <div>
                    <time>{slot.label}</time>
                    <strong>{race.name}</strong>
                  </div>
                  {@render openRace(race, slot, year)}
                </div>
              {/each}
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  </section>
</div>

<Dialog
  id={`${instanceId}-race-slot-picker`}
  bind:open={pickerOpen}
  title={picker ? `${picker.year.label} · ${picker.slot.label}` : 'Choose a race'}
  maxWidth="640px"
>
  <div class="race-options">
    {#each picker?.slot.races ?? [] as race (race.id)}
      <button
        type="button"
        aria-label={`Select ${race.name}`}
        onclick={() => {
          if (picker) onselect?.(race, picker.slot.id, picker.year.id);
          pickerOpen = false;
        }}
      >
        <RaceBadge
          {race}
          compact
        />
        <span>
          {race.name}
          <small>{race.grade}</small>
        </span>
      </button>
    {/each}
  </div>
</Dialog>

<style>
  .race-schedule-container {
    min-width: 0;
    container: race-schedule / inline-size;
  }
  .race-schedule {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    min-width: 0;
  }
  .year {
    min-width: 0;
  }
  h4 {
    margin: 0 0 8px;
    text-align: center;
    font-size: 12px;
    font-weight: 700;
  }
  .year--junior {
    --year-color: var(--accent-primary);
  }
  .year--classic {
    --year-color: var(--accent-warning);
  }
  .year--senior {
    --year-color: var(--accent-secondary);
  }
  .year h4 {
    color: var(--year-color);
  }
  .selectable .year + .year {
    border-left: 1px solid var(--border-subtle);
    padding-left: 12px;
  }
  .selectable h4 {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0 10px;
    border-bottom: 2px solid color-mix(in srgb, var(--year-color) 45%, transparent);
    font-size: 14px;
    text-align: left;
  }
  .year-number {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
  }
  .calendar-head {
    display: grid;
    grid-template-columns: 42px repeat(2, minmax(0, 1fr));
    gap: 4px;
    margin-bottom: 6px;
    font-size: 11px;
    color: var(--color-text-muted);
    text-align: center;
  }
  .calendar-head > span:first-child {
    text-align: left;
  }
  .month-label {
    display: flex;
    align-items: center;
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .calendar {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px 4px;
  }
  .calendar-cell {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .cell-races {
    min-height: 44px;
    aspect-ratio: 2/1;
    display: grid;
    gap: 3px;
    background: var(--surface-2);
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    position: relative;
  }
  .cell-races:has(:global(.race)) {
    aspect-ratio: auto;
    background: transparent;
    border: 0;
  }
  .unavailable {
    opacity: 0.35;
  }
  .selectable .calendar {
    grid-template-columns: 42px repeat(2, minmax(0, 1fr));
    gap: 4px;
  }
  .selectable .cell-races {
    aspect-ratio: auto;
    min-height: 28px;
    background: transparent;
    border: 0;
    border-radius: var(--radius-sm);
  }
  .selectable .unavailable {
    opacity: 1;
  }
  .unavailable-mark {
    display: grid;
    place-items: center;
    color: var(--color-text-subtle);
    font-size: 12px;
  }
  .add-race {
    display: flex;
  }
  .add-race :global(.ui-button) {
    width: 100%;
    min-height: 28px;
    padding: 3px;
    border-radius: var(--radius-sm);
  }
  .add-race :global(svg) {
    width: 14px;
    height: 14px;
    color: var(--accent-primary);
  }
  .add-race :global(.ui-button:hover) {
    border-color: var(--accent-primary);
    background: var(--color-accent-soft);
  }
  time {
    display: block;
    text-align: center;
    color: var(--color-text-subtle);
    font-size: 9px;
    white-space: nowrap;
  }
  .race-options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .race-options button {
    min-width: 0;
    padding: 6px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    background: var(--surface-2);
    color: var(--color-text);
    cursor: pointer;
  }
  .race-options button:hover {
    border-color: var(--accent-primary);
  }
  .race-options button > span {
    display: block;
    font-size: 11px;
    margin-top: 5px;
  }
  .race-options small {
    color: var(--color-text-muted);
  }
  .race-open {
    display: block;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    cursor: pointer;
  }
  .race-open:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }
  .mobile-races {
    display: none;
  }
  .mobile-race {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 110px;
    align-items: center;
    gap: 8px;
    padding: 5px;
    background: var(--surface-2);
    border-radius: 4px;
  }
  .mobile-race time {
    text-align: left;
  }
  .mobile-race strong {
    font-size: 11px;
  }
  @container race-schedule (max-width:1120px) {
    .race-schedule-container:not(.selectable) .race-schedule {
      grid-template-columns: 1fr;
      gap: 16px;
    }
    .race-schedule-container:not(.selectable) .calendar {
      display: none;
    }
    .mobile-races {
      display: grid;
      gap: 5px;
    }
  }
  @container race-schedule (max-width:680px) {
    .race-schedule {
      grid-template-columns: 1fr;
      gap: 16px;
    }
    .selectable .year + .year {
      border-left: 0;
      padding-left: 0;
    }
    .calendar-cell time {
      font-size: 10px;
    }
  }
  @media (max-width: 600px) {
    .race-options {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
