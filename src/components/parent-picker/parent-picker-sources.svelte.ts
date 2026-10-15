import {
  loadCharacterCatalog,
  loadReleasedCharacterCatalog,
  type CharacterCatalogEntry
} from '@/lib/catalog/character-catalog';
import { loadG1SaddleGroups } from '@/lib/catalog/race-catalog';
import {
  accountParent,
  inheritanceParent,
  parseManualParents,
  MANUAL_PARENTS_KEY,
  type ManualParent,
  type SelectableParent
} from '@/lib/veterans/parent-picker';
import { VeteranAffinityEngine } from '@/lib/veterans/affinity-engine';
import { veteranAffinityRepository } from '@/lib/veterans/affinity-repository';
import { profileRepository } from '@/pages/profile/profile-repository';
import { inheritanceRepository } from '@/pages/database/inheritance-repository';
import { partnerRepository, type PartnerPhase } from './partner-repository';

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}

/**
 * Catalogs and parent sources for the picker: account veterans, bookmarks, saved partners,
 * partner lookups and manual entries. Requests started before a sign-in change are ignored.
 */
export class ParentPickerSources {
  characters = $state.raw(new Map<number, CharacterCatalogEntry>());
  engine = $state<VeteranAffinityEngine>();
  groups = $state.raw(new Map<number, number>());
  selectableCharacters = $state.raw<CharacterCatalogEntry[]>([]);
  catalogError = $state('');
  veterans = $state.raw<Record<string, SelectableParent[]>>({});
  bookmarks = $state.raw<SelectableParent[]>([]);
  partners = $state.raw<SelectableParent[]>([]);
  busy = $state<Record<string, boolean>>({});
  errors = $state<Record<string, string>>({});
  manuals = $state<ManualParent[]>([]);
  manualReadError = $state('');
  manualError = $state('');
  partnerId = $state('');
  partnerPhase = $state<PartnerPhase>();
  lookupResult = $state<SelectableParent>();
  lookupError = $state('');
  lookupTimedOut = $state(false);

  #lookupController: AbortController | undefined;
  #accountGeneration = 0;
  #partnerReloadPending = false;
  #live = true;
  #accountRequests = new Map<string, number>();

  readManuals(): void {
    try {
      this.manuals = parseManualParents(localStorage.getItem(MANUAL_PARENTS_KEY));
    } catch (error) {
      this.manualReadError = message(error);
    }
  }

  async loadCatalogs(): Promise<void> {
    this.catalogError = '';
    const results = await Promise.allSettled([
      loadCharacterCatalog(),
      veteranAffinityRepository.load(),
      loadG1SaddleGroups(),
      loadReleasedCharacterCatalog()
    ]);
    if (!this.#live) return;
    if (results[0].status === 'fulfilled') this.characters = results[0].value;
    if (results[1].status === 'fulfilled')
      this.engine = new VeteranAffinityEngine(results[1].value);
    if (results[2].status === 'fulfilled') this.groups = results[2].value;
    if (results[3].status === 'fulfilled') {
      this.selectableCharacters = results[3].value;
      const released = new Map(
        this.selectableCharacters.map((character) => [Number(character.id), character] as const)
      );
      this.characters = new Map([
        ...released,
        ...[...this.characters].filter(([id]) => !released.has(id))
      ]);
    }
    if (results.some((result) => result.status === 'rejected'))
      this.catalogError =
        'Some character or affinity resources could not be loaded. Your saved entries have not been changed.';
  }

  async loadAccount(account: string, refresh = false): Promise<void> {
    const key = `account:${account}`;
    if (!account || (!refresh && (this.busy[key] || this.veterans[account]))) return;
    const request = (this.#accountRequests.get(account) ?? 0) + 1;
    this.#accountRequests.set(account, request);
    const generation = this.#accountGeneration;
    this.busy[key] = true;
    this.errors[key] = '';
    const current = () =>
      this.#live &&
      generation === this.#accountGeneration &&
      this.#accountRequests.get(account) === request;
    try {
      const result = await profileRepository.load(account, refresh);
      if (current())
        this.veterans = {
          ...this.veterans,
          [account]: (result.veterans ?? []).map((veteran) => accountParent(veteran, account))
        };
    } catch (error) {
      if (current()) this.errors[key] = message(error);
    } finally {
      if (current()) this.busy[key] = false;
    }
  }

  async loadBookmarks(): Promise<void> {
    const generation = this.#accountGeneration;
    const current = () => this.#live && generation === this.#accountGeneration;
    this.busy.bookmarks = true;
    this.errors.bookmarks = '';
    try {
      const result = await inheritanceRepository.bookmarks();
      if (current()) this.bookmarks = result.map((record) => inheritanceParent(record, 'bookmark'));
    } catch (error) {
      if (current()) this.errors.bookmarks = message(error);
    } finally {
      if (current()) this.busy.bookmarks = false;
    }
  }

  async loadPartners(refresh = false): Promise<void> {
    if (this.busy.saved) {
      if (refresh) this.#partnerReloadPending = true;
      return;
    }
    const generation = this.#accountGeneration;
    const current = () => this.#live && generation === this.#accountGeneration;
    this.busy.saved = true;
    this.errors.saved = '';
    try {
      await partnerRepository.migrateAnonymous();
      const result = await partnerRepository.saved();
      if (current()) this.partners = result;
    } catch (error) {
      if (current()) this.errors.saved = message(error);
    } finally {
      if (current()) {
        this.busy.saved = false;
        if (this.#partnerReloadPending) {
          this.#partnerReloadPending = false;
          void this.loadPartners();
        }
      }
    }
  }

  retry(tab: string, accountId: string): void {
    if (tab === 'veterans') void this.loadAccount(accountId, true);
    else if (tab === 'bookmarks') void this.loadBookmarks();
    else if (tab === 'saved') void this.loadPartners();
  }

  saveManual(next: ManualParent[]): boolean {
    if (this.manualReadError) return false;
    try {
      localStorage.setItem(MANUAL_PARENTS_KEY, JSON.stringify(next));
      this.manuals = next;
      this.manualError = '';
      return true;
    } catch {
      this.manualError =
        'Could not save manual entries. Browser storage is unavailable or full. Your changes remain in the editor.';
      return false;
    }
  }

  async deleteParent(parent: SelectableParent): Promise<void> {
    if (parent.share_source === 'manual') {
      this.saveManual(this.manuals.filter((entry) => entry.id !== parent.share_local_id));
      return;
    }
    try {
      await partnerRepository.remove(parent);
      if (!this.#live) return;
      this.partners = this.partners.filter((item) => item.pickerId !== parent.pickerId);
      if (this.lookupResult?.pickerId === parent.pickerId) this.lookupResult = undefined;
    } catch (error) {
      if (this.#live) this.errors.saved = message(error);
    }
  }

  async lookup(): Promise<void> {
    if (this.partnerPhase) return;
    this.#lookupController?.abort();
    const controller = new AbortController();
    this.#lookupController = controller;
    this.lookupError = '';
    this.lookupTimedOut = false;
    this.lookupResult = undefined;
    try {
      const result = await partnerRepository.lookup(this.partnerId, controller.signal, (phase) => {
        if (this.#live && !controller.signal.aborted) this.partnerPhase = phase;
      });
      if (!this.#live || controller.signal.aborted) return;
      if (!result.parent)
        throw new Error('Lookup completed without inheritance data. Please try again.');
      if (result.willPersist) await this.loadPartners(true);
      else this.lookupResult = result.parent;
    } catch (error) {
      if (this.#live && !controller.signal.aborted) {
        this.lookupError = message(error);
        this.lookupTimedOut = error instanceof Error && error.name === 'TimeoutError';
      }
    } finally {
      if (this.#live && this.#lookupController === controller) this.partnerPhase = undefined;
    }
  }

  clearPartnerId(): void {
    this.#lookupController?.abort();
    this.partnerId = '';
    this.partnerPhase = undefined;
    this.lookupError = '';
    this.lookupTimedOut = false;
  }

  /** Drops every account-bound source after a sign-in change and reloads them for `user`. */
  resetForUser(user: unknown): void {
    this.#accountGeneration++;
    this.veterans = {};
    this.bookmarks = [];
    this.partners = [];
    this.busy = {};
    this.errors = {};
    this.#partnerReloadPending = false;
    this.#lookupController?.abort();
    this.lookupResult = undefined;
    this.partnerPhase = undefined;
    this.lookupError = '';
    this.lookupTimedOut = false;
    if (user) {
      void this.loadBookmarks();
      void this.loadPartners();
    }
  }

  dispose(): void {
    this.#live = false;
    this.#accountGeneration++;
    this.#lookupController?.abort();
  }
}
