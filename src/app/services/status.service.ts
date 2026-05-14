import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, EMPTY, Subject, from, fromEvent, of, startWith, switchMap, takeUntil, timer } from 'rxjs';
import { environment } from '../../environments/environment';

export type OverallStatus = 'operational' | 'degraded' | 'down' | 'loading';

export interface EndpointStatus {
  name: string;
  group: string;
  healthy: boolean;
}

interface GatusEndpoint {
  name: string;
  group: string;
  key: string;
  results: { success: boolean }[];
}

@Injectable({
  providedIn: 'root'
})
export class StatusService implements OnDestroy {
  private static readonly POLL_INTERVAL = 5 * 60_000;

  private destroy$ = new Subject<void>();
  private statusSubject = new BehaviorSubject<OverallStatus>('loading');
  private endpointsSubject = new BehaviorSubject<EndpointStatus[]>([]);
  private refreshInFlight: Promise<void> | null = null;
  private lastUpdatedAt = 0;
  private readonly apiUrl = environment.statusApiUrl;

  status$ = this.statusSubject.asObservable();
  endpoints$ = this.endpointsSubject.asObservable();

  constructor() {
    if (!this.apiUrl) {
      return;
    }

    this.startPolling();
  }

  refreshIfStale(maxAgeMs: number = 0): void {
    if (!this.isDocumentVisible()) {
      return;
    }

    if (this.refreshInFlight || (maxAgeMs > 0 && Date.now() - this.lastUpdatedAt < maxAgeMs)) {
      return;
    }

    this.refreshInFlight = this.fetchStatuses()
      .then(data => {
        if (!data) {
          this.statusSubject.next('loading');
          this.endpointsSubject.next([]);
          return;
        }

        const endpoints: EndpointStatus[] = data.map(ep => ({
          name: ep.name,
          group: ep.group,
          healthy: ep.results?.length > 0 ? ep.results[ep.results.length - 1].success : false
        }));
        this.endpointsSubject.next(endpoints);
        this.lastUpdatedAt = Date.now();

        const total = endpoints.length;
        const healthy = endpoints.filter(e => e.healthy).length;
        if (healthy === total) {
          this.statusSubject.next('operational');
        } else if (healthy === 0) {
          this.statusSubject.next('down');
        } else {
          this.statusSubject.next('degraded');
        }
      })
      .finally(() => {
        this.refreshInFlight = null;
      });
  }

  private fetchStatuses(): Promise<GatusEndpoint[] | null> {
    if (!this.apiUrl) {
      return Promise.resolve(null);
    }

    return fetch(this.apiUrl)
      .then(res => res.ok ? res.json() : null)
      .catch(() => null);
  }

  private startPolling(): void {
    if (typeof document === 'undefined') {
      this.refreshIfStale();
      return;
    }

    fromEvent(document, 'visibilitychange').pipe(
      startWith(null),
      switchMap(() => this.isDocumentVisible() ? timer(0, StatusService.POLL_INTERVAL) : EMPTY),
      takeUntil(this.destroy$),
    ).subscribe(() => {
      this.refreshIfStale();
    });
  }

  private isDocumentVisible(): boolean {
    return typeof document === 'undefined' || document.visibilityState === 'visible';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
