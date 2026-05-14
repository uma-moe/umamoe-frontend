import { Component, Inject, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { startWith, map } from 'rxjs/operators';
import { CharacterService } from '../../services/character.service';
import { AffinityService, PlannerRaceWins, PlannerSlotPosition, TreeSlots } from '../../services/affinity.service';
import { Character } from '../../models/character.model';

export type CharacterSelectMode = 'include' | 'exclude' | 'target';
export type CharacterSelectSort = 'default' | 'name' | 'affinity';

export interface CharacterSelectDialogData {
  multiSelect?: boolean;
  existingIds?: number[];
  mode?: CharacterSelectMode;
  /**
   * Base character IDs (chara_id, e.g. 1001) to score affinity against.
   * When provided, the "Sort by affinity" option is enabled and a small
   * affinity score is shown on each card.
   */
  affinityTargetIds?: number[];
  /**
    * Base character IDs (chara_id, e.g. 1001) that should be hidden from
    * the list entirely. This ensures all skin variants are excluded together.
   */
  excludeIds?: number[];
  /**
   * Optional lineage slot position (e.g. p1, p1-1) to score affinity
   * exactly as that slot contributes in the planner.
   */
  slotPosition?: PlannerSlotPosition;
  /**
   * Current planner slot ids (base chara_id values), used with slotPosition
   * for slot-aware affinity scoring.
   */
  treeSlots?: TreeSlots;
  /**
   * Current race wins per lineage position, used to include race affinity
   * in slot-total scoring.
   */
  raceWinsByPosition?: PlannerRaceWins;
}

interface DisplayCharacter extends Character {
  affinity?: number;
}

@Component({
  selector: 'app-character-select-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
  ],
  template: `
    <div class="select-dialog" [class.mode-include]="mode === 'include'" [class.mode-exclude]="mode === 'exclude'">
      <div class="select-header">
        <mat-icon class="select-header-icon">{{ mode === 'exclude' ? 'person_remove' : mode === 'include' ? 'person_add' : 'person_search' }}</mat-icon>
        <span class="select-header-title">{{ multiSelect ? (mode === 'exclude' ? 'Exclude Characters' : mode === 'include' ? 'Include Characters' : 'Select Characters') : 'Select Character' }}</span>
        <span class="selected-count" *ngIf="multiSelect && selectedCharacters.length > 0">
          {{ selectedCharacters.length }} selected
        </span>

        <button
          class="sort-btn"
          [matMenuTriggerFor]="sortMenu"
          type="button"
          [title]="'Sort: ' + sortLabel(sort)"
        >
          <mat-icon>sort</mat-icon>
          <span class="sort-btn-label">{{ sortLabel(sort) }}</span>
          <mat-icon class="sort-btn-caret">arrow_drop_down</mat-icon>
        </button>
        <mat-menu #sortMenu="matMenu" class="char-select-sort-menu">
          <button mat-menu-item (click)="setSort('default')" [class.active]="sort === 'default'">
            <mat-icon>schedule</mat-icon><span>Default</span>
          </button>
          <button mat-menu-item (click)="setSort('name')" [class.active]="sort === 'name'">
            <mat-icon>sort_by_alpha</mat-icon><span>Name (A–Z)</span>
          </button>
          <button mat-menu-item (click)="setSort('affinity')" [class.active]="sort === 'affinity'" [disabled]="!hasAffinityContext">
            <mat-icon>favorite</mat-icon><span>Affinity{{ hasAffinityContext ? '' : ' (n/a)' }}</span>
          </button>
        </mat-menu>

        <button mat-icon-button class="close-btn" (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <mat-dialog-content class="select-body">
        <div class="search-bar">
          <mat-icon class="search-icon">search</mat-icon>
          <input
            [formControl]="searchControl"
            placeholder="Search by name..."
            class="search-input"
          />
          <mat-icon *ngIf="searchControl.value" class="clear-icon" (click)="searchControl.setValue('')">close</mat-icon>
        </div>
        <div class="character-grid">
          <div
            *ngFor="let character of filteredCharacters | async; trackBy: trackById"
            class="char-card"
            [class.selected]="isSelected(character)"
            (click)="selectCharacter(character)"
          >
            <div class="char-avatar">
              <img
                [src]="getCharacterImagePath(character.image)"
                [alt]="character.name"
                loading="lazy"
              />
              <div class="check-overlay" *ngIf="multiSelect && isSelected(character)">
                <mat-icon>{{ mode === 'exclude' ? 'close' : 'check' }}</mat-icon>
              </div>
              <div class="aff-badge" *ngIf="hasAffinityContext && character.affinity != null"
                   [class.has-affinity]="character.affinity > 0">
                <mat-icon>favorite</mat-icon>{{ character.affinity }}
              </div>
            </div>
            <span class="char-name">{{ character.name }}</span>
          </div>
        </div>
      </mat-dialog-content>
      <div class="select-footer" *ngIf="multiSelect">
        <button class="confirm-btn" (click)="confirmSelection()" [disabled]="selectedCharacters.length === 0">
          <mat-icon>check</mat-icon>
          Add {{ selectedCharacters.length }} Character{{ selectedCharacters.length !== 1 ? 's' : '' }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .select-dialog {
        display: flex;
        flex-direction: column;
        max-height: 80vh;
        background: #141414;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
        color: #e0e0e0;
        width: 100%;
      }
      .select-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 18px;
        background: #1a1a1a;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        flex-shrink: 0;
        .select-header-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
          color: #64b5f6;
        }
        .select-header-title {
          font-size: 15px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
        }
        .close-btn {
          width: 32px;
          height: 32px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.4);
          flex-shrink: 0;
          ::ng-deep .mat-mdc-button-touch-target {
            width: 32px;
            height: 32px;
          }
          mat-icon {
            font-size: 18px;
            width: 18px;
            height: 18px;
            margin: 0;
          }
          &:hover {
            color: rgba(255, 255, 255, 0.8);
            background: rgba(255, 255, 255, 0.06);
          }
        }
      }
      .sort-btn {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 6px 4px 8px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.75);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
          color: rgba(255, 255, 255, 0.5);
        }
        .sort-btn-caret {
          margin-left: -2px;
          font-size: 18px;
          width: 18px;
          height: 18px;
        }
        &:hover {
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.9);
        }
      }
      .select-body {
        padding: 12px !important;
        margin: 0;
        background: #141414;
        overflow-y: auto;
        flex: 1;
        max-height: none;
        &::-webkit-scrollbar {
          width: 6px;
        }
        &::-webkit-scrollbar-track {
          background: transparent;
        }
        &::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.12);
          border-radius: 3px;
          &:hover {
            background: rgba(255, 255, 255, 0.2);
          }
        }
      }
      .search-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        margin-bottom: 16px;
        transition: all 0.2s;
        &:focus-within {
          border-color: rgba(100, 181, 246, 0.4);
          background: rgba(255, 255, 255, 0.06);
          box-shadow: 0 0 0 3px rgba(100, 181, 246, 0.08);
        }
        .search-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
          color: rgba(255, 255, 255, 0.3);
          flex-shrink: 0;
        }
        .search-input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          color: rgba(255, 255, 255, 0.9);
          font-size: 14px;
          padding: 4px 0;
          &::placeholder {
            color: rgba(255, 255, 255, 0.25);
          }
        }
        .clear-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
          color: rgba(255, 255, 255, 0.3);
          cursor: pointer;
          flex-shrink: 0;
          &:hover {
            color: rgba(255, 255, 255, 0.6);
          }
        }
      }
      .character-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
        gap: 4px;
      }
      .char-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        padding: 8px 4px 6px;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.15s ease;
        border: 1px solid transparent;
        position: relative;
        &:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(100, 181, 246, 0.3);
          .char-avatar img {
            transform: scale(1.15);
          }
        }
        &.selected {
          background: rgba(100, 181, 246, 0.08);
          border-color: rgba(100, 181, 246, 0.4);
          .char-avatar {
            border-color: rgba(100, 181, 246, 0.6);
          }
          .char-name {
            color: rgba(255, 255, 255, 0.9);
          }
        }
        &:active {
          transform: scale(0.97);
        }
        .char-avatar {
          width: 66px;
          height: 66px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.3);
          border: 2px solid rgba(255, 255, 255, 0.08);
          flex-shrink: 0;
          position: relative;
          img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.2s ease;
            border-radius: 50%;
          }
          .check-overlay {
            position: absolute;
            inset: 0;
            background: rgba(33, 150, 243, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            mat-icon {
              font-size: 24px;
              width: 24px;
              height: 24px;
              color: white;
            }
          }
        }
        .aff-badge {
          position: absolute;
          bottom: -4px;
          right: -4px;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 2px 6px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 700;
          line-height: 1;
          background: #1e1e1e;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.4);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5), 0 0 0 2px #141414;
          pointer-events: none;
          z-index: 2;
          mat-icon {
            font-size: 11px !important;
            width: 11px !important;
            height: 11px !important;
          }
          &.has-affinity {
            color: #ff5c8a;
            background: #1a1a1a;
            border-color: rgba(233, 30, 99, 0.55);
            mat-icon { color: #ff5c8a; }
          }
        }
        .char-name {
          font-size: 12px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.7);
          text-align: center;
          line-height: 1.3;
          word-break: break-word;
          overflow-wrap: break-word;
          max-width: 100%;
        }
      }
      @media (max-width: 600px) {
        .select-dialog {
          min-width: auto;
          max-width: 100%;
          max-height: calc(100vh - 48px);
          border-radius: 12px;
        }
        .select-header {
          padding: 10px 12px;
          gap: 8px;
        }
        .sort-btn .sort-btn-label { display: none; }
        .select-body {
          padding: 8px !important;
        }
        .character-grid {
          grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
          gap: 2px;
        }
        .char-card {
          padding: 6px 2px 5px;
          .char-avatar {
            width: 62px;
            height: 62px;
          }
          .char-name {
            font-size: 11px;
          }
        }
        .search-bar {
          margin-bottom: 10px;
        }
      }
      // Include mode theming
      .select-dialog.mode-include {
        .select-header {
          border-bottom-color: rgba(129, 199, 132, 0.2);
          .select-header-icon {
            color: #81c784;
          }
        }
        .selected-count {
          color: #81c784;
          background: rgba(129, 199, 132, 0.1);
        }
        .char-card.selected {
          background: rgba(129, 199, 132, 0.08);
          border-color: rgba(129, 199, 132, 0.4);
          .char-avatar {
            border-color: rgba(129, 199, 132, 0.6);
          }
        }
        .char-card:hover {
          border-color: rgba(129, 199, 132, 0.3);
        }
        .check-overlay {
          background: rgba(76, 175, 80, 0.5) !important;
        }
        .confirm-btn {
          background: #4caf50;
          &:hover {
            background: #43a047;
            box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
          }
        }
        .search-bar:focus-within {
          border-color: rgba(129, 199, 132, 0.4);
          box-shadow: 0 0 0 3px rgba(129, 199, 132, 0.08);
        }
      }
      // Exclude mode theming
      .select-dialog.mode-exclude {
        .select-header {
          border-bottom-color: rgba(239, 83, 80, 0.2);
          .select-header-icon {
            color: #ef5350;
          }
        }
        .selected-count {
          color: #ef9a9a;
          background: rgba(244, 67, 54, 0.1);
        }
        .char-card.selected {
          background: rgba(244, 67, 54, 0.08);
          border-color: rgba(239, 83, 80, 0.4);
          .char-avatar {
            border-color: rgba(239, 83, 80, 0.6);
          }
        }
        .char-card:hover {
          border-color: rgba(239, 83, 80, 0.3);
        }
        .check-overlay {
          background: rgba(244, 67, 54, 0.5) !important;
        }
        .confirm-btn {
          background: #f44336;
          &:hover {
            background: #e53935;
            box-shadow: 0 4px 12px rgba(244, 67, 54, 0.3);
          }
        }
        .search-bar:focus-within {
          border-color: rgba(239, 83, 80, 0.4);
          box-shadow: 0 0 0 3px rgba(239, 83, 80, 0.08);
        }
      }
      .selected-count {
        font-size: 12px;
        font-weight: 600;
        color: #64b5f6;
        background: rgba(100, 181, 246, 0.1);
        padding: 3px 10px;
        border-radius: 12px;
      }
      .select-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 12px 18px;
        background: #1a1a1a;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        flex-shrink: 0;
      }
      .confirm-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 20px;
        border: none;
        border-radius: 8px;
        background: #2196f3;
        color: white;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }
        &:hover {
          background: #1e88e5;
          box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
        }
        &:disabled {
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.3);
          cursor: not-allowed;
          box-shadow: none;
        }
      }
    `,
  ],
})
export class CharacterSelectDialogComponent implements OnInit {
  searchControl = new FormControl('');
  characters: Character[] = [];
  filteredCharacters!: Observable<DisplayCharacter[]>;
  multiSelect = false;
  selectedCharacters: Character[] = [];
  existingIds: number[] = [];
  excludeIds: Set<number> = new Set();
  excludeBaseCharaIds: Set<number> = new Set();
  mode: CharacterSelectMode = 'target';
  affinityTargetIds: number[] = [];
  hasAffinityTarget = false;
  hasAffinityContext = false;
  slotPosition: PlannerSlotPosition | null = null;
  slotTreeSlots: TreeSlots | null = null;
  raceWinsByPosition: PlannerRaceWins = {};

  sort: CharacterSelectSort = 'default';
  private sort$ = new BehaviorSubject<CharacterSelectSort>('default');

  constructor(
    private characterService: CharacterService,
    private affinityService: AffinityService,
    private cdr: ChangeDetectorRef,
    private dialogRef: MatDialogRef<CharacterSelectDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CharacterSelectDialogData | null
  ) {
    if (data) {
      this.multiSelect = !!data.multiSelect;
      this.existingIds = data.existingIds || [];
      this.mode = data.mode || 'target';
      this.affinityTargetIds = (data.affinityTargetIds || []).filter(id => id != null);
      this.slotPosition = data.slotPosition ?? null;
      this.slotTreeSlots = data.treeSlots ?? null;
      this.raceWinsByPosition = data.raceWinsByPosition ?? {};
    }
    this.hasAffinityTarget = this.affinityTargetIds.length > 0;
    this.hasAffinityContext = this.hasAffinityTarget || (!!this.slotPosition && !!this.slotTreeSlots);
    this.excludeIds = new Set(this.data?.excludeIds ?? []);
    for (const id of this.excludeIds) {
      if (id <= 0) continue;
      this.excludeBaseCharaIds.add(id >= 100000 ? Math.floor(id / 100) : id);
    }
    if (this.hasAffinityContext) {
      // Default to affinity sort whenever a target is provided.
      this.sort = 'affinity';
      this.sort$.next('affinity');
      // Ensure affinity data is loaded; re-trigger the pipeline once ready.
      this.affinityService.load().subscribe(() => {
        this.sort$.next(this.sort);
        this.cdr.markForCheck();
      });
    }
  }

  ngOnInit() {
    this.characterService
      .getReleasedCharacters()
      .subscribe((characters: Character[]) => {
        this.characters = characters;
        this.sort$.next(this.sort);
        this.cdr.markForCheck();
      });

    this.filteredCharacters = combineLatest([
      this.searchControl.valueChanges.pipe(startWith(this.searchControl.value || '')),
      this.sort$,
    ]).pipe(
      map(([value, sort]) => this.computeList(value || '', sort))
    );
  }

  private computeList(value: string, sort: CharacterSelectSort): DisplayCharacter[] {
    const q = value.toLowerCase();
    let list: DisplayCharacter[] = this.characters.filter(
      (character) =>
        (character.name.toLowerCase().includes(q) ||
        character.id.toString().includes(q)) &&
        !this.isExcludedCharacter(character.id)
    );

    // Always score affinity when a target is provided so the badge can render
    // regardless of the active sort mode.
    if (this.hasAffinityContext && this.affinityService.isReady) {
      list = list.map(c => ({ ...c, affinity: this.scoreAffinity(c.id) }));
    }

    if (sort === 'affinity' && this.hasAffinityContext && this.affinityService.isReady) {
      list.sort((a, b) => (b.affinity ?? -1) - (a.affinity ?? -1));
    } else if (sort === 'name') {
      list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
    }
    // 'default' = preserve service order (release-date / id ordering)
    return list;
  }

  private isExcludedCharacter(characterId: number): boolean {
    return this.excludeBaseCharaIds.has(Math.floor(characterId / 100));
  }

  private scoreAffinity(charaIdWithVariant: number): number {
    const baseId = Math.floor(charaIdWithVariant / 100);

    // Slot-aware score for lineage planner so the picker displays the same
    // affinity logic users see once the character is placed in that slot.
    if (this.slotPosition && this.slotTreeSlots && this.affinityService.isReady) {
      return this.affinityService.scorePlannerSlot(
        this.slotPosition,
        baseId,
        this.slotTreeSlots,
        this.raceWinsByPosition,
      );
    }

    let total = 0;
    for (const t of this.affinityTargetIds) {
      total += this.affinityService.getAff2(baseId, t);
    }
    return total;
  }

  setSort(sort: CharacterSelectSort) {
    if (sort === 'affinity' && !this.hasAffinityContext) return;
    this.sort = sort;
    this.sort$.next(sort);
  }

  sortLabel(sort: CharacterSelectSort): string {
    switch (sort) {
      case 'name': return 'Name';
      case 'affinity': return 'Affinity';
      default: return 'Default';
    }
  }

  trackById = (_: number, c: DisplayCharacter) => c.id;

  selectCharacter(character: Character) {
    if (this.multiSelect) {
      const idx = this.selectedCharacters.findIndex(c => c.id === character.id);
      if (idx >= 0) {
        this.selectedCharacters.splice(idx, 1);
      } else {
        this.selectedCharacters.push(character);
      }
      this.cdr.markForCheck();
    } else {
      this.dialogRef.close(character);
    }
  }

  confirmSelection() {
    this.dialogRef.close(this.selectedCharacters);
  }

  isSelected(character: Character): boolean {
    return this.selectedCharacters.some(c => c.id === character.id) ||
           this.existingIds.includes(character.id);
  }

  close() {
    this.dialogRef.close();
  }

  getCharacterImagePath(imageName: string): string {
    return `assets/images/character_stand/${imageName}`;
  }
}
