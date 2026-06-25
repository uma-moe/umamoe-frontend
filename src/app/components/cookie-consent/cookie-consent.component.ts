import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CookieConsentService, CookieConsent } from '../../services/cookie-consent.service';
import { FuseAdsService } from '../../services/fuse-ads.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-cookie-consent',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  template: `
    <!-- Main banner: shown on first visit OR when user reopens settings -->
    <div class="cookie-banner" *ngIf="showBanner">
      <div class="banner-content">
        <div class="banner-main" *ngIf="!showDetails">
          <div class="banner-text">
            <div class="banner-title">
              <mat-icon>cookie</mat-icon>
              <span>Cookie Settings</span>
            </div>
            <p>We use essential cookies to keep the site working. Optional analytics help us improve uma.moe, and advertising can support the site.</p>
            <p class="privacy-link">
              You can change this anytime.
              <a routerLink="/privacy-policy">Privacy Policy</a>
            </p>
          </div>
          <div class="banner-actions">
            <button class="consent-btn secondary" (click)="showDetails = true">Customize</button>
            <button class="consent-btn reject" (click)="rejectAll()">Reject All</button>
            <button class="consent-btn accept" (click)="acceptAll()">Accept All</button>
          </div>
        </div>

        <div class="banner-details" *ngIf="showDetails">
          <div class="banner-title">
            <mat-icon>cookie</mat-icon>
            <span>Cookie Settings</span>
          </div>
          <p class="details-description">
            Choose which optional cookies and ad preferences you'd like to allow. Essential cookies are required for the site to function.
            Advertising is controlled here and applies to ads served through our ad partners.
          </p>

          <div class="consent-categories">
            <label class="consent-category essential">
              <div class="category-info">
                <div class="category-header">
                  <mat-icon>lock</mat-icon>
                  <span class="category-name">Essential</span>
                  <span class="always-on-badge">Always on</span>
                </div>
                <p class="category-desc">Authentication, session management, and security. Required for the site to work.</p>
              </div>
              <div class="toggle disabled">
                <div class="toggle-track on"><div class="toggle-thumb"></div></div>
              </div>
            </label>

            <label class="consent-category" (click)="choices.analytics = !choices.analytics">
              <div class="category-info">
                <div class="category-header">
                  <mat-icon>analytics</mat-icon>
                  <span class="category-name">Analytics</span>
                </div>
                <p class="category-desc">Allow Google Analytics cookies and full page-view reporting. When off, Google may receive cookieless consent-mode signals for aggregate modeling.</p>
              </div>
              <div class="toggle">
                <div class="toggle-track" [class.on]="choices.analytics"><div class="toggle-thumb"></div></div>
              </div>
            </label>

            <label class="consent-category advertising" (click)="toggleAdvertising()">
              <div class="category-info">
                <div class="category-header">
                  <mat-icon>campaign</mat-icon>
                  <span class="category-name">Advertising</span>
                </div>
                <p class="category-desc">Allow ad delivery and ad personalization where available.</p>
              </div>
              <div class="toggle">
                <div class="toggle-track" [class.on]="choices.advertising"><div class="toggle-thumb"></div></div>
              </div>
            </label>

            <div class="ad-privacy-panel" (click)="$event.stopPropagation()">
              <button
                type="button"
                class="ad-privacy-button"
                [disabled]="adPrivacyControlsOpening"
                (click)="openAdPrivacyControls($event)">
                <mat-icon>{{ adPrivacyControlsOpening ? 'hourglass_empty' : 'tune' }}</mat-icon>
                <span>Ad privacy controls</span>
              </button>
              <span class="ad-privacy-note" *ngIf="adPrivacyControlsNotice">
                {{ adPrivacyControlsNotice }}
              </span>
            </div>
          </div>

          <div class="banner-actions">
            <button class="consent-btn secondary" (click)="showDetails = false">Back</button>
            <button class="consent-btn accept" (click)="saveChoices()">Save Preferences</button>
          </div>
        </div>
      </div>
    </div>

  `,
  styles: [`
    .cookie-banner {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 10000;
      padding: 0 1rem 1rem;
      pointer-events: none;
      animation: slideUp 0.35s ease-out;
    }

    .banner-content {
      max-width: 720px;
      margin: 0 auto;
      background: #1a1a1a;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 1.25rem 1.5rem;
      box-shadow: 0 -4px 30px rgba(0, 0, 0, 0.5);
      pointer-events: all;
    }

    .banner-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;

      mat-icon {
        color: #ffb74d;
        font-size: 20px;
        width: 20px;
        height: 20px;
      }

      span {
        font-size: 1rem;
        font-weight: 700;
        color: #fff;
      }
    }

    .banner-text p {
      margin: 0;
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.55);
      line-height: 1.6;
    }

    .privacy-link {
      margin-top: 0.35rem !important;

      a {
        color: #64b5f6;
        text-decoration: none;

        &:hover {
          text-decoration: underline;
        }
      }
    }

    .details-description {
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.5);
      margin: 0 0 1rem;
      line-height: 1.5;

      a {
        color: #64b5f6;
        text-decoration: none;

        &:hover {
          text-decoration: underline;
        }
      }
    }

    .banner-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    .consent-btn {
      padding: 8px 18px;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s;
      white-space: nowrap;

      &.accept {
        background: #64b5f6;
        color: #000;
        border-color: #64b5f6;

        &:hover {
          background: #90caf9;
          border-color: #90caf9;
        }
      }

      &.reject {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        border-color: rgba(255, 255, 255, 0.2);

        &:hover {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.3);
        }
      }

      &.secondary {
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.6);
        border-color: rgba(255, 255, 255, 0.08);

        &:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
      }
    }

    // --- Category toggles ---
    .consent-categories {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .consent-category {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.75rem 1rem;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.03);
      cursor: pointer;
      transition: background 0.15s;
      user-select: none;

      &:hover:not(.essential) {
        background: rgba(255, 255, 255, 0.06);
      }

      &.essential {
        cursor: default;
        opacity: 0.7;
      }

      &.advertising {
        align-items: center;
      }
    }

    .category-info {
      flex: 1;
      min-width: 0;
    }

    .category-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.2rem;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: rgba(255, 255, 255, 0.4);
      }
    }

    .category-name {
      font-size: 0.85rem;
      font-weight: 600;
      color: #fff;
    }

    .always-on-badge {
      font-size: 0.65rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.35);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .category-desc {
      margin: 0;
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.4);
      line-height: 1.4;
      padding-left: 1.6rem;
    }

    .ad-privacy-panel {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.65rem 1rem;
      border: 1px solid rgba(100, 181, 246, 0.16);
      border-radius: 10px;
      background: rgba(100, 181, 246, 0.06);
    }

    .ad-privacy-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      min-height: 32px;
      padding: 0 0.75rem;
      border: 1px solid rgba(100, 181, 246, 0.28);
      border-radius: 8px;
      background: rgba(100, 181, 246, 0.12);
      color: #90caf9;
      font: inherit;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      &:hover:not(:disabled) {
        border-color: rgba(100, 181, 246, 0.45);
        background: rgba(100, 181, 246, 0.18);
        color: #bbdefb;
      }

      &:disabled {
        opacity: 0.68;
        cursor: wait;
      }
    }

    .ad-privacy-note {
      color: rgba(255, 255, 255, 0.48);
      font-size: 0.72rem;
      line-height: 1.35;
      text-align: right;
    }

    // --- Toggle switch ---
    .toggle {
      flex-shrink: 0;

      &.disabled {
        opacity: 0.5;
        pointer-events: none;
      }
    }

    .toggle-track {
      width: 40px;
      height: 22px;
      border-radius: 11px;
      background: rgba(255, 255, 255, 0.12);
      position: relative;
      transition: background 0.2s;

      &.on {
        background: #64b5f6;
      }
    }

    .toggle-thumb {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #fff;
      position: absolute;
      top: 2px;
      left: 2px;
      transition: transform 0.2s;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);

      .on & {
        transform: translateX(18px);
      }
    }

    @keyframes slideUp {
      from {
        transform: translateY(100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    @media (max-width: 640px) {
      .cookie-banner {
        padding: 0 0.5rem 0.5rem;
      }

      .banner-content {
        padding: 1rem;
        border-radius: 12px;
      }

      .banner-actions {
        flex-direction: column;
      }

      .consent-btn {
        width: 100%;
        text-align: center;
      }

      .consent-category.advertising {
        align-items: center;
      }

      .ad-privacy-panel {
        align-items: stretch;
        flex-direction: column;
      }

      .ad-privacy-button {
        width: 100%;
      }

      .ad-privacy-note {
        text-align: left;
      }
    }
  `]
})
export class CookieConsentComponent implements OnInit, OnDestroy {
  showBanner = false;
  showDetails = false;
  choices: CookieConsent = { essential: true, analytics: false, advertising: true };
  private sub?: Subscription;
  adPrivacyControlsOpening = false;
  adPrivacyControlsNotice = '';
  private adPrivacyControlsTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public consentService: CookieConsentService,
    private fuseAdsService: FuseAdsService,
  ) {}

  ngOnInit(): void {
    // Show banner if user hasn't consented yet
    if (!this.consentService.hasConsented) {
      this.showBanner = true;
    }

    // Listen for reopen requests
    this.sub = this.consentService.showBanner$.subscribe(open => {
      if (open) {
        // Pre-fill with current choices
        const current = this.consentService.consent;
        if (current) {
          this.choices = { ...current };
        }
        this.showDetails = true;
        this.showBanner = true;
        this.consentService.closeBanner();
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    if (this.adPrivacyControlsTimer !== null) {
      clearTimeout(this.adPrivacyControlsTimer);
    }
  }

  acceptAll(): void {
    this.consentService.acceptAll();
    this.showBanner = false;
    this.showDetails = false;
  }

  rejectAll(): void {
    this.consentService.rejectAll();
    this.showBanner = false;
    this.showDetails = false;
  }

  saveChoices(): void {
    this.consentService.saveChoices(this.choices);
    this.showBanner = false;
    this.showDetails = false;
  }

  toggleAdvertising(): void {
    this.choices.advertising = !this.choices.advertising;
  }

  openAdPrivacyControls(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    this.adPrivacyControlsOpening = true;
    this.adPrivacyControlsNotice = 'Opening regional controls...';

    const controlsRequested = this.fuseAdsService.openPrivacyControls();
    if (!controlsRequested) {
      this.adPrivacyControlsOpening = false;
      this.adPrivacyControlsNotice = 'Ad privacy controls are unavailable in this build.';
      return;
    }

    if (this.adPrivacyControlsTimer !== null) {
      clearTimeout(this.adPrivacyControlsTimer);
    }

    this.adPrivacyControlsTimer = setTimeout(() => {
      this.adPrivacyControlsOpening = false;
      this.adPrivacyControlsNotice = '';
      this.adPrivacyControlsTimer = null;
    }, 2400);
  }

  reopenSettings(): void {
    const current = this.consentService.consent;
    if (current) {
      this.choices = { ...current };
    }
    this.showDetails = true;
    this.showBanner = true;
  }
}
