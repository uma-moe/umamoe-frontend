import {
  Component, Inject, OnInit, OnDestroy,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA, MatDialogRef, MatDialogModule, MatDialog,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSelectModule } from '@angular/material/select';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil, catchError, of } from 'rxjs';
import { VpdRowComponent, VpdRowData, VpdResolvedSpark, VpdResolvedParent } from './vpd-row/vpd-row.component';
import { SparkEditorComponent } from '../spark-editor/spark-editor.component';
import { VeteranMember, FactorInfoEntry, SuccessionChara, VeteranInheritance } from '../../models/profile.model';
import { LinkedAccount } from '../../models/auth.model';
import { Character } from '../../models/character.model';
import { InheritanceRecord } from '../../models/inheritance.model';
import { ProfileService } from '../../services/profile.service';
import { CharacterService } from '../../services/character.service';
import { FactorService, Factor, SparkInfo } from '../../services/factor.service';
import { AffinityService } from '../../services/affinity.service';
import { BookmarkService } from '../../services/bookmark.service';
import { AuthService } from '../../services/auth.service';
import { PartnerService, PartnerInheritance, PartnerLookupEvent } from '../../services/partner.service';
import {
  getCharacterName, getCardImage, getAptGrade,
  getScenarioName, getStarDisplay, getTotalStats,
} from '../../pages/profile/profile-helpers';
import { CharacterSelectDialogComponent } from '../character-select-dialog/character-select-dialog.component';
import { RaceWinPickerDialogComponent, RaceWinPickerDialogData } from '../race-results-dialog/race-win-picker-dialog.component';
import { TreeSlots, SlotName, CandidateScore } from '../../services/affinity.service';

export interface VeteranPickerDialogData {
  linkedAccounts: LinkedAccount[];
  selectedAccountId: string | null;
  characters: Character[];
  veterans: { [accountId: string]: VeteranMember[] };
  loadingVeterans: { [accountId: string]: boolean };
  targetCharaId: number | null;
}

type TabId = 'veterans' | 'bookmarks' | 'saved' | 'manual';
type SortKey = 'total' | 'blue' | 'pink' | 'green' | 'name' | 'affinity';
type SparkColor = 'blue' | 'pink' | 'green';
type FactorColor = 'blue' | 'pink' | 'green' | 'white';
type SparkScope = 'any' | 'own' | 'p1' | 'p2';

interface FactorFilterRow {
  factorId: string | null;
  name: string;
  color: FactorColor;
  searchQuery: string;
  searchResults: FactorSearchResult[];
  scope: SparkScope;
  minLevel: number;
}

interface FactorSearchResult {
  id: string;
  name: string;
  type: number;
  color: FactorColor;
}

interface ManualFormNode {
  cardId: number | null;
  charSearch: string;
  charResults: Character[];
  sparks: SparkInfo[];
  winSaddleIds: number[];
}

interface StoredManualEntry {
  id: string;
  label: string;
  mainCardId: number | null;
  ownSparkIds: number[];
  p1CardId: number | null;
  p1SparkIds: number[];
  p2CardId: number | null;
  p2SparkIds: number[];
  mainWinSaddleIds?: number[];
  p1WinSaddleIds?: number[];
  p2WinSaddleIds?: number[];
  createdAt: string;
}

type ResolvedSpark = VpdResolvedSpark;
type ResolvedParent = VpdResolvedParent;

@Component({
  selector: 'app-veteran-picker-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatDialogModule, MatIconModule, MatButtonModule, MatTooltipModule, MatFormFieldModule, MatInputModule, MatAutocompleteModule, MatSelectModule, VpdRowComponent, SparkEditorComponent],
  templateUrl: './veteran-picker-dialog.component.html',
  styleUrls: ['./veteran-picker-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VeteranPickerDialogComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  accounts: LinkedAccount[];
  selectedId: string | null;
  characters: Character[];
  veterans: { [accountId: string]: VeteranMember[] };
  loadingVeterans: { [accountId: string]: boolean };
  tab: TabId = 'veterans';
  sortKey: SortKey = 'total';
  searchQuery = '';
  sparkFilters: SparkColor[] = [];
  targetCharaId: number | null;
  factorFilters: FactorFilterRow[] = [];

  bookmarks: InheritanceRecord[] = [];
  bookmarksLoading = false;
  private bookmarksLoaded = false;
  private bookmarkSparkCache = new Map<InheritanceRecord, ResolvedSpark[]>();
  private bookmarkParentCache = new Map<InheritanceRecord, ResolvedParent[]>();

  savedTrainerId = '';
  savedVeterans: VeteranMember[] = [];
  savedLoading = false;
  savedLoaded = false;
  private savedHistoryLoaded = false;

  /** Phase of the SSE-driven lookup. */
  savedPhase: 'idle' | 'queued' | 'waiting' | 'processing' | 'done' | 'error' | 'timeout' = 'idle';
  savedError: string | null = null;
  savedHistory: PartnerInheritance[] = [];

  manualEntries: StoredManualEntry[] = [];
  manualFormVisible = false;
  editingManualId: string | null = null;
  manualLabel = '';

  manualNodes: ManualFormNode[] = [
    { cardId: null, charSearch: '', charResults: [], sparks: [], winSaddleIds: [] },
    { cardId: null, charSearch: '', charResults: [], sparks: [], winSaddleIds: [] },
    { cardId: null, charSearch: '', charResults: [], sparks: [], winSaddleIds: [] },
  ];
  readonly manualNodeLabels = ['Main', 'GP-1', 'GP-2'];

  // Character picker overlay state
  manualPickerOpen = false;
  manualPickerTarget = 0;
  manualPickerSearch = '';
  manualPickerResults: Character[] = [];

  private sparkCache = new Map<VeteranMember, ResolvedSpark[]>();
  private parentCache = new Map<VeteranMember, ResolvedParent[]>();
  private allFactors: Factor[] = [];

  // ── Filtered list memoization ────────────────────────────────────────────
  private _vetCacheKey = '';
  private _vetCache: VeteranMember[] = [];
  private _vetCacheList: VeteranMember[] | null = null;
  private _bmCacheKey = '';
  private _bmCache: InheritanceRecord[] = [];
  private _bmCacheList: InheritanceRecord[] | null = null;
  private _meCacheKey = '';
  private _meCache: StoredManualEntry[] = [];
  private _meCacheList: StoredManualEntry[] | null = null;

  // ── Row data memoization (per item) ──────────────────────────────────────
  private _vetRowCache = new WeakMap<VeteranMember, VpdRowData>();
  private _bmRowCache = new WeakMap<InheritanceRecord, VpdRowData>();
  private _meRowCache = new WeakMap<StoredManualEntry, VpdRowData>();

  // ── Progressive rendering ────────────────────────────────────────────────
  /** Number of rows currently rendered for the active tab. Grows over animation frames. */
  renderLimit = 0;
  private _renderRafScheduled = false;
  sparkScopes: { value: SparkScope; label: string; short: string }[] = [
    { value: 'any', label: 'Any source', short: 'Any' },
    { value: 'own', label: 'Own sparks', short: 'Own' },
    { value: 'p1', label: 'Parent 1', short: 'P1' },
    { value: 'p2', label: 'Parent 2', short: 'P2' },
  ];

  constructor(
    public dialogRef: MatDialogRef<VeteranPickerDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: VeteranPickerDialogData,
    private profileService: ProfileService,
    private characterService: CharacterService,
    private factorService: FactorService,
    public affinityService: AffinityService,
    private bookmarkService: BookmarkService,
    private authService: AuthService,
    private partnerService: PartnerService,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog,
  ) {
    this.accounts = data.linkedAccounts.filter(a => a.verification_status === 'verified');
    this.selectedId = data.selectedAccountId;
    this.characters = data.characters;
    this.veterans = { ...data.veterans };
    this.loadingVeterans = { ...data.loadingVeterans };
    this.targetCharaId = data.targetCharaId;
  }

  ngOnInit(): void {
    if (this.selectedId && this.veterans[this.selectedId] === undefined) {
      this.loadVeterans(this.selectedId);
    }
    this.characterService.getReleasedCharacters()
      .pipe(takeUntil(this.destroy$))
      .subscribe(characters => {
        this.characters = characters;
        if (this.manualPickerSearch.trim()) {
          this.searchManualPicker();
        }
        this.manualNodes.forEach(node => {
          if (node.charSearch.trim()) {
            this.searchManualNodeChar(node);
          }
        });
        this._invalidateFiltered();
        this.cdr.markForCheck();
      });
    this.affinityService.load().pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.targetCharaId && this.affinityService.isReady) {
        this.sortKey = 'affinity';
        this._invalidateFiltered();
      }
      this.cdr.markForCheck();
    });
    this.factorService.getFactors().pipe(takeUntil(this.destroy$)).subscribe(f => this.allFactors = f);
    this.loadManualEntries();
    if (this.authService.isLoggedIn()) {
      this.loadBookmarks();
    }
    if (!this.savedHistoryLoaded) {
      this.savedHistoryLoaded = true;
      this.loadSavedHistory();
    }
    // Wait for the dialog open animation to finish before instantiating any
    // rows; first render only the dialog chrome so the open is instant.
    this.dialogRef.afterOpened().pipe(takeUntil(this.destroy$)).subscribe(() => {
      this._scheduleRenderExpansion();
    });
  }

  private _scheduleRenderExpansion(): void {
    if (this._renderRafScheduled) return;
    this._renderRafScheduled = true;
    const tick = () => {
      this._renderRafScheduled = false;
      const target = this._currentFilteredLength();
      if (this.renderLimit >= target) return;
      // First chunk renders the visible viewport; subsequent chunks fill the rest.
      const step = this.renderLimit === 0 ? 8 : 30;
      this.renderLimit = Math.min(target, this.renderLimit + step);
      this.cdr.markForCheck();
      if (this.renderLimit < target) {
        this._renderRafScheduled = true;
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }

  private _currentFilteredLength(): number {
    switch (this.tab) {
      case 'veterans': return this.filteredVeterans.length;
      case 'bookmarks': return this.filteredBookmarks.length;
      case 'manual': return this.filteredManualEntries.length;
      default: return 0;
    }
  }

  private _invalidateFiltered(): void {
    this._vetCacheKey = '';
    this._bmCacheKey = '';
    this._meCacheKey = '';
    this._scheduleRenderExpansion();
  }

  private _filterSignature(extra: string): string {
    return `${this.searchQuery}|${this.sortKey}|${this.sparkFilters.join(',')}|${this.factorFilters.map(f => `${f.factorId ?? ''}:${f.scope}:${f.minLevel}`).join(';')}|${this.targetCharaId ?? ''}|${extra}`;
  }

  trackByVet = (_: number, v: VeteranMember): any => v;
  trackByBookmark = (_: number, b: InheritanceRecord): any => b;
  trackByManual = (_: number, e: StoredManualEntry): string => e.id;

  onSearchChange(): void {
    this.renderLimit = 0;
    this._invalidateFiltered();
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get loading(): boolean {
    return !!(this.selectedId && this.loadingVeterans[this.selectedId]);
  }

  get currentVeterans(): VeteranMember[] {
    return this.selectedId ? (this.veterans[this.selectedId] ?? []) : [];
  }

  get hasActiveVeteranFilters(): boolean {
    return !!(this.searchQuery || this.sparkFilters.length || this.factorFilters.length);
  }

  get hasLinkedVeteranAccount(): boolean {
    return this.accounts.length > 0;
  }

  get veteransUploadRoute(): (string | null)[] | null {
    const accountId = this.selectedId ?? this.accounts[0]?.account_id ?? null;
    return accountId ? ['/profile', accountId, 'veterans'] : null;
  }

  get filteredVeterans(): VeteranMember[] {
    const list = this.currentVeterans;
    const key = this._filterSignature(`v|${list.length}`);
    if (this._vetCacheList === list && this._vetCacheKey === key) {
      return this._vetCache;
    }
    this._vetCacheList = list;
    this._vetCacheKey = key;
    this._vetCache = this.applyFiltersAndSort(
      list,
      v => this.getName(v),
      v => this.getAllSparksForFilter(v),
      (v, scope) => this.getSparksForScope(v, scope as SparkScope),
      (v, sk) => {
        switch (sk) {
          case 'total': return this.getTotal(v);
          case 'affinity': return this.getAffinity(v);
          case 'blue': return this.getSparkSum(v, 'blue');
          case 'pink': return this.getSparkSum(v, 'pink');
          case 'green': return this.getSparkSum(v, 'green');
          default: return 0;
        }
      }
    );
    return this._vetCache;
  }

  get visibleVeterans(): VeteranMember[] {
    const list = this.filteredVeterans;
    return list.length > this.renderLimit ? list.slice(0, this.renderLimit) : list;
  }

  get visibleBookmarks(): InheritanceRecord[] {
    const list = this.filteredBookmarks;
    return list.length > this.renderLimit ? list.slice(0, this.renderLimit) : list;
  }

  get visibleManualEntries(): StoredManualEntry[] {
    const list = this.filteredManualEntries;
    return list.length > this.renderLimit ? list.slice(0, this.renderLimit) : list;
  }

  private applyFiltersAndSort<T>(
    list: T[],
    getName: (item: T) => string,
    getAllSparks: (item: T) => ResolvedSpark[],
    getScopeSparks: (item: T, scope: string) => ResolvedSpark[],
    getStat: (item: T, key: string) => number
  ): T[] {
    let result = list;

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(item => getName(item).toLowerCase().includes(q));
    }

    if (this.sparkFilters.length > 0) {
      result = result.filter(item => {
        const sparks = getAllSparks(item);
        return this.sparkFilters.every(color => sparks.some(s => s.color === color));
      });
    }

    if (this.factorFilters.length > 0) {
      const activeFilters = this.factorFilters.filter(ff => ff.factorId);
      if (activeFilters.length > 0) {
        result = result.filter(item => {
          return activeFilters.every(ff => {
            const sparks = getScopeSparks(item, ff.scope);
            return sparks.some(s => s.factorId === ff.factorId && s.level >= ff.minLevel);
          });
        });
      }
    }

    return [...result].sort((a, b) => {
      if (this.sortKey === 'name') {
        return getName(a).localeCompare(getName(b));
      }
      return getStat(b, this.sortKey) - getStat(a, this.sortKey);
    });
  }

  switchAccount(accountId: string): void {
    this.selectedId = accountId;
    if (this.veterans[accountId] === undefined) {
      this.loadVeterans(accountId);
    }
    this.sparkCache.clear();
    this.parentCache.clear();
    this._invalidateFiltered();
    this.renderLimit = 0;
    this.cdr.markForCheck();
  }

  onSortChange(): void {
    this._invalidateFiltered();
    this.cdr.markForCheck();
  }

  hasSparkFilter(color: SparkColor): boolean {
    return this.sparkFilters.includes(color);
  }

  toggleSparkFilter(color: SparkColor): void {
    const idx = this.sparkFilters.indexOf(color);
    if (idx >= 0) {
      this.sparkFilters.splice(idx, 1);
    } else {
      this.sparkFilters.push(color);
    }
    this._invalidateFiltered();
    this.cdr.markForCheck();
  }

  searchFactorsForRow(row: FactorFilterRow): void {
    const q = row.searchQuery.toLowerCase().trim();
    if (!q) { row.searchResults = []; return; }
    const existing = new Set(this.factorFilters.filter(f => f.factorId).map(f => f.factorId));
    const typeToColor = (type: number): FactorColor => {
      if (type === 0) return 'blue';
      if (type === 1) return 'pink';
      if (type === 5) return 'green';
      return 'white';
    };
    row.searchResults = this.allFactors
      .filter(f => !existing.has(f.id) && f.text.toLowerCase().includes(q))
      .slice(0, 20)
      .map(f => ({ id: f.id, name: f.text, type: f.type, color: typeToColor(f.type) }));
  }

  selectFactorForRow(row: FactorFilterRow, factor: FactorSearchResult): void {
    row.factorId = factor.id;
    row.name = factor.name;
    row.color = factor.color;
    row.searchQuery = '';
    row.searchResults = [];
    this._invalidateFiltered();
    this.cdr.markForCheck();
  }

  addEmptyFactorFilter(): void {
    this.factorFilters.push({ factorId: null, name: '', color: 'white', searchQuery: '', searchResults: [], scope: 'any', minLevel: 1 });
    this.cdr.markForCheck();
  }

  removeFactorFilter(index: number): void {
    this.factorFilters.splice(index, 1);
    this._invalidateFiltered();
    this.cdr.markForCheck();
  }

  onFactorRowChanged(): void {
    this._invalidateFiltered();
    this.cdr.markForCheck();
  }

  private loadVeterans(accountId: string): void {
    if (this.loadingVeterans[accountId]) return;
    this.loadingVeterans[accountId] = true;
    this.cdr.markForCheck();

    this.profileService.getProfile(accountId)
      .pipe(takeUntil(this.destroy$), catchError(() => of(null)))
      .subscribe(profile => {
        this.loadingVeterans[accountId] = false;
        this.veterans[accountId] = profile?.veterans ?? [];
        this._invalidateFiltered();
        this.cdr.markForCheck();
      });
  }

  select(veteran: VeteranMember): void {
    this.dialogRef.close(veteran);
  }

  private loadBookmarks(): void {
    if (this.bookmarksLoading) return;
    this.bookmarksLoaded = true;
    this.bookmarksLoading = true;
    this.cdr.markForCheck();
    this.bookmarkService.loadBookmarks()
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(records => {
        this.bookmarks = records;
        this.bookmarksLoading = false;
        this._invalidateFiltered();
        this.cdr.markForCheck();
      });
  }

  /** Switch tabs and lazy-load data the first time a remote-backed tab is opened. */
  setTab(tab: TabId): void {
    this.tab = tab;
    this.renderLimit = 0;
    this._scheduleRenderExpansion();
    if (tab === 'bookmarks' && !this.bookmarksLoaded && this.authService.isLoggedIn()) {
      this.loadBookmarks();
    } else if (tab === 'saved' && !this.savedHistoryLoaded) {
      this.savedHistoryLoaded = true;
      this.loadSavedHistory();
    }
  }

  get savedIdValid(): boolean {
    const len = this.savedTrainerId.trim().length;
    return len === 9 || len === 12;
  }

  onPartnerIdInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = input.value.replace(/[^0-9]/g, '');
    this.savedTrainerId = input.value;
  }

  loadSaved(): void {
    const id = this.savedTrainerId.trim();
    if (!id || this.savedLoading || !this.savedIdValid) return;
    this.savedLoading = true;
    this.savedLoaded = false;
    this.savedError = null;
    this.savedPhase = 'queued';
    this.savedVeterans = [];
    this.cdr.markForCheck();

    this.partnerService.lookup(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (evt: PartnerLookupEvent) => this.handleLookupEvent(evt),
        error: err => {
          this.savedLoading = false;
          this.savedPhase = 'error';
          this.savedError = (err?.error?.error as string) || err?.message || 'Lookup failed';
          this.cdr.markForCheck();
        },
      });
  }

  private handleLookupEvent(evt: PartnerLookupEvent): void {
    switch (evt.kind) {
      case 'pending':
        this.savedPhase = 'waiting';
        break;
      case 'processing':
        this.savedPhase = 'processing';
        break;
      case 'completed':
        this.savedLoading = false;
        this.savedPhase = 'idle';
        // Refresh the saved-history list so the new entry shows up.
        this.loadSavedHistory();
        break;
      case 'failed':
        this.savedLoading = false;
        this.savedPhase = 'error';
        this.savedError = evt.error || 'Lookup failed';
        break;
      case 'timeout':
        this.savedLoading = false;
        this.savedPhase = 'timeout';
        this.savedError = 'The worker did not respond in time. Please try again.';
        break;
    }
    this.cdr.markForCheck();
  }

  /** Load history from backend (logged-in) or localStorage (anon). */
  get filteredSavedHistory(): PartnerInheritance[] {
    return this.applyFiltersAndSort(
      this.savedHistory,
      p => this.getPartnerName(p),
      p => this.getPartnerSparks(p),
      (p, _) => this.getPartnerSparks(p),
      (p, key) => {
        switch (key) {
           case 'total': return this.getPartnerSparkSum(p, 'blue') + this.getPartnerSparkSum(p, 'pink') + this.getPartnerSparkSum(p, 'green');
           case 'blue': return this.getPartnerSparkSum(p, 'blue');
           case 'pink': return this.getPartnerSparkSum(p, 'pink');
           case 'green': return this.getPartnerSparkSum(p, 'green');
           default: return 0;
        }
      }
    );
  }

  getPartnerName(record: PartnerInheritance): string {
    return getCharacterName(record.main_parent_id);
  }

  getPartnerSparks(record: PartnerInheritance): ResolvedSpark[] {
    const allIds = [
      ...(record.blue_sparks || []),
      ...(record.pink_sparks || []),
      ...(record.green_sparks || []),
      ...(record.white_sparks || [])
    ];
    const uniqueIds = Array.from(new Set(allIds));
    return uniqueIds.map(id => {
      const spark = this.factorService.resolveSpark(id);
      if (!spark) return null;
      return {
        factorId: spark.factorId,
        level: spark.level,
        name: spark.name,
        color: this.sparkTypeToColor(spark.type)
      } as ResolvedSpark;
    }).filter(s => s !== null) as ResolvedSpark[];
  }

  /** Sparks belonging only to the main parent (used for row display). */
  getPartnerMainSparks(record: PartnerInheritance): ResolvedSpark[] {
    const colorOrder: Record<string, number> = { blue: 0, pink: 1, green: 2, white: 3 };
    const toId = (v: number | null | undefined): number[] => v != null ? [v] : [];
    const ids = [
      ...toId(record.main_blue_factors),
      ...toId(record.main_pink_factors),
      ...toId(record.main_green_factors),
      ...(record.main_white_factors || []),
    ];
    return ids.map(id => {
      const spark = this.factorService.resolveSpark(id);
      if (!spark) return null;
      return {
        factorId: spark.factorId,
        level: spark.level,
        name: spark.name,
        color: this.sparkTypeToColor(spark.type)
      } as ResolvedSpark;
    }).filter(s => s !== null).sort((a, b) => {
      const cc = (colorOrder[a!.color] ?? 9) - (colorOrder[b!.color] ?? 9);
      return cc !== 0 ? cc : b!.level - a!.level;
    }) as ResolvedSpark[];
  }

  getPartnerSparkSum(record: PartnerInheritance, color: SparkColor): number {
    return this.getPartnerSparks(record).filter(s => s.color === color).reduce((sum, s) => sum + s.level, 0);
  }

  getPartnerMainSparkSum(record: PartnerInheritance, color: SparkColor): number {
    return this.getPartnerMainSparks(record).filter(s => s.color === color).reduce((sum, s) => sum + s.level, 0);
  }

  getPartnerAffinity(record: PartnerInheritance): number {
    if (!this.targetCharaId || !this.affinityService.isReady) return 0;
    const charaId = record.main_parent_id ? Math.floor(record.main_parent_id / 100) : null;
    if (!charaId) return 0;
    let total = this.affinityService.getAff2(this.targetCharaId, charaId);
    const mainWins = record.main_win_saddles ?? [];
    const parents = [
      { id: record.parent_left_id, wins: record.left_win_saddles ?? [] },
      { id: record.parent_right_id, wins: record.right_win_saddles ?? [] },
    ];
    for (const p of parents) {
      if (!p.id) continue;
      const gpCharaId = Math.floor(p.id / 100);
      total += this.affinityService.getAff3(this.targetCharaId, charaId, gpCharaId);
      if (mainWins.length && p.wins.length) {
        const mainSet = new Set(mainWins);
        total += p.wins.filter(w => mainSet.has(w)).length;
      }
    }
    return total;
  }

  getPartnerParentRows(record: PartnerInheritance): ResolvedParent[] {
    const colorOrder: Record<string, number> = { blue: 0, pink: 1, green: 2, white: 3 };
    const resolveIds = (ids: number[]): ResolvedSpark[] =>
      ids.map(id => {
        const spark = this.factorService.resolveSpark(id);
        const color = this.sparkTypeToColor(spark.type);
        return { factorId: spark.factorId, level: spark.level, name: spark.name, color } as ResolvedSpark;
      }).sort((a, b) => {
        const cc = (colorOrder[a.color] ?? 9) - (colorOrder[b.color] ?? 9);
        return cc !== 0 ? cc : b.level - a.level;
      });
    const toId = (v: number | null | undefined): number[] => v != null ? [v] : [];
    const parents: ResolvedParent[] = [];
    if (record.parent_left_id) {
      const ids = [
        ...toId(record.left_blue_factors),
        ...toId(record.left_pink_factors),
        ...toId(record.left_green_factors),
        ...(record.left_white_factors || []),
      ];
      if (ids.length) {
        parents.push({ name: getCharacterName(record.parent_left_id), position: 'P1', sparks: resolveIds(ids) });
      }
    }
    if (record.parent_right_id) {
      const ids = [
        ...toId(record.right_blue_factors),
        ...toId(record.right_pink_factors),
        ...toId(record.right_green_factors),
        ...(record.right_white_factors || []),
      ];
      if (ids.length) {
        parents.push({ name: getCharacterName(record.parent_right_id), position: 'P2', sparks: resolveIds(ids) });
      }
    }
    return parents;
  }

  partnerToRowData(p: PartnerInheritance): VpdRowData {
    return {
      imageUrl: `assets/images/character_stand/chara_stand_${p.main_parent_id}.png`,
      name: getCharacterName(p.main_parent_id),
      subtitle: p.trainer_name ?? undefined,
      rarity: p.parent_rarity,
      affinity: this.targetCharaId ? this.getPartnerAffinity(p) : 0,
      sparks: this.getPartnerMainSparks(p),
      parents: this.getPartnerParentRows(p),
      sparkSums: {
        blue: this.getPartnerMainSparkSum(p, 'blue'),
        pink: this.getPartnerMainSparkSum(p, 'pink'),
        green: this.getPartnerMainSparkSum(p, 'green'),
      },
      showActions: true,
    };
  }

  loadSavedHistory(): void {
    if (this.authService.isLoggedIn()) {
      this.partnerService.listSaved()
        .pipe(takeUntil(this.destroy$), catchError(() => of([] as PartnerInheritance[])))
        .subscribe(list => {
          this.savedHistory = list;
          this.cdr.markForCheck();
        });
    } else {
      this.savedHistory = this.partnerService.readAnonSaved();
      this.cdr.markForCheck();
    }
  }

  /** Use a previously saved partner — directly close the dialog with the result. */
  selectSavedPartner(partner: PartnerInheritance): void {
    this.select(this.partnerToVeteran(partner));
  }

  /** Remove a saved partner (backend or localStorage). */
  deleteSavedPartner(partner: PartnerInheritance, event: Event): void {
    event.stopPropagation();
    if (this.authService.isLoggedIn()) {
      this.partnerService.deleteSaved(partner.account_id)
        .pipe(takeUntil(this.destroy$), catchError(() => of(null)))
        .subscribe(() => this.loadSavedHistory());
    } else {
      this.partnerService.deleteAnonSaved(partner.account_id);
      this.loadSavedHistory();
    }
  }

  /** Adapt a PartnerInheritance row into a VeteranMember-shaped object so the
   *  existing VPD row component and `select()` flow can consume it without
   *  changes to the dialog's return contract. */
  private partnerToVeteran(p: PartnerInheritance): VeteranMember {
    const toId = (v: number | null | undefined): number[] => v != null ? [v] : [];
    // Import only the selected main parent's own sparks for the slot.
    // The combined partner arrays (blue_sparks / white_sparks / etc.) include
    // GP1/GP2 display data and would leak those sparks into the main node.
    const ownBlue = toId(p.main_blue_factors);
    const ownPink = toId(p.main_pink_factors);
    const ownGreen = toId(p.main_green_factors);
    const ownWhite = p.main_white_factors || [];
    const v: VeteranMember = {
      trainer_id: p.account_id,
      distance_type: null,
      member_id: null,
      trained_chara_id: p.main_parent_id || null,
      running_style: null,
      card_id: p.main_parent_id || null,
      speed: null, power: null, stamina: null, wiz: null, guts: null,
      fans: null, rank_score: null,
      skills: null, support_cards: null,
      scenario_id: null,
      proper_ground_turf: null, proper_ground_dirt: null,
      proper_running_style_nige: null, proper_running_style_senko: null,
      proper_running_style_sashi: null, proper_running_style_oikomi: null,
      proper_distance_short: null, proper_distance_mile: null,
      proper_distance_middle: null, proper_distance_long: null,
      rarity: p.parent_rarity || null,
      talent_level: null, team_rating: null,
      race_results: p.race_results,
      win_saddle_id_array: p.main_win_saddles,
      factors: [
        ...ownBlue,
        ...ownPink,
        ...ownGreen,
        ...ownWhite,
      ],
      // Main parent's own factors for spark display
      factor_info_array: [
        ...ownBlue,
        ...ownPink,
        ...ownGreen,
        ...ownWhite,
      ].map(id => ({ factor_id: id, level: 0 } as FactorInfoEntry)),
      // Parent rows for affinity computation in veteran-display
      succession_chara_array: [
        p.parent_left_id ? {
          position_id: 10,
          card_id: p.parent_left_id,
          rank: 0,
          rarity: null,
          talent_level: null,
          factor_id_array: [
            ...toId(p.left_blue_factors),
            ...toId(p.left_pink_factors),
            ...toId(p.left_green_factors),
            ...(p.left_white_factors || []),
          ],
          win_saddle_id_array: p.left_win_saddles,
        } as SuccessionChara : null,
        p.parent_right_id ? {
          position_id: 20,
          card_id: p.parent_right_id,
          rank: 0,
          rarity: null,
          talent_level: null,
          factor_id_array: [
            ...toId(p.right_blue_factors),
            ...toId(p.right_pink_factors),
            ...toId(p.right_green_factors),
            ...(p.right_white_factors || []),
          ],
          win_saddle_id_array: p.right_win_saddles,
        } as SuccessionChara : null,
      ].filter((x): x is SuccessionChara => x !== null),
      inheritance: {
        blue_sparks: ownBlue,
        pink_sparks: ownPink,
        green_sparks: ownGreen,
        white_sparks: ownWhite,
        blue_stars_sum: p.blue_stars_sum,
        pink_stars_sum: p.pink_stars_sum,
        green_stars_sum: p.green_stars_sum,
        white_stars_sum: p.white_stars_sum,
      },
    };
    return v;
  }

  get filteredSavedVeterans(): VeteranMember[] {
    return this.applyFiltersAndSort(
      this.savedVeterans,
      v => this.getName(v),
      v => this.getAllSparksForFilter(v),
      (v, scope) => this.getSparksForScope(v, scope as SparkScope),
      (v, key) => {
        switch (key) {
          case 'total': return this.getTotal(v);
          case 'affinity': return this.getAffinity(v);
          case 'blue': return this.getSparkSum(v, 'blue');
          case 'pink': return this.getSparkSum(v, 'pink');
          case 'green': return this.getSparkSum(v, 'green');
          default: return 0;
        }
      }
    );
  }

  showManualForm(): void {
    this.manualFormVisible = true;
    this.cdr.markForCheck();
  }

  editManualEntry(entry: StoredManualEntry): void {
    this.editingManualId = entry.id;
    this.manualLabel = entry.label;
    const resolveNode = (cardId: number | null, sparkIds: number[], winSaddleIds: number[]): ManualFormNode => {
      const sparks: SparkInfo[] = sparkIds.map(id => {
        const spark = this.factorService.resolveSpark(id);
        // Store base factorId (not the full spark ID) so toIds can re-encode it correctly
        return { factorId: spark.factorId, level: spark.level, name: spark.name, type: spark.type };
      });
      return { cardId, charSearch: cardId ? getCharacterName(cardId) : '', charResults: [], sparks, winSaddleIds: [...winSaddleIds] };
    };
    this.manualNodes = [
      resolveNode(entry.mainCardId, entry.ownSparkIds, entry.mainWinSaddleIds ?? []),
      resolveNode(entry.p1CardId, entry.p1SparkIds, entry.p1WinSaddleIds ?? []),
      resolveNode(entry.p2CardId, entry.p2SparkIds, entry.p2WinSaddleIds ?? []),
    ];
    this.manualFormVisible = true;
    this.cdr.markForCheck();
  }

  isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  get filteredBookmarks(): InheritanceRecord[] {
    const list = this.bookmarks;
    const key = this._filterSignature(`b|${list.length}`);
    if (this._bmCacheList === list && this._bmCacheKey === key) {
      return this._bmCache;
    }
    this._bmCacheList = list;
    this._bmCacheKey = key;
    this._bmCache = this.applyFiltersAndSort(
      list,
      r => this.getBookmarkName(r),
      r => this.getBookmarkSparks(r),
      (r, _) => this.getBookmarkSparks(r),
      (r, sk) => {
        switch (sk) {
          case 'total': return this.getBookmarkSparkSum(r, 'blue') + this.getBookmarkSparkSum(r, 'pink') + this.getBookmarkSparkSum(r, 'green');
          case 'blue': return this.getBookmarkSparkSum(r, 'blue');
          case 'pink': return this.getBookmarkSparkSum(r, 'pink');
          case 'green': return this.getBookmarkSparkSum(r, 'green');
          default: return 0;
        }
      }
    );
    return this._bmCache;
  }

  get filteredManualEntries(): StoredManualEntry[] {
    const list = this.manualEntries;
    const key = this._filterSignature(`m|${list.length}`);
    if (this._meCacheList === list && this._meCacheKey === key) {
      return this._meCache;
    }
    this._meCacheList = list;
    this._meCacheKey = key;
    this._meCache = this.applyFiltersAndSort(
      list,
      e => this.getManualEntryName(e) + ' ' + (e.label || ''),
      e => this.getManualEntrySparks(e),
      (e, _) => this.getManualEntrySparks(e),
      (e, sk) => {
        switch (sk) {
          case 'total': return this.getManualEntrySparkSum(e, 'blue') + this.getManualEntrySparkSum(e, 'pink') + this.getManualEntrySparkSum(e, 'green');
          case 'blue': return this.getManualEntrySparkSum(e, 'blue');
          case 'pink': return this.getManualEntrySparkSum(e, 'pink');
          case 'green': return this.getManualEntrySparkSum(e, 'green');
          default: return 0;
        }
      }
    );
    return this._meCache;
  }



  getManualGPSparks(entry: StoredManualEntry, sparkIds: number[]): ResolvedSpark[] {
    const colorOrder: Record<string, number> = { blue: 0, pink: 1, green: 2, white: 3 };
    return sparkIds.map(id => {
      const spark = this.factorService.resolveSpark(id);
      const color = this.sparkTypeToColor(spark.type);
      return { factorId: spark.factorId, level: spark.level, name: spark.name, color } as ResolvedSpark;
    }).sort((a, b) => {
      const cc = (colorOrder[a.color] ?? 9) - (colorOrder[b.color] ?? 9);
      return cc !== 0 ? cc : b.level - a.level;
    });
  }

  getBookmarkName(record: InheritanceRecord): string {
    if (record.main_parent_id) return getCharacterName(record.main_parent_id);
    if (record.main?.name) return record.main.name;
    return 'Unknown';
  }

  getBookmarkImage(record: InheritanceRecord): string {
    if (record.main_parent_id) return `assets/images/character_stand/chara_stand_${record.main_parent_id}.png`;
    if (record.main?.image) return `assets/images/characters/${record.main.image}`;
    return '';
  }

  getBookmarkSparks(record: InheritanceRecord): ResolvedSpark[] {
    const cached = this.bookmarkSparkCache.get(record);
    if (cached) return cached;
    const colorOrder: Record<string, number> = { blue: 0, pink: 1, green: 2, white: 3 };
    const allIds = [
      ...(record.blue_sparks || []),
      ...(record.pink_sparks || []),
      ...(record.green_sparks || []),
      ...(record.white_sparks || []),
    ];
    const resolved = allIds.map(id => {
      const spark = this.factorService.resolveSpark(id);
      const color = this.sparkTypeToColor(spark.type);
      return { factorId: spark.factorId, level: spark.level, name: spark.name, color } as ResolvedSpark;
    }).sort((a, b) => {
      const cc = (colorOrder[a.color] ?? 9) - (colorOrder[b.color] ?? 9);
      return cc !== 0 ? cc : b.level - a.level;
    });
    this.bookmarkSparkCache.set(record, resolved);
    return resolved;
  }

  /** Sparks belonging only to the bookmark's main parent (row headline display). */
  getBookmarkMainSparks(record: InheritanceRecord): ResolvedSpark[] {
    const colorOrder: Record<string, number> = { blue: 0, pink: 1, green: 2, white: 3 };
    const toId = (v: number | null | undefined): number[] => v != null ? [v] : [];
    const ids = [
      ...toId(record.main_blue_factors),
      ...toId(record.main_pink_factors),
      ...toId(record.main_green_factors),
      ...(record.main_white_factors || []),
    ];

    return ids.map(id => {
      const spark = this.factorService.resolveSpark(id);
      const color = this.sparkTypeToColor(spark.type);
      return { factorId: spark.factorId, level: spark.level, name: spark.name, color } as ResolvedSpark;
    }).sort((a, b) => {
      const cc = (colorOrder[a.color] ?? 9) - (colorOrder[b.color] ?? 9);
      return cc !== 0 ? cc : b.level - a.level;
    });
  }

  getBookmarkSparkSum(record: InheritanceRecord, color: SparkColor): number {
    return this.getBookmarkSparks(record).filter(s => s.color === color).reduce((sum, s) => sum + s.level, 0);
  }

  getBookmarkMainSparkSum(record: InheritanceRecord, color: SparkColor): number {
    return this.getBookmarkMainSparks(record).filter(s => s.color === color).reduce((sum, s) => sum + s.level, 0);
  }

  getBookmarkAffinity(record: InheritanceRecord): number {
    if (!this.targetCharaId || !this.affinityService.isReady) return 0;
    const charaId = record.main_parent_id ? Math.floor(record.main_parent_id / 100) : null;
    if (!charaId) return 0;
    let total = this.affinityService.getAff2(this.targetCharaId, charaId);
    const mainWins = record.main_win_saddles ?? [];
    const parents = [
      { id: record.parent_left_id, wins: record.left_win_saddles ?? [] },
      { id: record.parent_right_id, wins: record.right_win_saddles ?? [] },
    ];
    for (const p of parents) {
      if (!p.id) continue;
      const gpCharaId = Math.floor(p.id / 100);
      total += this.affinityService.getAff3(this.targetCharaId, charaId, gpCharaId);
      if (mainWins.length && p.wins.length) {
        const mainSet = new Set(mainWins);
        total += p.wins.filter(w => mainSet.has(w)).length;
      }
    }
    return total;
  }

  getBookmarkParentRows(record: InheritanceRecord): ResolvedParent[] {
    const cached = this.bookmarkParentCache.get(record);
    if (cached) return cached;

    const colorOrder: Record<string, number> = { blue: 0, pink: 1, green: 2, white: 3 };
    const resolveIds = (ids: number[]): ResolvedSpark[] =>
      ids.map(id => {
        const spark = this.factorService.resolveSpark(id);
        const color = this.sparkTypeToColor(spark.type);
        return { factorId: spark.factorId, level: spark.level, name: spark.name, color } as ResolvedSpark;
      }).sort((a, b) => {
        const cc = (colorOrder[a.color] ?? 9) - (colorOrder[b.color] ?? 9);
        return cc !== 0 ? cc : b.level - a.level;
      });

    const toId = (v: number | null | undefined): number[] => v != null ? [v] : [];

    const parents: ResolvedParent[] = [];
    if (record.parent_left_id) {
      const ids = [
        ...toId(record.left_blue_factors),
        ...toId(record.left_pink_factors),
        ...toId(record.left_green_factors),
        ...(record.left_white_factors || []),
      ];
      if (ids.length) {
        parents.push({ name: getCharacterName(record.parent_left_id), position: 'P1', sparks: resolveIds(ids) });
      }
    }
    if (record.parent_right_id) {
      const ids = [
        ...toId(record.right_blue_factors),
        ...toId(record.right_pink_factors),
        ...toId(record.right_green_factors),
        ...(record.right_white_factors || []),
      ];
      if (ids.length) {
        parents.push({ name: getCharacterName(record.parent_right_id), position: 'P2', sparks: resolveIds(ids) });
      }
    }

    this.bookmarkParentCache.set(record, parents);
    return parents;
  }

  selectBookmark(record: InheritanceRecord): void {
    const toArr = (v: number | null | undefined): number[] => (v != null ? [v] : []);
    // Important: when importing a bookmark into a single lineage slot, use only
    // the main parent's own factors for that slot. Combined bookmark spark arrays
    // (record.blue_sparks, etc.) include lineage-wide display data and would leak
    // P1/P2 factors into the selected node.
    const ownBlue = toArr(record.main_blue_factors);
    const ownPink = toArr(record.main_pink_factors);
    const ownGreen = toArr(record.main_green_factors);
    const ownWhite = record.main_white_factors || [];

    const vet: VeteranMember = {
      card_id: record.main_parent_id ?? null,
      trained_chara_id: record.main_parent_id ? Math.floor(record.main_parent_id / 100) : null,
      win_saddle_id_array: record.main_win_saddles || [],
      factors: [
        ...ownBlue,
        ...ownPink,
        ...ownGreen,
        ...ownWhite,
      ],
      inheritance: {
        blue_sparks: ownBlue,
        pink_sparks: ownPink,
        green_sparks: ownGreen,
        white_sparks: ownWhite,
        blue_stars_sum: 0, pink_stars_sum: 0, green_stars_sum: 0, white_stars_sum: 0,
      } as VeteranInheritance,
      succession_chara_array: [
        ...(record.parent_left_id ? [{
          position_id: 10,
          card_id: record.parent_left_id,
          rank: 0, rarity: null, talent_level: null,
          factor_id_array: [
            ...toArr(record.left_blue_factors),
            ...toArr(record.left_pink_factors),
            ...toArr(record.left_green_factors),
            ...(record.left_white_factors || []),
          ],
          win_saddle_id_array: record.left_win_saddles || [],
        } as SuccessionChara] : []),
        ...(record.parent_right_id ? [{
          position_id: 20,
          card_id: record.parent_right_id,
          rank: 0, rarity: null, talent_level: null,
          factor_id_array: [
            ...toArr(record.right_blue_factors),
            ...toArr(record.right_pink_factors),
            ...toArr(record.right_green_factors),
            ...(record.right_white_factors || []),
          ],
          win_saddle_id_array: record.right_win_saddles || [],
        } as SuccessionChara] : []),
      ],
      distance_type: null, member_id: null, running_style: null,
      speed: null, power: null, stamina: null, wiz: null, guts: null,
      fans: null, rank_score: null, skills: null, support_cards: null,
      scenario_id: null,
      proper_ground_turf: null, proper_ground_dirt: null,
      proper_running_style_nige: null, proper_running_style_senko: null,
      proper_running_style_sashi: null, proper_running_style_oikomi: null,
      proper_distance_short: null, proper_distance_mile: null,
      proper_distance_middle: null, proper_distance_long: null,
      rarity: record.parent_rarity ?? null,
      talent_level: null, team_rating: null,
    };
    this.dialogRef.close(vet);
  }

  private readonly MANUAL_STORAGE_KEY = 'vpd_manual_entries';

  loadManualEntries(): void {
    try {
      const raw = localStorage.getItem(this.MANUAL_STORAGE_KEY);
      this.manualEntries = raw ? JSON.parse(raw) : [];
    } catch {
      this.manualEntries = [];
    }
  }

  private saveManualEntries(): void {
    try {
      localStorage.setItem(this.MANUAL_STORAGE_KEY, JSON.stringify(this.manualEntries));
    } catch { /* quota exceeded */ }
  }

  resetManualForm(): void {
    this.manualLabel = '';
    this.manualNodes = [
      { cardId: null, charSearch: '', charResults: [], sparks: [], winSaddleIds: [] },
      { cardId: null, charSearch: '', charResults: [], sparks: [], winSaddleIds: [] },
      { cardId: null, charSearch: '', charResults: [], sparks: [], winSaddleIds: [] },
    ];
  }

  cancelManualForm(): void {
    this.resetManualForm();
    this.editingManualId = null;
    this.manualFormVisible = false;
    this.cdr.markForCheck();
  }

  searchManualNodeChar(node: ManualFormNode): void {
    const q = node.charSearch.toLowerCase().trim();
    if (!q) { node.charResults = []; return; }
    node.charResults = this.characters
      .filter(c => getCharacterName(c.id).toLowerCase().includes(q))
      .slice(0, 20);
  }

  searchManualPicker(): void {
    const q = this.manualPickerSearch.toLowerCase().trim();
    if (!q) { this.manualPickerResults = []; return; }
    this.manualPickerResults = this.characters
      .filter(c => getCharacterName(c.id).toLowerCase().includes(q))
      .slice(0, 30);
  }

  pickManualCharacter(char: Character): void {
    const node = this.manualNodes[this.manualPickerTarget];
    if (node) {
      node.cardId = char.id;
      node.charSearch = getCharacterName(char.id);
      node.charResults = [];
    }
    this.manualPickerOpen = false;
    this.manualPickerSearch = '';
    this.manualPickerResults = [];
    this.cdr.markForCheck();
  }

  openManualCharacterPicker(targetIndex: number): void {
    // Build affinity targets: always include the legacy target, plus the
    // Main parent when picking a grandparent (index 1 or 2), so affinity
    // sorting reflects the full inheritance context.
    const affinityTargetIds: number[] = [];
    if (this.targetCharaId) affinityTargetIds.push(this.targetCharaId);
    if (targetIndex !== 0) {
      const mainCardId = this.manualNodes[0]?.cardId;
      if (mainCardId) {
        const mainCharaId = Math.floor(mainCardId / 100);
        if (mainCharaId && !affinityTargetIds.includes(mainCharaId)) {
          affinityTargetIds.push(mainCharaId);
        }
      }
    }

    const dialogRef = this.dialog.open(CharacterSelectDialogComponent, {
      width: '90%',
      maxWidth: '600px',
      height: '80vh',
      panelClass: 'modern-dialog-panel',
      data: affinityTargetIds.length ? { affinityTargetIds } : null,
    });
    dialogRef.afterClosed().subscribe((result: Character | undefined) => {
      if (result) {
        const node = this.manualNodes[targetIndex];
        if (node) {
          node.cardId = result.id;
          node.charSearch = getCharacterName(result.id);
          node.charResults = [];
        }
        this.cdr.markForCheck();
      }
    });
  }

  selectManualNodeChar(node: ManualFormNode, char: Character): void {
    node.cardId = char.id;
    node.charSearch = getCharacterName(char.id);
    node.charResults = [];
    this.cdr.markForCheck();
  }

  clearManualNodeChar(node: ManualFormNode): void {
    node.cardId = null;
    node.charSearch = '';
    node.charResults = [];
    node.sparks = [];
    node.winSaddleIds = [];
    this.cdr.markForCheck();
  }

  openManualRaceWins(nodeIndex: number, event: Event): void {
    event.stopPropagation();
    const node = this.manualNodes[nodeIndex];
    if (!node?.cardId) return;

    const charName = getCharacterName(node.cardId);
    const dialogRef = this.dialog.open(RaceWinPickerDialogComponent, {
      data: { charName, charId: node.cardId, winSaddleIds: node.winSaddleIds } as RaceWinPickerDialogData,
      panelClass: 'modern-dialog-panel',
      width: '1100px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false,
    });
    dialogRef.afterClosed().subscribe((saddleIds: number[] | null) => {
      if (saddleIds != null) {
        node.winSaddleIds = saddleIds;
        this.cdr.markForCheck();
      }
    });
  }

  // Slot fitter state
  manualSlotFitterTarget: number | null = null;
  manualSlotFitterCandidates: (CandidateScore & { character?: Character; individualAffinity: number })[] = [];

  openManualBestFit(nodeIndex: number, event?: Event): void {
    event?.stopPropagation();
    if (!this.affinityService.isReady || !this.targetCharaId) return;

    const NODE_TO_SLOT: Record<number, SlotName> = { 0: 'p1', 1: 'gp1Left', 2: 'gp2Left' };
    const slotName = NODE_TO_SLOT[nodeIndex];
    if (!slotName) return;

    const charaId = (node: ManualFormNode): number | null =>
      node.cardId ? Math.floor(node.cardId / 100) : null;

    const slots: TreeSlots = {
      target: this.targetCharaId,
      p1: charaId(this.manualNodes[0]),
      p2: null,
      gp1Left: charaId(this.manualNodes[1]),
      gp1Right: null,
      gp2Left: charaId(this.manualNodes[2]),
      gp2Right: null,
    };

    const candidates = this.affinityService.rankCandidatesForSlot(slotName, slots, 20);
    const target = slots.target;

    this.manualSlotFitterCandidates = candidates
      .map(c => {
        let individualAffinity = 0;
        if (target) {
          if (slotName === 'p1') {
            individualAffinity = this.affinityService.getAff2(target, c.charaId);
          } else {
            const parent = slots.p1;
            if (parent) individualAffinity = this.affinityService.getAff3(target, parent, c.charaId);
          }
        }
        return {
          ...c,
          character: this.characters.find(ch => Math.floor(ch.id / 100) === c.charaId),
          individualAffinity,
        };
      })
      .filter(c => !!c.character);

    this.manualSlotFitterTarget = nodeIndex;
    this.cdr.markForCheck();
  }

  closeManualSlotFitter(): void {
    this.manualSlotFitterTarget = null;
    this.manualSlotFitterCandidates = [];
    this.cdr.markForCheck();
  }

  selectManualSlotFitterCandidate(candidate: CandidateScore & { character?: Character; individualAffinity: number }): void {
    if (!candidate.character || this.manualSlotFitterTarget == null) return;
    const node = this.manualNodes[this.manualSlotFitterTarget];
    node.cardId = candidate.character.id;
    node.charSearch = getCharacterName(candidate.character.id);
    node.charResults = [];
    this.closeManualSlotFitter();
  }

  setNodeSparks(nodeIndex: number, sparks: SparkInfo[]): void {
    this.manualNodes[nodeIndex].sparks = sparks;
    this.cdr.markForCheck();
  }

  saveManualEntry(): void {
    const main = this.manualNodes[0];
    if (!main.cardId) return;
    // Encode as proper spark ID: baseFactorId + level digit (e.g. "101" + 2 → 1012)
    const toIds = (node: ManualFormNode) =>
      node.sparks.map(s => parseInt(s.factorId + s.level.toString()));
    const entry: StoredManualEntry = {
      id: this.editingManualId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label: this.manualLabel.trim(),
      mainCardId: main.cardId,
      ownSparkIds: toIds(main),
      p1CardId: this.manualNodes[1].cardId,
      p1SparkIds: toIds(this.manualNodes[1]),
      p2CardId: this.manualNodes[2].cardId,
      p2SparkIds: toIds(this.manualNodes[2]),
      mainWinSaddleIds: [...this.manualNodes[0].winSaddleIds],
      p1WinSaddleIds: [...this.manualNodes[1].winSaddleIds],
      p2WinSaddleIds: [...this.manualNodes[2].winSaddleIds],
      createdAt: this.editingManualId
        ? (this.manualEntries.find(e => e.id === this.editingManualId)?.createdAt ?? new Date().toISOString())
        : new Date().toISOString(),
    };
    if (this.editingManualId) {
      this.manualEntries = this.manualEntries.map(e => e.id === this.editingManualId ? entry : e);
    } else {
      this.manualEntries = [entry, ...this.manualEntries];
    }
    this.saveManualEntries();
    this.cancelManualForm();
  }

  selectManualEntry(entry: StoredManualEntry): void {
    const vet: VeteranMember = {
      card_id: entry.mainCardId,
      trained_chara_id: entry.mainCardId ? Math.floor(entry.mainCardId / 100) : null,
      factors: entry.ownSparkIds,
      inheritance: null,
      win_saddle_id_array: entry.mainWinSaddleIds ?? [],
      succession_chara_array: [
        ...(entry.p1CardId ? [{
          position_id: 10, card_id: entry.p1CardId,
          rank: 0, rarity: null, talent_level: null,
          factor_id_array: entry.p1SparkIds,
          win_saddle_id_array: entry.p1WinSaddleIds ?? [],
        } as SuccessionChara] : []),
        ...(entry.p2CardId ? [{
          position_id: 20, card_id: entry.p2CardId,
          rank: 0, rarity: null, talent_level: null,
          factor_id_array: entry.p2SparkIds,
          win_saddle_id_array: entry.p2WinSaddleIds ?? [],
        } as SuccessionChara] : []),
      ],
      distance_type: null, member_id: null, running_style: null,
      speed: null, power: null, stamina: null, wiz: null, guts: null,
      fans: null, rank_score: null, skills: null, support_cards: null,
      scenario_id: null,
      proper_ground_turf: null, proper_ground_dirt: null,
      proper_running_style_nige: null, proper_running_style_senko: null,
      proper_running_style_sashi: null, proper_running_style_oikomi: null,
      proper_distance_short: null, proper_distance_mile: null,
      proper_distance_middle: null, proper_distance_long: null,
      rarity: null, talent_level: null, team_rating: null,
    };
    this.dialogRef.close(vet);
  }

  deleteManualEntry(entry: StoredManualEntry, event: Event): void {
    event.stopPropagation();
    this.manualEntries = this.manualEntries.filter(e => e.id !== entry.id);
    this.saveManualEntries();
    this.cdr.markForCheck();
  }

  // ── Row data mappers for VpdRowComponent ──────────────────────────────────

  vetToRowData(vet: VeteranMember): VpdRowData {
    const cached = this._vetRowCache.get(vet);
    if (cached) return cached;
    const data: VpdRowData = {
      imageUrl: this.getImage(vet),
      name: this.getName(vet),
      tag: vet.scenario_id ? getScenarioName(vet.scenario_id) : undefined,
      rarity: vet.rarity,
      affinity: this.targetCharaId ? this.getAffinity(vet) : 0,
      sparks: this.getSparks(vet),
      parents: this.getParentSparks(vet),
      sparkSums: {
        blue: this.getSparkSum(vet, 'blue'),
        pink: this.getSparkSum(vet, 'pink'),
        green: this.getSparkSum(vet, 'green'),
      },
    };
    this._vetRowCache.set(vet, data);
    return data;
  }

  bookmarkToRowData(bm: InheritanceRecord): VpdRowData {
    const cached = this._bmRowCache.get(bm);
    if (cached) return cached;
    const data: VpdRowData = {
      imageUrl: this.getBookmarkImage(bm),
      name: this.getBookmarkName(bm),
      subtitle: bm.trainer_name ?? undefined,
      rarity: bm.parent_rarity,
      affinity: this.targetCharaId ? this.getBookmarkAffinity(bm) : 0,
      sparks: this.getBookmarkMainSparks(bm),
      parents: this.getBookmarkParentRows(bm),
      sparkSums: {
        blue: this.getBookmarkMainSparkSum(bm, 'blue'),
        pink: this.getBookmarkMainSparkSum(bm, 'pink'),
        green: this.getBookmarkMainSparkSum(bm, 'green'),
      },
    };
    this._bmRowCache.set(bm, data);
    return data;
  }

  manualToRowData(entry: StoredManualEntry): VpdRowData {
    const cached = this._meRowCache.get(entry);
    if (cached) return cached;
    const data: VpdRowData = {
      imageUrl: this.getManualEntryImage(entry),
      name: this.getManualEntryName(entry),
      subtitle: entry.label || undefined,
      affinity: this.targetCharaId ? this.getManualEntryAffinity(entry) : 0,
      sparks: this.getManualEntrySparks(entry),
      parents: this.getManualEntryParentRows(entry),
      sparkSums: {
        blue: this.getManualEntrySparkSum(entry, 'blue'),
        pink: this.getManualEntrySparkSum(entry, 'pink'),
        green: this.getManualEntrySparkSum(entry, 'green'),
      },
      showActions: true,
      showEdit: true,
    };
    this._meRowCache.set(entry, data);
    return data;
  }

  // ─────────────────────────────────────────────────────────────────────────

  getManualEntryName(entry: StoredManualEntry): string {
    return entry.mainCardId ? getCharacterName(entry.mainCardId) : 'Unknown';
  }

  getManualEntryImage(entry: StoredManualEntry): string {
    return entry.mainCardId ? `assets/images/character_stand/chara_stand_${entry.mainCardId}.png` : '';
  }

  getManualEntrySparks(entry: StoredManualEntry): ResolvedSpark[] {
    const colorOrder: Record<string, number> = { blue: 0, pink: 1, green: 2, white: 3 };
    return entry.ownSparkIds.map(id => {
      const spark = this.factorService.resolveSpark(id);
      const color = this.sparkTypeToColor(spark.type);
      return { factorId: spark.factorId, level: spark.level, name: spark.name, color } as ResolvedSpark;
    }).sort((a, b) => {
      const cc = (colorOrder[a.color] ?? 9) - (colorOrder[b.color] ?? 9);
      return cc !== 0 ? cc : b.level - a.level;
    });
  }

  getManualEntryParentRows(entry: StoredManualEntry): ResolvedParent[] {
    const colorOrder: Record<string, number> = { blue: 0, pink: 1, green: 2, white: 3 };
    const resolveIds = (ids: number[]): ResolvedSpark[] =>
      ids.map(id => {
        const spark = this.factorService.resolveSpark(id);
        const color = this.sparkTypeToColor(spark.type);
        return { factorId: spark.factorId, level: spark.level, name: spark.name, color } as ResolvedSpark;
      }).sort((a, b) => {
        const cc = (colorOrder[a.color] ?? 9) - (colorOrder[b.color] ?? 9);
        return cc !== 0 ? cc : b.level - a.level;
      });
    const rows: ResolvedParent[] = [];
    if (entry.p1CardId) {
      rows.push({ name: getCharacterName(entry.p1CardId), position: 'P1', sparks: resolveIds(entry.p1SparkIds) });
    }
    if (entry.p2CardId) {
      rows.push({ name: getCharacterName(entry.p2CardId), position: 'P2', sparks: resolveIds(entry.p2SparkIds) });
    }
    return rows;
  }

  getManualEntrySparkSum(entry: StoredManualEntry, color: SparkColor): number {
    return this.getManualEntrySparks(entry).filter(s => s.color === color).reduce((sum, s) => sum + s.level, 0);
  }

  getManualEntryAffinity(entry: StoredManualEntry): number {
    if (!this.targetCharaId || !this.affinityService.isReady || !entry.mainCardId) return 0;
    const charaId = Math.floor(entry.mainCardId / 100);
    let total = this.affinityService.getAff2(this.targetCharaId, charaId);
    for (const gpId of [entry.p1CardId, entry.p2CardId]) {
      if (!gpId) continue;
      total += this.affinityService.getAff3(this.targetCharaId, charaId, Math.floor(gpId / 100));
    }
    return total;
  }

  getManualFormAffinity(): number {
    if (!this.targetCharaId || !this.affinityService.isReady || !this.manualNodes[0].cardId) return 0;
    const charaId = Math.floor(this.manualNodes[0].cardId / 100);
    let total = this.affinityService.getAff2(this.targetCharaId, charaId);
    for (const node of [this.manualNodes[1], this.manualNodes[2]]) {
      if (!node.cardId) continue;
      total += this.affinityService.getAff3(this.targetCharaId, charaId, Math.floor(node.cardId / 100));
    }
    return total;
  }

  getManualNodeAffinity(nodeIndex: number): number {
    if (!this.affinityService.isReady) return 0;
    const node = this.manualNodes[nodeIndex];
    if (!node?.cardId) return 0;
    const charaId = Math.floor(node.cardId / 100);
    if (nodeIndex === 0) {
      // Parent: prefer playerSide total when a target is set; otherwise fall
      // back to summed pair affinities with whichever GPs are filled in.
      if (this.targetCharaId) return this.getManualFormAffinity();
      let total = 0;
      for (const gp of [this.manualNodes[1], this.manualNodes[2]]) {
        if (!gp.cardId) continue;
        total += this.affinityService.getAff2(charaId, Math.floor(gp.cardId / 100));
      }
      return total;
    }
    const parent = this.manualNodes[0];
    if (!parent?.cardId) return 0;
    const parentChara = Math.floor(parent.cardId / 100);
    if (this.targetCharaId) {
      return this.affinityService.getAff3(this.targetCharaId, parentChara, charaId);
    }
    // No target chara — show pair affinity between parent and this GP.
    return this.affinityService.getAff2(parentChara, charaId);
  }

  getAffinitySymbol(value: number): string {
    if (value >= 150) return '◎';
    if (value >= 100) return '○';
    if (value >= 50) return '△';
    return '';
  }

  getManualNodeCharName(node: ManualFormNode): string {
    return node.cardId ? getCharacterName(node.cardId) : '';
  }

  getManualNodeImage(node: ManualFormNode): string {
    return node.cardId ? `assets/images/character_stand/chara_stand_${node.cardId}.png` : '';
  }

  trackByIndex(i: number): number { return i; }

  getName(vet: VeteranMember): string {
    if (vet.card_id) return getCharacterName(vet.card_id);
    if (vet.trained_chara_id) {
      const c = this.characters.find(ch => Math.floor(ch.id / 100) === vet.trained_chara_id);
      return c ? getCharacterName(c.id) : `Uma #${vet.trained_chara_id}`;
    }
    return 'Unknown';
  }

  getImage(vet: VeteranMember): string {
    if (vet.card_id) return `assets/images/character_stand/chara_stand_${vet.card_id}.png`;
    if (vet.trained_chara_id) {
      const c = this.characters.find(ch => Math.floor(ch.id / 100) === vet.trained_chara_id);
      return c ? `assets/images/character_stand/chara_stand_${c.id}.png` : '';
    }
    return '';
  }

  getSparks(vet: VeteranMember): ResolvedSpark[] {
    const cached = this.sparkCache.get(vet);
    if (cached) return cached;

    const colorOrder: Record<string, number> = { blue: 0, pink: 1, green: 2, white: 3 };
    let resolved: ResolvedSpark[];

    if (vet.factor_info_array && vet.factor_info_array.length > 0) {
      resolved = vet.factor_info_array.map(entry => {
        const spark = this.factorService.resolveSpark(entry.factor_id);
        const color = this.sparkTypeToColor(spark.type);
        return { factorId: spark.factorId, level: spark.level, name: spark.name, color };
      });
    } else if (vet.inheritance) {
      const inh = vet.inheritance;
      const allIds = [
        ...(inh.blue_sparks || []),
        ...(inh.pink_sparks || []),
        ...(inh.green_sparks || []),
        ...(inh.white_sparks || []),
      ];
      resolved = allIds.map(id => {
        const spark = this.factorService.resolveSpark(id);
        const color = this.sparkTypeToColor(spark.type);
        return { factorId: spark.factorId, level: spark.level, name: spark.name, color };
      });
    } else if (vet.factors?.length) {
      resolved = vet.factors.map(id => {
        const spark = this.factorService.resolveSpark(id);
        const color = this.sparkTypeToColor(spark.type);
        return { factorId: spark.factorId, level: spark.level, name: spark.name, color };
      });
    } else {
      resolved = [];
    }

    resolved.sort((a, b) => {
      const cmpColor = (colorOrder[a.color] ?? 9) - (colorOrder[b.color] ?? 9);
      return cmpColor !== 0 ? cmpColor : b.level - a.level;
    });

    this.sparkCache.set(vet, resolved);
    return resolved;
  }

  private sparkTypeToColor(type: number): ResolvedSpark['color'] {
    if (type === 0) return 'blue';
    if (type === 1) return 'pink';
    if (type === 5) return 'green';
    return 'white';
  }

  getSparkSum(vet: VeteranMember, color: SparkColor): number {
    return this.getAllSparksForFilter(vet).filter(s => s.color === color).reduce((sum, s) => sum + s.level, 0);
  }

  getTotal(vet: VeteranMember): number {
    return getTotalStats(vet);
  }

  getParentSparks(vet: VeteranMember): ResolvedParent[] {
    const cached = this.parentCache.get(vet);
    if (cached) return cached;

    const parents: ResolvedParent[] = [];
    if (!vet.succession_chara_array?.length) {
      this.parentCache.set(vet, parents);
      return parents;
    }

    const posLabels: Record<number, string> = { 10: 'P1', 20: 'P2' };
    const colorOrder: Record<string, number> = { blue: 0, pink: 1, green: 2, white: 3 };

    for (const sc of vet.succession_chara_array) {
      if (sc.position_id !== 10 && sc.position_id !== 20) continue;
      const ids = sc.factor_info_array?.length
        ? sc.factor_info_array.map(e => e.factor_id)
        : sc.factor_id_array || [];
      if (!ids.length) continue;

      const sparks = ids.map(id => {
        const spark = this.factorService.resolveSpark(id);
        const color = this.sparkTypeToColor(spark.type);
        return { factorId: spark.factorId, level: spark.level, name: spark.name, color } as ResolvedSpark;
      }).sort((a, b) => {
        const cmpColor = (colorOrder[a.color] ?? 9) - (colorOrder[b.color] ?? 9);
        return cmpColor !== 0 ? cmpColor : b.level - a.level;
      });

      parents.push({
        name: getCharacterName(sc.card_id),
        position: posLabels[sc.position_id] || `P${sc.position_id}`,
        sparks,
      });
    }

    this.parentCache.set(vet, parents);
    return parents;
  }

  getAllSparksForFilter(vet: VeteranMember): ResolvedSpark[] {
    const own = this.getSparks(vet);
    const parentSparks = this.getParentSparks(vet).flatMap(p => p.sparks);
    return [...own, ...parentSparks];
  }

  private getSparksForScope(vet: VeteranMember, scope: SparkScope): ResolvedSpark[] {
    switch (scope) {
      case 'own': return this.getSparks(vet);
      case 'p1': {
        const p1 = this.getParentSparks(vet).find(p => p.position === 'P1');
        return p1 ? p1.sparks : [];
      }
      case 'p2': {
        const p2 = this.getParentSparks(vet).find(p => p.position === 'P2');
        return p2 ? p2.sparks : [];
      }
      default: return this.getAllSparksForFilter(vet);
    }
  }

  getAffinity(vet: VeteranMember): number {
    if (!this.targetCharaId || !this.affinityService.isReady) return 0;
    const vetCharaId = this.getCharaId(vet);
    if (!vetCharaId) return 0;

    let total = this.affinityService.getAff2(this.targetCharaId, vetCharaId);

    const succession = vet.succession_chara_array;
    if (succession?.length) {
      for (const sc of succession) {
        if (sc.position_id !== 10 && sc.position_id !== 20) continue;
        const gpCharaId = sc.card_id ? Math.floor(sc.card_id / 100) : null;
        if (!gpCharaId) continue;
        total += this.affinityService.getAff3(this.targetCharaId, vetCharaId, gpCharaId);
        const vetWins = vet.win_saddle_id_array ?? [];
        const gpWins = sc.win_saddle_id_array ?? [];
        if (vetWins.length && gpWins.length) {
          const vetSet = new Set(vetWins);
          total += gpWins.filter(w => vetSet.has(w)).length;
        }
      }
    }

    return total;
  }

  private getCharaId(vet: VeteranMember): number | null {
    if (vet.card_id) return Math.floor(vet.card_id / 100);
    return vet.trained_chara_id ?? null;
  }

  onImgError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  getAptGrade = getAptGrade;
  getScenarioName = getScenarioName;
  getStarDisplay = getStarDisplay;
  getCharaName = getCharacterName;
}
