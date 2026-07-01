import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timer, switchMap, BehaviorSubject, tap, catchError, of } from 'rxjs';
import { environment } from '../../environments/environment';
export interface TodayActivity {
  tasks_24h: number;
}
export interface DataFreshness {
  accounts_24h: number;
  accounts_7d: number;
  umas_tracked: number;
}
export interface StatsResponse {
  today: TodayActivity;
  freshness: DataFreshness;
}
export interface FriendlistReportResponse {
  success: boolean;
  message: string;
}
@Injectable({
  providedIn: 'root'
})
export class StatsService {
  private readonly apiUrl = `${environment.apiUrl}/api`;
  private stats$ = new BehaviorSubject<StatsResponse | null>(null);
  constructor(private http: HttpClient) {}

  // Get comprehensive stats
  getStats(days: number = 30): Observable<StatsResponse> {
    return this.http.get<StatsResponse>(`${this.apiUrl}/stats?days=${days}`)
      .pipe(
        tap(stats => this.stats$.next(stats)),
        catchError(error => {
          console.error('Failed to load stats:', error);
          // Return fallback stats
          const fallbackStats: StatsResponse = {
            today: { tasks_24h: 0 },
            freshness: {
              accounts_24h: 0,
              accounts_7d: 0,
              umas_tracked: 0,
            },
          };
          this.stats$.next(fallbackStats);
          return of(fallbackStats);
        })
      );
  }
  // Get today's stats only (clean JSON response)
  getTodayStats(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/stats/today`)
      .pipe(
        catchError(error => {
          console.error('Failed to load today stats:', error);
          return of(null);
        })
      );
  }
  // Get daily stats for graphing
  getDailyStats(days: number = 30): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/stats/daily?days=${days}`)
      .pipe(
        catchError(error => {
          console.error('Failed to load daily stats:', error);
          return of([]);
        })
      );
  }
  // Get current stats observable
  getStatsObservable(): Observable<StatsResponse | null> {
    return this.stats$.asObservable();
  }
  // Get current stats value
  getCurrentStats(): StatsResponse | null {
    return this.stats$.value;
  }
  // Clear stats cache
  clearStats(): void {
    this.stats$.next(null);
  }
  // Report a record as "friendlist full"
  reportFriendlistFull(recordId: string): Observable<FriendlistReportResponse> {
    return this.http.post<FriendlistReportResponse>(
      `${this.apiUrl}/inheritance/${recordId}/friendlist_full`,
      {}
    );
  }
  // Get live stats that refresh every 30 seconds
  getLiveStats(refreshInterval: number = 30000): Observable<StatsResponse> {
    return timer(0, refreshInterval).pipe(
      switchMap(() => this.getStats())
    );
  }
  // Get stats for specific time periods
  getWeeklyStats(): Observable<StatsResponse> {
    return this.getStats(7);
  }
  getMonthlyStats(): Observable<StatsResponse> {
    return this.getStats(30);
  }
  getQuarterlyStats(): Observable<StatsResponse> {
    return this.getStats(90);
  }
}
