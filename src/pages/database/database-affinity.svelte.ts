import type { Toast } from '@/components/feedback/ToastRegion.svelte';
import { loadG1SaddleGroups } from '@/lib/catalog/race-catalog';
import { VeteranAffinityEngine } from '@/lib/veterans/affinity-engine';
import { veteranAffinityRepository } from '@/lib/veterans/affinity-repository';
import { parentAffinity, parentCharacter } from '@/lib/veterans/parent-picker';
import { normalizeVeteranRecord } from '@/lib/veterans/veteran-normalizer';
import type { DatabaseCatalogs } from './database-catalogs.svelte';
import { legacyVeteranView } from './database-legacy';
import type { DatabaseFilters } from './search/database-filters.svelte';

export interface DatabaseAffinitySource {
  filters: DatabaseFilters;
  catalogs: DatabaseCatalogs;
  factorCatalog: () => unknown;
  notify: (title: string, tone?: Toast['tone']) => void;
}

/** Affinity data and the selected legacy's partner record, summary and per-character scores. */
export class DatabaseAffinity {
  engine = $state<VeteranAffinityEngine>();
  error = $state('');
  raceGroups = $state.raw(new Map<number, number>());

  #source: DatabaseAffinitySource;

  partner = $derived.by(() => {
    const { filters, catalogs } = this.#source;
    const selectedParent = filters.selectedParent;
    if (selectedParent) {
      const { cardId } = parentCharacter(
        selectedParent,
        new Map(catalogs.selectableCharacters.map((character) => [Number(character.id), character]))
      );
      return cardId ? normalizeVeteranRecord({ ...selectedParent, card_id: cardId }) : undefined;
    }
    const characterId = filters.values.p2MainCharaId;
    if (!characterId) return undefined;
    return normalizeVeteranRecord({
      card_id: characterId >= 10000 ? characterId : characterId * 100,
      win_saddle_id_array: filters.values.p2WinSaddle
    });
  });
  aceOptions = $derived.by(() => {
    const { filters, catalogs } = this.#source;
    const selectedParent = filters.selectedParent;
    const engine = this.engine;
    return selectedParent && engine
      ? catalogs.characterOptions.map((option) => ({
          ...option,
          affinity: parentAffinity(selectedParent, Number(option.id), engine, this.raceGroups)
        }))
      : catalogs.characterOptions;
  });
  veteranView = $derived.by(() => {
    const { filters, catalogs } = this.#source;
    this.#source.factorCatalog();
    if (!filters.selectedParent || !this.partner) return undefined;
    return legacyVeteranView(
      filters.selectedParent,
      this.partner,
      catalogs.characters,
      filters.values.playerCharaId,
      this.engine,
      this.raceGroups
    );
  });

  constructor(source: DatabaseAffinitySource) {
    this.#source = source;
  }

  loadRaceGroups(): void {
    void loadG1SaddleGroups()
      .then((value) => (this.raceGroups = value))
      .catch(() => this.#source.notify('Race affinity details could not be loaded.', 'warning'));
  }

  load = async (refresh = false): Promise<void> => {
    this.error = '';
    try {
      this.engine = new VeteranAffinityEngine(await veteranAffinityRepository.load(refresh));
    } catch {
      this.error =
        'Local affinity calculations are unavailable. Records and filters still work; scores without a target use the stored record value.';
    }
  };
}
