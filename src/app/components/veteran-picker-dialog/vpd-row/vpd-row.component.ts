import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { getStarDisplay } from '../../../pages/profile/profile-helpers';

export interface VpdResolvedSpark {
  factorId: string;
  level: number;
  name: string;
  color: 'blue' | 'pink' | 'green' | 'white';
}

export interface VpdResolvedParent {
  name: string;
  position: string;
  sparks: VpdResolvedSpark[];
}

export interface VpdRowData {
  imageUrl: string;
  name: string;
  /** Trainer name / entry label shown as a pill under the name */
  subtitle?: string;
  /** Scenario tag text (shown as sm-tag chip) */
  tag?: string;
  /** Rarity for star display */
  rarity?: number | null;
  /** Affinity value; 0 or undefined → hidden */
  affinity?: number;
  sparks: VpdResolvedSpark[];
  parents: VpdResolvedParent[];
  sparkSums: { blue: number; pink: number; green: number };
  /** Show delete action button */
  showActions?: boolean;
  /** Show edit action button (manual entries only) */
  showEdit?: boolean;
}

@Component({
  selector: 'app-vpd-row',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  templateUrl: './vpd-row.component.html',
  styleUrls: ['./vpd-row.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VpdRowComponent {
  @Input() data!: VpdRowData;

  @Output() rowClick = new EventEmitter<void>();
  @Output() editClick = new EventEmitter<void>();
  @Output() deleteClick = new EventEmitter<MouseEvent>();

  readonly getStarDisplay = getStarDisplay;

  @HostListener('click')
  onHostClick(): void {
    this.rowClick.emit();
  }

  onImgError(event: Event): void {
    (event.target as HTMLImageElement).src = '';
  }

  stopProp(event: MouseEvent): void {
    event.stopPropagation();
  }
}
