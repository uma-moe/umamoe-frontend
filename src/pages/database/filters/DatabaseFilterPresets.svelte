<script lang="ts">
  import { onMount } from 'svelte';
  import FilterPresetMenu, {
    type FilterPreset
  } from '@/components/filters/FilterPresetMenu.svelte';
  import { copyText } from '@/lib/clipboard';
  import type {
    InheritanceFilterMode,
    InheritanceSearchFilters
  } from '@/lib/inheritance/inheritance-search';
  import {
    compactStateFromFilters,
    databasePresetFilterCount,
    decodeDatabaseFilterState,
    encodeDatabaseFilterState,
    exportDatabasePresets,
    importDatabasePresets,
    readDatabasePresets,
    writeDatabasePresets,
    type CompactDatabaseFilterState,
    type SavedDatabaseFilterPreset
  } from '../database-preferences';

  interface Props {
    filterMode: InheritanceFilterMode;
    filters: InheritanceSearchFilters;
    compactState: CompactDatabaseFilterState;
    message: string;
    onload: (state: CompactDatabaseFilterState, mode: InheritanceFilterMode) => void;
  }

  let { filterMode, filters, compactState, message = $bindable(), onload }: Props = $props();

  let presets = $state<SavedDatabaseFilterPreset[]>([]);
  let draft = $state('');

  const presetViews = $derived<FilterPreset[]>(
    presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      mode: preset.mode,
      activeCount: databasePresetFilterCount(preset)
    }))
  );

  function savePreset(name: string): void {
    const now = Date.now();
    const existing = presets.find(
      (entry) => entry.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    );
    const preset: SavedDatabaseFilterPreset = {
      version: 1,
      id: existing?.id ?? crypto.randomUUID(),
      name,
      mode: filterMode,
      state: encodeDatabaseFilterState(compactStateFromFilters(filters, compactState)),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    presets = [preset, ...presets.filter((entry) => entry.id !== preset.id)].sort(
      (left, right) => right.updatedAt - left.updatedAt
    );
    writeDatabasePresets(localStorage, presets);
    draft = name;
    message = existing ? 'Preset updated.' : 'Preset saved.';
  }

  function loadPreset(preset: FilterPreset): void {
    const stored = presets.find((entry) => entry.id === preset.id);
    if (!stored) return;
    try {
      onload(decodeDatabaseFilterState(stored.state), stored.mode);
      message = `Loaded “${stored.name}”.`;
    } catch {
      message = `Could not load “${stored.name}”.`;
    }
  }

  function deletePreset(preset: FilterPreset): void {
    presets = presets.filter((entry) => entry.id !== preset.id);
    writeDatabasePresets(localStorage, presets);
  }

  async function exportPresets(): Promise<void> {
    if (!presets.length) {
      message = 'No presets to export.';
      return;
    }
    const transfer = exportDatabasePresets(presets);
    if (await copyText(transfer)) message = 'Export copied.';
    else {
      window.prompt('Copy filter preset export string', transfer);
      message = 'Export string ready.';
    }
  }

  function importPresets(): void {
    const transfer = window.prompt('Paste filter preset export string')?.trim();
    if (!transfer) return;
    try {
      const imported = importDatabasePresets(transfer, presets);
      presets = imported.presets;
      writeDatabasePresets(localStorage, presets);
      message = imported.importedCount
        ? `Imported ${imported.importedCount} preset${imported.importedCount === 1 ? '' : 's'}.`
        : 'No presets found.';
    } catch {
      message = 'Invalid export string.';
    }
  }

  onMount(() => {
    presets = readDatabasePresets(localStorage);
  });
</script>

<FilterPresetMenu
  bind:draft
  {message}
  presets={presetViews}
  onsave={savePreset}
  onload={loadPreset}
  ondelete={deletePreset}
  onexport={() => void exportPresets()}
  onimport={importPresets}
/>
