import {
  characterImagePath,
  loadReleasedCharacters,
  type CharacterData
} from '@/lib/game-data/characters';
import {
  loadSupportCards,
  readCachedSupportCards,
  supportCardImagePath,
  type SupportCardData
} from '@/lib/game-data/support-cards/support-cards';
import { resourceCache } from '@/services/resources/resource-cache';
import {
  releasedSupportCards,
  supportCardDisplay,
  supportTypeName
} from '@/lib/game-data/support-cards/support-card-details';
import type { SupportCardPickerOption } from '@/components/pickers/picker-types';
import { loadGameDataEntries, type GameDataEntry } from '@/lib/game-data/display-records';

/** Character and support-card data shown by the database filters and result cards. */
export class DatabaseGameData {
  characters = $state.raw<GameDataEntry[]>([]);
  selectableCharacters = $state.raw<CharacterData[]>([]);
  charactersLoading = $state(false);
  charactersError = $state('');
  supports = $state.raw<GameDataEntry[]>([]);
  selectableSupports = $state.raw<SupportCardData[]>([]);
  supportsLoading = $state(false);
  supportsLoaded = $state(false);
  supportsCached = $state(false);
  supportsError = $state('');

  #disposed = false;

  characterOptions = $derived(
    this.selectableCharacters.map((entry) => ({
      id: entry.id,
      name: entry.name,
      subtitle: entry.subtitle,
      image: characterImagePath(Number(entry.id))
    }))
  );

  supportOptions = $derived<SupportCardPickerOption[]>(
    releasedSupportCards(this.selectableSupports).map((entry) => ({
      id: entry.id,
      ...supportCardDisplay(entry),
      image: supportCardImagePath(entry.id),
      type: supportTypeName(entry.type),
      rarity: entry.rarity === 3 ? 'SSR' : entry.rarity === 2 ? 'SR' : 'R'
    }))
  );

  loadDisplayData(): void {
    // Display data must not hold up the first search and browser verification.
    void Promise.all([loadGameDataEntries('characters'), loadGameDataEntries('supports')])
      .then(([nextCharacters, nextSupports]) => {
        if (!this.#disposed) {
          this.characters = nextCharacters;
          this.supports = nextSupports;
        }
      })
      .catch(() => {
        /* Search still works with numeric character fallbacks. */
      });
  }

  loadCharacters = async (): Promise<void> => {
    if (this.charactersLoading) return;
    this.charactersLoading = true;
    this.charactersError = '';
    try {
      this.selectableCharacters = await loadReleasedCharacters();
    } catch (error) {
      this.charactersError =
        error instanceof Error ? error.message : 'Character data could not be loaded.';
    } finally {
      this.charactersLoading = false;
    }
  };

  loadSupports = async (refresh = false): Promise<void> => {
    if (this.supportsLoading || (this.supportsLoaded && !refresh)) return;
    this.supportsLoading = true;
    this.supportsError = '';
    try {
      if (!this.supportsLoaded) {
        const cached = await readCachedSupportCards();
        if (this.#disposed) return;
        if (cached) {
          this.selectableSupports = cached;
          this.supportsCached = true;
        }
      }

      const fresh = await loadSupportCards(refresh);
      if (!this.#disposed) {
        this.selectableSupports = fresh;
        this.supportsLoaded = true;
        this.supportsCached = false;
      }
    } catch (error) {
      if (!this.#disposed)
        this.supportsError =
          error instanceof Error ? error.message : 'Support-card data could not be loaded.';
    } finally {
      if (!this.#disposed) this.supportsLoading = false;
    }
  };

  watchSupportUpdates(): () => void {
    return resourceCache.onUpdate((name) => {
      if (name === 'support-cards-db') {
        this.supportsLoaded = false;
        void this.loadSupports();
      }
    });
  }

  dispose(): void {
    this.#disposed = true;
  }
}
