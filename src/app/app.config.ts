import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { MATERIAL_SANITY_CHECKS } from '@angular/material/core';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MAT_TOOLTIP_DEFAULT_OPTIONS, MatTooltipDefaultOptions } from '@angular/material/tooltip';
import { routes } from './app.routes';
import { CorsInterceptor } from './interceptors/cors.interceptor';
import { RateLimitInterceptor } from './interceptors/rate-limit.interceptor';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { TurnstileInterceptor } from './interceptors/turnstile.interceptor';
import { CookielessApiInterceptor } from './interceptors/cookieless-api.interceptor';

const tooltipDefaultOptions: MatTooltipDefaultOptions = {
  showDelay: 0,
  hideDelay: 0,
  touchendHideDelay: 1500,
  // Material's touch tooltips apply `touch-action: none` to their triggers,
  // which prevents a page swipe from starting on buttons and other controls.
  touchGestures: 'off',
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptorsFromDi()),
    importProvidersFrom(MatSnackBarModule),
    {
      provide: MAT_TOOLTIP_DEFAULT_OPTIONS,
      useValue: tooltipDefaultOptions,
    },
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
      provide: HTTP_INTERCEPTORS,
      useClass: CookielessApiInterceptor,
      multi: true
    }
  ]
};
