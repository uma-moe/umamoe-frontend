import { Component, Inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RaceSchedulerComponent, RaceEntry } from '../race-scheduler/race-scheduler.component';

export interface RaceWinPickerDialogData {
  charName: string;
  charId?: number;
  /** Pre-selected win saddle IDs to restore previous selection */
  winSaddleIds: number[];
}

@Component({
  selector: 'app-race-win-picker-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule, RaceSchedulerComponent],
  template: `
    <div class="race-win-picker">
      <div class="picker-header">
        <div class="header-left">
          <img *ngIf="data.charId"
               [src]="'/assets/images/character_stand/chara_stand_' + data.charId + '.png'"
               class="char-portrait"
               [alt]="data.charName"
               (error)="handleImageError($event)">
          <div class="header-text">
            <span class="picker-title">Select Race Wins</span>
            <span class="char-name">{{ data.charName }}</span>
          </div>
        </div>

        <button class="close-btn" (click)="dialogRef.close(null)">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="picker-body">
        <app-race-scheduler
          #scheduler
          [selectable]="true"
          [showSearch]="true"
          [winSaddleIds]="data.winSaddleIds"
          (selectionChanged)="onSelectionChanged($event)">
        </app-race-scheduler>
      </div>

      <div class="picker-footer">
        <span class="selection-count">{{ selectedCount }} race{{ selectedCount !== 1 ? 's' : '' }} selected</span>
        <button class="confirm-btn" (click)="confirm()">
          <mat-icon>check</mat-icon>
          Confirm
        </button>
      </div>
    </div>
  `,
  styles: [`
    .race-win-picker {
      background: #1a1a1a;
      display: flex;
      flex-direction: column;
      height: 100%;
      max-height: 85vh;
    }

    .picker-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);

      .header-left {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        min-width: 0;
      }

      .char-portrait {
        height: 30px;
        object-fit: contain;
        flex-shrink: 0;
      }

      .header-text {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
      }

      .picker-title {
        font-size: 13px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .char-name {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.45);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .close-btn {
        flex-shrink: 0;
        background: none;
        border: none;
        padding: 4px;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.4);
        display: flex;
        align-items: center;
        border-radius: 6px;
        transition: all 0.15s;

        &:hover {
          color: rgba(255, 255, 255, 0.8);
          background: rgba(255, 255, 255, 0.05);
        }

        mat-icon { font-size: 18px; width: 18px; height: 18px; }
      }
    }

    .picker-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    .picker-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);

      .selection-count {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.45);
      }

      .confirm-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 18px;
        border: 1px solid rgba(33, 150, 243, 0.3);
        border-radius: 8px;
        background: rgba(33, 150, 243, 0.12);
        color: #64b5f6;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.15s;

        mat-icon { font-size: 18px; width: 18px; height: 18px; }

        &:hover {
          background: rgba(33, 150, 243, 0.2);
          border-color: rgba(33, 150, 243, 0.5);
          color: #90caf9;
        }
      }
    }

    // ── Race search ──────────────────────────────────────────────────────────

    .race-search-wrap {
      flex: 1;
      min-width: 0;
      max-width: 300px;
      margin-left: auto;
      position: relative;
    }

    .race-search-box {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 6px 10px;
      transition: border-color 0.15s;

      &:focus-within {
        border-color: rgba(100, 181, 246, 0.4);
        background: rgba(100, 181, 246, 0.04);
      }
    }

    .race-search-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: rgba(255, 255, 255, 0.3);
      flex-shrink: 0;
    }

    .race-search-input {
      flex: 1;
      background: none;
      border: none;
      outline: none;
      color: rgba(255, 255, 255, 0.9);
      font-size: 13px;
      font-family: inherit;
      min-width: 0;

      &::placeholder { color: rgba(255, 255, 255, 0.3); }
    }

    .race-search-clear {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: rgba(255, 255, 255, 0.3);
      cursor: pointer;
      flex-shrink: 0;
      transition: color 0.12s;

      &:hover { color: rgba(255, 255, 255, 0.7); }
    }

    .race-search-results {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      background: #1e1e1e;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      max-height: 220px;
      overflow-y: auto;
      z-index: 100;
    }

    .race-search-result {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      transition: background 0.1s;

      &:last-child { border-bottom: none; }
      &:hover { background: rgba(255, 255, 255, 0.05); }

      &.already-selected {
        opacity: 0.5;
        cursor: default;
        &:hover { background: none; }
      }

      .race-res-grade {
        font-size: 10px;
        font-weight: 700;
        padding: 1px 4px;
        border-radius: 3px;
        flex-shrink: 0;
        letter-spacing: 0.04em;

        &.grade-g1 { color: var(--grade-g1); background: rgba(54, 132, 227, 0.12); border: 1px solid rgba(54, 132, 227, 0.3); }
        &.grade-g2 { color: var(--grade-g2); background: rgba(244, 85, 129, 0.12); border: 1px solid rgba(244, 85, 129, 0.3); }
        &.grade-g3 { color: var(--grade-g3); background: rgba(57, 187, 84, 0.12); border: 1px solid rgba(57, 187, 84, 0.3); }
      }

      .race-res-name {
        flex: 1;
        color: rgba(255, 255, 255, 0.85);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .race-res-check {
        font-size: 14px;
        width: 14px;
        height: 14px;
        color: rgba(100, 181, 246, 0.7);
        flex-shrink: 0;
      }

      .race-slot-count {
        font-size: 10px;
        font-weight: 700;
        color: rgba(100, 181, 246, 0.7);
        flex-shrink: 0;
        letter-spacing: 0.03em;
      }
    }
  `]
})
export class RaceWinPickerDialogComponent {
  @ViewChild('scheduler') scheduler!: RaceSchedulerComponent;

  selectedCount = 0;

  raceSearchQuery = '';
  raceSearchResults: RaceEntry[] = [];

  constructor(
    public dialogRef: MatDialogRef<RaceWinPickerDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RaceWinPickerDialogData
  ) {
    this.selectedCount = data.winSaddleIds?.length ?? 0;
  }

  onSelectionChanged(raceIds: number[]): void {
    this.selectedCount = raceIds.length;
  }

  onRaceSearch(query: string): void {
    this.raceSearchResults = this.scheduler?.searchRaces(query) ?? [];
  }

  addRace(race: RaceEntry, event: MouseEvent): void {
    event.preventDefault();
    if (this.isRaceFullySelected(race)) return;
    this.scheduler.selectRaceById(race.race_instance_id);
    this.raceSearchQuery = '';
    this.raceSearchResults = [];
  }

  isRaceSelected(race: RaceEntry): boolean {
    return (this.scheduler?.getRaceSelectedCount(race.race_instance_id) ?? 0) > 0;
  }

  isRaceFullySelected(race: RaceEntry): boolean {
    const count = this.scheduler?.getRaceSelectedCount(race.race_instance_id) ?? 0;
    const max = this.scheduler?.getRaceMaxSlots(race.race_instance_id) ?? 1;
    return count >= max;
  }

  getRaceMaxSlots(race: RaceEntry): number {
    return this.scheduler?.getRaceMaxSlots(race.race_instance_id) ?? 1;
  }

  getRaceSelectedCount(race: RaceEntry): number {
    return this.scheduler?.getRaceSelectedCount(race.race_instance_id) ?? 0;
  }

  clearSearch(event: MouseEvent): void {
    event.preventDefault();
    this.raceSearchQuery = '';
    this.raceSearchResults = [];
  }

  hideSearchDropdown(): void {
    // Small delay so mousedown on a result fires before blur clears results
    setTimeout(() => { this.raceSearchResults = []; }, 150);
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

  handleImageError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  confirm(): void {
    const saddleIds = this.scheduler.getSelectedSaddleIds();
    this.dialogRef.close(saddleIds);
  }
}
