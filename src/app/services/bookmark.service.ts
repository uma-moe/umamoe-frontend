import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, tap, catchError, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { InheritanceRecord } from '../models/inheritance.model';
import { AffinityService } from './affinity.service';

interface BookmarkInheritanceResponse {
  account_id: string;
  trainer_name?: string;
  follower_num?: number | null;
  last_updated?: string | null;
  is_stale?: boolean;
  inheritance: {
    inheritance_id: number;
    account_id: string;
    main_parent_id: number;
    parent_left_id: number;
    parent_right_id: number;
    parent_rank: number;
    parent_rarity: number;
    blue_sparks: number[] | null;
    pink_sparks: number[] | null;
    green_sparks: number[] | null;
    white_sparks: number[] | null;
    win_count: number;
    white_count: number;
    affinity_score: number;
    main_blue_factors: number;
    main_pink_factors: number;
    main_green_factors: number;
    main_white_factors: number[] | null;
    main_white_count: number;
    left_blue_factors: number;
    left_pink_factors: number;
    left_green_factors: number;
    left_white_factors: number[] | null;
    left_white_count: number;
    right_blue_factors: number;
    right_pink_factors: number;
    right_green_factors: number;
    right_white_factors: number[] | null;
    right_white_count: number;
    main_win_saddles: number[] | null;
    left_win_saddles: number[] | null;
    right_win_saddles: number[] | null;
    race_results: number[] | null;
  };
  support_card?: {
    account_id: string;
    support_card_id: number;
    limit_break_count?: number | null;
    experience: number;
  } | null;
}

export interface BookmarkSnapshotContext {
  borrow_key?: string | null;
  support_card_id?: number | null;
  support_card_limit_break?: number | null;
  support_card_experience?: number | null;
}

@Injectable({ providedIn: 'root' })
export class BookmarkService {
  static readonly MAX_BOOKMARKS = 500;

  private bookmarkedIds = new Set<string>();
  private bookmarksSubject = new BehaviorSubject<InheritanceRecord[]>([]);
  private loaded = false;
  private loading = false;

  bookmarks$ = this.bookmarksSubject.asObservable();

  constructor(
    private http: HttpClient,
    private affinityService: AffinityService,
  ) {}

  get count(): number {
    return this.bookmarkedIds.size;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  isBookmarked(accountId: string): boolean {
    return this.bookmarkedIds.has(accountId);
  }

  loadBookmarks(): Observable<InheritanceRecord[]> {
    if (this.loading) return this.bookmarks$;
    this.loading = true;

    return this.http.get<BookmarkInheritanceResponse[]>(`${environment.apiUrl}/api/auth/bookmarks`).pipe(
      map(items => items.map(item => this.mapToRecord(item))),
      tap(records => {
        this.bookmarkedIds.clear();
        for (const r of records) {
          if (r.account_id) this.bookmarkedIds.add(r.account_id);
        }
        this.bookmarksSubject.next(records);
        this.loaded = true;
        this.loading = false;
      }),
      catchError(err => {
        console.error('Failed to load bookmarks:', err);
        this.loading = false;
        return of([]);
      })
    );
  }

  addBookmark(accountId: string, context?: BookmarkSnapshotContext): Observable<void> {
    const body = {
      borrow_key: context?.borrow_key ?? undefined,
      support_card_id: context?.support_card_id ?? undefined,
      support_card_limit_break: context?.support_card_limit_break ?? undefined,
      support_card_experience: context?.support_card_experience ?? undefined,
    };
    return this.http.post<void>(`${environment.apiUrl}/api/auth/bookmarks/${accountId}`, body).pipe(
      tap(() => {
        this.bookmarkedIds.add(accountId);
      }),
      catchError(err => {
        console.error('Failed to add bookmark:', err);
        throw err;
      })
    );
  }

  removeBookmark(accountId: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/api/auth/bookmarks/${accountId}`).pipe(
      tap(() => {
        this.bookmarkedIds.delete(accountId);
        const current = this.bookmarksSubject.value;
        this.bookmarksSubject.next(current.filter(r => r.account_id !== accountId));
      }),
      catchError(err => {
        console.error('Failed to remove bookmark:', err);
        throw err;
      })
    );
  }

  /**
   * Bulk-delete bookmarks. Pass either a list of account IDs to remove, or
   * `{ all: true }` to clear every bookmark on the account.
   */
  bulkDeleteBookmarks(
    payload: { accountIds: string[] } | { all: true },
  ): Observable<{ status: string; removed_count: number }> {
    const body = 'all' in payload
      ? { all: true }
      : { account_ids: payload.accountIds };
    return this.http
      .post<{ status: string; removed_count: number }>(
        `${environment.apiUrl}/api/auth/bookmarks/bulk-delete`,
        body,
      )
      .pipe(
        tap(() => {
          if ('all' in payload) {
            this.bookmarkedIds.clear();
            this.bookmarksSubject.next([]);
          } else {
            const removed = new Set(payload.accountIds);
            for (const id of removed) this.bookmarkedIds.delete(id);
            const current = this.bookmarksSubject.value;
            this.bookmarksSubject.next(
              current.filter(r => !r.account_id || !removed.has(r.account_id)),
            );
          }
        }),
        catchError(err => {
          console.error('Failed to bulk-delete bookmarks:', err);
          throw err;
        }),
      );
  }

  reset(): void {
    this.bookmarkedIds.clear();
    this.bookmarksSubject.next([]);
    this.loaded = false;
    this.loading = false;
  }

  private mapToRecord(item: BookmarkInheritanceResponse): InheritanceRecord {
    const inh = item.inheritance;
    const mainWinSaddles = this.toNumberArray(inh.main_win_saddles);
    const hasMainWinSaddles = Array.isArray(inh.main_win_saddles);
    return {
      id: inh.inheritance_id,
      account_id: item.account_id,
      trainer_id: item.account_id,
      trainer_name: item.trainer_name,
      umamusume_id: inh.main_parent_id,
      main_parent_id: inh.main_parent_id,
      parent_left_id: inh.parent_left_id,
      parent_right_id: inh.parent_right_id,
      parent_rank: inh.parent_rank,
      parent_rarity: inh.parent_rarity,
      blue_sparks: this.toNumberArray(inh.blue_sparks),
      pink_sparks: this.toNumberArray(inh.pink_sparks),
      green_sparks: this.toNumberArray(inh.green_sparks),
      white_sparks: this.toNumberArray(inh.white_sparks),
      win_count: hasMainWinSaddles ? this.affinityService.countG1RaceWins(mainWinSaddles) : inh.win_count,
      white_count: inh.white_count,
      affinity_score: inh.affinity_score,
      main_blue_factors: inh.main_blue_factors,
      main_pink_factors: inh.main_pink_factors,
      main_green_factors: inh.main_green_factors,
      main_white_factors: this.toNumberArray(inh.main_white_factors),
      main_white_count: inh.main_white_count,
      left_blue_factors: inh.left_blue_factors,
      left_pink_factors: inh.left_pink_factors,
      left_green_factors: inh.left_green_factors,
      left_white_factors: this.toNumberArray(inh.left_white_factors),
      left_white_count: inh.left_white_count,
      right_blue_factors: inh.right_blue_factors,
      right_pink_factors: inh.right_pink_factors,
      right_green_factors: inh.right_green_factors,
      right_white_factors: this.toNumberArray(inh.right_white_factors),
      right_white_count: inh.right_white_count,
      main_win_saddles: mainWinSaddles,
      left_win_saddles: this.toNumberArray(inh.left_win_saddles),
      right_win_saddles: this.toNumberArray(inh.right_win_saddles),
      race_results: this.toNumberArray(inh.race_results),
      follower_num: item.follower_num ?? null,
      last_updated: item.last_updated ?? null,
      is_stale: item.is_stale ?? false,
      support_card_id: item.support_card?.support_card_id,
      limit_break_count: item.support_card?.limit_break_count ?? undefined,
      support_card_experience: item.support_card?.experience,
      upvotes: 0,
      downvotes: 0,
      user_vote: null,
    };
  }

  private toNumberArray(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return value
      .map(entry => Number(entry))
      .filter(entry => Number.isFinite(entry));
  }
}
