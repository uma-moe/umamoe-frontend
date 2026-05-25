import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { HallResponse, ShameHallParams, ViewerReport, ViewerReportParams } from '../models/shame.model';

@Injectable({
  providedIn: 'root'
})
export class ShameService {
  private apiUrl = `${environment.apiUrl}/api/v4/shame`;
  private hallCache = new Map<string, { data: HallResponse, timestamp: number }>();
  private viewerCache = new Map<string, { data: ViewerReport, timestamp: number }>();
  private CACHE_DURATION = 60 * 1000;
  public listScrollPosition = 0;

  constructor(private http: HttpClient) { }

  getHall(params: ShameHallParams): Observable<HallResponse> {
    const normalizedParams: ShameHallParams = {
      ...params,
      sort_by: params.sort_by === 'score' ? undefined : params.sort_by
    };
    const cacheKey = JSON.stringify(normalizedParams);
    const cached = this.hallCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return of(cached.data);
    }

    let httpParams = new HttpParams();
    if (params.page !== undefined) httpParams = httpParams.set('page', params.page);
    if (params.limit !== undefined) httpParams = httpParams.set('limit', params.limit);
    if (params.sort_by && params.sort_by !== 'score') httpParams = httpParams.set('sort_by', params.sort_by);
    if (params.min_score !== undefined) httpParams = httpParams.set('min_score', params.min_score);
    if (params.min_days !== undefined) httpParams = httpParams.set('min_days', params.min_days);
    if (params.query) httpParams = httpParams.set('query', params.query);

    return this.http.get<HallResponse>(`${this.apiUrl}/hall`, { params: httpParams }).pipe(
      tap(data => this.hallCache.set(cacheKey, { data, timestamp: Date.now() }))
    );
  }

  getViewerReport(viewerId: number, params: ViewerReportParams = {}): Observable<ViewerReport> {
    const cacheKey = `${viewerId}:${params.days ?? ''}`;
    const cached = this.viewerCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return of(cached.data);
    }

    let httpParams = new HttpParams();
    if (params.days !== undefined) httpParams = httpParams.set('days', params.days);

    return this.http.get<ViewerReport>(`${this.apiUrl}/viewer/${viewerId}`, { params: httpParams }).pipe(
      map(response => ({
        ...response,
        top_online_streaks: response.top_online_streaks ?? response.top_sessions ?? []
      })),
      tap(data => this.viewerCache.set(cacheKey, { data, timestamp: Date.now() }))
    );
  }
}