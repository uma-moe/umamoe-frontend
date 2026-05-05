import { Component, Inject, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface TreeSaveEntry {
  name: string;
  /** Number of populated nodes in the saved tree (for display only). */
  nodeCount: number;
}

export interface TreeSavesDialogData {
  /** List of currently saved trees (sorted alphabetically). */
  saves: TreeSaveEntry[];
  /** Whether the live tree currently has any content (controls Save button enable). */
  hasCurrent: boolean;
}

export type TreeSavesDialogResult =
  | { action: 'save'; name: string }
  | { action: 'load'; name: string }
  | { action: 'delete'; name: string }
  | { action: 'export-clipboard' }
  | { action: 'export-file' }
  | { action: 'import-clipboard' }
  | { action: 'import-file'; file: File }
  | null;

@Component({
  selector: 'app-tree-saves-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatDialogModule, MatIconModule, MatTooltipModule],
  template: `
    <div class="saves-dialog">
      <div class="dialog-header">
        <mat-icon class="header-icon">account_tree</mat-icon>
        <span class="header-title">Lineage Trees</span>
        <button class="close-btn" (click)="close()" matTooltip="Close">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="dialog-body">
        <!-- Save section -->
        <div class="section">
          <div class="section-label">
            <mat-icon>save</mat-icon>
            <span>Save current tree</span>
          </div>
          <div class="save-row">
            <input #nameInput type="text" class="text-input" placeholder="Tree name"
                   [(ngModel)]="newName" (keydown.enter)="confirmSave()" maxlength="60" />
            <button class="primary-btn" (click)="confirmSave()"
                    [disabled]="!data.hasCurrent || !newName.trim()">
              <mat-icon>save</mat-icon>
              <span>Save</span>
            </button>
          </div>
          <p class="hint" *ngIf="!data.hasCurrent">Tree is empty — nothing to save yet.</p>
          <p class="hint" *ngIf="willOverwrite()">A save with this name already exists. It will be overwritten.</p>
        </div>

        <!-- Load section -->
        <div class="section">
          <div class="section-label">
            <mat-icon>folder_open</mat-icon>
            <span>Saved trees ({{ data.saves.length }})</span>
          </div>
          <div class="saves-list" *ngIf="data.saves.length > 0; else emptyList">
            <div class="save-item" *ngFor="let s of data.saves" (click)="confirmLoad(s.name)">
              <mat-icon class="item-icon">account_tree</mat-icon>
              <div class="item-meta">
                <span class="item-name">{{ s.name }}</span>
                <span class="item-sub">{{ s.nodeCount }} node{{ s.nodeCount === 1 ? '' : 's' }}</span>
              </div>
              <button class="icon-btn danger" (click)="confirmDelete(s.name, $event)" matTooltip="Delete">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          </div>
          <ng-template #emptyList>
            <p class="empty">No saved trees yet.</p>
          </ng-template>
        </div>

        <!-- Share section -->
        <div class="section">
          <div class="section-label">
            <mat-icon>share</mat-icon>
            <span>Share &amp; transfer</span>
          </div>
          <div class="action-grid">
            <button class="action-btn" (click)="exportClipboard()" [disabled]="!data.hasCurrent">
              <mat-icon>content_copy</mat-icon>
              <span class="btn-label">Copy share string</span>
              <span class="btn-sub">Send via chat or notes</span>
            </button>
            <button class="action-btn" (click)="exportFile()" [disabled]="!data.hasCurrent">
              <mat-icon>download</mat-icon>
              <span class="btn-label">Download .json</span>
              <span class="btn-sub">Save as a file</span>
            </button>
            <button class="action-btn" (click)="importClipboard()">
              <mat-icon>content_paste</mat-icon>
              <span class="btn-label">Paste share string</span>
              <span class="btn-sub">Replaces current tree</span>
            </button>
            <button class="action-btn" (click)="triggerFile()">
              <mat-icon>upload</mat-icon>
              <span class="btn-label">Import .json</span>
              <span class="btn-sub">Load a file</span>
            </button>
          </div>
          <input #fileInput type="file" accept=".json,application/json"
                 style="display:none" (change)="onFileSelected($event)" />
        </div>
      </div>
    </div>
  `,
  styles: [`
    .saves-dialog {
      background: #1e1e1e;
      border-radius: 12px;
      width: 100%;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      color: rgba(255, 255, 255, 0.9);
    }
    .dialog-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 12px 12px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      flex-shrink: 0;
      .header-icon {
        color: #64b5f6;
        width: 20px;
        transform: scale(0.8333);
      }
      .header-title {
        flex: 1;
        font-size: 15px;
        font-weight: 600;
        color: #fff;
      }
      .close-btn {
        display: flex; align-items: center; justify-content: center;
        width: 28px; height: 28px;
        border-radius: 6px; border: none;
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer; padding: 0;
        transition: all 0.15s;
        mat-icon { width: 18px; transform: scale(0.75); }
        &:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
      }
    }
    .dialog-body {
      padding: 16px;
      overflow-y: auto;
      flex: 1;
      display: flex; flex-direction: column;
      gap: 18px;
      &::-webkit-scrollbar { width: 4px; }
      &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
    }
    .section {
      display: flex; flex-direction: column;
      gap: 8px;
    }
    .section-label {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 600;
      color: rgba(255, 255, 255, 0.5);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      mat-icon {
        width: 14px;
        transform: scale(0.5833);
        color: #64b5f6;
      }
    }
    .hint {
      margin: 0;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.45);
    }
    .empty {
      margin: 0;
      padding: 16px;
      text-align: center;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.4);
      background: rgba(255, 255, 255, 0.03);
      border: 1px dashed rgba(255, 255, 255, 0.08);
      border-radius: 8px;
    }

    /* Save row */
    .save-row {
      display: flex;
      gap: 8px;
      align-items: stretch;
    }
    .text-input {
      flex: 1;
      min-width: 0;
      height: 36px;
      padding: 0 12px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: rgba(255, 255, 255, 0.9);
      font-size: 13px;
      outline: none;
      transition: all 0.15s;
      &::placeholder { color: rgba(255, 255, 255, 0.35); }
      &:hover { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.2); }
      &:focus { border-color: #64b5f6; box-shadow: 0 0 0 2px rgba(100, 181, 246, 0.15); }
    }
    .primary-btn {
      display: inline-flex; align-items: center; gap: 6px;
      height: 36px;
      padding: 0 14px;
      border: none;
      border-radius: 6px;
      background: rgba(100, 181, 246, 0.18);
      color: #64b5f6;
      font-size: 13px; font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      mat-icon { width: 16px; transform: scale(0.6667); }
      &:hover:not(:disabled) { background: rgba(100, 181, 246, 0.28); }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }

    /* Saves list */
    .saves-list {
      display: flex; flex-direction: column;
      gap: 4px;
      max-height: 240px;
      overflow-y: auto;
      &::-webkit-scrollbar { width: 4px; }
      &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
    }
    .save-item {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 10px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
      &:hover {
        background: rgba(100, 181, 246, 0.08);
        border-color: rgba(100, 181, 246, 0.25);
      }
      .item-icon {
        width: 18px;
        transform: scale(0.75);
        color: rgba(255, 255, 255, 0.4);
        flex-shrink: 0;
      }
      .item-meta {
        flex: 1; min-width: 0;
        display: flex; flex-direction: column;
      }
      .item-name {
        font-size: 13px; font-weight: 500;
        color: rgba(255, 255, 255, 0.9);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .item-sub {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.4);
      }
    }
    .icon-btn {
      display: flex; align-items: center; justify-content: center;
      width: 28px; height: 28px;
      border: none; border-radius: 6px;
      background: transparent;
      color: rgba(255, 255, 255, 0.4);
      cursor: pointer;
      transition: all 0.15s;
      padding: 0;
      mat-icon { width: 16px; transform: scale(0.6667); }
      &.danger:hover {
        background: rgba(244, 67, 54, 0.15);
        color: #f44336;
      }
    }

    /* Action grid */
    .action-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    .action-btn {
      display: flex; flex-direction: column; align-items: flex-start;
      gap: 2px;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      color: rgba(255, 255, 255, 0.85);
      cursor: pointer;
      text-align: left;
      transition: all 0.15s;
      mat-icon {
        width: 18px;
        transform: scale(0.75);
        color: #64b5f6;
        margin-bottom: 2px;
      }
      .btn-label {
        font-size: 13px; font-weight: 600;
      }
      .btn-sub {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.45);
      }
      &:hover:not(:disabled) {
        background: rgba(100, 181, 246, 0.08);
        border-color: rgba(100, 181, 246, 0.25);
      }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }

    @media (max-width: 600px) {
      .action-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class TreeSavesDialogComponent {
  newName = '';
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  constructor(
    public dialogRef: MatDialogRef<TreeSavesDialogComponent, TreeSavesDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: TreeSavesDialogData,
    private cdr: ChangeDetectorRef,
  ) {}

  willOverwrite(): boolean {
    const t = this.newName.trim();
    return !!t && this.data.saves.some(s => s.name === t);
  }

  close(): void { this.dialogRef.close(null); }

  confirmSave(): void {
    const name = this.newName.trim();
    if (!name || !this.data.hasCurrent) return;
    this.dialogRef.close({ action: 'save', name });
  }

  confirmLoad(name: string): void {
    this.dialogRef.close({ action: 'load', name });
  }

  confirmDelete(name: string, event: Event): void {
    event.stopPropagation();
    // Caller is responsible for any confirmation; emit and let parent re-open
    // the dialog with refreshed data if it wants to.
    this.dialogRef.close({ action: 'delete', name });
  }

  exportClipboard(): void { this.dialogRef.close({ action: 'export-clipboard' }); }
  exportFile(): void { this.dialogRef.close({ action: 'export-file' }); }
  importClipboard(): void { this.dialogRef.close({ action: 'import-clipboard' }); }

  triggerFile(): void {
    this.fileInput.nativeElement.value = '';
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.dialogRef.close({ action: 'import-file', file });
  }
}
