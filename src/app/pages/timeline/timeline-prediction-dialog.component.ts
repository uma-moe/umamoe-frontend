import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TimelineCalculation, TimelineEvent } from '../../models/timeline.model';
import { TimelinePredictionAlternative, TimelinePredictionInsight } from '../../services/timeline-prediction.service';

export interface TimelinePredictionDialogData {
  event: TimelineEvent;
  insight: TimelinePredictionInsight;
  calculation: TimelineCalculation | null;
  eventTypeLabel: string;
  displayTitle?: string;
  dateLabel: string;
}

interface PlacementFact {
  icon: string;
  label: string;
  value: string;
}

@Component({
  selector: 'app-timeline-prediction-dialog',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <div class="timeline-prediction-dialog">
      <header class="tpd-header">
        <div class="tpd-title">
          <span>{{ data.eventTypeLabel }}</span>
          <h2>{{ data.displayTitle || data.event.title }}</h2>
        </div>
        <button
          mat-icon-button
          type="button"
          aria-label="Close prediction details"
          (click)="dialogRef.close()"
        >
          <mat-icon>close</mat-icon>
        </button>
      </header>

      <mat-dialog-content class="tpd-content">
        <section class="tpd-current" [class.is-confirmed]="isConfirmed">
          <div class="tpd-current-copy">
            <span>{{ currentEyebrow }}</span>
            <h3>{{ data.dateLabel }}</h3>
            <p>{{ currentDetail }}</p>
          </div>
          <div class="tpd-current-status">
            <strong [class]="summaryPillClass">{{ summaryPill }}</strong>
          </div>
        </section>

        <section class="tpd-why" *ngIf="placementFacts.length">
          <div class="tpd-section-head">
            <h3>Why this date</h3>
            <span>{{ whyCaption }}</span>
          </div>
          <div class="tpd-why-grid">
            <div *ngFor="let fact of placementFacts" class="tpd-why-item">
              <mat-icon>{{ fact.icon }}</mat-icon>
              <span>{{ fact.label }}</span>
              <strong>{{ fact.value }}</strong>
            </div>
          </div>
        </section>

        <section class="tpd-outcomes">
          <div class="tpd-section-head">
            <h3>Possible outcomes</h3>
            <span>{{ outcomeCaption }}</span>
          </div>
          <div class="tpd-outcome-list">
            <div class="tpd-outcome is-current" [style.--alt-weight]="currentFitWeight">
              <div class="tpd-outcome-marker">
                <mat-icon>{{ isConfirmed ? 'verified' : 'radio_button_checked' }}</mat-icon>
              </div>
              <div class="tpd-outcome-date">
                <strong>{{ data.dateLabel }}</strong>
                <small>{{ currentOutcomeNote }}</small>
              </div>
              <span>{{ currentOutcomeBadge }}</span>
            </div>

            <div
              *ngFor="let alternative of compactAlternatives; let first = first"
              class="tpd-outcome"
              [class.is-primary]="first"
              [style.--alt-weight]="alternativeWeight(alternative)"
            >
              <div class="tpd-outcome-marker">
                <i></i>
              </div>
              <div class="tpd-outcome-date">
                <strong>{{ alternative.label }}</strong>
                <small>{{ shortAlternativeReason(alternative) }}</small>
              </div>
              <span>{{ alternative.probabilityLabel }}</span>
            </div>
          </div>
        </section>
      </mat-dialog-content>
    </div>
  `,
  styles: [`
    .timeline-prediction-dialog {
      width: min(430px, calc(100vw - 20px));
      max-height: min(520px, calc(100dvh - 20px));
      overflow: hidden;
      color: var(--text-primary);
      background: var(--bg-secondary);
    }

    .tpd-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.8rem 0.85rem 0.65rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .tpd-title {
      min-width: 0;
    }

    .tpd-title span {
      display: block;
      color: var(--text-muted);
      font-size: 0.66rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .tpd-title h2 {
      display: -webkit-box;
      margin: 0.1rem 0;
      overflow: hidden;
      color: var(--text-primary);
      font-size: 1rem;
      line-height: 1.18;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .tpd-header button {
      flex: 0 0 auto;
      color: var(--text-secondary);
      margin: -0.35rem -0.35rem 0 0;
    }

    .tpd-content {
      display: grid;
      gap: 0.64rem;
      max-height: calc(min(520px, 100dvh - 20px) - 64px);
      padding: 0.7rem 0.78rem 0.82rem;
      overflow: auto;
    }

    .tpd-current {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.7rem;
      align-items: center;
      padding: 0.62rem 0.68rem;
      border-left: 3px solid var(--accent-primary);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.045);
    }

    .tpd-current.is-confirmed {
      border-left-color: var(--accent-success);
      background: rgba(var(--accent-success-rgb), 0.08);
    }

    .tpd-current-copy {
      min-width: 0;
    }

    .tpd-current-copy span {
      display: block;
      margin-bottom: 0.14rem;
      color: var(--text-muted);
      font-size: 0.6rem;
      font-weight: 800;
      text-transform: uppercase;
    }

    .tpd-current-copy h3 {
      margin: 0;
      color: var(--text-primary);
      font-size: 1rem;
      line-height: 1.18;
    }

    .tpd-current-copy p {
      margin: 0.26rem 0 0;
      color: var(--text-secondary);
      font-size: 0.74rem;
      line-height: 1.34;
    }

    .tpd-current-status {
      display: flex;
      align-items: center;
      min-height: 1.4rem;
    }

    .tpd-section-head h3 {
      color: var(--text-primary);
      font-size: 0.82rem;
      font-weight: 800;
      line-height: 1.1;
      margin: 0;
    }

    .tpd-current-status strong {
      padding: 0.18rem 0.42rem;
      border-radius: 999px;
      font-size: 0.74rem;
      font-weight: 850;
      white-space: nowrap;
    }

    .tpd-pill-confirmed {
      color: var(--accent-success);
      background: rgba(var(--accent-success-rgb), 0.16);
    }

    .tpd-pill-strong {
      color: var(--accent-success);
      background: rgba(var(--accent-success-rgb), 0.16);
    }

    .tpd-pill-medium {
      color: var(--accent-warning);
      background: rgba(var(--accent-warning-rgb), 0.13);
    }

    .tpd-pill-weak,
    .tpd-pill-neutral {
      color: var(--accent-primary);
      background: rgba(var(--accent-primary-rgb), 0.14);
    }

    .tpd-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.8rem;
    }

    .tpd-section-head span {
      color: var(--text-muted);
      font-size: 0.6rem;
      font-weight: 700;
      line-height: 1.1;
      text-transform: uppercase;
      text-align: right;
    }

    .tpd-why,
    .tpd-outcomes {
      display: grid;
      gap: 0.4rem;
    }

    .tpd-why-grid {
      display: grid;
      gap: 0.26rem;
    }

    .tpd-why-item {
      display: grid;
      grid-template-columns: 0.9rem minmax(4.5rem, auto) minmax(0, 1fr);
      gap: 0.42rem;
      align-items: center;
      padding: 0.38rem 0.48rem;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.045);
    }

    .tpd-why-item mat-icon {
      width: 0.86rem;
      height: 0.86rem;
      color: var(--accent-primary);
      font-size: 0.86rem;
    }

    .tpd-why-item span {
      display: block;
      color: var(--text-muted);
      font-size: 0.62rem;
      font-weight: 750;
      line-height: 1.15;
      text-transform: uppercase;
    }

    .tpd-why-item strong {
      display: block;
      overflow: hidden;
      color: var(--text-primary);
      font-size: 0.73rem;
      line-height: 1.18;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tpd-outcome-date small {
      display: block;
      color: var(--text-muted);
      font-size: 0.62rem;
      line-height: 1.22;
    }

    .tpd-outcome-list {
      display: grid;
      gap: 0.28rem;
    }

    .tpd-outcome {
      --alt-weight: 0%;
      display: grid;
      grid-template-columns: 1rem minmax(0, 1fr) minmax(3.2rem, auto);
      gap: 0.5rem;
      align-items: center;
      position: relative;
      overflow: hidden;
      min-height: 2.7rem;
      padding: 0.42rem 0.54rem;
      border: 1px solid transparent;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.045);
    }

    .tpd-outcome::before {
      content: '';
      position: absolute;
      inset: auto auto 0 0;
      width: var(--alt-weight);
      height: 2px;
      background: rgba(100, 181, 246, 0.11);
      pointer-events: none;
    }

    .tpd-outcome.is-current {
      border-color: rgba(100, 181, 246, 0.18);
      background: rgba(100, 181, 246, 0.08);
    }

    .tpd-outcome.is-current::before {
      width: var(--alt-weight);
      background: var(--accent-primary);
    }

    .tpd-outcome.is-current > span {
      color: var(--accent-primary);
    }

    .tpd-outcome.is-current .tpd-outcome-marker mat-icon {
      color: var(--accent-primary);
    }

    .tpd-outcome.is-current .tpd-outcome-date strong {
      color: var(--text-primary);
    }

    .tpd-current.is-confirmed + .tpd-why + .tpd-outcomes .tpd-outcome.is-current > span,
    .tpd-current.is-confirmed + .tpd-why + .tpd-outcomes .tpd-outcome.is-current .tpd-outcome-marker mat-icon {
      color: var(--accent-success);
    }

    .tpd-outcome.is-primary {
      border-color: rgba(255, 215, 0, 0.16);
      background: rgba(255, 215, 0, 0.045);
    }

    .tpd-outcome.is-primary::before {
      background: rgba(255, 215, 0, 0.13);
    }

    .tpd-outcome-marker,
    .tpd-outcome-date,
    .tpd-outcome > span {
      position: relative;
    }

    .tpd-outcome-marker {
      display: grid;
      place-items: center;
      width: 1rem;
      height: 1rem;
    }

    .tpd-outcome-marker mat-icon {
      width: 1rem;
      height: 1rem;
      color: var(--accent-primary);
      font-size: 1rem;
    }

    .tpd-outcome-marker i {
      width: 0.46rem;
      height: 0.46rem;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.45);
    }

    .tpd-outcome-date {
      min-width: 0;
    }

    .tpd-outcome-date strong {
      display: block;
      color: var(--text-primary);
      font-size: 0.82rem;
      line-height: 1.18;
    }

    .tpd-outcome > span {
      color: var(--accent-warning);
      font-size: 0.78rem;
      font-weight: 800;
      line-height: 1.2;
      text-align: right;
      white-space: nowrap;
    }

    .tpd-outcome-date small {
      overflow: hidden;
      display: -webkit-box;
      margin-top: 0.16rem;
      line-height: 1.22;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
    }

    @media (max-width: 420px) {
      .timeline-prediction-dialog {
        width: 100vw;
        max-height: 88dvh;
      }

      .tpd-header {
        padding: 0.72rem 0.78rem 0.58rem;
      }

      .tpd-content {
        gap: 0.6rem;
        max-height: calc(88dvh - 66px);
        padding: 0.65rem 0.78rem max(0.85rem, env(safe-area-inset-bottom));
      }

      .tpd-title h2 {
        font-size: 0.96rem;
      }

      .tpd-current {
        grid-template-columns: 1fr;
        gap: 0.45rem;
        align-items: start;
      }

      .tpd-current-status {
        min-height: 0;
      }

      .tpd-why-item {
        grid-template-columns: 0.9rem minmax(3.8rem, auto) minmax(0, 1fr);
        gap: 0.36rem;
      }

      .tpd-current-copy p,
      .tpd-outcome-date small {
        font-size: 0.74rem;
      }

      .tpd-outcome {
        grid-template-columns: 1rem minmax(0, 1fr) minmax(2.7rem, auto);
        gap: 0.42rem;
      }
    }
  `]
})
export class TimelinePredictionDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<TimelinePredictionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: TimelinePredictionDialogData
  ) {}

  get isConfirmed(): boolean {
    return this.data.event.prediction?.kind === 'confirmed' || this.data.event.isConfirmed;
  }

  get currentEyebrow(): string {
    return this.isConfirmed ? 'Confirmed date' : 'Current placement';
  }

  get currentDetail(): string {
    if (this.isConfirmed) {
      return 'Fixed by the resource schedule.';
    }

    if (this.compactAlternatives.length) {
      return 'Best combined schedule and calendar fit right now.';
    }

    switch (this.data.event.prediction?.kind) {
      case 'interpolated':
        return 'Placed between nearby confirmed JP/global anchors.';
      case 'extrapolated':
        return 'Placed from the current catch-up pace.';
      case 'fallback':
        return 'Placed by fallback schedule rules.';
      default:
        return this.data.insight.subtitle;
    }
  }

  get summaryPill(): string {
    if (this.isConfirmed) {
      return 'Confirmed';
    }

    return this.data.event.prediction?.kind === 'extrapolated' ? 'Schedule-led' : this.sourceLabel;
  }

  get summaryPillClass(): string {
    if (this.isConfirmed) {
      return 'tpd-pill-confirmed';
    }
    return `tpd-pill-${this.data.insight.scoreTone || 'neutral'}`;
  }

  get whyCaption(): string {
    return this.isConfirmed ? 'source' : 'model inputs';
  }

  get outcomeCaption(): string {
    if (this.isConfirmed) {
      return 'no estimate used';
    }
    return this.compactAlternatives.length ? 'combined fit' : 'single placement';
  }

  get currentOutcomeNote(): string {
    if (this.isConfirmed) {
      return 'Resource-confirmed date';
    }
    return this.compactAlternatives.length ? 'Schedule + calendar signals' : this.sourceLabel;
  }

  get currentOutcomeBadge(): string {
    if (this.isConfirmed) {
      return 'Fixed';
    }
    return this.currentFitPercentLabel || 'Current';
  }

  get currentFitWeight(): string {
    const fit = this.currentCalendarFit;
    return fit === null ? '3px' : `${Math.max(4, Math.min(100, Math.round(fit * 100)))}%`;
  }

  get placementFacts(): PlacementFact[] {
    const prediction = this.data.event.prediction;
    if (this.isConfirmed) {
      return [{
        icon: 'verified',
        label: 'Source',
        value: 'Resources'
      }];
    }

    const facts: PlacementFact[] = [];

    if (typeof prediction?.accelerationRate === 'number') {
      facts.push({
        icon: 'trending_up',
        label: 'Pace',
        value: `${this.formatPercent(prediction.accelerationRate)} JP pace`
      });
    }

    if (prediction?.anchorJpDate || prediction?.anchorGlobalDate) {
      facts.push({
        icon: 'anchor',
        label: 'Anchors',
        value: this.anchorSummary
      });
    }

    if (prediction?.calendarLikelihood) {
      facts.push({
        icon: 'event',
        label: 'Date fit',
        value: this.currentFitLabel
      });
    }

    if (typeof prediction?.scheduleAdjustmentDays === 'number' && prediction.scheduleAdjustmentDays !== 0) {
      facts.push({
        icon: 'tune',
        label: 'Shift',
        value: this.formatSignedDays(prediction.scheduleAdjustmentDays)
      });
    }

    if (!facts.length) {
      facts.push({
        icon: 'timeline',
        label: 'Method',
        value: this.sourceLabel
      });
    }

    return facts.slice(0, 3);
  }

  get compactAlternatives(): TimelinePredictionAlternative[] {
    return this.data.insight.alternatives.slice(0, 4);
  }

  shortAlternativeReason(alternative: TimelinePredictionAlternative): string {
    if (alternative.reason.includes('Schedule')) {
      return alternative.reason;
    }

    const monthDayMatch = alternative.reason.match(/^Month-day pattern in (\d+) sample/);
    if (monthDayMatch) {
      return `Day pattern - ${monthDayMatch[1]} samples`;
    }

    const weekdayMatch = alternative.reason.match(/^([A-Z][a-z]+) in (\d+) sample/);
    if (weekdayMatch) {
      return `${weekdayMatch[1]} - ${weekdayMatch[2]} samples`;
    }

    return alternative.reason;
  }

  alternativeWeight(alternative: TimelinePredictionAlternative): string {
    const percent = Math.round(alternative.fitScore * 100);
    return `${Math.max(4, Math.min(100, percent))}%`;
  }

  private get sourceLabel(): string {
    const kind = this.data.event.prediction?.kind;
    return kind ? this.titleCase(kind) : 'Prediction';
  }

  private get anchorSummary(): string {
    const prediction = this.data.event.prediction;
    const parts: string[] = [];
    if (prediction?.anchorGlobalDate) {
      parts.push(`Global ${this.formatShortDate(prediction.anchorGlobalDate)}`);
    }
    if (prediction?.anchorJpDate) {
      parts.push(`JP ${this.formatShortDate(prediction.anchorJpDate)}`);
    }
    return parts.join(' / ') || 'Schedule anchor';
  }

  private get currentCalendarFit(): number | null {
    const score = this.data.insight.fitScore;
    return typeof score === 'number' ? score : null;
  }

  private get currentFitPercentLabel(): string {
    if (this.data.insight.fitLabel) {
      return this.data.insight.fitLabel;
    }

    const fit = this.currentCalendarFit;
    return fit === null ? '' : this.formatPercent(fit);
  }

  private get currentFitLabel(): string {
    return this.currentFitPercentLabel ? `${this.currentFitPercentLabel} fit` : '';
  }

  private formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  private formatSignedDays(value: number): string {
    return `${value > 0 ? '+' : ''}${value}d`;
  }

  private formatShortDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  private titleCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
