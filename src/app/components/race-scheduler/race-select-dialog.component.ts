import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RaceEntry } from './race-scheduler.component';
import { getRaceThumbnailUrl } from '../../utils/race-image.util';

export interface RaceSelectDialogData {
  races: RaceEntry[];
  /** Currently selected race_instance_id for this cell (single), or null */
  selectedId: number | null;
  cellLabel: string;
}

@Component({
  selector: 'app-race-select-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <div class="race-select-dialog">
      <div class="dialog-header">
        <h3>Select Race</h3>
        <span class="cell-context">{{ data.cellLabel }}</span>
        <button class="close-btn" (click)="dialogRef.close(null)">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <div class="race-list">
        <button
          *ngFor="let race of data.races"
          class="race-option"
          [class.selected]="selectedId === race.race_instance_id"
          [ngClass]="getGradeClass(race.grade)"
          [attr.aria-label]="race.name + ' (' + getGradeLabel(race.grade) + ')'"
          [matTooltip]="race.name + ' (' + getGradeLabel(race.grade) + ')'"
          (click)="pick(race)">
          <img
            *ngIf="getRaceImageUrl(race) as raceImageUrl"
            [src]="raceImageUrl"
            alt=""
            class="race-title-image"
            (error)="hideBrokenRaceImage($event)"
            loading="lazy"
            decoding="async">
          <span class="race-name race-image-fallback">{{ race.name }}</span>
          <mat-icon class="check-icon" *ngIf="selectedId === race.race_instance_id">radio_button_checked</mat-icon>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .race-select-dialog {
      background: #1a1a1a;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      overflow: hidden;
      min-width: 320px;
      max-width: 520px;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);

      h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
      }

      .cell-context {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.4);
        margin-left: auto;
        margin-right: 8px;
      }

      .close-btn {
        background: none;
        border: none;
        padding: 4px;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.4);
        display: flex;
        align-items: center;
        border-radius: 4px;

        &:hover {
          color: rgba(255, 255, 255, 0.8);
          background: rgba(255, 255, 255, 0.05);
        }

        mat-icon { font-size: 18px; width: 18px; height: 18px; }
      }
    }

    .race-list {
      padding: 8px;
      max-height: 400px;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
      gap: 6px;
    }

    .race-option {
      --race-outline: rgba(255, 255, 255, 0.16);
      position: relative;
      display: grid;
      place-items: center;
      align-items: center;
      aspect-ratio: 2 / 1;
      min-width: 0;
      padding: 0;
      border: 2px solid var(--race-outline);
      border-radius: 5px;
      background: rgba(255, 255, 255, 0.02);
      cursor: pointer;
      transition: all 0.15s ease;
      color: rgba(255, 255, 255, 0.8);
      overflow: hidden;

      &.grade-g1 { --race-outline: var(--grade-g1); }
      &.grade-g2 { --race-outline: var(--grade-g2); }
      &.grade-g3 { --race-outline: var(--grade-g3); }

      &:hover {
        filter: brightness(1.12);
      }

      &.selected {
        box-shadow:
          0 0 0 2px var(--dialog-surface-bg, #1a1a1a),
          0 0 0 4px var(--race-outline);
      }
    }

    .race-title-image {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
    }

    .race-title-image:not([hidden]) + .race-image-fallback {
      display: none;
    }

    .race-name {
      position: relative;
      z-index: 0;
      padding: 8px;
      font-size: 13px;
      font-weight: 500;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
    }

    .check-icon {
      position: absolute;
      z-index: 2;
      top: 4px;
      right: 4px;
      display: grid;
      place-items: center;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: rgba(12, 16, 20, 0.88);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
      font-size: 16px;
      color: #66bb6a;
    }

    :host-context(.light-theme) {
      .race-select-dialog {
        background: var(--dialog-surface-bg);
        border-color: var(--dialog-border);
        box-shadow: var(--dialog-shadow);
      }

      .dialog-header {
        background: var(--dialog-header-bg);
        border-bottom-color: var(--dialog-soft-border);

        h3 { color: var(--text-primary); }

        .cell-context {
          color: var(--text-muted);
        }

        .close-btn {
          color: var(--text-muted);

          &:hover {
            color: var(--text-primary);
            background: var(--surface-hover);
          }
        }
      }

      .race-list {
        background: var(--dialog-surface-bg);
      }

      .race-option {
        background: var(--light-card-bg);
        color: var(--text-secondary);

        &:hover {
          filter: brightness(1.06);
        }
      }
    }

    @media (max-width: 360px) {
      .race-select-dialog { min-width: 280px; }
      .race-list { grid-template-columns: 1fr; }
    }
  `]
})
export class RaceSelectDialogComponent {
  selectedId: number | null;

  constructor(
    public dialogRef: MatDialogRef<RaceSelectDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RaceSelectDialogData
  ) {
    this.selectedId = data.selectedId;
  }

  pick(race: RaceEntry): void {
    // Clicking the already-selected race deselects; otherwise select and close immediately
    if (this.selectedId === race.race_instance_id) {
      this.dialogRef.close(null); // deselect
    } else {
      this.dialogRef.close(race.race_instance_id);
    }
  }

  getGradeClass(grade: number): string {
    switch (grade) {
      case 100: return 'grade-g1';
      case 200: return 'grade-g2';
      case 300: return 'grade-g3';
      default: return '';
    }
  }

  getGradeLabel(grade: number): string {
    switch (grade) {
      case 100: return 'G1';
      case 200: return 'G2';
      case 300: return 'G3';
      default: return '';
    }
  }

  getRaceImageUrl(race: RaceEntry): string | null {
    return getRaceThumbnailUrl(race.thumbnail_id);
  }

  hideBrokenRaceImage(event: Event): void {
    (event.currentTarget as HTMLImageElement).hidden = true;
  }
}
