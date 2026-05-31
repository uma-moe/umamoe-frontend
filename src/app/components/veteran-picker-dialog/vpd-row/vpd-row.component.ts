import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, HostListener, OnChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { getStarDisplay } from '../../../pages/profile/profile-helpers';
import { VeteranMember } from '../../../models/profile.model';
import { LineageDisplayComponent } from '../../lineage-display/lineage-display.component';

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
  /** Full veteran source used for compact planner-style lineage display. */
  lineageVeteran?: VeteranMember;
  lineageTargetCharaId?: number | null;
}

@Component({
  selector: 'app-vpd-row',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule, LineageDisplayComponent],
  templateUrl: './vpd-row.component.html',
  styleUrls: ['./vpd-row.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VpdRowComponent implements OnChanges {
  @Input() data!: VpdRowData;

  @Output() rowClick = new EventEmitter<void>();
  @Output() editClick = new EventEmitter<void>();
  @Output() deleteClick = new EventEmitter<MouseEvent>();

  readonly getStarDisplay = getStarDisplay;
  displayStars: ReturnType<typeof getStarDisplay> = [];
  visibleSparks: VpdResolvedSpark[] = [];
  private readonly visibleParentSparkCache = new WeakMap<VpdResolvedSpark[], VpdResolvedSpark[]>();

  ngOnChanges(): void {
    this.displayStars = this.data?.rarity ? getStarDisplay(this.data.rarity) : [];
    this.visibleSparks = this.data?.sparks?.length > 16 ? this.data.sparks.slice(0, 16) : (this.data?.sparks ?? []);
  }

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

  visibleParentSparks(parent: VpdResolvedParent): VpdResolvedSpark[] {
    const sparks = parent.sparks;
    if (sparks.length <= 8) return sparks;
    const cached = this.visibleParentSparkCache.get(sparks);
    if (cached) return cached;
    const visible = sparks.slice(0, 8);
    this.visibleParentSparkCache.set(sparks, visible);
    return visible;
  }

  trackByStar(index: number): number {
    return index;
  }

  trackBySpark(_: number, spark: VpdResolvedSpark): string {
    return `${spark.factorId}:${spark.level}:${spark.color}`;
  }

  trackByParent(_: number, parent: VpdResolvedParent): string {
    return parent.position;
  }
}
