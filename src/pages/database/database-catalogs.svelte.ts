import {
  characterImagePath,
  loadReleasedCharacterCatalog,
  type CharacterCatalogEntry
} from '@/lib/catalog/character-catalog';
import {
  loadLiveSupportCards,
  readCachedSupportCards,
  supportCardImagePath,
  type SupportCardCatalogEntry
} from '@/lib/catalog/support-card-catalog';
import { resourceRepository } from '@/lib/catalog/resource-repository';
import {
  releasedSupportCards,
  supportCardDisplay,
  supportTypeName
} from '@/lib/supports/support-card';
import type { SupportCardPickerOption } from '@/components/pickers/picker-types';
import { loadCatalog, type CatalogEntry } from './catalog-repository';

/** Character and support-card catalogs shown by the database filters and result cards. */
export class DatabaseCatalogs {
  characters = $state.raw<CatalogEntry[]>([]);
  selectableCharacters = $state.raw<CharacterCatalogEntry[]>([]);
  charactersLoading = $state(false);
  charactersError = $state('');
  supports = $state.raw<CatalogEntry[]>([]);
  selectableSupports = $state.raw<SupportCardCatalogEntry[]>([]);
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

  loadDisplayCatalogs(): void {
    // Display catalogs must not hold up the first search and browser verification.
    void Promise.all([loadCatalog('characters'), loadCatalog('supports')])
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
      this.selectableCharacters = await loadReleasedCharacterCatalog();
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
      const fresh = await loadLiveSupportCards(refresh);
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
    return resourceRepository.onUpdate((name) => {
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
