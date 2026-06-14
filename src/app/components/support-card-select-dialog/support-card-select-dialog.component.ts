import { CommonModule } from '@angular/common';
import { Component, Inject, Input, OnInit, Optional } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Rarity, SupportCardShort, SupportCardType } from '../../models/support-card.model';
import { SupportCardService } from '../../services/support-card.service';
import { ResourceLoadError } from '../../services/resource-data.service';

export interface SupportCardSelectDialogData {
  initialCard?: SupportCardShort | null;
}

@Component({
  selector: 'app-support-card-select-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  template: `
    <div class="select-dialog">
      <div class="select-header">
        <mat-icon class="select-header-icon">style</mat-icon>
        <span class="select-header-title">Select Support Card</span>
        <button mat-icon-button class="close-btn" (click)="cancel()">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <mat-dialog-content class="select-body">
        <div class="search-bar">
          <mat-icon class="search-icon">search</mat-icon>
          <input
            [formControl]="searchControl"
            (input)="filterCards()"
            placeholder="Search by name..."
            class="search-input"
          />
          <mat-icon *ngIf="searchControl.value" class="clear-icon" (click)="searchControl.setValue(''); filterCards()">close</mat-icon>
        </div>
        <div class="resource-status" *ngIf="resourcesPending$ | async">
          <mat-progress-spinner
            class="resource-spinner"
            mode="indeterminate"
            [diameter]="16"
            [strokeWidth]="2"
          ></mat-progress-spinner>
          <span>{{ (resourcesUsingCachedData$ | async) ? 'Using cached resources; refreshing...' : 'Still fetching resources...' }}</span>
        </div>
        <div class="resource-error" *ngIf="resourcesError$ | async as resourceError">
          <mat-icon>error_outline</mat-icon>
          <div>
            <span>{{ (resourcesUsingCachedData$ | async) ? 'Resource refresh failed' : 'Resource fetch failed' }}</span>
            <code>{{ formatResourceError(resourceError) }}</code>
          </div>
        </div>
        <div class="quick-filters">
          <mat-form-field appearance="fill" class="filter-field">
            <mat-label>Type</mat-label>
            <mat-select [formControl]="typeControl" (selectionChange)="filterCards()">
              <mat-option value="">All</mat-option>
              <mat-option *ngFor="let type of cardTypes" [value]="type.value">
                {{type.label}}
              </mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="fill" class="filter-field">
            <mat-label>Rarity</mat-label>
            <mat-select [formControl]="rarityControl" (selectionChange)="filterCards()">
              <mat-option value="">All</mat-option>
              <mat-option *ngFor="let rarity of rarities" [value]="rarity.value">
                {{rarity.label}}
              </mat-option>
            </mat-select>
          </mat-form-field>
        </div>
        <div class="card-grid">
          <div
            *ngFor="let card of filteredCardsSync"
            class="card-item"
            [class.selected]="selectedCard?.id === card.id"
            (click)="selectCard(card)"
          >
            <div class="card-thumb">
              <img [src]="card.imageUrl" [alt]="card.name" (error)="onImageError($event)">
            </div>
            <span class="card-name">{{card.name}}</span>
            <div class="card-meta">
              <span class="type-badge">{{getTypeDisplayName(card.type)}}</span>
              <span class="rarity-badge">{{getRarityDisplayName(card.rarity)}}</span>
            </div>
          </div>
        </div>
      </mat-dialog-content>
    </div>
  `,
  styleUrls: ['./support-card-select-dialog.component.scss'],
  host: {
    class: 'support-card-select-dialog-page',
  },
})
export class SupportCardSelectDialogComponent implements OnInit {
  @Input() initialCard?: SupportCardShort;

  searchControl = new FormControl('');
  typeControl = new FormControl('');
  rarityControl = new FormControl('');
  supportCards: SupportCardShort[] = [];
  filteredCardsSync: SupportCardShort[] = [];
  selectedCard: SupportCardShort | null = null;
  resourcesPending$!: Observable<boolean>;
  resourcesError$!: Observable<ResourceLoadError | null>;
  resourcesUsingCachedData$!: Observable<boolean>;

  readonly cardTypes = [
    { value: SupportCardType.SPEED, label: 'Speed' },
    { value: SupportCardType.STAMINA, label: 'Stamina' },
    { value: SupportCardType.POWER, label: 'Power' },
    { value: SupportCardType.GUTS, label: 'Guts' },
    { value: SupportCardType.WISDOM, label: 'Wisdom' },
    { value: SupportCardType.FRIEND, label: 'Friend' },
  ];

  readonly rarities = [
    { value: Rarity.R, label: 'R' },
    { value: Rarity.SR, label: 'SR' },
    { value: Rarity.SSR, label: 'SSR' },
  ];

  constructor(
    private dialogRef: MatDialogRef<SupportCardSelectDialogComponent>,
    private supportCardService: SupportCardService,
    @Optional() @Inject(MAT_DIALOG_DATA) private dialogData: SupportCardSelectDialogData | null,
  ) {
    this.resourcesPending$ = this.supportCardService.supportCardsPending$;
    this.resourcesError$ = this.supportCardService.supportCardsError$;
    this.resourcesUsingCachedData$ = this.supportCardService.supportCardsUsingCachedData$;
  }

  ngOnInit(): void {
    this.loadSupportCards();
    this.selectedCard = this.dialogData?.initialCard ?? this.initialCard ?? null;
  }

  private loadSupportCards(): void {
    this.supportCardService.getReleasedSupportCards().subscribe({
      next: (cards: SupportCardShort[]) => {
        this.supportCards = cards;
        this.filterCards();
      },
      error: (error: unknown) => {
        console.error('Error loading support cards:', error);
      },
    });
  }

  private filterBySearch(value: string): SupportCardShort[] {
    if (!value || typeof value !== 'string') {
      return this.applyFilters(this.supportCards);
    }

    const filterValue = value.toLowerCase();
    const filtered = this.supportCards.filter(card =>
      card.name.toLowerCase().includes(filterValue),
    );
    return this.applyFilters(filtered);
  }

  private applyFilters(cards: SupportCardShort[]): SupportCardShort[] {
    let filtered = cards;
    if (this.typeControl.value !== '' && this.typeControl.value !== null) {
      filtered = filtered.filter(card => card.type === Number(this.typeControl.value));
    }

    if (this.rarityControl.value !== '' && this.rarityControl.value !== null) {
      filtered = filtered.filter(card => card.rarity === Number(this.rarityControl.value));
    }

    return filtered.sort((a, b) => {
      if (a.type === SupportCardType.SPEED && b.type !== SupportCardType.SPEED) return -1;
      if (a.type !== SupportCardType.SPEED && b.type === SupportCardType.SPEED) return 1;
      if (a.rarity > b.rarity) return -1;
      if (a.rarity < b.rarity) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  filterCards(): void {
    const searchValue = this.searchControl.value || '';
    this.filteredCardsSync = this.filterBySearch(searchValue);
  }

  selectCard(card: SupportCardShort): void {
    this.selectedCard = card;
    this.confirm();
  }

  getTypeDisplayName(type: SupportCardType): string {
    const typeMap = {
      [SupportCardType.SPEED]: 'Speed',
      [SupportCardType.STAMINA]: 'Stamina',
      [SupportCardType.POWER]: 'Power',
      [SupportCardType.GUTS]: 'Guts',
      [SupportCardType.WISDOM]: 'Wisdom',
      [SupportCardType.FRIEND]: 'Friend',
    };
    return typeMap[type] || 'Unknown';
  }

  getRarityDisplayName(rarity: Rarity): string {
    const rarityMap = {
      [Rarity.R]: 'R',
      [Rarity.SR]: 'SR',
      [Rarity.SSR]: 'SSR',
    };
    return rarityMap[rarity] || 'Unknown';
  }

  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement | null;
    if (target) {
      target.src = 'assets/images/placeholder-card.webp';
    }
  }

  confirm(): void {
    if (this.selectedCard) {
      this.dialogRef.close(this.selectedCard);
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }

  formatResourceError(error: ResourceLoadError): string {
    const parts = [
      `resource=${error.resourceName}`,
      `attempt=${error.attempt}`,
      `time=${error.occurredAt}`,
      `build=${error.buildVersion}`,
      `build_label=${error.buildVersionLabel}`,
      `error=${error.message}`,
    ];
    if (error.url) {
      parts.push(`url=${error.url}`);
    }

    if (error.browserProof) {
      parts.push(`proof_stage=${error.browserProof.stage}`);
      parts.push(`proof_ready=${error.browserProof.ready}`);
      parts.push(`proof_attempt=${error.browserProof.attempt}`);
      parts.push(`proof_updated=${error.browserProof.updatedAt}`);
      parts.push(`proof_mode=${error.browserProof.mode ?? 'unknown'}`);
      if (error.browserProof.elapsedMs != null) {
        parts.push(`proof_elapsed_ms=${error.browserProof.elapsedMs}`);
      }
      if (error.browserProof.error) {
        parts.push(`proof_error=${error.browserProof.error}`);
      }
      if (error.browserProof.errorCode) {
        parts.push(`proof_code=${error.browserProof.errorCode}`);
      }
      if (error.browserProof.message) {
        parts.push(`proof_message=${error.browserProof.message}`);
      }
      parts.push(`turnstile_script_loaded=${error.browserProof.scriptLoaded}`);
      parts.push(`turnstile_token_timeout_ms=${error.browserProof.tokenTimeoutMs}`);
      parts.push(`turnstile_script_timeout_ms=${error.browserProof.scriptTimeoutMs}`);
    }

    return parts.join(' | ');
  }
}
