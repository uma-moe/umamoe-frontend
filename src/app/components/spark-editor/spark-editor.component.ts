import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef,
  ViewChild, ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { OverlayModule, ConnectedPosition } from '@angular/cdk/overlay';
import { FactorService, Factor, SparkInfo } from '../../services/factor.service';

@Component({
  selector: 'app-spark-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, OverlayModule],
  templateUrl: './spark-editor.component.html',
  styleUrls: ['./spark-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SparkEditorComponent {
  /** Current sparks list – treated as immutable input. */
  @Input() sparks: SparkInfo[] = [];

  /**
   * Whether to render the existing spark chips inside this component.
   * Set to `false` when the parent already renders its own chip display
   * (e.g. lineage-planner node cards) and only the "add" editor is needed.
   */
  @Input() showChips = true;

  /** Emitted whenever the sparks list changes (add or remove). */
  @Output() sparksChange = new EventEmitter<SparkInfo[]>();

  @ViewChild('anchor') anchorEl?: ElementRef<HTMLElement>;

  readonly overlayPositions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top',    offsetY: 2 },
    { originX: 'start', originY: 'top',    overlayX: 'start', overlayY: 'bottom', offsetY: -2 },
  ];

  panelWidth = 220;

  searchQuery = '';
  searchResults: Factor[] = [];
  addLevel = 3;
  isOpen = false;

  constructor(
    private factorService: FactorService,
    private cdr: ChangeDetectorRef,
  ) {}

  // ── Display helpers ───────────────────────────────────────────────────────

  chipClass(spark: SparkInfo): string {
    return this.colorClass(spark.type);
  }

  typeClass(type: number): string {
    return this.colorClass(type);
  }

  colorClass(type: number): string {
    if (type === 0) return 'blue-spark';
    if (type === 1) return 'pink-spark';
    if (type === 5) return 'green-spark';
    return 'white-spark';
  }

  typeLabelByType(type: number): string {
    switch (type) {
      case 0: return 'Stat';
      case 1: return 'Aptitude';
      case 5: return 'Unique Skill';
      case 2: return 'Race';
      case 3: return 'Skill';
      case 4: return 'Scenario';
      default: return 'Skill';
    }
  }

  toggleOpen(event: Event): void {
    event.stopPropagation();
    this.isOpen = !this.isOpen;
    if (!this.isOpen) {
      this.searchQuery = '';
      this.searchResults = [];
    }
    this.cdr.markForCheck();
  }

  closeEditor(): void {
    this.isOpen = false;
    this.searchQuery = '';
    this.searchResults = [];
    this.cdr.markForCheck();
  }

  starLabel(level: number): string {
    return level + '★';
  }

  // ── Search ────────────────────────────────────────────────────────────────

  search(query: string): void {
    this.searchQuery = query;
    if (this.anchorEl) {
      this.panelWidth = this.anchorEl.nativeElement.getBoundingClientRect().width;
    }
    if (!query.trim()) {
      this.searchResults = [];
      this.cdr.markForCheck();
      return;
    }
    const q = query.toLowerCase();
    this.searchResults = this.factorService.getAllFactors()
      .filter(f => f.text.toLowerCase().includes(q))
      .slice(0, 20);
    this.cdr.markForCheck();
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  addSpark(factor: Factor, event: Event): void {
    event.stopPropagation();
    const spark: SparkInfo = {
      factorId: factor.id,
      level: this.addLevel,
      name: factor.text,
      type: factor.type,
    };
    this.sparksChange.emit([...this.sparks, spark]);
    this.searchQuery = '';
    this.searchResults = [];
    this.isOpen = false;
    this.cdr.markForCheck();
  }

  removeSpark(index: number, event: Event): void {
    event.stopPropagation();
    this.sparksChange.emit(this.sparks.filter((_, i) => i !== index));
    this.cdr.markForCheck();
  }

  setLevel(level: number, event: Event): void {
    event.stopPropagation();
    this.addLevel = level;
    this.cdr.markForCheck();
  }
}
