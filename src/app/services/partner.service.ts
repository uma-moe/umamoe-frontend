import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Observer, Subject } from 'rxjs';
import { filter, pairwise, startWith, takeUntil } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/** Mirror of backend `models::PartnerInheritance`. Stays close to the
 *  existing `InheritanceRecord` shape so VPD can reuse its rendering helpers. */
export interface PartnerInheritance {
  id?: number;
  account_id: string;
  main_parent_id: number;
  parent_left_id: number;
  parent_right_id: number;
  parent_rank: number;
  parent_rarity: number;
  blue_sparks: number[];
  pink_sparks: number[];
  green_sparks: number[];
  white_sparks: number[];
  win_count: number;
  white_count: number;
  main_blue_factors: number;
  main_pink_factors: number;
  main_green_factors: number;
  main_white_factors: number[];
  main_white_count: number;
  left_blue_factors: number;
  left_pink_factors: number;
  left_green_factors: number;
  left_white_factors: number[];
  left_white_count: number;
  right_blue_factors: number;
  right_pink_factors: number;
  right_green_factors: number;
  right_white_factors: number[];
  right_white_count: number;
  main_win_saddles: number[];
  left_win_saddles: number[];
  right_win_saddles: number[];
  race_results: number[];
  blue_stars_sum: number;
  pink_stars_sum: number;
  green_stars_sum: number;
  white_stars_sum: number;
  affinity_score?: number | null;
  label?: string | null;
  trainer_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PartnerLookupResult {
  account_id: string;
  trainer_name?: string | null;
  follower_num?: number | null;
  last_updated?: string | null;
  inheritance: PartnerInheritance | null;
}

export interface PartnerLookupCreateResponse {
  task_id: number | null;
  status: string;
  /** True when the user is logged in and the result will be persisted in the
   *  backend `partner_inheritance` table. False for anonymous lookups. */
  will_persist: boolean;
  /** Populated immediately when the backend already has cached data and no
   *  async task is needed (task_id will be null in this case). */
  result?: PartnerLookupResult | null;
}

export type PartnerLookupEvent =
  | { kind: 'pending'; taskId: number }
  | { kind: 'processing'; taskId: number }
  | { kind: 'completed'; taskId: number; inheritance: PartnerInheritance | null }
  | { kind: 'failed'; taskId: number; error?: string }
  | { kind: 'timeout'; taskId: number };

const ANON_STORAGE_KEY = 'partner-lookups:anon';
const ANON_MAX_ENTRIES = 25;

@Injectable({ providedIn: 'root' })
export class PartnerService implements OnDestroy {
  private destroy$ = new Subject<void>();

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private zone: NgZone,
  ) {
    // Migrate localStorage entries once when the user transitions from
    // unauthenticated → authenticated (first login or OAuth callback).
    this.auth.user$
      .pipe(
        startWith(null),
        pairwise(),
        filter(([prev, curr]) => prev === null && curr !== null),
        takeUntil(this.destroy$),
      )
      .subscribe(() => this.migrateAnonToBackend());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Queue a lookup task on the backend. */
  createLookup(partnerId: string, label?: string): Observable<PartnerLookupCreateResponse> {
    return this.http.post<PartnerLookupCreateResponse>(
      `${environment.apiUrl}/api/v4/partner/lookup`,
      { partner_id: partnerId.trim(), label: label?.trim() || null },
    );
  }

  /** Open an SSE stream for a lookup task. The Observable completes once the
   *  task reaches a terminal state (completed / failed / timeout). */
  streamLookup(taskId: number | null): Observable<PartnerLookupEvent> {
    return new Observable<PartnerLookupEvent>((subscriber: Observer<PartnerLookupEvent>) => {
      if (!taskId) {
        subscriber.error(new Error(`Invalid task ID: ${taskId}`));
        return;
      }
      const url = `${environment.apiUrl}/api/v4/partner/lookup/${taskId}/stream`;
      // EventSource does not support custom headers, so JWT-based auth on the
      // SSE endpoint is intentionally bypassed (the endpoint is not user-gated).
      const source = new EventSource(url, { withCredentials: false });

      const emit = (evt: PartnerLookupEvent) => {
        this.zone.run(() => subscriber.next(evt));
      };
      const complete = () => {
        try { source.close(); } catch { /* noop */ }
        this.zone.run(() => subscriber.complete());
      };

      source.addEventListener('pending', (e: MessageEvent) => {
        const data = safeJson(e.data);
        emit({ kind: 'pending', taskId: data?.task_id ?? taskId });
      });

      source.addEventListener('processing', (e: MessageEvent) => {
        const data = safeJson(e.data);
        emit({ kind: 'processing', taskId: data?.task_id ?? taskId });
      });

      source.addEventListener('completed', (e: MessageEvent) => {
        const data = safeJson(e.data) ?? {};
        const inh = (data.inheritance as PartnerInheritance | null) ?? null;
        emit({ kind: 'completed', taskId: data.task_id ?? taskId, inheritance: inh });
        complete();
      });

      source.addEventListener('failed', (e: MessageEvent) => {
        const data = safeJson(e.data) ?? {};
        emit({ kind: 'failed', taskId: data.task_id ?? taskId, error: data.error });
        complete();
      });

      source.addEventListener('timeout', () => {
        emit({ kind: 'timeout', taskId });
        complete();
      });

      source.onerror = () => {
        // Browsers fire `error` on graceful close as well — only treat it as
        // a failure if we never saw a terminal event.
        if (source.readyState === EventSource.CLOSED) {
          complete();
        } else {
          emit({ kind: 'failed', taskId, error: 'SSE connection error' });
          complete();
        }
      };

      return () => {
        try { source.close(); } catch { /* noop */ }
      };
    });
  }

  /** End-to-end helper: create the task and stream the result. Persists the
   *  result locally on success for anonymous users so the saved tab can show
   *  history without backend storage. */
  lookup(partnerId: string, label?: string): Observable<PartnerLookupEvent> {
    const isLoggedIn = this.auth.isLoggedIn();
    return new Observable<PartnerLookupEvent>(subscriber => {
      const sub = this.createLookup(partnerId, label).subscribe({
        next: created => {
          // Backend already had cached data — no streaming needed.
          if (created.task_id == null) {
            const result = created.result ?? null;
            const inh = result?.inheritance ? { ...result.inheritance, trainer_name: result.trainer_name ?? null } : null;
            if (!isLoggedIn && inh) { this.saveAnon(inh, label); }
            subscriber.next({ kind: 'completed', taskId: 0, inheritance: inh });
            subscriber.complete();
            return;
          }
          const inner = this.streamLookup(created.task_id).subscribe({
            next: evt => {
              if (evt.kind === 'completed' && evt.inheritance && !isLoggedIn) {
                this.saveAnon(evt.inheritance, label);
              }
              subscriber.next(evt);
            },
            error: err => subscriber.error(err),
            complete: () => subscriber.complete(),
          });
          subscriber.add(inner);
        },
        error: err => subscriber.error(err),
      });
      subscriber.add(sub);
    });
  }

  /** List of partner inheritances saved to the backend for the current user. */
  listSaved(): Observable<PartnerInheritance[]> {
    return this.http.get<PartnerInheritance[]>(
      `${environment.apiUrl}/api/v4/partner/saved`,
    );
  }

  /** Delete a saved partner from the backend. */
  deleteSaved(accountId: string): Observable<{ success: boolean; deleted: number }> {
    return this.http.delete<{ success: boolean; deleted: number }>(
      `${environment.apiUrl}/api/v4/partner/saved/${encodeURIComponent(accountId)}`,
    );
  }

  // -- Anonymous (localStorage) persistence -----------------------------------

  /**
   * Migrate any localStorage partner lookups to the backend.
   * Called automatically on the null→user auth transition; also exposed so
   * callers can trigger it manually if needed.
   */
  migrateAnonToBackend(): void {
    const entries = this.readAnonSaved();
    if (!entries.length) return;

    this.http
      .post<{ migrated: number }>(
        `${environment.apiUrl}/api/v4/partner/saved/migrate`,
        entries,
      )
      .subscribe({
        next: () => {
          // Clear the local cache — backend is now the source of truth.
          try { localStorage.removeItem(ANON_STORAGE_KEY); } catch { /* noop */ }
        },
        error: () => {
          // Migration failed (e.g. offline) — leave localStorage intact so
          // we can retry on the next login.
        },
      });
  }

  /** Read the anonymous saved-lookup cache. */
  readAnonSaved(): PartnerInheritance[] {
    try {
      const raw = localStorage.getItem(ANON_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as PartnerInheritance[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** Remove an anonymous entry by account_id. */
  deleteAnonSaved(accountId: string): void {
    const next = this.readAnonSaved().filter(p => p.account_id !== accountId);
    localStorage.setItem(ANON_STORAGE_KEY, JSON.stringify(next));
  }

  private saveAnon(inh: PartnerInheritance, label?: string): void {
    const list = this.readAnonSaved();
    const stamped: PartnerInheritance = {
      ...inh,
      label: label?.trim() || inh.label || null,
      updated_at: new Date().toISOString(),
    };
    // Upsert by account_id; newest first; cap to ANON_MAX_ENTRIES.
    const filtered = list.filter(p => p.account_id !== stamped.account_id);
    const next = [stamped, ...filtered].slice(0, ANON_MAX_ENTRIES);
    try {
      localStorage.setItem(ANON_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota exceeded or storage disabled — silently ignore; the lookup
      // result is still emitted to the caller.
    }
  }
}

function safeJson(raw: unknown): any | null {
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw); } catch { return null; }
}
