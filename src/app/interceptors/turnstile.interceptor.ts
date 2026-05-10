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

    return from(this.prepareRequest(req, false, true)).pipe(
      switchMap(preparedReq => next.handle(preparedReq).pipe(
        catchError(error => this.retryWithFreshProof(error, req, preparedReq, next)),
      )),
    );
  }

  private shouldAttachTurnstile(req: HttpRequest<unknown>): boolean {
    if (!environment.turnstile.enabled || !environment.turnstile.siteKey) {
      return false;
    }

    if (req.method.toUpperCase() === 'OPTIONS') {
      return false;
    }

    if (
      req.headers.has(this.turnstileService.proofHeaderName)
      || req.headers.has(environment.turnstile.challengeHeaderName)
      || req.headers.has('X-API-Key')
      || this.isProofExchangeRequest(req.url)
    ) {
      return false;
    }

    return this.isOwnApiRequest(req.url);
  }

  private async prepareRequest(
    req: HttpRequest<unknown>,
    forceRefresh: boolean,
    allowFailOpen: boolean,
  ): Promise<HttpRequest<unknown>> {
    try {
      const proofToken = await this.turnstileService.getProofToken(environment.turnstile.action, forceRefresh);
      if (!proofToken) {
        return req;
      }

      return req.clone({
        setHeaders: {
          [this.turnstileService.proofHeaderName]: proofToken,
        },
      });
    } catch (error) {
      if (allowFailOpen && environment.turnstile.failOpen) {
        console.warn('Browser proof refresh failed; sending request without proof because failOpen is enabled.', error);
        return req;
      }

      throw new HttpErrorResponse({
        error,
        status: 0,
        statusText: 'Turnstile verification failed',
        url: req.url,
      });
    }
  }

  private retryWithFreshProof(
    error: unknown,
    originalReq: HttpRequest<unknown>,
    sentReq: HttpRequest<unknown>,
    next: HttpHandler,
  ): Observable<HttpEvent<unknown>> {
    if (!(error instanceof HttpErrorResponse) || !this.shouldRetryWithFreshProof(error)) {
      return throwError(() => error);
    }

    const failedProofToken = sentReq.headers.get(this.turnstileService.proofHeaderName) ?? undefined;
    this.turnstileService.invalidateBrowserProof(failedProofToken);

    return from(this.prepareRequest(originalReq, true, false)).pipe(
      switchMap(retryReq => next.handle(retryReq)),
    );
  }

  private shouldRetryWithFreshProof(error: HttpErrorResponse): boolean {
    if (error.status !== 403) {
      return false;
    }

    const errorCode = this.extractErrorCode(error.error);
    return errorCode === 'browser_proof_required' || errorCode === 'turnstile_invalid';
  }

  private extractErrorCode(errorBody: unknown): string | null {
    if (!errorBody || typeof errorBody !== 'object') {
      return null;
    }

    const errorCode = (errorBody as { error?: unknown }).error;
    return typeof errorCode === 'string' ? errorCode : null;
  }

  private isProofExchangeRequest(url: string): boolean {
    const exchangePath = environment.turnstile.exchangePath;
    if (url === exchangePath || url.endsWith(exchangePath)) {
      return true;
    }

    return !!environment.apiUrl && url === `${environment.apiUrl}${exchangePath}`;
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