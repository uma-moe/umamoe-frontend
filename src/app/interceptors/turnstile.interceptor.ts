import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { TurnstileService } from '../services/turnstile.service';

@Injectable()
export class TurnstileInterceptor implements HttpInterceptor {
  constructor(private turnstileService: TurnstileService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!this.shouldAttachTurnstile(req)) {
      return next.handle(req);
    }

    return from(this.turnstileService.getToken(environment.turnstile.action)).pipe(
      catchError(error => {
        if (environment.turnstile.failOpen) {
          console.warn('Turnstile token request failed; sending request without proof because failOpen is enabled.', error);
          return of('');
        }

        return throwError(() => new HttpErrorResponse({
          error,
          status: 0,
          statusText: 'Turnstile verification failed',
          url: req.url,
        }));
      }),
      switchMap(token => {
        if (!token) {
          return next.handle(req);
        }

        return next.handle(req.clone({
          setHeaders: {
            [this.turnstileService.headerName]: token,
          },
        }));
      }),
    );
  }

  private shouldAttachTurnstile(req: HttpRequest<unknown>): boolean {
    if (!environment.turnstile.enabled || !environment.turnstile.siteKey) {
      return false;
    }

    if (req.method.toUpperCase() === 'OPTIONS') {
      return false;
    }

    if (req.headers.has(environment.turnstile.headerName) || req.headers.has('X-API-Key')) {
      return false;
    }

    return this.isOwnApiRequest(req.url);
  }

  private isOwnApiRequest(url: string): boolean {
    if (!(url.includes('/api/') || url.includes('/ingest/'))) {
      return false;
    }

    if (url.startsWith('/api/') || url.startsWith('/ingest/')) {
      return true;
    }

    if (environment.apiUrl && url.startsWith(`${environment.apiUrl}/api/`)) {
      return true;
    }

    if (environment.apiUrl && url.startsWith(`${environment.apiUrl}/ingest/`)) {
      return true;
    }

    return false;
  }
}