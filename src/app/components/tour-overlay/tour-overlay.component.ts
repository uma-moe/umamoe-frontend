import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TourService, TourStepTemplateComponent } from 'ngx-ui-tour-md-menu';

@Component({
  selector: 'app-tour-overlay',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatCardModule, MatIconModule, TourStepTemplateComponent],
  template: `
    <tour-step-template>
      <ng-template let-step="step">
        <mat-card
          class="umamoe-tour-card"
          (click)="$event.stopPropagation()"
          [style.width]="step.stepDimensions?.width"
          [style.min-width]="step.stepDimensions?.minWidth"
          [style.max-width]="step.stepDimensions?.maxWidth"
        >
          <mat-card-header>
            <div class="header-group">
              <mat-card-title>{{ step.title }}</mat-card-title>
              <button mat-icon-button type="button" class="close" (click)="tourService.end()" aria-label="Close tour">
                <mat-icon>close</mat-icon>
              </button>
            </div>
          </mat-card-header>
          <mat-card-content class="mat-body" [innerHTML]="step.content"></mat-card-content>
          <mat-card-actions [class.no-progress]="!step.showProgress">
            <button mat-button type="button" class="prev" [disabled]="!tourService.hasPrev(step)" (click)="tourService.prev()">
              <mat-icon>chevron_left</mat-icon>
              {{ step.prevBtnTitle }}
            </button>
            <div class="progress" *ngIf="step.showProgress">
              {{ (tourService.steps.indexOf(step) || 0) + 1 }} / {{ tourService.steps.length }}
            </div>
            <button
              *ngIf="tourService.hasNext(step) && !step.nextOnAnchorClick"
              class="next"
              type="button"
              (click)="tourService.next()"
              mat-button
            >
              {{ step.nextBtnTitle }}
              <mat-icon iconPositionEnd>chevron_right</mat-icon>
            </button>
            <button *ngIf="!tourService.hasNext(step)" mat-button type="button" class="next" (click)="tourService.end()">
              {{ step.endBtnTitle }}
            </button>
          </mat-card-actions>
        </mat-card>
      </ng-template>
    </tour-step-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TourOverlayComponent {
  constructor(public readonly tourService: TourService) {}
}
