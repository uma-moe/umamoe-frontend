import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { OptimalRaceRecommendation } from '../../services/affinity.service';
import { RaceSchedulerComponent } from '../race-scheduler/race-scheduler.component';

export interface OptimalRacesDialogData {
  recommendations: OptimalRaceRecommendation[];
}

@Component({
  selector: 'app-optimal-races-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, RaceSchedulerComponent],
  template: `
    <section class="optimal-races-dialog">
      <header>
        <div class="title-icon"><mat-icon>emoji_events</mat-icon></div>
        <div class="title-copy">
          <h2>Optimal Races</h2>
          <p>Win these G1s with the parent you are building to maximize future race affinity.</p>
        </div>
        <button class="close-button" type="button" (click)="dialogRef.close()" aria-label="Close">
          <mat-icon>close</mat-icon>
        </button>
      </header>

      <div class="legend">
        <span><strong>+6</strong> both parents</span>
        <span><strong>+3</strong> one parent</span>
      </div>

      <div class="race-calendar">
        <app-race-scheduler
          [selectable]="false"
          [showLegend]="false"
          [optimalRaceRecommendations]="data.recommendations">
        </app-race-scheduler>
      </div>

      <footer>
        Race affinity is awarded when this new parent later appears above the matching P1/P2 legacies.
      </footer>
    </section>
  `,
  styles: [`
    .optimal-races-dialog {
      width: 100%;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-sizing: border-box;
      color: var(--text-primary);
      background: var(--surface-overlay);
      border: 1px solid var(--border-primary);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-dropdown);
    }

    header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 18px 18px 14px;
      border-bottom: 1px solid var(--border-subtle);
    }

    .title-icon {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      border-radius: 10px;
      color: #ffca28;
      background: rgba(255, 202, 40, 0.1);
      border: 1px solid rgba(255, 202, 40, 0.24);
    }

    .title-icon mat-icon { font-size: 21px; width: 21px; height: 21px; }
    .title-copy { min-width: 0; flex: 1; }
    h2 { margin: 0; font-size: 1.05rem; line-height: 1.25; }
    p { margin: 4px 0 0; color: var(--text-muted); font-size: 0.78rem; line-height: 1.4; }

    .close-button {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: 8px;
      color: var(--text-muted);
      background: transparent;
      cursor: pointer;
    }

    .close-button:hover { color: var(--text-primary); background: var(--surface-hover); }
    .close-button mat-icon { font-size: 19px; width: 19px; height: 19px; }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 7px 18px;
      padding: 10px 18px;
      color: var(--text-muted);
      background: rgba(var(--on-surface-rgb), 0.025);
      border-bottom: 1px solid var(--border-subtle);
      font-size: 0.7rem;
    }

    .legend strong { color: #ffca28; font-family: var(--font-mono); }

    .race-calendar {
      flex: 1 1 auto;
      min-height: 0;
      padding: 12px 16px 16px;
      overflow: auto;
      overscroll-behavior: contain;
    }

    app-race-scheduler {
      display: block;
      min-width: 1040px;
    }

    footer {
      flex: 0 0 auto;
      padding: 11px 18px 14px;
      color: var(--text-disabled);
      border-top: 1px solid var(--border-subtle);
      font-size: 0.66rem;
      line-height: 1.4;
    }

    @media (max-width: 768px) {
      app-race-scheduler { min-width: 0; }
      .race-calendar {
        overflow-x: hidden;
        overscroll-behavior-y: auto;
        -webkit-overflow-scrolling: touch;
      }
    }

    @media (max-width: 520px) {
      .optimal-races-dialog { max-height: min(84dvh, 660px); }
      header { align-items: center; gap: 8px; padding: 8px 8px 7px; }
      .title-icon, p { display: none; }
      h2 { font-size: 0.9rem; }
      .close-button { width: 28px; height: 28px; flex: 0 0 28px; }
      .legend {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 4px 8px;
        padding: 5px 8px;
        font-size: 0.61rem;
      }
      .race-calendar { padding: 5px 7px 7px; }
      footer { display: none; }
    }
  `],
})
export class OptimalRacesDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<OptimalRacesDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: OptimalRacesDialogData,
  ) {}

  trackByGroup(_: number, race: OptimalRaceRecommendation): number {
    return race.groupId;
  }

  getOverlapLabel(race: OptimalRaceRecommendation): string {
    if (race.overlapsP1 && race.overlapsP2) return 'Overlaps P1 and P2';
    return race.overlapsP1 ? 'Overlaps P1' : 'Overlaps P2';
  }
}
