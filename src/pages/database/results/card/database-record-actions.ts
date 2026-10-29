import type { Toast } from '@/components/feedback/ToastRegion.svelte';
import type { InheritanceRecord } from '@/lib/inheritance/search/inheritance-search';
import { copyText } from '@/lib/clipboard';
import { trackBorrowCopy } from '../../borrow-interactions';
import { inheritanceRepository } from '../../inheritance-repository';
import type { DatabaseFilters } from '../../search/database-filters.svelte';
import type { DatabaseSearch } from '../../search/database-search.svelte';
import type { DatabaseBookmarks } from '../database-bookmarks.svelte';

export interface DatabaseRecordActionsSource {
  filters: DatabaseFilters;
  search: DatabaseSearch;
  bookmarks: DatabaseBookmarks;
  notify: (title: string, tone?: Toast['tone']) => void;
}

/** Copy, share, planner and report actions offered by every result card. */
export class DatabaseRecordActions {
  #source: DatabaseRecordActionsSource;

  constructor(source: DatabaseRecordActionsSource) {
    this.#source = source;
  }

  copyTrainer = async (record: InheritanceRecord): Promise<void> => {
    const { notify } = this.#source;
    if (!record.accountId) return notify('No Trainer ID to copy', 'warning');
    if (!(await copyText(record.accountId))) return notify('Failed to copy Trainer ID', 'danger');
    notify(`Trainer ID copied: ${record.accountId}`, 'success');
    const pendingCount = trackBorrowCopy(record);
    if (!pendingCount) return;
    this.#setBorrowCopies(record, record.borrowCopies + 1);
    this.#setBorrowCopies(record, await pendingCount);
  };

  share = async (record: InheritanceRecord): Promise<void> => {
    const url = `${window.location.origin}/database?trainer_id=${encodeURIComponent(record.accountId)}`;
    const copied = await copyText(url);
    this.#source.notify(
      copied ? 'Link copied to clipboard' : 'Failed to copy link',
      copied ? 'success' : 'danger'
    );
  };

  openInPlanner = (record: InheritanceRecord): void => {
    const { filters } = this.#source;
    const veteran = filters.selectedParent;
    try {
      localStorage.setItem(
        'planner_transfer',
        JSON.stringify({
          record,
          targetCharaId: filters.values.playerCharaId ?? null,
          veteran: veteran ?? null,
          veteranPosition: 'p2'
        })
      );
    } catch {
      /* Preserve navigation when storage is unavailable. */
    }

    window.open('/tools/lineage-planner?from=db', '_blank', 'noopener');
  };

  report = async (record: InheritanceRecord): Promise<void> => {
    const { bookmarks, search, notify } = this.#source;
    if (!record.accountId || bookmarks.busyIds.includes(record.accountId)) return;
    if (!window.confirm(`Report trainer ${record.accountId} as unavailable or friend list full?`))
      return;
    bookmarks.setBusy(record.accountId, true);
    try {
      await inheritanceRepository.reportUnavailable(record.accountId);
      notify('Trainer reported as unavailable', 'success');
      search.schedule(true);
    } catch {
      notify('Could not report this trainer. Please try again.', 'danger');
    } finally {
      bookmarks.setBusy(record.accountId, false);
    }
  };

  #setBorrowCopies(record: InheritanceRecord, count: number): void {
    const { search, bookmarks } = this.#source;
    search.inheritance = {
      ...search.inheritance,
      records: search.inheritance.records.map((item) =>
        item.id === record.id ? { ...item, borrowCopies: count } : item
      )
    };

    bookmarks.records = bookmarks.records.map((item) =>
      item.id === record.id ? { ...item, borrowCopies: count } : item
    );
  }
}
