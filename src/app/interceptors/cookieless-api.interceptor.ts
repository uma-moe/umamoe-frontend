import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpHeaders,
  HttpInterceptor,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

const XSSI_PREFIX = /^\)\]\}',?\n/;

@Injectable()
export class CookielessApiInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!this.isOwnApiRequest(req.url)) {
      return next.handle(req);
    }

    return new Observable<HttpEvent<unknown>>(subscriber => {
      const controller = new AbortController();
      void this.fetchRequest(req, controller.signal)
        .then(response => {
          subscriber.next(response);
          subscriber.complete();
        })
        .catch(error => {
          subscriber.error(error);
        });

      return () => controller.abort();
    });
  }

  private async fetchRequest(req: HttpRequest<unknown>, signal: AbortSignal): Promise<HttpResponse<unknown>> {
    const headers = this.toFetchHeaders(req);
    const response = await fetch(req.urlWithParams, {
      method: req.method,
      headers,
      body: this.getFetchBody(req),
      credentials: 'omit',
      signal,
    });
    const responseHeaders = this.toHttpHeaders(response.headers);
    const body = response.ok
      ? await this.parseBody(response, req.responseType)
      : await this.parseErrorBody(response, req.responseType);

    if (!response.ok) {
      throw new HttpErrorResponse({
        error: body,
        headers: responseHeaders,
        status: response.status,
        statusText: response.statusText,
        url: response.url || req.urlWithParams,
      });
    }

    return new HttpResponse({
      body,
      headers: responseHeaders,
      status: response.status,
      statusText: response.statusText,
      url: response.url || req.urlWithParams,
    });
  }

  private toFetchHeaders(req: HttpRequest<unknown>): Headers {
    const headers = new Headers();
    for (const name of req.headers.keys()) {
      for (const value of req.headers.getAll(name) ?? []) {
        headers.append(name, value);
      }
    }

    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json, text/plain, */*');
    }

    if (!headers.has('Content-Type')) {
      const detectedType = req.detectContentTypeHeader();
      if (detectedType !== null) {
        headers.set('Content-Type', detectedType);
      }
    }

    return headers;
  }

  private getFetchBody(req: HttpRequest<unknown>): BodyInit | null {
    if (req.method === 'GET' || req.method === 'HEAD') {
      return null;
    }

    return req.serializeBody() as BodyInit | null;
  }

  private async parseBody(response: Response, responseType: HttpRequest<unknown>['responseType']): Promise<unknown> {
    if (response.status === 204) {
      return null;
    }

    switch (responseType) {
      case 'arraybuffer':
        return response.arrayBuffer();
      case 'blob':
        return response.blob();
      case 'text':
        return response.text();
      case 'json': {
        const text = (await response.text()).replace(XSSI_PREFIX, '');
        return text ? JSON.parse(text) : null;
      }
    }
  }

  private async parseErrorBody(response: Response, responseType: HttpRequest<unknown>['responseType']): Promise<unknown> {
    if (responseType !== 'json') {
      return this.parseBody(response, responseType);
    }

    const text = (await response.text()).replace(XSSI_PREFIX, '');
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private toHttpHeaders(headers: Headers): HttpHeaders {
    let httpHeaders = new HttpHeaders();
    headers.forEach((value, name) => {
      httpHeaders = httpHeaders.append(name, value);
    });
    return httpHeaders;
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
