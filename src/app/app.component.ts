import { Component, OnInit, Inject, PLATFORM_ID, HostListener } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { NavigationComponent } from './components/navigation/navigation.component';
import { FooterComponent } from './components/footer/footer.component';
import { SnowComponent } from './components/snow/snow.component';
import { AdLayoutComponent } from './components/ads/ad-layout.component';
import { ThemeService } from './services/theme.service';
import { UpdateNotificationService } from './services/update-notification.service';
import { RateLimitService } from './services/rate-limit.service';
import { AuthService } from './services/auth.service';
import { MasterDataService } from './services/master-data.service';
import { TurnstileDebugState, TurnstileService } from './services/turnstile.service';
import { GoogleAnalyticsService } from './services/google-analytics.service';
import { FuseAdsService } from './services/fuse-ads.service';
import { AppVersionService } from './services/app-version.service';
import { environment } from '../environments/environment';
import { BehaviorSubject, Observable, combineLatest, map, timer } from 'rxjs';

interface TurnstileRecoveryView {
  debug: TurnstileDebugState;
  visible: boolean;
  stalled: boolean;
  canRetry: boolean;
  showAction: boolean;
  title: string;
  message: string;
  statusLabel: string;
  buttonLabel: string;
  checkTitle: string;
  checkMessage: string;
}

interface TurnstileRecoveryNotice {
  state: 'success' | 'failed';
  expiresAt: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    NavigationComponent,
    FooterComponent,
    SnowComponent,
    MatDialogModule,
    AdLayoutComponent,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'uma-gacha-hub';
  isChristmas$ = this.themeService.isChristmas$;
  turnstileRecovery$: Observable<TurnstileRecoveryView>;
  interactiveVerificationPending = false;
  private readonly interactiveNoticeSubject = new BehaviorSubject<TurnstileRecoveryNotice | null>(null);

  constructor(
    private themeService: ThemeService,
    private dialog: MatDialog,
    private updateNotificationService: UpdateNotificationService,
    private rateLimitService: RateLimitService,
    private authService: AuthService,
    private masterDataService: MasterDataService,
    private turnstileService: TurnstileService,
    private googleAnalyticsService: GoogleAnalyticsService,
    private fuseAdsService: FuseAdsService,
    private appVersionService: AppVersionService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.turnstileRecovery$ = combineLatest([
      this.turnstileService.proofDebug$,
      timer(0, 1000),
      this.interactiveNoticeSubject,
    ]).pipe(
      map(([debug, _tick, notice]) => this.toTurnstileRecoveryView(debug, notice)),
    );
  }
  // Debug shortcut: Ctrl+Shift+L to test rate limit popup (dev only)
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (!environment.production && event.ctrlKey && event.shiftKey && event.key === 'L') {
      event.preventDefault();
      this.rateLimitService.showRateLimitPopup(60); // Show with 60 second countdown
    }
  }
  ngOnInit(): void {
    let browserParams: URLSearchParams | null = null;
    let turnstileDebugApplied = false;
    if (isPlatformBrowser(this.platformId)) {
      browserParams = new URLSearchParams(window.location.search);
      turnstileDebugApplied = this.applyTurnstileDebugParam(browserParams);
    }

    this.masterDataService.init();
    this.fuseAdsService.init();
    this.googleAnalyticsService.init();
    this.appVersionService.init();

    // Handle OAuth token from any URL (backend redirects to /?token=...)
    if (isPlatformBrowser(this.platformId)) {
      const token = browserParams?.get('token');
      if (token) {
        this.authService.handleCallback(token);
        return;
      }

      if (!turnstileDebugApplied) {
        void this.turnstileService.prime();
      }
    }

    // Check for update notification
    if (isPlatformBrowser(this.platformId)) {
      // Small delay to let the app settle before showing popup
      setTimeout(() => {
        this.updateNotificationService.checkAndShowUpdate();
      }, 1000);
    }
  }

  retryTurnstileInteractive(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    if (this.interactiveVerificationPending) {
      return;
    }

    this.interactiveNoticeSubject.next(null);
    this.interactiveVerificationPending = true;
    void this.turnstileService.verifyInteractively()
      .then(() => {
        this.showInteractiveNotice('success', 6000);
      })
      .catch(() => {
        this.showInteractiveNotice('failed', 12000);
      })
      .finally(() => {
        this.interactiveVerificationPending = false;
      });
  }

  formatTurnstileDebug(debug: TurnstileDebugState): string {
    const parts = [
      `proof_stage=${debug.stage}`,
      `proof_ready=${debug.ready}`,
      `proof_attempt=${debug.attempt}`,
      `proof_updated=${debug.updatedAt}`,
      `proof_mode=${debug.mode ?? 'unknown'}`,
      `build=${debug.buildVersion}`,
      `build_label=${debug.buildVersionLabel}`,
      `turnstile_script_loaded=${debug.scriptLoaded}`,
      `turnstile_token_timeout_ms=${debug.tokenTimeoutMs}`,
      `turnstile_script_timeout_ms=${debug.scriptTimeoutMs}`,
    ];

    if (debug.elapsedMs != null) {
      parts.push(`proof_elapsed_ms=${debug.elapsedMs}`);
    }
    if (debug.source) {
      parts.push(`proof_source=${debug.source}`);
    }
    if (debug.error) {
      parts.push(`proof_error=${debug.error}`);
    }
    if (debug.errorCode) {
      parts.push(`proof_code=${debug.errorCode}`);
    }
    if (debug.message) {
      parts.push(`proof_message=${debug.message}`);
    }

    return parts.join(' | ');
  }

  private toTurnstileRecoveryView(
    debug: TurnstileDebugState,
    notice: TurnstileRecoveryNotice | null,
  ): TurnstileRecoveryView {
    const now = Date.now();
    const activeNotice = notice && notice.expiresAt > now ? notice : null;
    const passedSilently = activeNotice?.state === 'success' && debug.ready;
    const pending = this.isTurnstilePending(debug);
    const stalled = pending && this.msSince(debug.startedAt ?? debug.updatedAt) >= this.turnstileRecoveryPromptMs;
    const failed = debug.stage === 'failed' || debug.stage === 'misconfigured';
    const visible = passedSilently || (!debug.ready && (failed || (debug.enabled && stalled)));
    const interactivePending = this.interactiveVerificationPending || (debug.mode === 'interactive' && pending);
    const interactiveFailed = debug.mode === 'interactive' && failed;

    return {
      debug,
      visible,
      stalled,
      canRetry: visible && !passedSilently && !this.interactiveVerificationPending,
      showAction: !passedSilently,
      title: passedSilently
        ? 'Browser check passed'
        : failed ? 'Browser check needs attention' : 'Browser check is taking longer than usual',
      message: passedSilently
        ? 'Cloudflare completed the check without showing a challenge. The page can use the new browser token now.'
        : failed
        ? 'The automatic check could not create a usable browser token. Run a visible check; Cloudflare may pass silently or show a challenge here.'
        : 'The page is still waiting for browser verification. Run a visible check if this does not clear on its own.',
      statusLabel: this.getTurnstileStatusLabel(debug),
      buttonLabel: interactivePending ? 'Checking...' : interactiveFailed ? 'Run check again' : 'Run browser check',
      checkTitle: passedSilently
        ? 'Passed silently'
        : interactivePending
        ? 'Cloudflare check running'
        : interactiveFailed
          ? 'Visible check did not finish'
          : 'Visible check not started',
      checkMessage: passedSilently
        ? 'No widget was needed for this browser.'
        : interactivePending
        ? 'If Cloudflare shows a challenge, complete it here. It may also pass silently.'
        : interactiveFailed
          ? 'Run it again, or open Status for support if this area stays empty.'
          : 'Use Run browser check. If nothing appears, open Status for support.',
    };
  }

  private showInteractiveNotice(state: TurnstileRecoveryNotice['state'], durationMs: number): void {
    this.interactiveNoticeSubject.next({
      state,
      expiresAt: Date.now() + durationMs,
    });
  }

  private getTurnstileStatusLabel(debug: TurnstileDebugState): string {
    switch (debug.stage) {
      case 'script_loading':
        return 'Loading Cloudflare script';
      case 'challenge_running':
        return 'Waiting for Cloudflare challenge';
      case 'exchange_running':
        return 'Exchanging challenge token';
      case 'failed':
        return debug.errorCode ? `Failed: ${debug.errorCode}` : 'Failed';
      case 'misconfigured':
        return 'Turnstile misconfigured';
      case 'warmup':
        return 'Using warmup token';
      case 'ready':
        return 'Browser token ready';
      case 'disabled':
        return 'Turnstile disabled';
      case 'idle':
      default:
        return 'Waiting for browser token';
    }
  }

  private isTurnstilePending(debug: TurnstileDebugState): boolean {
    return debug.stage === 'script_loading'
      || debug.stage === 'challenge_running'
      || debug.stage === 'exchange_running';
  }

  private msSince(timestamp?: string): number {
    if (!timestamp) {
      return 0;
    }

    const time = Date.parse(timestamp);
    return Number.isFinite(time) ? Math.max(0, Date.now() - time) : 0;
  }

  private get turnstileRecoveryPromptMs(): number {
    const promptMs = Number((environment.turnstile as any).recoveryPromptMs ?? 10000);
    return Number.isFinite(promptMs) && promptMs > 0 ? promptMs : 10000;
  }

  private applyTurnstileDebugParam(params: URLSearchParams): boolean {
    if (environment.production) {
      return false;
    }

    const debugMode = (params.get('turnstile_test') || params.get('turnstile_debug') || '').trim().toLowerCase();
    if (debugMode === 'failed' || debugMode === 'fail') {
      this.turnstileService.simulateFailureForSupport();
      return true;
    }

    if (debugMode === 'background_failed' || debugMode === 'background_fail') {
      this.turnstileService.simulateFailureForSupport(
        'Simulated background Turnstile failure for support testing.',
        'simulated_background_failure',
        'background',
      );
      return true;
    }

    if (debugMode === 'stalled' || debugMode === 'stall') {
      this.turnstileService.simulateStallForSupport();
      return true;
    }

    if (debugMode === 'background_stalled' || debugMode === 'background_stall') {
      this.turnstileService.simulateStallForSupport('background');
      return true;
    }

    return false;
  }
}
