<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import RaceSchedule from '@/components/game/RaceSchedule.svelte';
  import RaceBadge from '@/components/game/RaceBadge.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import type { RaceBadgeData, RaceScheduleYear } from '@/components/game/race-types';
  import { loadRaceSaddleIndex, loadRaceSchedule } from '@/lib/game-data/racing/races';
  import {
    raceSelectionKey,
    decodeRaceAgenda,
    selectedRaceSaddles,
    toggleRaceSelection,
    type EncodedRaceSelection,
    type RaceAgendaEntry
  } from '../results/race-schedule-selection';

  interface Props {
    selection?: EncodedRaceSelection[];
    onchange?: (selection: EncodedRaceSelection[], saddleIds: number[]) => void;
  }

  let { selection = [], onchange }: Props = $props();

  let years = $state.raw<RaceScheduleYear[]>([]);
  let saddleIndex = $state.raw(new Map<number, number[]>());
  let loading = $state(true);
  let error = $state('');
  let query = $state('');
  let fileInput = $state<HTMLInputElement>();
  let selected = $state<EncodedRaceSelection[]>([]);

  let lastInput = '';

  const selectedKeys = $derived(selected.map(raceSelectionKey));
  const shownYears = $derived.by(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return years;
    return years
      .map((year) => ({
        ...year,
        slots: year.slots
          .map((slot) => ({
            ...slot,
            races: slot.races.filter((race) =>
              `${race.name} ${race.shortName ?? ''} ${race.grade}`
                .toLocaleLowerCase()
                .includes(term)
            )
          }))
          .filter((slot) => slot.races.length)
      }))
      .filter((year) => year.slots.length);
  });

  function signature(value: EncodedRaceSelection[]): string {
    return JSON.stringify(value);
  }

  function commit(next: EncodedRaceSelection[]): void {
    selected = next;
    lastInput = signature(next);
    onchange?.(next, selectedRaceSaddles(next, saddleIndex));
  }

  function choose(race: RaceBadgeData, slotId: string, yearId: string): void {
    const parts = slotId.match(/^(junior|classic|senior)-(\d+)-(\d+)$/);
    if (!parts) return;
    const year = ['junior', 'classic', 'senior'].indexOf(yearId);
    const month = Number(parts[2]);
    const half = Number(parts[3]);
    const raceId = Number(race.id);
    if (year < 0 || !Number.isFinite(month) || !Number.isFinite(half) || !Number.isFinite(raceId))
      return;
    commit(toggleRaceSelection(selected, [year, month, half, raceId]));
  }

  function entryFor(value: EncodedRaceSelection): RaceAgendaEntry | null {
    const [yearIndex, month, half, raceId] = value;
    const year = years[yearIndex];
    if (!year) return null;
    const slot = year.slots.find((item) => item.id === `${year.id}-${month}-${half}`);
    const race = slot?.races.find((item) => Number(item.id) === raceId);
    return race
      ? {
          raceName: race.name,
          grade: race.grade,
          year: year.label,
          turn: `${String(month).padStart(2, '0')}_${String(half).padStart(2, '0')}`
        }
      : null;
  }

  function exportSchedule(): void {
    const entries = selected
      .map(entryFor)
      .filter((entry): entry is RaceAgendaEntry => entry != null);

    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `uma-agenda-plan-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importSchedule(files: FileList | null): Promise<void> {
    const file = files?.item(0);
    if (!file) return;
    try {
      const entries = decodeRaceAgenda(JSON.parse(await file.text()));
      let next: EncodedRaceSelection[] = [];
      for (const entry of entries) {
        const yearName = entry.year.toLocaleLowerCase();
        const yearIndex = ['junior', 'classic', 'senior'].findIndex((name) =>
          yearName.includes(name)
        );

        const [month = 0, half = 0] = entry.turn.split('_').map(Number);
        const year = years[yearIndex];
        const slot = year?.slots.find((item) => item.id === `${year.id}-${month}-${half}`);
        const race = slot?.races.find((item) => item.name === entry.raceName);
        if (yearIndex >= 0 && month > 0 && half > 0 && race)
          next = toggleRaceSelection(next, [yearIndex, month, half, Number(race.id)]);
      }

      commit(next);
      error = '';
    } catch {
      error = 'The selected file is not a valid uma agenda schedule.';
    }

    if (fileInput) fileInput.value = '';
  }

  onMount(async () => {
    selected = selection;
    lastInput = signature(selection);
    try {
      [years, saddleIndex] = await Promise.all([loadRaceSchedule(), loadRaceSaddleIndex()]);
      if (selected.length) onchange?.(selected, selectedRaceSaddles(selected, saddleIndex));
    } catch {
      error = 'Race schedule data could not be loaded.';
    } finally {
      loading = false;
    }
  });

  $effect(() => {
    const next = signature(selection);
    if (next !== lastInput) {
      selected = selection;
      lastInput = next;
    }
  });
</script>

<div class="schedule-filter">
  <div class="toolbar">
    <TextField
      id="database-race-search"
      type="search"
      label="Search and add race"
      placeholder="Race name or grade"
      bind:value={query}
    />
    <div class="actions">
      <Button
        variant="secondary"
        size="sm"
        icon="upload"
        onclick={() => fileInput?.click()}
      >
        Import
      </Button><Button
        variant="secondary"
        size="sm"
        icon="download"
        disabled={!selected.length}
        onclick={exportSchedule}
      >
        Export
      </Button>{#if selected.length}
        <Button
          variant="ghost"
          size="sm"
          onclick={() => commit([])}
        >
          Clear
        </Button>
      {/if}
    </div>
    <input
      bind:this={fileInput}
      class="file"
      type="file"
      accept=".json,application/json"
      onchange={(event) => void importSchedule(event.currentTarget.files)}
    />
  </div>
  <p class="summary">
    {selected.length} selected race{selected.length === 1 ? '' : 's'}, one race per calendar slot
  </p>
  {#if error}
    <p class="error">{error}</p>
  {/if}
  {#if query.trim()}
    <div
      class="search-results"
      aria-label="Matching races"
    >
      {#each shownYears as year}
        {#each year.slots as slot}
          {#each slot.races as race}
            <button
              type="button"
              aria-pressed={selectedKeys.includes(`${slot.id}:${race.id}`)}
              onclick={() => {
                choose(race, slot.id, year.id);
                query = '';
              }}
            >
              <RaceBadge
                {race}
                compact
              />
              <span>
                {race.name}
                <small>{year.label}, {slot.label}</small>
              </span>
            </button>
          {/each}
        {/each}
      {/each}
      {#if !shownYears.length}
        <p class="empty">No races match “{query}”.</p>
      {/if}
    </div>
  {/if}
  {#if loading}
    <div class="loading">
      <Spinner size={24} />Loading race schedule…
    </div>
  {:else}
    <RaceSchedule
      {years}
      selectable
      {selectedKeys}
      onselect={choose}
    />
  {/if}
</div>

<style>
  .search-results {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 5px;
    max-height: 240px;
    overflow: auto;
    padding: 5px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
  }
  .search-results button {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px;
    min-width: 0;
    text-align: left;
    background: var(--surface-2);
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    color: var(--color-text);
    cursor: pointer;
  }
  .search-results button[aria-pressed='true'] {
    border-color: var(--accent-primary);
  }
  .search-results button :global(.race) {
    width: 65px;
    flex: 0 0 65px;
  }
  .search-results button > span {
    font-size: 11px;
  }
  .search-results small {
    display: block;
    font-size: 9px;
    color: var(--color-text-muted);
  }
  .schedule-filter {
    display: grid;
    gap: 7px;
  }
  .toolbar {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) auto;
    align-items: end;
    gap: 7px;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .file {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    opacity: 0;
  }
  .summary,
  .error,
  .empty {
    margin: 0;
    font-size: var(--font-xs);
  }
  .summary,
  .empty {
    color: var(--color-text-subtle);
  }
  .error {
    color: var(--color-danger);
  }
  .loading {
    min-height: 96px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--color-text-muted);
    font-size: var(--font-sm);
  }
  @media (max-width: 620px) {
    .toolbar {
      grid-template-columns: 1fr;
    }
    .actions {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
    }
    .actions :global(.ui-button) {
      width: 100%;
    }
  }
</style>
