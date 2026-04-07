import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-milestone-popup',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <div class="milestone-popup">
      <!-- Confetti particles -->
      <div class="confetti-container">
        <div *ngFor="let p of confetti" class="confetti-piece"
             [style.left.%]="p.x"
             [style.animation-delay.s]="p.delay"
             [style.animation-duration.s]="p.duration"
             [style.background]="p.color"
             [style.width.px]="p.size"
             [style.height.px]="p.size * p.ratio">
        </div>
      </div>

      <div class="popup-header">
        <div class="milestone-number">
          <span class="number-glow">1,000,000</span>
        </div>
        <h2>Unique Monthly Visitors!</h2>
      </div>

      <div class="popup-content">
        <p class="main-message">
          <strong>uma.moe</strong> just crossed
          <strong>1 million unique visitors</strong> in a single month.
          That's... a lot of uma enthusiasts.
        </p>

        <p class="origin-story">
          I never expected this to go this far. The whole thing started as a joke
          in a Discord with friends, basically just "huh, I wonder when X comes out"
          and now here we are.
        </p>

        <div class="asterisk-box">
          <div class="asterisk-header">
            <mat-icon>info_outline</mat-icon>
            <span>Obligatory disclaimer</span>
          </div>
          <p>
            "Unique visitors" ≠ active users. This number includes bots, crawlers,
            people who accidentally clicked a link, and that one person in
            incognito mode visiting 47 times.
            We're not <em>that</em> popular. Probably.
          </p>
        </div>

        <p class="thank-you">
          Jokes aside, thank you for using uma.moe. Whether you check in daily
          or stumbled here once, it means a lot. There's more to come! 🐴
        </p>
      </div>

      <div class="popup-actions">
        <button mat-raised-button color="primary" (click)="dismiss()" class="dismiss-btn">
          <mat-icon>celebration</mat-icon>
          Nice!
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .milestone-popup {
      max-width: 520px;
      padding: 2rem 1.5rem 1.5rem;
      background: var(--bg-secondary);
      color: var(--text-primary);
      border-radius: var(--radius-xl);
      border: 1px solid var(--border-primary);
      position: relative;
      overflow: hidden;
    }

    // Confetti
    .confetti-container {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 100%;
      pointer-events: none;
      overflow: hidden;
    }

    .confetti-piece {
      position: absolute;
      top: -20px;
      border-radius: 2px;
      animation: confetti-fall linear forwards;
      opacity: 0;
    }

    @keyframes confetti-fall {
      0% {
        transform: translateY(0) rotate(0deg);
        opacity: 1;
      }
      100% {
        transform: translateY(600px) rotate(720deg);
        opacity: 0;
      }
    }

    // Header
    .popup-header {
      text-align: center;
      margin-bottom: 1.5rem;
      position: relative;
      z-index: 1;
    }

    .milestone-number {
      margin-bottom: 0.5rem;
    }

    .number-glow {
      font-size: 3rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      background: linear-gradient(135deg, #ffd700, #ffaa00, #ffd700);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      filter: drop-shadow(0 2px 12px rgba(255, 215, 0, 0.3));
      animation: number-shimmer 3s ease-in-out infinite;
      font-variant-numeric: tabular-nums;
    }

    @keyframes number-shimmer {
      0%, 100% {
        filter: drop-shadow(0 2px 12px rgba(255, 215, 0, 0.3));
      }
      50% {
        filter: drop-shadow(0 4px 20px rgba(255, 215, 0, 0.5));
      }
    }

    h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--text-secondary);
      letter-spacing: -0.01em;
    }

    // Content
    .popup-content {
      position: relative;
      z-index: 1;
    }

    .main-message {
      font-size: 0.95rem;
      line-height: 1.7;
      color: var(--text-primary);
      text-align: center;
      margin: 0 0 1.25rem;
    }

    .main-message strong {
      color: var(--accent-primary);
      font-weight: 600;
    }

    .origin-story {
      font-size: 0.95rem;
      line-height: 1.7;
      color: var(--text-secondary);
      text-align: center;
      margin: 0 0 1.25rem;
      font-style: italic;
    }

    // Disclaimer box
    .asterisk-box {
      background: var(--surface-2);
      border: 1px solid rgba(var(--accent-warning-rgb), 0.2);
      border-radius: var(--radius-lg);
      padding: 0.875rem 1rem;
      margin-bottom: 1.25rem;
    }

    .asterisk-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      color: var(--accent-warning);
      font-weight: 600;
      font-size: var(--font-sm);
      text-transform: uppercase;
      letter-spacing: 0.03em;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }

    .asterisk-box p {
      margin: 0;
      font-size: var(--font-sm);
      line-height: 1.6;
      color: var(--text-secondary);
    }

    .asterisk-box em {
      color: var(--accent-warning);
      font-style: italic;
    }

    // Thank you
    .thank-you {
      text-align: center;
      font-size: 0.95rem;
      line-height: 1.6;
      color: var(--text-secondary);
      margin: 0;
    }

    // Actions
    .popup-actions {
      display: flex;
      justify-content: center;
      padding-top: 1.25rem;
      margin-top: 1.25rem;
      border-top: 1px solid var(--border-subtle);
      position: relative;
      z-index: 1;
    }

    .dismiss-btn {
      padding: 0.75rem 2.5rem;
      font-weight: 600;
      font-size: 1rem;
      border-radius: var(--radius-md);
      background: linear-gradient(135deg, #ffd700 0%, #ffaa00 100%) !important;
      color: #1a1a1a !important;
      border: none;
      box-shadow:
        0 4px 12px rgba(255, 215, 0, 0.25),
        0 0 0 1px rgba(255, 255, 255, 0.1) inset;
      transition: all 0.2s ease;
    }

    .dismiss-btn:hover {
      transform: translateY(-1px);
      box-shadow:
        0 6px 16px rgba(255, 215, 0, 0.35),
        0 0 0 1px rgba(255, 255, 255, 0.2) inset;
    }

    .dismiss-btn mat-icon {
      margin-right: 0.5rem;
      font-size: 1.1rem;
      color: #1a1a1a;
    }

    // Mobile
    @media (max-width: 600px) {
      .milestone-popup {
        padding: 1.5rem 1.25rem 1.25rem;
      }

      .number-glow {
        font-size: 2.25rem;
      }

      h2 {
        font-size: 1.1rem;
      }

      .main-message,
      .thank-you {
        font-size: 0.9rem;
      }
    }
  `]
})
export class MilestonePopupComponent {
  confetti: { x: number; delay: number; duration: number; color: string; size: number; ratio: number }[] = [];

  private readonly colors = [
    '#ffd700', '#ffaa00', '#64b5f6', '#81c784',
    '#f48fab', '#ce93d8', '#ff8a65', '#4fc3f7'
  ];

  constructor(
    public dialogRef: MatDialogRef<MilestonePopupComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.generateConfetti();
  }

  dismiss(): void {
    this.dialogRef.close();
  }

  private generateConfetti(): void {
    this.confetti = Array.from({ length: 40 }, () => ({
      x: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 2.5 + Math.random() * 2,
      color: this.colors[Math.floor(Math.random() * this.colors.length)],
      size: 4 + Math.random() * 6,
      ratio: 1 + Math.random() * 2
    }));
  }
}
