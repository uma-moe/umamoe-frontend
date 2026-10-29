import type { Toast } from '@/components/feedback/ToastRegion.svelte';
import type { InheritanceRecord } from '@/lib/inheritance/search/inheritance-search';
import { borrowContext } from '../borrow-interactions';
import { inheritanceRepository } from '../inheritance-repository';

type Notify = (title: string, tone?: Toast['tone']) => void;

/** Bookmarked records plus the per-record busy state shared by every result card action. */
export class DatabaseBookmarks {
  records = $state.raw<InheritanceRecord[]>([]);
  loading = $state(false);
  error = $state('');
  filter = $state<'all' | 'unchanged' | 'modified'>('all');
  page = $state(1);
  busyIds = $state<string[]>([]);
  clearArmed = $state(false);

  ids = $derived(new Set(this.records.map((record) => record.accountId)));
  modifiedCount = $derived(this.records.filter((record) => record.isStale).length);

  #signedIn: () => boolean;
  #notify: Notify;

  constructor(signedIn: () => boolean, notify: Notify) {
    this.#signedIn = signedIn;
    this.#notify = notify;
  }

  setBusy(accountId: string, busy: boolean): void {
    this.busyIds = busy
      ? [...new Set([...this.busyIds, accountId])]
      : this.busyIds.filter((id) => id !== accountId);
  }

  load = async (): Promise<void> => {
    if (!this.#signedIn()) {
      this.records = [];
      return;
    }

    this.loading = true;
    this.error = '';
    try {
      this.records = await inheritanceRepository.bookmarks();
      this.page = 1;
    } catch (reason) {
      this.error = reason instanceof Error ? reason.message : 'Bookmarks could not be loaded.';
    } finally {
      this.loading = false;
    }
  };

  toggle = async (record: InheritanceRecord): Promise<void> => {
    if (!this.#signedIn()) return this.#notify('Sign in to bookmark records', 'warning');
    const removing = this.ids.has(record.accountId);
    if (!removing && this.records.length >= 500)
      return this.#notify('Bookmark limit reached (500)', 'warning');
    this.setBusy(record.accountId, true);
    try {
      if (removing) {
        await inheritanceRepository.removeBookmark(record.accountId);
        this.records = this.records.filter((item) => item.accountId !== record.accountId);
      } else {
        await inheritanceRepository.addBookmark(record.accountId, borrowContext(record));
        this.records = [
          record,
          ...this.records.filter((item) => item.accountId !== record.accountId)
        ];
      }

      this.#notify(removing ? 'Bookmark removed' : 'Bookmarked', 'success');
    } catch {
      this.#notify(removing ? 'Failed to remove bookmark' : 'Failed to bookmark', 'danger');
    } finally {
      this.setBusy(record.accountId, false);
    }
  };

  async removeModified(): Promise<void> {
    const ids = this.records.filter((record) => record.isStale).map((record) => record.accountId);
    if (!ids.length) return;
    try {
      const result = await inheritanceRepository.bulkDeleteBookmarks({ accountIds: ids });
      this.records = this.records.filter((record) => !ids.includes(record.accountId));
      this.#notify(
        `Removed ${result.removed_count} modified bookmark${result.removed_count === 1 ? '' : 's'}`,
        'success'
      );
    } catch {
      this.#notify('Failed to remove modified bookmarks', 'danger');
    }
  }

  async clearAll(): Promise<void> {
    if (!this.clearArmed) {
      this.clearArmed = true;
      window.setTimeout(() => (this.clearArmed = false), 4_000);
      return;
    }

    this.clearArmed = false;
    try {
      const result = await inheritanceRepository.bulkDeleteBookmarks({ all: true });
      this.records = [];
      this.#notify(
        `Removed ${result.removed_count} bookmark${result.removed_count === 1 ? '' : 's'}`,
        'success'
      );
    } catch {
      this.#notify('Failed to clear bookmarks', 'danger');
    }
  }
}
