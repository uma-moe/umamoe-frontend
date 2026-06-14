import { Component, OnInit, OnDestroy, HostListener, ViewChild, AfterViewInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { Meta, Title } from '@angular/platform-browser';
import { InheritanceService } from '../../services/inheritance.service';
import { VoteProtectionService, VoteState } from '../../services/vote-protection.service';
import { PlannerTransferService } from '../../services/planner-transfer.service';
import { FactorService, SparkInfo } from '../../services/factor.service';
import { SupportCardService } from '../../services/support-card.service';
import { AffinityService } from '../../services/affinity.service';
import { AuthService } from '../../services/auth.service';
import { BookmarkService } from '../../services/bookmark.service';
import { AppVersionService } from '../../services/app-version.service';
import { AnalyticsEventParams, GoogleAnalyticsService } from '../../services/google-analytics.service';
import { InheritanceFilterComponent, InheritanceFilters } from './inheritance-filter.component';
import { TrainerSubmitDialogComponent, TrainerSubmissionConfig } from '../../components/trainer-submit-dialog/trainer-submit-dialog.component';
import { TrainerIdFormatPipe } from '../../pipes/trainer-id-format.pipe';
import { ResolveSparksPipe } from '../../pipes/resolve-sparks.pipe';
import {
  InheritanceRecord,
  InheritanceSearchFilters
} from '../../models/inheritance.model';
import { SearchResult } from '../../models/common.model';
import { SupportCardShort } from '../../models/support-card.model';
import { environment } from '../../../environments/environment';
import { DatabaseFilterComponent, UnifiedSearchParams } from '../../components/database-filter/database-filter.component';
import { InheritanceEntryComponent } from '../../components/inheritance-entry/inheritance-entry.component';
import { getCharacterById } from '../../data/character.data';
import { LocaleNumberPipe } from '../../pipes/locale-number.pipe';

type P2SparkSource = 'main' | 'left' | 'right';

interface P2SparkSourceEntry {
  id: number;
  source: P2SparkSource;
}

@Component({
  selector: 'app-inheritance-database',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatSelectModule,
    InheritanceFilterComponent,
    TrainerIdFormatPipe,
    ResolveSparksPipe,
    DatabaseFilterComponent,
    InheritanceEntryComponent,
    LocaleNumberPipe,
    RouterModule
  ],
  templateUrl: './inheritance-database.component.html',
  styleUrl: './inheritance-database.component.scss'
})
export class InheritanceDatabaseComponent implements OnInit, OnDestroy, AfterViewInit {
  private destroy$ = new Subject<void>();
  private searchSubscription?: Subscription;
  private scrollListener!: () => void;
  private scrollThrottled = false;
  environment = environment;
  isMobile = false;
  mobileBreakpoint = 1000; // Adjust as needed for your design
  loading = false;
  loadingMore = false;
  allRecords: InheritanceRecord[] = [];
  renderedRecords: InheritanceRecord[] = [];
  currentFilters: InheritanceFilters | null = null;
  currentAdvancedFilters: UnifiedSearchParams | null = null;
  hasMoreRecords = true;
  // Scroll / pagination mode
  listMode: 'infinite' | 'paginated' = 'infinite';
  private readonly LIST_MODE_KEY = 'db-list-mode';
  // Pagination properties
  pageSize = 12;
  currentPage = 0;
  totalRecords = 0; // Total records from the search result
  // Sorting properties
  currentSortBy = 'affinity_score';
  currentSortOrder: 'asc' | 'desc' = 'desc';
  includeMaxFollowers = false;
  splitSparksMode = false;
  sparkShowPerRun = false;
  showP2Sparks = false;

  // Bookmarks tab
  activeTab: 'database' | 'bookmarks' = 'database';
  pendingSearch = false;
  bookmarksDirty = false;
  bookmarkRecords: InheritanceRecord[] = [];
  filteredBookmarks: InheritanceRecord[] = [];
  bookmarksLoading = false;
  bookmarkPage = 0;
  bookmarkPageSize = 12;
  /**
   * Bookmark filter:
   * - 'all'       — show every bookmark
   * - 'unchanged' — record still matches what was originally saved
   * - 'modified'  — source record changed since the user bookmarked it (is_stale)
   */
  bookmarkStaleFilter: 'all' | 'unchanged' | 'modified' = 'all';
  bookmarkBulkBusy = false;
  /**
   * Two-step guard for the destructive "Clear all" action. First click arms it
   * (button label flips to "Confirm clear all"); second click within 4s commits.
   */
  clearAllArmed = false;
  private clearAllTimer: any = null;
  readonly maxBookmarks = BookmarkService.MAX_BOOKMARKS;

  private toCharaId(cardId: number | undefined): number | null {
    if (!cardId) return null;
    return cardId >= 10000 ? Math.floor(cardId / 100) : cardId;
  }

  private getSelectedVeteranSuccession(positionId: 10 | 20) {
    return this.advancedFilter?.selectedVeteran?.succession_chara_array?.find(s => s.position_id === positionId) ?? null;
  }

  get currentTargetCharaId(): number | null {
    return this.toCharaId(this.advancedFilter?.treeData?.characterId);
  }

  get currentP2CharaId(): number | null {
    // Mirror AdvancedFilter's P2 normalization so the selected legacy is passed
    // into AffinityService as a base chara id, not a raw card id.
    const vet = this.advancedFilter?.selectedVeteran;
    if (vet) {
      return this.toCharaId(vet.card_id ?? vet.trained_chara_id ?? undefined);
    }
    return this.toCharaId(this.advancedFilter?.treeData?.children?.[1]?.characterId);
  }

  get currentGp2LeftCharaId(): number | null {
    const sc = this.getSelectedVeteranSuccession(10);
    if (sc) return this.toCharaId(sc.card_id);
    return this.toCharaId(this.advancedFilter?.treeData?.children?.[1]?.children?.[0]?.characterId);
  }

  get currentGp2RightCharaId(): number | null {
    const sc = this.getSelectedVeteranSuccession(20);
    if (sc) return this.toCharaId(sc.card_id);
    return this.toCharaId(this.advancedFilter?.treeData?.children?.[1]?.children?.[1]?.characterId);
  }

  get currentP2WinSaddleIds(): number[] | null {
    return this.advancedFilter?.selectedVeteran?.win_saddle_id_array ?? null;
  }

  get currentGp2LeftWinSaddleIds(): number[] | null {
    return this.getSelectedVeteranSuccession(10)?.win_saddle_id_array ?? null;
  }

  get currentGp2RightWinSaddleIds(): number[] | null {
    return this.getSelectedVeteranSuccession(20)?.win_saddle_id_array ?? null;
  }

  // Cached P2 spark arrays - only recomputed in onAdvancedFilterChange, never on every CD cycle
  private _p2BlueSparks: number[] | null = null;
  private _p2PinkSparks: number[] | null = null;
  private _p2GreenSparks: number[] | null = null;
  private _p2WhiteSparks: number[] | null = null;
  private _p2BlueSparkSources: P2SparkSourceEntry[] | null = null;
  private _p2PinkSparkSources: P2SparkSourceEntry[] | null = null;
  private _p2GreenSparkSources: P2SparkSourceEntry[] | null = null;
  private _p2WhiteSparkSources: P2SparkSourceEntry[] | null = null;
  private advancedSearchSignature: string | null = null;

  get currentP2BlueSparks(): number[] | null { return this._p2BlueSparks; }
  get currentP2PinkSparks(): number[] | null { return this._p2PinkSparks; }
  get currentP2GreenSparks(): number[] | null { return this._p2GreenSparks; }
  get currentP2WhiteSparks(): number[] | null { return this._p2WhiteSparks; }
  get currentP2BlueSparkSources(): P2SparkSourceEntry[] | null { return this._p2BlueSparkSources; }
  get currentP2PinkSparkSources(): P2SparkSourceEntry[] | null { return this._p2PinkSparkSources; }
  get currentP2GreenSparkSources(): P2SparkSourceEntry[] | null { return this._p2GreenSparkSources; }
  get currentP2WhiteSparkSources(): P2SparkSourceEntry[] | null { return this._p2WhiteSparkSources; }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map(item => this.stableStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      const objectValue = value as Record<string, unknown>;
      return `{${Object.keys(objectValue)
        .filter(key => objectValue[key] !== undefined)
        .sort()
        .map(key => `${JSON.stringify(key)}:${this.stableStringify(objectValue[key])}`)
        .join(',')}}`;
    }
    return JSON.stringify(value) ?? 'undefined';
  }

  private getAdvancedSearchSignature(params: UnifiedSearchParams | null): string {
    if (!params) return '';
    const searchParams: Record<string, unknown> = { ...params };
    delete searchParams['p2_main_chara_id'];
    delete searchParams['p2_win_saddle'];
    return this.stableStringify(searchParams);
  }

  private trackDatabaseEvent(eventName: string, params: AnalyticsEventParams = {}): void {
    this.googleAnalyticsService.trackEvent(eventName, {
      feature: 'inheritance_database',
      ...params,
    });
  }

  private trackAdvancedFilterChange(params: UnifiedSearchParams, changeType: string): void {
    this.trackDatabaseEvent('filter_inheritance_database', {
      change_type: changeType,
      sort_by: this.currentSortBy,
      filter_count: this.countAnalyticsFilterValues(params),
      blue_groups: params.blue_sparks?.length ?? 0,
      pink_groups: params.pink_sparks?.length ?? 0,
      green_groups: params.green_sparks?.length ?? 0,
      white_groups: params.white_sparks?.length ?? 0,
      has_uql: !!params.uql,
      has_trainer_lookup: !!(params.trainer_id || this.trainerIdFilter),
      has_p2_context: !!(params.p2_main_chara_id || params.p2_win_saddle?.length),
      has_support_filter: !!params.support_card_id,
      has_legacy_filter: !!(params.main_legacy_white?.length || params.left_legacy_white?.length || params.right_legacy_white?.length),
    });
  }

  private trackLegacyFilterChange(filters: InheritanceFilters | null): void {
    this.trackDatabaseEvent('filter_inheritance_database', {
      change_type: 'legacy',
      sort_by: this.currentSortBy,
      filter_count: this.countAnalyticsFilterValues(filters ?? {}),
      blue_groups: filters?.mainStats?.filter(stat => !!stat.type && !!stat.level).length ?? 0,
      pink_groups: filters?.aptitudes?.filter(stat => !!stat.type && !!stat.level).length ?? 0,
      green_groups: filters?.skills?.filter(stat => !!stat.type && !!stat.level).length ?? 0,
      white_groups: filters?.whiteSparks?.filter(stat => !!stat.type && !!stat.level).length ?? 0,
      has_trainer_lookup: !!this.trainerIdFilter,
    });
  }

  private countAnalyticsFilterValues(value: unknown): number {
    if (value === null || value === undefined) {
      return 0;
    }

    if (Array.isArray(value)) {
      return value.reduce((count, item) => count + this.countAnalyticsFilterValues(item), 0);
    }

    if (typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !key.includes('highlight'))
        .reduce((count, [, item]) => count + this.countAnalyticsFilterValues(item), 0);
    }

    if (typeof value === 'string') {
      return value.trim() ? 1 : 0;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) && value > 0 ? 1 : 0;
    }

    return value === true ? 1 : 0;
  }

  private withSelectedVeteranP2Params(params: UnifiedSearchParams): UnifiedSearchParams {
    const veteran = this.advancedFilter?.selectedVeteran;
    if (!veteran) return params;
    const p2MainCharaId = this.toCharaId(veteran.card_id ?? veteran.trained_chara_id ?? undefined) ?? undefined;
    const p2WinSaddle = veteran.win_saddle_id_array?.length ? veteran.win_saddle_id_array : undefined;
    if (!p2MainCharaId && !p2WinSaddle) return params;
    return {
      ...params,
      p2_main_chara_id: params.p2_main_chara_id ?? p2MainCharaId,
      p2_win_saddle: params.p2_win_saddle ?? p2WinSaddle,
    };
  }

  private refreshP2SparkCache(): void {
    this._p2BlueSparkSources = this.resolveP2SparkSourcesByColor(0);
    this._p2PinkSparkSources = this.resolveP2SparkSourcesByColor(1);
    this._p2GreenSparkSources = this.resolveP2SparkSourcesByColor(5);
    this._p2WhiteSparkSources = this.resolveP2SparkSourcesByColor(2, 3, 4);

    this._p2BlueSparks = this._p2BlueSparkSources?.map(s => s.id) ?? null;
    this._p2PinkSparks = this._p2PinkSparkSources?.map(s => s.id) ?? null;
    this._p2GreenSparks = this._p2GreenSparkSources?.map(s => s.id) ?? null;
    this._p2WhiteSparks = this._p2WhiteSparkSources?.map(s => s.id) ?? null;
  }

  private resolveP2SparkSourcesByColor(...types: number[]): P2SparkSourceEntry[] | null {
    const vet = this.advancedFilter?.selectedVeteran;
    if (!vet) return null;
    const typeSet = new Set(types);

    const allEntries: P2SparkSourceEntry[] = [];

    if (vet.inheritance) {
      const inh = vet.inheritance;
      allEntries.push(
        ...(inh.blue_sparks || []).map(id => ({ id, source: 'main' as const })),
        ...(inh.pink_sparks || []).map(id => ({ id, source: 'main' as const })),
        ...(inh.green_sparks || []).map(id => ({ id, source: 'main' as const })),
        ...(inh.white_sparks || []).map(id => ({ id, source: 'main' as const })),
      );
    } else {
      const own = vet.factor_info_array?.length
        ? vet.factor_info_array.map(e => e.factor_id)
        : (vet.factors ?? []);
      allEntries.push(...own.map(id => ({ id, source: 'main' as const })));
    }

    if (vet.succession_chara_array?.length) {
      for (const sc of vet.succession_chara_array) {
        if (sc.position_id !== 10 && sc.position_id !== 20) continue;
        const source: P2SparkSource = sc.position_id === 10 ? 'left' : 'right';
        const gpIds = sc.factor_info_array?.length
          ? sc.factor_info_array.map(e => e.factor_id)
          : (sc.factor_id_array || []);
        allEntries.push(...gpIds.map(id => ({ id, source })));
      }
    }

    const filtered = allEntries.filter(s => typeSet.has(this.factorService.resolveSpark(s.id).type));
    return filtered.length ? filtered : null;
  }

  sortOptions = [
    { value: 'affinity_score', label: 'Affinity' },
    { value: 'win_count', label: 'G1 Wins' },
    { value: 'white_count', label: 'White Count' },
    { value: 'score', label: 'Score' },
    { value: 'submitted_at', label: 'Most Recent' },
  ];
  // Vote state tracking
  voteStates = new Map<string, VoteState>();
  @ViewChild(DatabaseFilterComponent) advancedFilter!: DatabaseFilterComponent;
  // Trainer ID filter from URL parameters
  trainerIdFilter: string | null = null;

  // Bound method references for child component inputs
  boundIsSparkMatched = this.isSparkMatched.bind(this);
  boundGetLevelFromMainParent = this.getLevelFromMainParent.bind(this);
  private readonly mainParentLevelCache = new WeakMap<InheritanceRecord, Map<string, string>>();
  private readonly initialRecordRenderBatchSize = 8;
  private readonly recordRenderBatchSize = 8;
  private recordRenderFrame: number | null = null;
  private recordRenderGeneration = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private inheritanceService: InheritanceService,
    private voteProtection: VoteProtectionService,
    private factorService: FactorService,
    private supportCardService: SupportCardService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private meta: Meta,
    private title: Title,
    private ngZone: NgZone,
    private plannerTransfer: PlannerTransferService,
    private affinityService: AffinityService,
    public authService: AuthService,
    public bookmarkService: BookmarkService,
    private appVersionService: AppVersionService,
    private googleAnalyticsService: GoogleAnalyticsService,
  ) {
    // Restore list mode preference
    const saved = localStorage.getItem(this.LIST_MODE_KEY);
    if (saved === 'paginated' || saved === 'infinite') this.listMode = saved;
    // Restore page from URL - also force paginated mode
    const urlPage = parseInt(this.route.snapshot.queryParams['page'], 10);
    if (!isNaN(urlPage) && urlPage > 0) {
      this.currentPage = urlPage - 1;
      this.listMode = 'paginated';
    }
    this.title.setTitle('Database | uma.moe');
    this.meta.addTags([
      { name: 'description', content: 'Browse and search the Umamusume database. Find optimal inheritance skills and support cards for your team.' },
      { property: 'og:title', content: 'Database | uma.moe' },
      { property: 'og:description', content: 'Browse and search the Umamusume database. Find optimal inheritance skills and support cards for your team.' },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://uma.moe/database' },
      { property: 'og:image', content: 'https://uma.moe/assets/logo.webp' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'Database | uma.moe' },
      { name: 'twitter:description', content: 'Browse and search the Umamusume database. Find optimal inheritance skills and support cards for your team.' },
      { name: 'twitter:image', content: 'https://uma.moe/assets/logo.webp' }
    ]);
  }
  ngOnInit() {
    this.affinityService.load();
    if (this.authService.isLoggedIn()) {
      this.bookmarkService.loadBookmarks().pipe(takeUntil(this.destroy$)).subscribe();
    }
    // Check for trainer_id URL parameter
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const trainerId = params['trainer_id'];
      if (trainerId && trainerId !== this.trainerIdFilter) {
        this.trainerIdFilter = trainerId;
        // Reset search when trainer_id parameter changes
        this.currentPage = 0;
        this.clearRecords();
        this.hasMoreRecords = true;
        this.searchRecords();
        
        // Update page title and meta tags to reflect trainer filter
        this.title.setTitle(`Database - Trainer ${trainerId} | uma.moe`);
        this.meta.updateTag({ 
          name: 'description', 
          content: `Browse records for trainer ${trainerId} in the Umamusume database.` 
        });
      } else if (!trainerId && this.trainerIdFilter) {
        // Trainer ID parameter was removed, clear filter
        this.trainerIdFilter = null;
        this.currentPage = 0;
        this.clearRecords();
        this.hasMoreRecords = true;
        this.searchRecords();
        
        // Reset title and meta tags
        this.title.setTitle('Database | uma.moe');
        this.meta.updateTag({ 
          name: 'description', 
          content: 'Browse and search the Umamusume database. Find optimal inheritance skills and support cards for your team.' 
        });
      }
    });
    // Initial search (will include trainer_id if present in URL)
    // Skip if filters param is present, as ngAfterViewInit will handle it
    const hasFilters = this.route.snapshot.queryParams['filters'];
    const hasSavedFilters = !hasFilters && DatabaseFilterComponent.hasSavedFilterState();
    if (!this.trainerIdFilter && !hasFilters && !hasSavedFilters) {
      this.searchRecords();
    }
    this.ngZone.runOutsideAngular(() => this.initScrollListener());
  }
  private initScrollListener() {
    this.scrollListener = () => {
      if (this.scrollThrottled) return;
      this.scrollThrottled = true;
      requestAnimationFrame(() => {
        if (this.isNearRenderBoundary()) {
          this.ngZone.run(() => {
            if (this.hasUnrenderedRecords) {
              this.scheduleRecordRenderExpansion(this.recordRenderGeneration);
            } else if (this.listMode === 'infinite' && this.hasMoreRecords && !this.loading && !this.loadingMore) {
              this.loadMoreRecords();
            }
          });
        }
        this.scrollThrottled = false;
      });
    };
    window.addEventListener('scroll', this.scrollListener, { passive: true });
  }

  private _pendingPage: number | null = null;

  ngAfterViewInit() {
    // Check for filters URL parameter
    const filters = this.route.snapshot.queryParams['filters'];
    if (filters) {
      // Save the page from URL so it survives the debounced filter change
      if (this.currentPage > 0) {
        this._pendingPage = this.currentPage;
      }
      // Load state
      // Use setTimeout to avoid ExpressionChangedAfterItHasBeenCheckedError if the load triggers immediate changes
      setTimeout(() => {
        this.advancedFilter.loadSerializedState(filters);
      });
    }
  }
  onAdvancedFilterChange(params: UnifiedSearchParams) {
    if (this.advancedFilter?.isCurrentUqlOwnedLegacyResolutionPending()) {
      return;
    }
    const effectiveParams = this.withSelectedVeteranP2Params(params);
    if (this.advancedFilter?.currentUqlRequiresOwnedLegacyParams()
      && (!effectiveParams.p2_main_chara_id || !effectiveParams.p2_win_saddle?.length)) {
      return;
    }
    const previousSearchSignature = this.advancedSearchSignature;
    const nextSearchSignature = this.getAdvancedSearchSignature(effectiveParams);
    const isP2OnlyChange = previousSearchSignature !== null && previousSearchSignature === nextSearchSignature;
    const hasPendingPage = this._pendingPage !== null;

    this.currentAdvancedFilters = effectiveParams;
    this.advancedSearchSignature = nextSearchSignature;
    this.refreshP2SparkCache();
    this.trackAdvancedFilterChange(
      effectiveParams,
      isP2OnlyChange ? 'p2_context' : (hasPendingPage ? 'url_restore' : 'manual'),
    );
    
    // Update URL
    const serialized = this.advancedFilter.getSerializedState();
    // Only update URL if serialized string is not empty/default (optional optimization)
    
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { filters: serialized },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
    // Reset pagination and search (but preserve page when restoring from URL)
    if (hasPendingPage) {
      this.currentPage = this._pendingPage!;
      this._pendingPage = null;
    } else {
      this.currentPage = 0;
    }

    if (isP2OnlyChange && !hasPendingPage) {
      this.hasMoreRecords = true;
      this.searchRecords({ preserveExisting: true });
      return;
    }

    this.clearRecords();
    this.hasMoreRecords = true;
    this.searchRecords();
    this.boundIsSparkMatched = this.isSparkMatched.bind(this);
    this.bookmarkPage = 0;
    this.applyBookmarkFilters();
  }
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.scrollListener) {
      window.removeEventListener('scroll', this.scrollListener);
    }
    this.cancelRecordRender();
  }
  onFiltersChanged(filters: InheritanceFilters) {
    if (!environment.production) {
    }
    this.currentFilters = filters;
    this.trackLegacyFilterChange(filters);
    this.currentPage = 0; // Reset to first page
    this.clearRecords();
    this.hasMoreRecords = true;
    this.searchRecords();
  }
  onMaxFollowersToggled(includeMax: boolean) {
    this.includeMaxFollowers = includeMax;
    this.trackDatabaseEvent('toggle_inheritance_max_followers', {
      enabled: includeMax,
      source: 'filter_panel',
    });
  }
  onHeaderMaxFollowersToggle(checked: boolean) {
    this.includeMaxFollowers = checked;
    this.trackDatabaseEvent('toggle_inheritance_max_followers', {
      enabled: checked,
      source: 'results_header',
    });
    // Sync back to the advanced filter component
    if (this.advancedFilter) {
      this.advancedFilter.toggleMaxFollowers(checked);
    }
  }
  onSortChanged(event: any) {
    this.currentSortBy = event.value;
    this.trackDatabaseEvent('sort_inheritance_database', {
      sort_by: this.currentSortBy,
      active_tab: this.activeTab,
    });
    this.currentPage = 0;
    this.clearRecords();
    this.hasMoreRecords = true;
    this.searchRecords();
    this.boundIsSparkMatched = this.isSparkMatched.bind(this);
    this.bookmarkPage = 0;
    this.applyBookmarkFilters();
  }
  searchRecords(options: { preserveExisting?: boolean } = {}) {
    if (this.activeTab === 'bookmarks') {
      this.pendingSearch = true;
      return;
    }
    // If loading more (pagination), prevent duplicates
    if (this.currentPage > 0 && (this.loading || this.loadingMore)) {
      return;
    }
    // If new search (page 0), cancel previous
    if (this.currentPage === 0) {
      if (this.searchSubscription) {
        this.searchSubscription.unsubscribe();
      }
      const preserveExisting = !!options.preserveExisting && this.allRecords.length > 0;
      this.loading = !preserveExisting;
      this.loadingMore = false;
    } else {
      this.loadingMore = true;
    }
    let searchFilters: InheritanceSearchFilters = {};
    if (this.currentAdvancedFilters) {
      const af = this.currentAdvancedFilters;
      searchFilters = {
        trainerId: af.trainer_id || this.trainerIdFilter || undefined,
        trainerName: af.trainer_name,
        mainParentIds: af.main_parent_id,
        playerCharaId: af.player_chara_id,
        parentLeftId: af.parent_left_id,
        parentRightId: af.parent_right_id,
        parentId: af.parent_id,
        excludeParentId: af.exclude_parent_id,
        excludeMainParentId: af.exclude_main_parent_id,
        
        blueSparkGroups: af.blue_sparks,
        pinkSparkGroups: af.pink_sparks,
        greenSparkGroups: af.green_sparks,
        whiteSparkGroups: af.white_sparks,
        mainParentBlueSparks: af.main_parent_blue_sparks,
        mainParentPinkSparks: af.main_parent_pink_sparks,
        mainParentGreenSparks: af.main_parent_green_sparks,
        mainParentWhiteSparks: af.main_parent_white_sparks,
        
        optionalWhiteSparks: af.optional_white_sparks,
        optionalMainWhiteSparks: af.optional_main_white_sparks,
        lineageWhite: af.lineage_white,
        mainLegacyWhite: af.main_legacy_white,
        leftLegacyWhite: af.left_legacy_white,
        rightLegacyWhite: af.right_legacy_white,
        
        minMainBlueFactors: af.min_main_blue_factors,
        minMainPinkFactors: af.min_main_pink_factors,
        minMainGreenFactors: af.min_main_green_factors,
        minMainWhiteCount: af.min_main_white_count,
        
        minWinCount: af.min_win_count,
        minWhiteCount: af.min_white_count,
        maxFollowerNum: af.max_follower_num,
        minParentRank: af.parent_rank,
        minParentRarity: af.parent_rarity,
        supportCardId: af.support_card_id,
        minLimitBreak: af.min_limit_break,
        
        // Star Sum Filters
        minBlueStarsSum: af.min_blue_stars_sum,
        minPinkStarsSum: af.min_pink_stars_sum,
        minGreenStarsSum: af.min_green_stars_sum,
        minWhiteStarsSum: af.min_white_stars_sum,
        mainWinSaddle: af.main_win_saddle,
        
        p2MainCharaId: af.p2_main_chara_id,
        p2WinSaddle: af.p2_win_saddle,
        uql: af.uql,
        
        page: this.currentPage,
        pageSize: this.pageSize,
        sortBy: this.mapSortByToBackend(this.currentSortBy),
        sortOrder: 'desc'
      };
    } else {
      // Convert filter component format to service format
      searchFilters = {
      trainerId: this.trainerIdFilter || undefined, // Add trainer ID filter from URL
      umaId: this.currentFilters?.selectedCharacterId || undefined,
      page: this.currentPage,
      pageSize: this.pageSize,
      sortBy: this.mapSortByToBackend(this.currentSortBy),
      sortOrder: 'desc', // All V2 API sorts are descending
      minParentRank: (this.currentFilters?.parentRank && this.currentFilters.parentRank > 0) ? this.currentFilters.parentRank : undefined,
      minWinCount: (this.currentFilters?.winCount && this.currentFilters.winCount > 0) ? this.currentFilters.winCount : undefined,
      minWhiteCount: (this.currentFilters?.whiteCount && this.currentFilters.whiteCount > 0) ? this.currentFilters.whiteCount : undefined
    };
    // Convert main stats (blue sparks) to backend format using factor IDs
    if (this.currentFilters?.mainStats) {
      this.currentFilters.mainStats.forEach(stat => {
        if (stat.type && stat.level && stat.level > 0) {
          // Factor ID mapping for blue sparks (main stats)
          switch (stat.type) {
            case '10': // Speed
              searchFilters.speedSpark = stat.level;
              break;
            case '20': // Stamina
              searchFilters.staminaSpark = stat.level;
              break;
            case '30': // Power
              searchFilters.powerSpark = stat.level;
              break;
            case '40': // Guts
              searchFilters.gutsSpark = stat.level;
              break;
            case '50': // Wit
              searchFilters.witSpark = stat.level;
              break;
          }
        }
      });
    }
    // Convert aptitudes (pink sparks) to backend format using factor IDs
    if (this.currentFilters?.aptitudes) {
      this.currentFilters.aptitudes.forEach(aptitude => {
        if (aptitude.type && aptitude.level && aptitude.level > 0) {
          // Factor ID mapping for pink sparks (aptitudes)
          switch (aptitude.type) {
            case '110': // Turf
              searchFilters.turfSpark = aptitude.level;
              break;
            case '120': // Dirt
              searchFilters.dirtSpark = aptitude.level;
              break;
            case '310': // Sprint
              searchFilters.sprintSpark = aptitude.level;
              break;
            case '320': // Mile
              searchFilters.mileSpark = aptitude.level;
              break;
            case '330': // Middle
              searchFilters.middleSpark = aptitude.level;
              break;
            case '340': // Long
              searchFilters.longSpark = aptitude.level;
              break;
            case '210': // Front Runner
              searchFilters.frontRunnerSpark = aptitude.level;
              break;
            case '220': // Pace Chaser
              searchFilters.paceChaserSpark = aptitude.level;
              break;
            case '230': // Late Surger
              searchFilters.lateSurgerSpark = aptitude.level;
              break;
            case '240': // End
              searchFilters.endSpark = aptitude.level;
              break;
          }
        }
      });
    }
    // Convert skills (green sparks) to unique skills array with levels
    if (this.currentFilters?.skills && this.currentFilters.skills.length > 0) {
      const uniqueSkillIds: number[] = [];
      const skillLevels: { [skillId: number]: number } = {};
      this.currentFilters.skills.forEach(skill => {
        if (skill.type && skill.level && skill.level > 0) {
          // Parse skill type as skill ID if it's a number
          const skillId = parseInt(skill.type, 10);
          if (!isNaN(skillId)) {
            uniqueSkillIds.push(skillId);
            skillLevels[skillId] = skill.level;
          }
        }
      });
      if (uniqueSkillIds.length > 0) {
        searchFilters.uniqueSkills = uniqueSkillIds;
        searchFilters.skillLevels = skillLevels;
      }
    }
    // Convert white sparks to backend format using factor IDs
    if (this.currentFilters?.whiteSparks && this.currentFilters.whiteSparks.length > 0) {
      const whiteSparkFactors: number[] = [];
      this.currentFilters.whiteSparks.forEach(whiteSpark => {
        if (whiteSpark.type && whiteSpark.level && whiteSpark.level > 0) {
          // Create spark value: factorId + level (concatenated as number)
          const factorId = parseInt(whiteSpark.type, 10);
          if (!isNaN(factorId)) {
            const sparkValue = parseInt(`${factorId}${whiteSpark.level}`, 10);
            whiteSparkFactors.push(sparkValue);
          }
        }
      });
      if (whiteSparkFactors.length > 0) {
        searchFilters.whiteSparkFactors = whiteSparkFactors;
      }
    }
    }
    this.searchSubscription = this.inheritanceService.searchInheritance(searchFilters, searchFilters.page, searchFilters.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.totalRecords = result.total || 0;
          this._totalPages = result.totalPages || Math.max(1, Math.ceil(this.totalRecords / this.pageSize));
          if (this.currentPage === 0) {
            this.replaceRecords(result.items || []);
          } else {
            this.appendRecords(result.items || []);
          }
          // Check if there are more records to load
          this.hasMoreRecords = (result.items?.length || 0) >= this.pageSize;
          if (!environment.production) {
          }
          this.updateVoteStates();
          this.loading = false;
          this.loadingMore = false;
        },
        error: (error) => {
          console.error('V2 Search error:', error);
          
          // Revert page number on error so user can retry
          if (this.currentPage > 0) {
            this.currentPage--;
          }
          
          this.loading = false;
          this.loadingMore = false;
          
          // Don't show generic error for rate limiting (handled by interceptor popup)
          if (error.status !== 429) {
            this.snackBar.open(this.withBuild('Error loading records'), 'Close', { duration: 3000 });
          }
        }
      });
  }
  loadMoreRecords() {
    if (!this.hasMoreRecords || this.loading || this.loadingMore || this.isRenderingRecords || this.hasUnrenderedRecords) {
      return;
    }
    this.trackDatabaseEvent('load_more_inheritance_records', {
      next_page: this.currentPage + 1,
      page_size: this.pageSize,
      sort_by: this.currentSortBy,
      total_records: this.totalRecords,
    });
    this.currentPage++;
    this.searchRecords();
  }
  trackByRecordId(index: number, record: InheritanceRecord): number | string {
    return record.id;
  }

  get isRenderingRecords(): boolean {
    return this.recordRenderFrame !== null;
  }

  get hasUnrenderedRecords(): boolean {
    return this.renderedRecords.length < this.allRecords.length;
  }

  private clearRecords(): void {
    this.cancelRecordRender();
    this.recordRenderGeneration++;
    this.allRecords = [];
    this.renderedRecords = [];
  }

  private replaceRecords(records: InheritanceRecord[]): void {
    this.cancelRecordRender();
    this.recordRenderGeneration++;
    this.allRecords = records;
    this.renderInitialRecordBatch();
  }

  private appendRecords(records: InheritanceRecord[]): void {
    if (!records.length) return;
    this.allRecords = [...this.allRecords, ...records];
    if (!this.renderedRecords.length) {
      this.recordRenderGeneration++;
      this.renderInitialRecordBatch();
      return;
    }
    this.maybeRenderMoreRecordsForViewport();
  }

  private renderInitialRecordBatch(): void {
    const initialCount = Math.min(this.initialRecordRenderBatchSize, this.allRecords.length);
    this.renderedRecords = this.allRecords.slice(0, initialCount);
    if (initialCount < this.allRecords.length) {
      this.scheduleRecordRenderExpansion(this.recordRenderGeneration);
    }
  }

  private scheduleRecordRenderExpansion(generation: number): void {
    if (this.recordRenderFrame !== null) return;
    this.recordRenderFrame = requestAnimationFrame(() => {
      this.recordRenderFrame = null;
      if (generation !== this.recordRenderGeneration) return;

      const nextCount = Math.min(
        this.allRecords.length,
        this.renderedRecords.length + this.recordRenderBatchSize,
      );
      this.renderedRecords = this.allRecords.slice(0, nextCount);

      if (nextCount < this.allRecords.length && this.isNearRenderBoundary()) {
        this.scheduleRecordRenderExpansion(generation);
      } else if (nextCount >= this.allRecords.length) {
        this.maybeLoadMoreRecordsForViewport();
      }
    });
  }

  private cancelRecordRender(): void {
    if (this.recordRenderFrame === null) return;
    cancelAnimationFrame(this.recordRenderFrame);
    this.recordRenderFrame = null;
  }

  private maybeLoadMoreRecordsForViewport(): void {
    if (this.listMode !== 'infinite' || !this.hasMoreRecords || this.loading || this.loadingMore) return;
    if (this.isNearRenderBoundary()) {
      this.loadMoreRecords();
    }
  }

  private maybeRenderMoreRecordsForViewport(): void {
    if (this.hasUnrenderedRecords && this.isNearRenderBoundary()) {
      this.scheduleRecordRenderExpansion(this.recordRenderGeneration);
    }
  }

  private isNearRenderBoundary(): boolean {
    const threshold = 300;
    const position = window.pageYOffset + window.innerHeight;
    const height = document.documentElement.scrollHeight;
    return position > height - threshold;
  }

  private getStatLevel(statType: string): number | undefined {
    if (!this.currentFilters?.mainStats) return undefined;
    const stat = this.currentFilters.mainStats.find(s => s.type === statType);
    return stat?.level;
  }
  private getAptitudeLevel(aptitudeType: string): number | undefined {
    if (!this.currentFilters?.aptitudes) return undefined;
    const aptitude = this.currentFilters.aptitudes.find(a => a.type === aptitudeType);
    return aptitude?.level;
  }
  get totalPages(): number {
    return this._totalPages;
  }
  _totalPages = 1;
  toggleListMode() {
    this.listMode = this.listMode === 'infinite' ? 'paginated' : 'infinite';
    localStorage.setItem(this.LIST_MODE_KEY, this.listMode);
    // Reset and re-search when switching modes
    this.currentPage = 0;
    this.clearRecords();
    this.hasMoreRecords = true;
    // Clear page param from URL
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
    this.searchRecords();
  }
  goToPage(page: number) {
    if (page < 0 || page >= this.totalPages || page === this.currentPage) return;
    this.currentPage = page;
    this.clearRecords();
    this.hasMoreRecords = true;
    // Update URL with page param
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: page > 0 ? page + 1 : null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
    this.searchRecords();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  private _visiblePagesCache: { page: number; total: number; result: number[] } | null = null;
  /** Returns page indices to display, using -1 for ellipsis. Always returns exactly 9 slots. */
  getVisiblePages(): number[] {
    const total = this.totalPages;
    const cur = this.currentPage;
    if (this._visiblePagesCache && this._visiblePagesCache.page === cur && this._visiblePagesCache.total === total) {
      return this._visiblePagesCache.result;
    }
    let result: number[];
    if (total <= 9) {
      // Pad with -2 (hidden) to keep length 9
      result = Array.from({ length: total }, (_, i) => i);
      while (result.length < 9) result.push(-2);
    } else if (cur <= 4) {
      // Near start: [0 1 2 3 4 5 6 ... last]
      result = [0, 1, 2, 3, 4, 5, 6, -1, total - 1];
    } else if (cur >= total - 5) {
      // Near end: [first ... last-6 last-5 last-4 last-3 last-2 last-1 last]
      result = [0, -1, total - 7, total - 6, total - 5, total - 4, total - 3, total - 2, total - 1];
    } else {
      // Middle: [first ... cur-2 cur-1 cur cur+1 cur+2 ... last]
      result = [0, -1, cur - 2, cur - 1, cur, cur + 1, cur + 2, -1, total - 1];
    }
    this._visiblePagesCache = { page: cur, total, result };
    return result;
  }
  hasActiveFilters(): boolean {
    if (!this.currentFilters && !this.trainerIdFilter) return false;
    return !!(
      this.trainerIdFilter ||
      this.currentFilters?.selectedCharacterId ||
      (this.currentFilters?.mainStats && this.currentFilters.mainStats.length > 0) ||
      (this.currentFilters?.aptitudes && this.currentFilters.aptitudes.length > 0) ||
      (this.currentFilters?.skills && this.currentFilters.skills.length > 0) ||
      (this.currentFilters?.whiteSparks && this.currentFilters.whiteSparks.length > 0)
    );
  }
  hasOptionalWhiteFilters(): boolean {
    if (!this.currentAdvancedFilters) return false;
    return !!(
      (this.currentAdvancedFilters.optional_white_sparks && this.currentAdvancedFilters.optional_white_sparks.length > 0) ||
      (this.currentAdvancedFilters.optional_main_white_sparks && this.currentAdvancedFilters.optional_main_white_sparks.length > 0)
    );
  }
  getSortLabel(): string {
    const option = this.sortOptions.find(o => o.value === this.currentSortBy);
    return option?.label || 'Affinity';
  }
  getStarArray(rating: number): number[] {
    if (!rating || rating < 0) return [];
    return Array(Math.floor(rating)).fill(0);
  }
  getEmptyStarArray(rating: number): number[] {
    if (!rating || rating < 0) return Array(5).fill(0);
    return Array(5 - Math.floor(rating)).fill(0);
  }
  // Helper methods for vote state
  getVoteState(recordId: string): VoteState {
    const voteState = this.voteProtection.getVoteState(recordId);
    if (!environment.production) {
    }
    return voteState;
  }
  updateVoteStates() {
    if (this.allRecords?.length > 0) {
      this.allRecords.forEach(record => {
        const recordId = record.id.toString(); // Convert to string for vote tracking
        const voteState = this.voteProtection.getVoteState(recordId);
        this.voteStates.set(recordId, voteState);
        if (!environment.production) {
        }
      });
    }
  }
  // Check if account has max followers (1000 = cap, often bots/inactive)
  isMaxFollowers(record: InheritanceRecord): boolean {
    return record.follower_num === 1000;
  }
  // Helper methods for template to check record type
  isV2Record(record: InheritanceRecord): boolean {
    return typeof record.id === 'number';
  }
  isV1Record(record: InheritanceRecord): boolean {
    return typeof record.id === 'string';
  }
  // Helper methods for resolving spark IDs to meaningful names
  resolveSparks(sparkIds: number[]): SparkInfo[] {
    return this.factorService.resolveSparks(sparkIds);
  }
  // Get main parent factors for each spark type
  getMainParentFactors(record: InheritanceRecord, sparkType: 'blue' | 'pink' | 'green' | 'white'): SparkInfo[] {
    if (!this.isV2Record(record)) return [];
    let sparkArray: number[] = [];
    let mainCount = 0;
    switch (sparkType) {
      case 'blue':
        sparkArray = record.blue_sparks || [];
        mainCount = record.main_blue_factors || 0;
        break;
      case 'pink':
        sparkArray = record.pink_sparks || [];
        mainCount = record.main_pink_factors || 0;
        break;
      case 'green':
        sparkArray = record.green_sparks || [];
        mainCount = record.main_green_factors || 0;
        break;
      case 'white':
        sparkArray = record.white_sparks || [];
        mainCount = record.main_white_count || 0;
        break;
    }
    // Return the first N sparks (main parent contribution)
    const mainParentSparkIds = sparkArray.slice(0, mainCount);
    return this.resolveSparks(mainParentSparkIds);
  }
  resolveSpark(sparkId: number): SparkInfo {
    return this.factorService.resolveSpark(sparkId);
  }
  isVotingInProgress(recordId: string): boolean {
    const voteState = this.voteStates.get(recordId);
    if (!voteState) {
      const freshState = this.voteProtection.getVoteState(recordId);
      this.voteStates.set(recordId, freshState);
      return freshState.isInProgress;
    }
    return voteState.isInProgress;
  }
  canVoteOnRecord(recordId: string): boolean {
    const voteState = this.voteStates.get(recordId);
    if (!voteState) {
      const freshState = this.voteProtection.getVoteState(recordId);
      this.voteStates.set(recordId, freshState);
      return freshState.canVote && !freshState.isInProgress;
    }
    return voteState.canVote && !voteState.isInProgress;
  }
  getVoteCooldownMessage(recordId: string): string {
    return this.voteProtection.getCooldownMessage(recordId);
  }
  hasUserVoted(recordId: string): boolean {
    const voteState = this.voteStates.get(recordId);
    if (!voteState) {
      const freshState = this.voteProtection.getVoteState(recordId);
      this.voteStates.set(recordId, freshState);
      return freshState.hasVoted;
    }
    return voteState.hasVoted;
  }
  getUserVoteType(recordId: string): 'up' | 'down' | null {
    const voteState = this.voteStates.get(recordId);
    if (!voteState) {
      const freshState = this.voteProtection.getVoteState(recordId);
      this.voteStates.set(recordId, freshState);
      return freshState.voteType;
    }
    return voteState.voteType;
  }
  // Force refresh vote state for a specific record (for debugging)
  refreshVoteState(recordId: string) {
    const freshState = this.voteProtection.getVoteState(recordId);
    this.voteStates.set(recordId, freshState);
    if (!environment.production) {
    }
  }
  voteRecord(recordId: string, vote: number) {
    if (!recordId) return;
    const voteType = vote === 1 ? 'up' : 'down';
    // Check if user has already voted
    if (this.voteProtection.hasVoted(recordId)) {
      this.snackBar.open('You have already voted on this record', 'Close', { duration: 2000 });
      return;
    }
    // Use vote protection service to execute the vote
    const success = this.voteProtection.tryVote(recordId, () => {
      if (!environment.production) {
      }
      this.inheritanceService.voteOnInheritance(recordId, voteType)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (voteResult) => {
            if (!environment.production) {
            }
            // Record the vote in localStorage
            this.voteProtection.recordVote(recordId, voteType);
            this.snackBar.open(`Vote recorded!`, 'Close', { duration: 2000 });
            // Update the record in our current results
            if (this.allRecords?.length > 0) {
              const recordIndex = this.allRecords.findIndex(r => r.id === recordId);
              if (recordIndex >= 0) {
                this.allRecords[recordIndex].upvotes = voteResult.upvotes;
                this.allRecords[recordIndex].downvotes = voteResult.downvotes;
              }
            }
            // Mark voting as complete
            this.voteProtection.completeVoting(recordId, true);
            // Update vote state to reflect the new vote
            this.voteStates.set(recordId, this.voteProtection.getVoteState(recordId));
            this.trackDatabaseEvent('rate_inheritance_record', {
              vote_type: voteType,
              status: 'success',
            });
          },
          error: (error) => {
            console.error('Error voting:', error);
            this.snackBar.open(
              this.withBuild(`Failed to vote: ${error.message || 'Unknown error'}`),
              'Close',
              { duration: 3000 }
            );
            // Mark voting as complete (failed)
            this.voteProtection.completeVoting(recordId, false);
            // Update vote state
            this.voteStates.set(recordId, this.voteProtection.getVoteState(recordId));
            this.trackDatabaseEvent('rate_inheritance_record', {
              vote_type: voteType,
              status: 'error',
            });
          }
        });
    });
    if (!success) {
      if (!environment.production) {
      }
    } else {
      // Update vote state to show voting in progress
      this.voteStates.set(recordId, { ...this.voteProtection.getVoteState(recordId), isInProgress: true });
    }
  }
  // Rating methods (aliases for voting methods to match HTML template expectations)
  rateRecord(recordId: string, rating: number) {
    // Convert rating to vote: 1 (helpful) = upvote, -1 (unhelpful) = downvote
    const vote = rating > 0 ? 1 : 0;
    this.voteRecord(recordId, vote);
  }
  canRateRecord(recordId: string): boolean {
    return this.canVoteOnRecord(recordId);
  }
  hasUserRated(recordId: string): boolean {
    return this.hasUserVoted(recordId);
  }
  getRatingCooldownMessage(recordId: string): string {
    return this.getVoteCooldownMessage(recordId);
  }
  isRatingInProgress(recordId: string): boolean {
    return this.isVotingInProgress(recordId);
  }
  viewRecord(record: InheritanceRecord) {
    if (!record?.id) return;
    if (!environment.production) {
    }
    this.inheritanceService.getInheritanceById(record.id.toString())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (detailedRecord) => {
          if (!environment.production) {
          }
          // TODO: Open a detailed view dialog or navigate to detail page
          this.snackBar.open('Record details loaded successfully', 'Close', { duration: 2000 });
        },
        error: (error) => {
          console.error('Error fetching record details:', error);
          this.snackBar.open(
            this.withBuild(`Failed to load record details: ${error.message || 'Unknown error'}`),
            'Close',
            { duration: 3000 }
          );
        }
      });
  }
  async shareRecord(record: InheritanceRecord) {
    if (!record?.id) return;
    const url = `${window.location.origin}/inheritance/${record.id}`;
    const onCopySuccess = () => this.trackDatabaseEvent('copy_inheritance_link', {
      source: 'record_action',
    });
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText('');
        await navigator.clipboard.writeText(url);
        onCopySuccess();
        this.snackBar.open('Link copied to clipboard', 'Close', { duration: 2000 });
      } else {
        this.fallbackCopyToClipboard(url, {
          successMessage: 'Link copied to clipboard',
          failureMessage: 'Failed to copy link',
          onSuccess: onCopySuccess,
        });
      }
    } catch (error) {
      console.warn('Clipboard API failed for share, using fallback:', error);
      this.fallbackCopyToClipboard(url, {
        successMessage: 'Link copied to clipboard',
        failureMessage: 'Failed to copy link',
        onSuccess: onCopySuccess,
      });
    }
  }
  openSubmitDialog() {
    this.trackDatabaseEvent('open_trainer_submit', {
      source: 'database',
    });
    const config: TrainerSubmissionConfig = {
      title: 'Share Trainer ID',
      subtitle: 'Help the community grow'
    };
    const dialogRef = this.dialog.open(TrainerSubmitDialogComponent, {
      maxWidth: '500px',
      disableClose: false,
      panelClass: 'trainer-submit-dialog-panel',
      data: config
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result?.trainerId) {
        if (!environment.production) {
        }
        // For now, just show success message since we're only collecting trainer ID
        this.snackBar.open('Trainer ID submitted successfully!', 'Close', { duration: 3000 });
        this.trackDatabaseEvent('submit_trainer_id', {
          source: 'database_dialog',
        });
        // Refresh the records list
        this.searchRecords();
      }
    });
  }
  // Scroll detection is handled via passive event listener registered in initScrollListener()
  // Copy trainer ID to clipboard
  async copyTrainerId(trainerId: string, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!trainerId) {
      this.snackBar.open('No trainer ID to copy', 'Close', { duration: 2000 });
      return;
    }
    try {
      // Check if clipboard API is supported and we have permission
      const onCopySuccess = () => this.trackDatabaseEvent('copy_trainer_id', {
        source: 'database_record',
      });
      if (navigator.clipboard && window.isSecureContext) {
        // Clear clipboard first, then write new content
        await navigator.clipboard.writeText('');
        await navigator.clipboard.writeText(trainerId);
        onCopySuccess();
        this.snackBar.open(`Trainer ID copied: ${trainerId}`, 'Close', { duration: 2000 });
      } else {
        // Use fallback method
        this.fallbackCopyToClipboard(trainerId, { onSuccess: onCopySuccess });
      }
    } catch (error) {
      console.warn('Clipboard API failed, using fallback:', error);
      this.fallbackCopyToClipboard(trainerId, {
        onSuccess: () => this.trackDatabaseEvent('copy_trainer_id', {
          source: 'database_record',
        }),
      });
    }
  }
  private fallbackCopyToClipboard(
    text: string,
    options: { successMessage?: string; failureMessage?: string; onSuccess?: () => void } = {},
  ) {
    // Create a temporary textarea element
    const textArea = document.createElement('textarea');
    textArea.value = text;
    // Make it invisible and non-interactive
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.style.opacity = '0';
    textArea.setAttribute('readonly', '');
    textArea.setAttribute('aria-hidden', 'true');
    // Add to DOM, select, copy, then remove
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, 99999); // For mobile devices
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        options.onSuccess?.();
        this.snackBar.open(options.successMessage || `Trainer ID copied: ${text}`, 'Close', { duration: 2000 });
      } else {
        this.snackBar.open(this.withBuild(options.failureMessage || 'Failed to copy trainer ID'), 'Close', { duration: 2000 });
      }
    } catch (err) {
      console.error('Fallback copy failed:', err);
      this.snackBar.open(this.withBuild(options.failureMessage || 'Failed to copy trainer ID'), 'Close', { duration: 2000 });
    } finally {
      document.body.removeChild(textArea);
    }
  }
  // Report trainer friend list as full
  reportUnavailable(trainerId: string, event: Event) {
    event.stopPropagation();
    // Show confirmation dialog
    const confirmed = confirm(`Report trainer ${trainerId} as unavailable or friend list full?`);
    if (!confirmed) {
      return;
    }
    // Attempt to start the report process
    // if (!this.voteProtection.attemptReport(trainerId)) {
    //   return; // Protection service will show appropriate message
    // }
    // Call backend API to report user
    this.inheritanceService.reportUserUnavailable(trainerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // this.voteProtection.markReportCompleted(trainerId);
          this.snackBar.open('Trainer reported as unavailable', 'Close', { duration: 2000 });
          this.trackDatabaseEvent('report_trainer_unavailable', {
            source: 'database_record',
            status: 'success',
          });
          this.searchRecords();
        },
        error: (error: any) => {
          // this.voteProtection.markReportFailed(trainerId);
          console.error('Failed to report trainer:', error);
          // For now, show success even if backend fails (graceful degradation)
          this.snackBar.open(this.withBuild('Report submitted (service temporarily unavailable)'), 'Close', { duration: 3000 });
          this.trackDatabaseEvent('report_trainer_unavailable', {
            source: 'database_record',
            status: 'fallback',
          });
        }
      });
  }
  // Check if trainer has been reported
  hasReportedTrainer(trainerId: string): boolean {
    return this.voteProtection.hasReported(trainerId);
  }

  openInPlanner(record: InheritanceRecord): void {
    const target = this.advancedFilter?.treeData?.characterId || null;
    const vet = this.advancedFilter?.selectedVeteran || null;

    this.plannerTransfer.set({ record, targetCharaId: target, veteran: vet });
    this.trackDatabaseEvent('open_lineage_planner', {
      source: 'database_record',
      has_target_context: !!target,
      has_veteran_context: !!vet,
    });
    const url = this.router.serializeUrl(
      this.router.createUrlTree(['/tools/lineage-planner'], { queryParams: { from: 'db' } })
    );
    window.open(url, '_blank');
  }
  // Check if reporting is in progress
  isReportingInProgress(trainerId: string): boolean {
    return this.voteProtection.isReportingInProgress(trainerId);
  }
  @HostListener('window:resize', ['$event'])
  onResize(event: any): void {
    this.checkMobileBreakpoint();
  }
  private checkMobileBreakpoint(): void {
    const wasIsMobile = this.isMobile;
    this.isMobile = window.innerWidth < this.mobileBreakpoint;
  }
  private mapSortByToBackend(sortBy: string): InheritanceSearchFilters['sortBy'] {
    const sortMapping: { [key: string]: InheritanceSearchFilters['sortBy'] } = {
      'win_count': 'win_count',
      'white_count': 'white_count',
      'score': 'score',
      'submitted_at': 'submitted_at', // This maps to last_updated in V2 API
      'upvotes': 'upvotes',
      'downvotes': 'downvotes',
      'trainer_id': 'trainer_id',
      'verified': 'verified',
      'affinity_score': 'affinity_score'
    };
    return sortMapping[sortBy] || 'win_count';
  }
  getLevelFromMainParent(currentspark: SparkInfo, record: InheritanceRecord): string | undefined {
    return this.getMainParentLevelMap(record).get(String(currentspark.factorId));
  }
  private getMainParentLevelMap(record: InheritanceRecord): Map<string, string> {
    const cached = this.mainParentLevelCache.get(record);
    if (cached) return cached;

    const levels = new Map<string, string>();
    const addSpark = (spark: number | null | undefined) => {
      if (spark === null || spark === undefined) return;
      levels.set(String(Math.floor(spark / 10)), String(spark % 10));
    };
    addSpark(record.main_blue_factors);
    addSpark(record.main_pink_factors);
    addSpark(record.main_green_factors);
    for (const spark of record.main_white_factors ?? []) {
      addSpark(spark);
    }
    this.mainParentLevelCache.set(record, levels);
    return levels;
  }
  isSparkMatched(spark: SparkInfo, record: InheritanceRecord): boolean {
    if (!this.currentAdvancedFilters) return false;
    const filterId = parseInt(`${spark.factorId}${spark.level}`, 10);
    const filters = this.currentAdvancedFilters;
    const isFromMainParent = !!this.getLevelFromMainParent(spark, record);
    const sparkFactorId = parseInt(spark.factorId, 10);
    const uqlHighlight = filters.uql_highlight;
    if (uqlHighlight) {
      if (uqlHighlight.globalSparkIds?.includes(filterId)) return true;
      if (isFromMainParent && uqlHighlight.mainSparkIds?.length) {
        const mainLevel = this.getLevelFromMainParent(spark, record);
        const mainFilterId = mainLevel ? parseInt(`${spark.factorId}${mainLevel}`, 10) : filterId;
        if (uqlHighlight.mainSparkIds.includes(mainFilterId)) return true;
      }
      if (spark.type !== 0 && spark.type !== 1 && spark.type !== 5) {
        if (uqlHighlight.optionalWhiteFactorIds?.includes(sparkFactorId)) return true;
        if (uqlHighlight.lineageWhiteFactorIds?.includes(sparkFactorId)) return true;
        if (isFromMainParent && uqlHighlight.optionalMainWhiteFactorIds?.includes(sparkFactorId)) return true;
      }
    }
    const checkGroups = (groups: number[][] | undefined) => {
      if (!groups) return false;
      for (const group of groups) {
        if (group.includes(filterId)) return true;
      }
      return false;
    };
    const checkArray = (arr: number[] | undefined) => {
      if (!arr) return false;
      return arr.includes(filterId);
    };
    // Check global filters (apply to any spark)
    if (spark.type === 0) { // Blue
       if (checkGroups(filters.blue_sparks)) return true;
    } else if (spark.type === 1) { // Pink
       if (checkGroups(filters.pink_sparks)) return true;
    } else if (spark.type === 5) { // Green
       if (checkGroups(filters.green_sparks)) return true;
    } else { // White
       if (checkGroups(filters.white_sparks)) return true;
       
       // Check optional white sparks (match by factorId only)
       if (filters.optional_white_sparks && filters.optional_white_sparks.includes(sparkFactorId)) {
         return true;
       }
       // Check lineage white sparks (match by factorId only)
       if (filters.lineage_white && filters.lineage_white.includes(sparkFactorId)) {
         return true;
       }
    }
    // Helper to check arrays by factorId only (for main parent filters where the 
    // total spark level can be higher than the main parent's individual contribution)
    const checkArrayByFactorId = (arr: number[] | undefined) => {
      if (!arr) return false;
      // Each ID in arr is like 103 (factorId 10 + level 3), extract factor ID by removing last digit
      for (const fullId of arr) {
        const arrFactorId = Math.floor(fullId / 10);
        if (arrFactorId === sparkFactorId) return true;
      }
      return false;
    };
    // Check main parent filters - only highlight if the spark actually comes from the main parent
    if (isFromMainParent) {
      // Match by factorId only since the displayed spark shows the TOTAL level across all parents,
      // but the filter is for main parent only.
      // e.g., filter for "main parent has 3★ speed" should highlight a result showing "9★ speed total"
      // as long as the main parent contributes to that speed factor.
      if (spark.type === 0) { // Blue
         if (checkArrayByFactorId(filters.main_parent_blue_sparks)) return true;
      } else if (spark.type === 1) { // Pink
         if (checkArrayByFactorId(filters.main_parent_pink_sparks)) return true;
      } else if (spark.type === 5) { // Green
         if (checkArrayByFactorId(filters.main_parent_green_sparks)) return true;
      } else { // White
         // main_parent_white_sparks: check by factorId only
         const checkGroupsByFactorId = (groups: number[][] | undefined) => {
           if (!groups) return false;
           for (const group of groups) {
             // Each ID in group is like 20159XX where last digit is level, extract factor ID
             for (const fullId of group) {
               const groupFactorId = Math.floor(fullId / 10);
               if (groupFactorId === sparkFactorId) return true;
             }
           }
           return false;
         };
         if (checkGroupsByFactorId(filters.main_parent_white_sparks)) return true;
         
         // Check optional main white sparks (match by factorId only)
         if (filters.optional_main_white_sparks && filters.optional_main_white_sparks.includes(sparkFactorId)) {
           return true;
         }
      }
    }
    return false;
  }
  // Support card helper methods
  getSupportCardInfo(supportCardId: number): Promise<SupportCardShort | undefined> {
    return this.supportCardService.getSupportCardById(supportCardId.toString()).pipe().toPromise();
  }
  getSupportCardImageUrl(supportCardId: number): string {
    return `/assets/images/support_card/half/support_card_s_${supportCardId}.webp`;
  }
  getSupportCardName(supportCardId: number): string {
    // For now, return a fallback until we implement card lookup
    return `Support Card ${supportCardId}`;
  }
  // Limit break display helper - matches support cards database format
  getLimitBreakArray(limitBreakCount: number): { filled: boolean }[] {
    // Maximum limit break is typically 4 for SSR cards
    const maxLimitBreak = 4;
    const icons = [];
    for (let i = 0; i < maxLimitBreak; i++) {
      icons.push({
        filled: i < limitBreakCount
      });
    }
    return icons;
  }
  // Handle support card image loading errors
  handleSupportCardImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    const wrapper = imgElement.closest('.support-card-wrapper');
    if (wrapper) {
      wrapper.classList.add('image-error');
    }
  }
  copyUserId(trainerId: string | undefined, event: Event) {
    event.stopPropagation();
    if (!trainerId || trainerId.trim() === '') return;
    navigator.clipboard.writeText(trainerId).then(() => {
      this.snackBar.open('Trainer ID copied to clipboard', 'Close', { duration: 2000 });
      this.trackDatabaseEvent('copy_trainer_id', {
        source: 'inheritance_entry',
      });
    }).catch(() => {
      this.snackBar.open(this.withBuild('Failed to copy Trainer ID'), 'Close', { duration: 2000 });
    });
  }

  /** Wrapper for the child component's copyInfo event (no native Event needed) */
  onEntryCopyInfo(record: InheritanceRecord): void {
    this.copyRecordInfo(record, new Event('click'));
  }

  copyRecordInfo(record: InheritanceRecord, event: Event) {
    event.stopPropagation();
    const lines: string[] = [];

    // Trainer info
    const trainerId = record.account_id || record.trainer_id || '';
    if (record.trainer_name) {
      lines.push(`Trainer: ${record.trainer_name} (${trainerId})`);
    } else if (trainerId) {
      lines.push(`Trainer ID: ${trainerId}`);
    }

    // Character names
    if (record.main_parent_id && record.parent_left_id && record.parent_right_id) {
      const main = getCharacterById(record.main_parent_id);
      const left = getCharacterById(record.parent_left_id);
      const right = getCharacterById(record.parent_right_id);
      lines.push(`Main: ${main?.name || record.main_parent_id}`);
      lines.push(`Parents: ${left?.name || record.parent_left_id} / ${right?.name || record.parent_right_id}`);
    } else if (record.main && record.parent1 && record.parent2) {
      lines.push(`Main: ${record.main.name}`);
      lines.push(`Parents: ${record.parent1.name} / ${record.parent2.name}`);
    }

    // Stats
    const stats: string[] = [];
    if (record.affinity_score !== undefined) stats.push(`Affinity: ${record.affinity_score}`);
    if (record.win_count !== undefined) stats.push(`G1 Wins: ${record.win_count}`);
    if (record.white_count !== undefined) stats.push(`White Skills: ${record.white_count}`);
    if (stats.length) lines.push(stats.join(' | '));

    // Factors
    const formatSparks = (sparks: number[], label: string) => {
      if (!sparks?.length) return;
      const resolved = this.factorService.resolveSparks(sparks);
      const items = resolved.map(s => `${s.level}★ ${s.name}`);
      lines.push(`${label}: ${items.join(', ')}`);
    };

    if (record.blue_sparks || record.pink_sparks || record.green_sparks || record.white_sparks) {
      formatSparks(record.blue_sparks || [], 'Blue');
      formatSparks(record.pink_sparks || [], 'Pink');
      formatSparks(record.green_sparks || [], 'Green');
      formatSparks(record.white_sparks || [], 'White');
    } else {
      if (record.blue_factors?.length) {
        lines.push(`Blue: ${record.blue_factors.map(f => `${f.level}★ ${f.type}`).join(', ')}`);
      }
      if (record.pink_factors?.length) {
        lines.push(`Pink: ${record.pink_factors.map(f => `${f.level}★ ${f.type}`).join(', ')}`);
      }
      if (record.unique_skills?.length) {
        lines.push(`Unique: ${record.unique_skills.map(f => `${f.level}★ ${f.skill.name}`).join(', ')}`);
      }
    }

    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      this.snackBar.open('Inheritance info copied to clipboard', 'Close', { duration: 2000 });
      this.trackDatabaseEvent('copy_inheritance_info', {
        source: 'inheritance_entry',
        has_trainer_lookup: !!trainerId,
        line_count: lines.length,
        stat_count: stats.length,
      });
    }).catch(() => {
      this.fallbackCopyToClipboard(text, {
        successMessage: 'Inheritance info copied to clipboard',
        failureMessage: 'Failed to copy inheritance info',
        onSuccess: () => this.trackDatabaseEvent('copy_inheritance_info', {
          source: 'inheritance_entry_fallback',
          has_trainer_lookup: !!trainerId,
          line_count: lines.length,
          stat_count: stats.length,
        }),
      });
    });
  }

  // --- Bookmarks Tab ---

  switchTab(tab: 'database' | 'bookmarks'): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.trackDatabaseEvent('switch_inheritance_tab', {
      target_tab: tab,
      bookmark_count: this.bookmarkService.count,
    });
    if (tab === 'bookmarks') {
      if (this.bookmarksDirty) {
        this.bookmarksDirty = false;
        this.loadBookmarks();
      } else if (this.bookmarkRecords.length === 0 && !this.bookmarksLoading) {
        this.loadBookmarks();
      }
    } else {
      if (this.pendingSearch) {
        this.pendingSearch = false;
        this.searchRecords();
      }
    }
  }

  loadBookmarks(): void {
    this.bookmarksLoading = true;
    this.bookmarkPage = 0;
    this.bookmarkService.loadBookmarks()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (records) => {
          this.bookmarkRecords = records;
          this.applyBookmarkFilters();
          this.bookmarksLoading = false;
        },
        error: () => {
          this.bookmarksLoading = false;
          this.snackBar.open(this.withBuild('Failed to load bookmarks'), 'Close', { duration: 3000 });
        }
      });
  }

  onBookmarkToggle(event: { id: string; bookmarked: boolean }): void {
    if (!this.authService.isLoggedIn()) {
      this.snackBar.open('Sign in to bookmark records', 'Close', { duration: 3000 });
      this.trackDatabaseEvent('bookmark_inheritance_record', {
        action_type: event.bookmarked ? 'add' : 'remove',
        status: 'requires_login',
      });
      return;
    }
    if (event.bookmarked) {
      if (this.bookmarkService.count >= this.maxBookmarks) {
        this.snackBar.open(`Bookmark limit reached (${this.maxBookmarks})`, 'Close', { duration: 3000 });
        this.trackDatabaseEvent('bookmark_inheritance_record', {
          action_type: 'add',
          status: 'limit_reached',
          bookmark_count: this.bookmarkService.count,
        });
        return;
      }
      this.bookmarkService.addBookmark(event.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.snackBar.open('Bookmarked', 'Close', { duration: 1500 });
            this.bookmarksDirty = true;
            this.trackDatabaseEvent('bookmark_inheritance_record', {
              action_type: 'add',
              status: 'success',
              bookmark_count: this.bookmarkService.count,
            });
          },
          error: () => {
            this.snackBar.open(this.withBuild('Failed to bookmark'), 'Close', { duration: 3000 });
            this.trackDatabaseEvent('bookmark_inheritance_record', {
              action_type: 'add',
              status: 'error',
            });
          }
        });
    } else {
      this.bookmarkService.removeBookmark(event.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.snackBar.open('Bookmark removed', 'Close', { duration: 1500 });
            this.bookmarksDirty = true;
            if (this.activeTab === 'bookmarks') {
              this.bookmarkRecords = this.bookmarkRecords.filter(r => r.account_id !== event.id);
              this.applyBookmarkFilters();
            }
            this.trackDatabaseEvent('bookmark_inheritance_record', {
              action_type: 'remove',
              status: 'success',
              bookmark_count: this.bookmarkService.count,
            });
          },
          error: () => {
            this.snackBar.open(this.withBuild('Failed to remove bookmark'), 'Close', { duration: 3000 });
            this.trackDatabaseEvent('bookmark_inheritance_record', {
              action_type: 'remove',
              status: 'error',
            });
          }
        });
    }
  }

  applyBookmarkFilters(): void {
    let records = [...this.bookmarkRecords];
    if (this.bookmarkStaleFilter === 'modified') {
      records = records.filter(r => !!r.is_stale);
    } else if (this.bookmarkStaleFilter === 'unchanged') {
      records = records.filter(r => !r.is_stale);
    }
    const af = this.currentAdvancedFilters;
    if (af) {
      records = records.filter(r => this.matchesFilters(r, af));
    }
    if (!this.includeMaxFollowers) {
      records = records.filter(r => r.follower_num !== 1000);
    }
    this.computeBookmarkAffinity(records);
    records = this.sortBookmarks(records);
    this.filteredBookmarks = records;
  }

  /** Number of bookmarks the source has changed for since the user saved them. */
  get modifiedBookmarkCount(): number {
    return this.bookmarkRecords.reduce((n, r) => n + (r.is_stale ? 1 : 0), 0);
  }

  setBookmarkStaleFilter(filter: 'all' | 'unchanged' | 'modified'): void {
    if (this.bookmarkStaleFilter === filter) return;
    this.bookmarkStaleFilter = filter;
    this.bookmarkPage = 0;
    this.applyBookmarkFilters();
  }

  /** Bulk-remove every bookmark whose source record has changed. */
  removeAllModifiedBookmarks(): void {
    if (this.bookmarkBulkBusy) return;
    const ids = this.bookmarkRecords
      .filter(r => r.is_stale && r.account_id)
      .map(r => r.account_id as string);
    if (ids.length === 0) return;

    this.bookmarkBulkBusy = true;
    this.bookmarkService.bulkDeleteBookmarks({ accountIds: ids })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const removed = new Set(ids);
          this.bookmarkRecords = this.bookmarkRecords.filter(
            r => !r.account_id || !removed.has(r.account_id),
          );
          this.applyBookmarkFilters();
          this.bookmarkBulkBusy = false;
          this.snackBar.open(
            `Removed ${res.removed_count} modified bookmark${res.removed_count === 1 ? '' : 's'}`,
            'Close',
            { duration: 2000 },
          );
        },
        error: () => {
          this.bookmarkBulkBusy = false;
          this.snackBar.open(this.withBuild('Failed to remove modified bookmarks'), 'Close', { duration: 3000 });
        },
      });
  }

  /**
   * Two-step "Clear all". First call arms the button for ~4 s; second call
   * within that window commits the bulk delete.
   */
  clearAllBookmarks(): void {
    if (this.bookmarkBulkBusy || this.bookmarkRecords.length === 0) return;

    if (!this.clearAllArmed) {
      this.clearAllArmed = true;
      clearTimeout(this.clearAllTimer);
      this.clearAllTimer = setTimeout(() => {
        this.clearAllArmed = false;
        this.clearAllTimer = null;
      }, 4000);
      return;
    }

    clearTimeout(this.clearAllTimer);
    this.clearAllTimer = null;
    this.clearAllArmed = false;
    this.bookmarkBulkBusy = true;
    this.bookmarkService.bulkDeleteBookmarks({ all: true })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.bookmarkRecords = [];
          this.applyBookmarkFilters();
          this.bookmarkBulkBusy = false;
          this.snackBar.open(
            `Removed ${res.removed_count} bookmark${res.removed_count === 1 ? '' : 's'}`,
            'Close',
            { duration: 2000 },
          );
        },
        error: () => {
          this.bookmarkBulkBusy = false;
          this.snackBar.open(this.withBuild('Failed to clear bookmarks'), 'Close', { duration: 3000 });
        },
      });
  }

  /** Cancel an armed Clear-all (user moved away or pressed Escape). */
  cancelClearAll(): void {
    if (!this.clearAllArmed) return;
    clearTimeout(this.clearAllTimer);
    this.clearAllTimer = null;
    this.clearAllArmed = false;
  }

  private withBuild(message: string): string {
    return this.appVersionService.appendBuildTag(message);
  }

  private computeBookmarkAffinity(records: InheritanceRecord[]): void {
    const targetId = this.currentTargetCharaId;
    if (!targetId || !this.affinityService.isReady) return;

    for (const r of records) {
      const mainId = r.main_parent_id ? (r.main_parent_id >= 10000 ? Math.floor(r.main_parent_id / 100) : r.main_parent_id) : null;
      const leftId = r.parent_left_id ? (r.parent_left_id >= 10000 ? Math.floor(r.parent_left_id / 100) : r.parent_left_id) : null;
      const rightId = r.parent_right_id ? (r.parent_right_id >= 10000 ? Math.floor(r.parent_right_id / 100) : r.parent_right_id) : null;

      if (!mainId) continue;

      const pair = this.affinityService.getAff2(targetId, mainId);
      const tripleLeft = leftId ? this.affinityService.getAff3(targetId, mainId, leftId) : 0;
      const tripleRight = rightId ? this.affinityService.getAff3(targetId, mainId, rightId) : 0;
      let total = pair + tripleLeft + tripleRight;

      const mainSaddles = r.main_win_saddles ?? [];
      const leftSaddles = new Set(r.left_win_saddles ?? []);
      const rightSaddles = new Set(r.right_win_saddles ?? []);
      total += mainSaddles.filter(w => leftSaddles.has(w)).length;
      total += mainSaddles.filter(w => rightSaddles.has(w)).length;

      r.affinity_score = total;
    }
  }

  private sortBookmarks(records: InheritanceRecord[]): InheritanceRecord[] {
    const sortBy = this.currentSortBy;
    return records.sort((a, b) => {
      let va: number, vb: number;
      switch (sortBy) {
        case 'affinity_score': va = a.affinity_score ?? 0; vb = b.affinity_score ?? 0; break;
        case 'win_count': va = a.win_count ?? 0; vb = b.win_count ?? 0; break;
        case 'white_count': va = a.white_count ?? 0; vb = b.white_count ?? 0; break;
        case 'score': va = a.parent_rank ?? 0; vb = b.parent_rank ?? 0; break;
        default: return 0; // submitted_at - keep original order (newest first from API)
      }
      return vb - va;
    });
  }

  private matchesFilters(r: InheritanceRecord, af: UnifiedSearchParams): boolean {
    if (af.uql && !this.matchesLocalUql(r, af.uql)) return false;

    if (af.trainer_id && r.account_id !== af.trainer_id && r.trainer_id !== af.trainer_id) return false;
    if (af.trainer_name && !(r.trainer_name ?? '').toLowerCase().includes(af.trainer_name.toLowerCase())) return false;

    if (af.main_parent_id?.length && !af.main_parent_id.includes(r.main_parent_id!)) return false;
    if (af.parent_left_id && r.parent_left_id !== af.parent_left_id) return false;
    if (af.parent_right_id && r.parent_right_id !== af.parent_right_id) return false;

    if (af.parent_id?.length) {
      const matched = af.parent_id.some(id => r.parent_left_id === id || r.parent_right_id === id);
      if (!matched) return false;
    }
    if (af.exclude_parent_id?.length) {
      if (af.exclude_parent_id.some(id => r.parent_left_id === id || r.parent_right_id === id)) return false;
    }
    if (af.exclude_main_parent_id?.length) {
      if (af.exclude_main_parent_id.includes(r.main_parent_id!)) return false;
    }

    if (af.min_win_count && (r.win_count ?? 0) < af.min_win_count) return false;
    if (af.min_white_count && (r.white_count ?? 0) < af.min_white_count) return false;
    if (af.parent_rank && (r.parent_rank ?? 0) < af.parent_rank) return false;
    if (af.parent_rarity && (r.parent_rarity ?? 0) < af.parent_rarity) return false;

    if (af.support_card_id && r.support_card_id !== af.support_card_id) return false;
    if (af.min_limit_break && (r.limit_break_count ?? 0) < af.min_limit_break) return false;
    if (af.max_limit_break !== undefined && (r.limit_break_count ?? 0) > af.max_limit_break) return false;
    if (af.min_experience && (r.support_card_experience ?? 0) < af.min_experience) return false;

    if (af.max_follower_num && r.follower_num !== null && r.follower_num !== undefined && r.follower_num > af.max_follower_num) return false;

    const checkSparkGroups = (groups: number[][] | undefined, sparks: number[] | undefined): boolean => {
      if (!groups?.length) return true;
      if (!sparks?.length) return false;
      const sparkSet = new Set(sparks);
      return groups.every(group => group.some(id => sparkSet.has(id)));
    };
    if (!checkSparkGroups(af.blue_sparks, r.blue_sparks)) return false;
    if (!checkSparkGroups(af.pink_sparks, r.pink_sparks)) return false;
    if (!checkSparkGroups(af.green_sparks, r.green_sparks)) return false;
    if (!checkSparkGroups(af.white_sparks, r.white_sparks)) return false;
    if (!checkSparkGroups(af.main_parent_white_sparks, r.main_white_factors)) return false;

    const checkMainSparkArray = (required: number[] | undefined, mainFactor: number | undefined): boolean => {
      if (!required?.length) return true;
      if (mainFactor === undefined) return false;
      const mainFactorId = Math.floor(mainFactor / 10);
      return required.some(id => Math.floor(id / 10) === mainFactorId);
    };
    if (!checkMainSparkArray(af.main_parent_blue_sparks, r.main_blue_factors)) return false;
    if (!checkMainSparkArray(af.main_parent_pink_sparks, r.main_pink_factors)) return false;
    if (!checkMainSparkArray(af.main_parent_green_sparks, r.main_green_factors)) return false;

    const sparkLevel = (sparkId: number | undefined) => sparkId === undefined ? 0 : sparkId % 10;
    if (af.min_main_blue_factors && sparkLevel(r.main_blue_factors) < af.min_main_blue_factors) return false;
    if (af.min_main_pink_factors && sparkLevel(r.main_pink_factors) < af.min_main_pink_factors) return false;
    if (af.min_main_green_factors && sparkLevel(r.main_green_factors) < af.min_main_green_factors) return false;
    if (af.min_main_white_count && (r.main_white_count ?? r.main_white_factors?.length ?? 0) < af.min_main_white_count) return false;

    const sumSparks = (sparks: number[] | undefined) => (sparks ?? []).reduce((s, id) => s + (id % 10), 0);
    if (af.min_blue_stars_sum && sumSparks(r.blue_sparks) < af.min_blue_stars_sum) return false;
    if (af.min_pink_stars_sum && sumSparks(r.pink_sparks) < af.min_pink_stars_sum) return false;
    if (af.min_green_stars_sum && sumSparks(r.green_sparks) < af.min_green_stars_sum) return false;
    if (af.min_white_stars_sum && sumSparks(r.white_sparks) < af.min_white_stars_sum) return false;

    if (af.main_win_saddle?.length) {
      const mainWins = new Set(r.main_win_saddles ?? []);
      if (!af.main_win_saddle.every(id => mainWins.has(id))) return false;
    }

    return true;
  }

  private matchesLocalUql(record: InheritanceRecord, uql: string): boolean {
    const expression = uql.replace(/^\s*where\s+/i, '').trim();
    if (!expression) return true;
    try {
      return this.evaluateLocalUqlExpression(record, expression);
    } catch {
      return true;
    }
  }

  private evaluateLocalUqlExpression(record: InheritanceRecord, expression: string): boolean {
    const trimmed = this.stripOuterLocalUqlParens(expression.trim());
    const orParts = this.splitLocalUqlByKeyword(trimmed, 'or');
    if (orParts.length > 1) return orParts.some(part => this.evaluateLocalUqlExpression(record, part));
    const andParts = this.splitLocalUqlByKeyword(trimmed, 'and');
    if (andParts.length > 1) return andParts.every(part => this.evaluateLocalUqlExpression(record, part));
    const notMatch = trimmed.match(/^not\s+(.+)$/i);
    if (notMatch) return !this.evaluateLocalUqlExpression(record, notMatch[1]);
    return this.evaluateLocalUqlPredicate(record, trimmed);
  }

  private evaluateLocalUqlPredicate(record: InheritanceRecord, predicate: string): boolean {
    const normalized = predicate.trim();
    const functionMatch = normalized.match(/^(contains|has|overlaps|any|has_all|contains_all|all)\s*\(\s*([a-z_][a-z0-9_]*)\s*,\s*(.*)\)$/i);
    if (functionMatch) {
      const fn = functionMatch[1].toLowerCase();
      const field = functionMatch[2];
      const values = this.parseLocalUqlNumberList(functionMatch[3]);
      const fieldValues = this.getLocalUqlFieldValues(record, field);
      if (fn === 'has_all' || fn === 'contains_all' || fn === 'all') {
        return values.every(value => fieldValues.includes(value));
      }
      return values.some(value => fieldValues.includes(value));
    }

    const supportMatch = normalized.match(/^(?:has_)?support_card\s*\((.*)\)$/i);
    if (supportMatch) return this.evaluateLocalUqlSupportCard(record, supportMatch[1]);

    const notInMatch = normalized.match(/^([a-z_][a-z0-9_]*)\s+not\s+in\s*\((.*)\)$/i);
    if (notInMatch) {
      const values = this.parseLocalUqlNumberList(notInMatch[2]);
      return !this.getLocalUqlFieldValues(record, notInMatch[1]).some(value => values.includes(value));
    }

    const inMatch = normalized.match(/^([a-z_][a-z0-9_]*)\s+in\s*\((.*)\)$/i);
    if (inMatch) {
      const values = this.parseLocalUqlNumberList(inMatch[2]);
      return this.getLocalUqlFieldValues(record, inMatch[1]).some(value => values.includes(value));
    }

    const likeMatch = normalized.match(/^([a-z_][a-z0-9_]*)\s+(i?like)\s+['"]?([^'"]*)['"]?$/i);
    if (likeMatch) {
      const fieldText = String(this.getLocalUqlFieldValue(record, likeMatch[1]) ?? '');
      const needle = likeMatch[3].replace(/%/g, '');
      return likeMatch[2].toLowerCase() === 'ilike'
        ? fieldText.toLowerCase().includes(needle.toLowerCase())
        : fieldText.includes(needle);
    }

    const comparisonMatch = normalized.match(/^([a-z_][a-z0-9_]*|\d+)\s*(=|!=|<>|>=|<=|>|<)\s*([a-z_][a-z0-9_]*|\d+)$/i);
    if (comparisonMatch) {
      const left = /^\d+$/.test(comparisonMatch[1]) ? Number(comparisonMatch[1]) : this.getLocalUqlFieldValue(record, comparisonMatch[1]);
      const right = /^\d+$/.test(comparisonMatch[3]) ? Number(comparisonMatch[3]) : this.getLocalUqlFieldValue(record, comparisonMatch[3]);
      return this.compareLocalUqlValues(Number(left ?? 0), comparisonMatch[2], Number(right ?? 0));
    }

    return true;
  }

  private evaluateLocalUqlSupportCard(record: InheritanceRecord, argsText: string): boolean {
    const args = this.splitLocalUqlArgs(argsText);
    let cardId: number | undefined;
    let matches = true;
    for (const arg of args) {
      const trimmed = arg.trim();
      if (!trimmed) continue;
      if (/^\d+$/.test(trimmed)) {
        cardId = Number(trimmed);
        continue;
      }
      const comparison = trimmed.match(/^(?:id|card_id|support_card_id|lb|limitbreak|limit_break|limit_break_count|exp|experience)\s*(=|!=|<>|>=|<=|>|<)\s*(\d+)$/i);
      if (!comparison) continue;
      const key = trimmed.split(/\s*(?:=|!=|<>|>=|<=|>|<)\s*/)[0].toLowerCase();
      const value = Number(comparison[2]);
      const actual = /^(?:id|card_id|support_card_id)$/.test(key)
        ? record.support_card_id
        : /^(?:lb|limitbreak|limit_break|limit_break_count)$/.test(key)
          ? record.limit_break_count
          : record.support_card_experience;
      matches = matches && this.compareLocalUqlValues(Number(actual ?? 0), comparison[1], value);
    }
    if (cardId !== undefined && record.support_card_id !== cardId) return false;
    return matches;
  }

  private getLocalUqlFieldValue(record: InheritanceRecord, field: string): string | number | null | undefined {
    switch (field) {
      case 'inheritance_id': return typeof record.id === 'number' ? record.id : Number(record.id) || undefined;
      case 'main_chara_id': return this.toCharaId(record.umamusume_id);
      case 'left_chara_id': return this.toCharaId(record.parent_left_id);
      case 'right_chara_id': return this.toCharaId(record.parent_right_id);
      case 'left_parent_id':
      case 'parent_left_id': return record.parent_left_id;
      case 'right_parent_id':
      case 'parent_right_id': return record.parent_right_id;
      case 'followers': return record.follower_num;
      case 'wins': return record.win_count;
      case 'name': return record.trainer_name;
      case 'race_affinity':
      case 'computed_race_affinity': return record.affinity_score;
      case 'support_card_count':
      case 'support_cards_count': return record.support_card_id ? 1 : 0;
      case 'blue_stars_sum': return this.sumLocalUqlSparks(record.blue_sparks);
      case 'pink_stars_sum': return this.sumLocalUqlSparks(record.pink_sparks);
      case 'green_stars_sum': return this.sumLocalUqlSparks(record.green_sparks);
      case 'white_stars_sum': return this.sumLocalUqlSparks(record.white_sparks);
      default: return (record as any)[field];
    }
  }

  private getLocalUqlFieldValues(record: InheritanceRecord, field: string): number[] {
    const value = this.getLocalUqlFieldValue(record, field);
    if (Array.isArray(value)) return value.filter(entry => typeof entry === 'number');
    return typeof value === 'number' ? [value] : [];
  }

  private sumLocalUqlSparks(sparks: number[] | undefined): number {
    return (sparks ?? []).reduce((sum, sparkId) => sum + (sparkId % 10), 0);
  }

  private compareLocalUqlValues(actual: number, operator: string, expected: number): boolean {
    switch (operator) {
      case '=': return actual === expected;
      case '!=':
      case '<>': return actual !== expected;
      case '>=': return actual >= expected;
      case '<=': return actual <= expected;
      case '>': return actual > expected;
      case '<': return actual < expected;
      default: return true;
    }
  }

  private parseLocalUqlNumberList(valueText: string): number[] {
    return valueText.replace(/[()]/g, '').split(',')
      .map(value => Number(value.trim()))
      .filter(value => Number.isFinite(value));
  }

  private splitLocalUqlArgs(valueText: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index < valueText.length; index++) {
      const char = valueText[index];
      if (char === '(') depth++;
      else if (char === ')') depth = Math.max(0, depth - 1);
      else if (char === ',' && depth === 0) {
        parts.push(valueText.slice(start, index));
        start = index + 1;
      }
    }
    parts.push(valueText.slice(start));
    return parts;
  }

  private splitLocalUqlByKeyword(expression: string, keyword: 'and' | 'or'): string[] {
    const parts: string[] = [];
    let depth = 0;
    let quote: string | null = null;
    let start = 0;
    for (let index = 0; index < expression.length; index++) {
      const char = expression[index];
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === '\'' || char === '"') {
        quote = char;
        continue;
      }
      if (char === '(') depth++;
      else if (char === ')') depth = Math.max(0, depth - 1);
      if (depth !== 0) continue;
      const slice = expression.slice(index);
      const match = slice.match(new RegExp(`^\\s+${keyword}\\s+`, 'i'));
      if (match) {
        parts.push(expression.slice(start, index).trim());
        index += match[0].length - 1;
        start = index + 1;
      }
    }
    if (!parts.length) return [expression];
    parts.push(expression.slice(start).trim());
    return parts.filter(Boolean);
  }

  private stripOuterLocalUqlParens(expression: string): string {
    let result = expression;
    while (result.startsWith('(') && result.endsWith(')') && this.localUqlParensWrapWholeExpression(result)) {
      result = result.slice(1, -1).trim();
    }
    return result;
  }

  private localUqlParensWrapWholeExpression(expression: string): boolean {
    let depth = 0;
    let quote: string | null = null;
    for (let index = 0; index < expression.length; index++) {
      const char = expression[index];
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === '\'' || char === '"') {
        quote = char;
        continue;
      }
      if (char === '(') depth++;
      else if (char === ')') depth--;
      if (depth === 0 && index < expression.length - 1) return false;
    }
    return depth === 0;
  }

  get pagedBookmarks(): InheritanceRecord[] {
    const start = this.bookmarkPage * this.bookmarkPageSize;
    return this.filteredBookmarks.slice(start, start + this.bookmarkPageSize);
  }

  get bookmarkTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredBookmarks.length / this.bookmarkPageSize));
  }

  goToBookmarkPage(page: number): void {
    if (page < 0 || page >= this.bookmarkTotalPages) return;
    this.bookmarkPage = page;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
