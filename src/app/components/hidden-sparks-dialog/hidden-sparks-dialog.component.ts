import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  WhiteFactorPickerSelection,
  WhiteFactorTypePickerComponent,
} from '../database-filter/white-factor-type-picker/white-factor-type-picker.component';
import { Factor, FactorService } from '../../services/factor.service';

export interface HiddenSparksDialogData {
  factors: Factor[];
  hiddenFactorIds: number[];
}

@Component({
  selector: 'app-hidden-sparks-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    WhiteFactorTypePickerComponent,
  ],
  templateUrl: './hidden-sparks-dialog.component.html',
  styleUrl: './hidden-sparks-dialog.component.scss',
})
export class HiddenSparksDialogComponent {
  hiddenFactorIds: number[];

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: HiddenSparksDialogData,
    private dialogRef: MatDialogRef<HiddenSparksDialogComponent, number[]>,
    private factorService: FactorService,
  ) {
    this.hiddenFactorIds = this.normalizeIds(data.hiddenFactorIds);
  }

  get hiddenFactorSelections(): readonly { factorId: number }[] {
    return this.hiddenFactorIds.map(factorId => ({ factorId }));
  }

  addFactors(selection: WhiteFactorPickerSelection): void {
    this.hiddenFactorIds = this.normalizeIds([
      ...this.hiddenFactorIds,
      ...selection.factorIds,
    ]);
  }

  removeFactor(factorId: number): void {
    this.hiddenFactorIds = this.hiddenFactorIds.filter(id => id !== factorId);
  }

  clearAll(): void {
    this.hiddenFactorIds = [];
  }

  save(): void {
    this.dialogRef.close(this.hiddenFactorIds);
  }

  getFactorName(factorId: number): string {
    return this.findFactor(factorId)?.text ?? `Factor ${factorId}`;
  }

  getFactorIcon(factorId: number): string | null {
    const factor = this.findFactor(factorId);
    return factor
      ? this.factorService.getFactorImageUrl({
          factorId: String(factor.id),
          level: 1,
          name: factor.text,
          type: factor.type,
        })
      : null;
  }

  trackFactor(_index: number, factorId: number): number {
    return factorId;
  }

  private findFactor(factorId: number): Factor | undefined {
    return this.data.factors.find(factor => Number(factor.id) === factorId);
  }

  private normalizeIds(ids: readonly number[]): number[] {
    return [...new Set(ids.map(Number).filter(id => Number.isFinite(id) && id > 0))]
      .sort((left, right) => left - right);
  }
}
