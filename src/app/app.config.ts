import { ApplicationConfig, importProvidersFrom, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { MATERIAL_SANITY_CHECKS } from '@angular/material/core';
import { routes } from './app.routes';
import { CorsInterceptor } from './interceptors/cors.interceptor';
import { RateLimitInterceptor } from './interceptors/rate-limit.interceptor';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { TurnstileInterceptor } from './interceptors/turnstile.interceptor';
import { StatsService } from './services/stats.service';
import { TurnstileService } from './services/turnstile.service';
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptorsFromDi()),
    {
      // Avoid first-open synchronous style/layout read in MatCommonModule
      // (`_checkThemeIsPresent`), which can cause a visible hold before
      // opening heavy dialogs like the veteran picker.
      provide: MATERIAL_SANITY_CHECKS,
      useValue: {
        doctype: false,
        theme: false,
        version: false,
      },
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: CorsInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: TurnstileInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: RateLimitInterceptor,
      multi: true
    },
    {
      provide: APP_INITIALIZER,
      useFactory: (statsService: StatsService) => () => {
        // This ensures the stats service is initialized and daily tracking happens
        return Promise.resolve();
      },
      deps: [StatsService],
      multi: true
    },
    {
      provide: APP_INITIALIZER,
      useFactory: (turnstileService: TurnstileService) => () => {
        turnstileService.prime();
        return Promise.resolve();
      },
      deps: [TurnstileService],
      multi: true
    }
  ]
};
