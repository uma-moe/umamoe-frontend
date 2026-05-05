import { Component, Inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Visual variant — 'danger' uses red accent. */
  variant?: 'default' | 'danger';
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatDialogModule, MatIconModule],
  template: `
    <div class="confirm-dialog" [class.danger]="data.variant === 'danger'">
      <div class="dialog-header">
        <mat-icon class="header-icon">{{ data.variant === 'danger' ? 'warning' : 'help_outline' }}</mat-icon>
        <span class="header-title">{{ data.title }}</span>
      </div>
      <div class="dialog-body">
        <p class="message">{{ data.message }}</p>
      </div>
      <div class="dialog-footer">
        <button class="cancel-btn" (click)="dialogRef.close(false)">
          {{ data.cancelLabel || 'Cancel' }}
        </button>
        <button class="confirm-btn" (click)="dialogRef.close(true)" cdkFocusInitial>
          {{ data.confirmLabel || 'Confirm' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .confirm-dialog {
      background: #1e1e1e;
      border-radius: 12px;
      width: 100%;
      max-width: 420px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      color: rgba(255, 255, 255, 0.9);
    }
    .dialog-header {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      .header-icon {
        width: 20px;
        transform: scale(0.8333);
        color: #64b5f6;
      }
      .header-title {
        font-size: 15px; font-weight: 600; color: #fff;
      }
    }
    .dialog-body {
      padding: 16px;
      .message {
        margin: 0;
        font-size: 13px;
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.75);
      }
    }
    .dialog-footer {
      padding: 12px 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex; justify-content: flex-end;
      gap: 8px;
      .cancel-btn, .confirm-btn {
        height: 32px;
        padding: 0 16px;
        border-radius: 6px;
        font-size: 13px; font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
      }
      .cancel-btn {
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: transparent;
        color: rgba(255, 255, 255, 0.5);
        &:hover {
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.85);
        }
      }
      .confirm-btn {
        border: none;
        background: rgba(100, 181, 246, 0.18);
        color: #64b5f6;
        &:hover { background: rgba(100, 181, 246, 0.28); }
      }
    }

    .confirm-dialog.danger {
      .dialog-header .header-icon { color: #ef5350; }
      .dialog-footer .confirm-btn {
        background: rgba(244, 67, 54, 0.18);
        color: #ef5350;
        &:hover { background: rgba(244, 67, 54, 0.28); }
      }
    }
  `]
})
export class ConfirmDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData,
  ) {}
}
