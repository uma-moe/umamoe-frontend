import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject, timer, takeUntil, from, switchMap, catchError, of } from 'rxjs';

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
  private static readonly API_URL = `/status-api/api/v1/endpoints/statuses`;
  private static readonly POLL_INTERVAL = 60_000;

  private destroy$ = new Subject<void>();
  private statusSubject = new BehaviorSubject<OverallStatus>('loading');
  private endpointsSubject = new BehaviorSubject<EndpointStatus[]>([]);

  status$ = this.statusSubject.asObservable();
  endpoints$ = this.endpointsSubject.asObservable();

  constructor() {
    this.startPolling();
  }

  private fetchStatuses(): Promise<GatusEndpoint[] | null> {
    return fetch(StatusService.API_URL)
      .then(res => res.ok ? res.json() : null)
      .catch(() => null);
  }

  private startPolling(): void {
    timer(0, StatusService.POLL_INTERVAL).pipe(
      takeUntil(this.destroy$),
      switchMap(() =>
        from(this.fetchStatuses()).pipe(
          catchError(() => of(null))
        )
      )
    ).subscribe(data => {
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

      const total = endpoints.length;
      const healthy = endpoints.filter(e => e.healthy).length;
      if (healthy === total) {
        this.statusSubject.next('operational');
      } else if (healthy === 0) {
        this.statusSubject.next('down');
      } else {
        this.statusSubject.next('degraded');
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
