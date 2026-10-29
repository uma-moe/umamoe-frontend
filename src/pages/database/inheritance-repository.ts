import { appHttp } from '@/services/http/app-http';
import type { UqlValidation } from '@/lib/inheritance/uql/uql';
import {
  inheritanceSearchQuery,
  normalizeInheritanceSearch,
  type ApiInheritanceSearchResult,
  type InheritanceRecord,
  type InheritanceSearchFilters,
  type InheritanceSearchResult,
  type InheritanceFilterMode
} from '@/lib/inheritance/search/inheritance-search';

export interface BorrowInteractionContext {
  borrow_key?: string | null;
  inheritance_id?: number | null;
  support_card_id?: number | null;
  support_card_limit_break?: number | null;
  support_card_experience?: number | null;
}

export interface BorrowInteractionResponse {
  success: boolean;
  accepted: boolean;
  trainer_id: string;
  copy_count?: number;
  total_count?: number;
}

export interface BookmarkSnapshotContext extends BorrowInteractionContext {}

type BookmarkPayload = ApiInheritanceSearchResult['items'][number];

function normalizeBookmarks(items: BookmarkPayload[]): InheritanceRecord[] {
  return normalizeInheritanceSearch({
    items,
    total: items.length,
    page: 0,
    limit: Math.max(1, items.length),
    total_pages: items.length ? 1 : 0
  }).records;
}

export const inheritanceRepository = {
  async search(
    filters: InheritanceSearchFilters,
    page = 0,
    limit = 20,
    signal?: AbortSignal,
    mode?: InheritanceFilterMode,
    validation?: UqlValidation
  ): Promise<InheritanceSearchResult> {
    const query = inheritanceSearchQuery(filters, page, limit, mode, validation);
    const payload = await appHttp.request<ApiInheritanceSearchResult>(
      `/search/query?${query.toString()}`,
      { signal }
    );

    return normalizeInheritanceSearch(payload);
  },
  async submitTrainer(trainerId: string): Promise<void> {
    await appHttp.request('/api/tasks/submit', { method: 'POST', body: { trainer_id: trainerId } });
  },
  async reportUnavailable(trainerId: string): Promise<void> {
    await appHttp.request(`/api/tasks/report-unavailable/${encodeURIComponent(trainerId)}`, {
      method: 'POST',
      body: {}
    });
  },
  async bookmarks(): Promise<InheritanceRecord[]> {
    return normalizeBookmarks(await appHttp.request<BookmarkPayload[]>('/api/auth/bookmarks'));
  },
  async addBookmark(accountId: string, context: BookmarkSnapshotContext): Promise<void> {
    await appHttp.request(`/api/auth/bookmarks/${encodeURIComponent(accountId)}`, {
      method: 'POST',
      body: { ...context }
    });
  },
  async removeBookmark(accountId: string): Promise<void> {
    await appHttp.request(`/api/auth/bookmarks/${encodeURIComponent(accountId)}`, {
      method: 'DELETE'
    });
  },
  async bulkDeleteBookmarks(
    payload: { accountIds: string[] } | { all: true }
  ): Promise<{ status: string; removed_count: number }> {
    return appHttp.request('/api/auth/bookmarks/bulk-delete', {
      method: 'POST',
      body: 'all' in payload ? { all: true } : { account_ids: payload.accountIds }
    });
  },
  async trackBorrowCopy(
    trainerId: string,
    context: BorrowInteractionContext
  ): Promise<BorrowInteractionResponse> {
    return appHttp.request(`/api/borrow/${encodeURIComponent(trainerId)}/copy`, {
      method: 'POST',
      body: { ...context }
    });
  },
  async trackBorrowViews(
    views: Array<BorrowInteractionContext & { trainer_id: string }>
  ): Promise<void> {
    if (views.length)
      await appHttp.request('/api/borrow/views', { method: 'POST', body: { views } });
  }
};
