import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { RateLimitService } from '../services/rate-limit.service';
import { environment } from '../../environments/environment';

@Injectable()
export class RateLimitInterceptor implements HttpInterceptor {
  constructor(private rateLimitService: RateLimitService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 429 && !this.isBrowserProofWarmupLimit(error, req)) {
          // Extract retry-after header if present (in seconds)
          // Default to 60 seconds if not provided by the server
          const retryAfter = this.parseRetryAfter(error.headers.get('Retry-After')) ?? 60;
          
          console.warn('Rate limited (429):', req.url, `Retry after ${retryAfter}s`);
          
          // Show the rate limit popup
          this.rateLimitService.showRateLimitPopup(retryAfter);
        }
        
        return throwError(() => error);
      })
    );
  }

  /**
   * Parse the Retry-After header value
   * Can be either a number of seconds or an HTTP date
   */
  private parseRetryAfter(headerValue: string | null): number | undefined {
    if (!headerValue) {
      return undefined;
    }
    // Try parsing as a number first
    const seconds = parseInt(headerValue, 10);
    if (!isNaN(seconds)) {
      return seconds;
    }
    // Try parsing as an HTTP date
    const date = new Date(headerValue);
    if (!isNaN(date.getTime())) {
      const now = Date.now();
      const retryTime = date.getTime();
      const diffSeconds = Math.ceil((retryTime - now) / 1000);
      return diffSeconds > 0 ? diffSeconds : undefined;
    }
    return undefined;
  }

  private isBrowserProofWarmupLimit(error: HttpErrorResponse, req: HttpRequest<any>): boolean {
    if (!this.isOwnApiRequest(req.url) || req.headers.has(environment.turnstile.proofHeaderName)) {
      return false;
    }

    const errorCode = this.extractErrorCode(error.error);
    return errorCode === 'browser_proof_warmup_rate_limited'
      || errorCode === 'browser_proof_warmup_exhausted'
      || errorCode === 'rate_limited';
  }

  private extractErrorCode(errorBody: unknown): string | null {
    if (typeof errorBody === 'string') {
      if (errorBody.includes('browser_proof_warmup_rate_limited')) {
        return 'browser_proof_warmup_rate_limited';
      }

      if (errorBody.includes('browser_proof_warmup_exhausted')) {
        return 'browser_proof_warmup_exhausted';
      }

      if (errorBody.includes('rate_limited')) {
        return 'rate_limited';
      }

      return null;
    }

    if (!errorBody || typeof errorBody !== 'object') {
      return null;
    }

    const errorCode = (errorBody as { error?: unknown; code?: unknown }).error
      ?? (errorBody as { code?: unknown }).code;
    return typeof errorCode === 'string' ? errorCode : null;
  }

  private isOwnApiRequest(url: string): boolean {
    if (!(url.includes('/api/') || url.includes('/ingest/') || url.includes('/search/'))) {
      return false;
    }

    if (url.startsWith('/api/') || url.startsWith('/ingest/') || url.startsWith('/search/')) {
      return true;
    }

    if (environment.apiUrl && url.startsWith(`${environment.apiUrl}/api/`)) {
      return true;
    }

    if (environment.apiUrl && url.startsWith(`${environment.apiUrl}/search/`)) {
      return true;
    }

    if (environment.apiUrl && url.startsWith(`${environment.apiUrl}/ingest/`)) {
      return true;
    }

    return false;
  }
}
