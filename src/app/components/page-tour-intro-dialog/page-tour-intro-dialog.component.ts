import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export type PageTourIntroDialogResult = 'start' | 'skip';

export interface PageTourIntroDialogData {
  title: string;
  content: string;
}

@Component({
  selector: 'app-page-tour-intro-dialog',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatDialogModule],
  template: `
    <section class="tour-intro" aria-labelledby="tour-intro-title">
      <div class="tour-intro__header">
        <div class="tour-intro__mark" aria-hidden="true">
          <mat-icon>explore</mat-icon>
        </div>

        <div class="tour-intro__heading">
          <div class="tour-intro__eyebrow">Optional guided tour</div>
          <h2 id="tour-intro-title">{{ data.title }}</h2>
        </div>

        <button
          mat-icon-button
          type="button"
          class="tour-intro__close"
          aria-label="Skip tour"
          (click)="close('skip')"
        >
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <p class="tour-intro__body">{{ data.content }}</p>

      <div class="tour-intro__footer">
        <button mat-button type="button" class="tour-intro__skip" (click)="close('skip')">Skip</button>
        <p class="tour-intro__hint">Available later from the ? button.</p>
        <button mat-flat-button color="primary" type="button" class="tour-intro__start" (click)="close('start')">
          Start
          <mat-icon iconPositionEnd>chevron_right</mat-icon>
        </button>
      </div>
    </section>
  `,
  styles: [`
    :host {
      display: block;
      color: var(--text-primary);
    }

    .tour-intro {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 18px;
    }

    .tour-intro__header {
      align-items: center;
      display: grid;
      gap: 12px;
      grid-template-columns: auto 1fr auto;
    }

    .tour-intro__mark {
      align-items: center;
      background: rgba(var(--accent-primary-rgb), 0.1);
      border-radius: 999px;
      color: var(--accent-primary);
      display: flex;
      height: 34px;
      justify-content: center;
      width: 34px;
    }

    .tour-intro__mark mat-icon {
      font-size: 19px;
      height: 19px;
      width: 19px;
    }

    .tour-intro__heading {
      min-width: 0;
    }

    .tour-intro__eyebrow {
      color: var(--text-muted);
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0;
      line-height: 1.2;
      margin-bottom: 3px;
      text-transform: uppercase;
    }

    h2 {
      color: var(--text-primary);
      font-size: 1.08rem;
      font-weight: 700;
      letter-spacing: 0;
      line-height: 1.25;
      margin: 0;
    }

    .tour-intro__close {
      color: var(--text-muted);
      height: 34px;
      margin: -4px -4px 0 0;
      width: 34px;
    }

    .tour-intro__body {
      color: var(--text-primary);
      font-size: 0.94rem;
      line-height: 1.55;
      margin: 0;
    }

    .tour-intro__footer {
      align-items: center;
      border-top: 1px solid var(--border-primary);
      display: grid;
      gap: 12px;
      grid-template-columns: auto minmax(0, 1fr) auto;
      padding-top: 14px;
    }

    .tour-intro__hint {
      color: var(--text-muted);
      font-size: 0.78rem;
      line-height: 1.35;
      margin: 0;
      text-align: center;
    }

    .tour-intro__skip {
      justify-self: start;
    }

    .tour-intro__start {
      justify-self: end;
      white-space: nowrap;
    }

    @media (max-width: 520px) {
      .tour-intro {
        padding: 16px;
      }

      .tour-intro__footer {
        grid-template-columns: 1fr auto;
      }

      .tour-intro__hint {
        grid-column: 1 / -1;
        grid-row: 1;
        text-align: left;
      }

      .tour-intro__skip {
        grid-column: 1;
        grid-row: 2;
      }

      .tour-intro__start {
        grid-column: 2;
        grid-row: 2;
      }
    }
  `],
})
export class PageTourIntroDialogComponent {
  constructor(
    private dialogRef: MatDialogRef<PageTourIntroDialogComponent, PageTourIntroDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: PageTourIntroDialogData,
  ) {}

  close(result: PageTourIntroDialogResult): void {
    this.dialogRef.close(result);
  }
}
