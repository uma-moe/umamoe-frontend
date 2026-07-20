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
import { TourAnchorMatMenuDirective } from 'ngx-ui-tour-md-menu';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { Meta, Title } from '@angular/platform-browser';
import { InheritanceService } from '../../services/inheritance.service';
import { VoteProtectionService, VoteState } from '../../services/vote-protection.service';
import { SupportCardService } from '../../services/support-card.service';
import { AuthService } from '../../services/auth.service';
import { BookmarkService } from '../../services/bookmark.service';
import { AffinityService, PlannerRaceWins, TreeAffinityWithRaceResult, TreeSlots } from '../../services/affinity.service';
import { AppVersionService } from '../../services/app-version.service';
import { AnalyticsEventParams, GoogleAnalyticsService } from '../../services/google-analytics.service';
import { InheritanceFilterComponent, InheritanceFilters } from './inheritance-filter.component';
import { TrainerSubmitDialogComponent, TrainerSubmissionConfig } from '../../components/trainer-submit-dialog/trainer-submit-dialog.component';
import {
  InheritanceRecord,
  InheritanceSearchFilters
} from '../../models/inheritance.model';
import { SupportCardShort } from '../../models/support-card.model';
import { environment } from '../../../environments/environment';
import { DatabaseFilterComponent, UnifiedSearchParams } from '../../components/database-filter/database-filter.component';
import { InheritanceEntryComponent } from '../../components/inheritance-entry/inheritance-entry.component';
import { LocaleNumberPipe } from '../../pipes/locale-number.pipe';
import { AdInContentComponent } from '../../components/ads/ad-in-content.component';
import type { SuccessionChara } from '../../models/profile.model';

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
    TourAnchorMatMenuDirective,
    InheritanceFilterComponent,
    DatabaseFilterComponent,
    InheritanceEntryComponent,
    LocaleNumberPipe,
    AdInContentComponent,
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
  currentSortBy = 'trending';
  currentSortOrder: 'asc' | 'desc' = 'desc';
  private sortSelectionMode: 'auto' | 'manual' = 'auto';
  private uqlSortActive = false;
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

  private toCharaId(cardId: number | null | undefined): number | null {
    if (!cardId) return null;
    return cardId >= 10000 ? Math.floor(cardId / 100) : cardId;
  }

  private advancedSearchSignature: string | null = null;
  private readonly emptyNumberArray: number[] = [];

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

  sortOptions = [
    { value: 'trending', label: 'Trending' },
    { value: 'affinity_score', label: 'Affinity' },
    { value: 'win_count', label: 'G1 Wins' },
    { value: 'white_count', label: 'White Count' },
    { value: 'blue_stars_sum', label: 'Total Blue Stars' },
    { value: 'pink_stars_sum', label: 'Total Red Stars' },
    { value: 'green_stars_sum', label: 'Total Green Stars' },
    { value: 'white_stars_sum', label: 'Total White Stars' },
    { value: 'score', label: 'Score' },
    { value: 'submitted_at', label: 'Most Recent' },
  ];
  // Vote state tracking
  voteStates = new Map<string, VoteState>();
  @ViewChild(DatabaseFilterComponent) advancedFilter!: DatabaseFilterComponent;
  // Trainer ID filter from URL parameters
  trainerIdFilter: string | null = null;

  get entryFilterTree() {
    return this.advancedFilter?.treeData ?? null;
  }

  get entrySelectedVeteran() {
    return this.advancedFilter?.selectedVeteran ?? null;
  }

  private readonly initialRecordRenderBatchSize = 8;
  private readonly recordRenderBatchSize = 8;
  private readonly recordRenderAheadViewportMultiplier = 2;
  private recordRenderFrame: number | null = null;
  private recordRenderGeneration = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private inheritanceService: InheritanceService,
    private voteProtection: VoteProtectionService,
    private supportCardService: SupportCardService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private meta: Meta,
    private title: Title,
    private ngZone: NgZone,
    public authService: AuthService,
    public bookmarkService: BookmarkService,
    private affinityService: AffinityService,
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
    this.affinityService.load()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.bookmarkRecords.length) {
          this.applyBookmarkFilters();
        }
      });

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
        this.advancedFilter.loadSerializedState(filters, null, { emitImmediately: true, persist: false });
      });
    }
  }
  onAdvancedFilterChange(params: UnifiedSearchParams) {
    if (this.advancedFilter?.isCurrentUqlOwnedLegacyResolutionPending()) {
      return;
    }
    const effectiveParams = this.withSelectedVeteranP2Params(params);
    if (this.advancedFilter?.currentUqlRequiresOwnedLegacyParams()
      && !effectiveParams.p2_main_chara_id
      && !effectiveParams.p2_win_saddle?.length) {
      return;
    }
    const previousSearchSignature = this.advancedSearchSignature;
    const nextSearchSignature = this.getAdvancedSearchSignature(effectiveParams);
    const isP2OnlyChange = previousSearchSignature !== null && previousSearchSignature === nextSearchSignature;
    const hasPendingPage = this._pendingPage !== null;

    this.currentAdvancedFilters = effectiveParams;
    this.advancedSearchSignature = nextSearchSignature;
    if (effectiveParams.sort_by) {
      this.currentSortBy = effectiveParams.sort_by;
      this.uqlSortActive = true;
    } else {
      if (this.uqlSortActive) {
        this.uqlSortActive = false;
        this.sortSelectionMode = 'auto';
      }
      this.applyAutomaticSortForFilters();
    }
    this.trackAdvancedFilterChange(
      effectiveParams,
      isP2OnlyChange ? 'p2_context' : (hasPendingPage ? 'url_restore' : 'manual'),
    );
    
    // Update URL
    const serialized = this.advancedFilter.getSerializedState({ shareable: true });
    // Only update URL if serialized string is not empty/default (optional optimization)
    
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { filters: serialized || null },
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
    this.applyAutomaticSortForFilters();
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
    this.sortSelectionMode = 'manual';
    this.uqlSortActive = false;
    this.trackDatabaseEvent('sort_inheritance_database', {
      sort_by: this.currentSortBy,
      active_tab: this.activeTab,
    });
    this.currentPage = 0;
    this.clearRecords();
    this.hasMoreRecords = true;
    this.searchRecords();
    this.bookmarkPage = 0;
    this.applyBookmarkFilters();
  }
  searchRecords(options: { preserveExisting?: boolean } = {}) {
    if (this.activeTab === 'bookmarks') {
      this.pendingSearch = true;
      return;
    }
    this.applyAutomaticSortForFilters();
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
        scenarioIds: af.scenario_id,
        mainParentBlueSparks: af.main_parent_blue_sparks,
        mainParentPinkSparks: af.main_parent_pink_sparks,
        mainParentGreenSparks: af.main_parent_green_sparks,
        mainParentWhiteSparks: af.main_parent_white_sparks,
        
        optionalWhiteSparks: af.optional_white_sparks,
        optionalMainWhiteSparks: af.optional_main_white_sparks,
        optionalWhitePriorities: af.optional_white_priorities,
        optionalMainWhitePriorities: af.optional_main_white_priorities,
        lineageWhite: af.lineage_white,
        lineageWhitePriorities: af.lineage_white_priorities,
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
    const threshold = Math.max(900, window.innerHeight * this.recordRenderAheadViewportMultiplier);
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

  shouldShowDatabaseInterscroller(recordIndex: number): boolean {
    const firstPlacement = 2;
    const interval = 8;

    return this.listMode === 'infinite'
      && recordIndex >= firstPlacement
      && (recordIndex - firstPlacement) % interval === 0;
  }

  getDatabaseInterscrollerIndex(recordIndex: number): number {
    const firstPlacement = 2;
    const interval = 8;
    const slotNumber = Math.floor((recordIndex - firstPlacement) / interval);
    return (slotNumber % 8) + 1;
  }

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

  private applyAutomaticSortForFilters(): void {
    if (this.uqlSortActive) return;
    if (this.sortSelectionMode !== 'auto') return;
    this.currentSortBy = this.hasFiltersForAffinityDefault() ? 'affinity_score' : 'trending';
  }

  private hasFiltersForAffinityDefault(): boolean {
    return !!(
      this.trainerIdFilter ||
      this.hasMeaningfulAdvancedFilters(this.currentAdvancedFilters) ||
      this.hasMeaningfulLegacyFilters(this.currentFilters)
    );
  }

  private hasMeaningfulAdvancedFilters(params: UnifiedSearchParams | null): boolean {
    if (!params) return false;
    const ignoredKeys = new Set([
      'page',
      'limit',
      'search_type',
      'sort_by',
      'sort_order',
      'uql_highlight',
    ]);

    return Object.entries(params).some(([key, value]) => {
      if (ignoredKeys.has(key)) return false;
      if (key === 'max_follower_num') {
        return typeof value === 'number' && value !== 999 && value !== 1000;
      }
      if (key === 'parent_rank') {
        return typeof value === 'number' && value > 1;
      }
      return this.hasMeaningfulFilterValue(value);
    });
  }

  private hasMeaningfulFilterValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.some(item => this.hasMeaningfulFilterValue(item));
    if (typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).some(item => this.hasMeaningfulFilterValue(item));
    }
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return Number.isFinite(value) && value > 0;
    return value === true;
  }

  private hasMeaningfulLegacyFilters(filters: InheritanceFilters | null): boolean {
    if (!filters) return false;
    const hasSparkRows = (rows?: Array<{ type?: string; level?: number }>) =>
      rows?.some(row => !!row.type && !!row.level && row.level > 0) ?? false;
    return !!(
      filters.selectedCharacterId ||
      hasSparkRows(filters.mainStats) ||
      hasSparkRows(filters.aptitudes) ||
      hasSparkRows(filters.skills) ||
      hasSparkRows(filters.whiteSparks) ||
      (filters.parentRank && filters.parentRank > 0) ||
      (filters.winCount && filters.winCount > 0) ||
      (filters.whiteCount && filters.whiteCount > 0)
    );
  }

  hasActiveFilters(): boolean {
    return this.hasFiltersForAffinityDefault();
  }
  hasOptionalWhiteFilters(): boolean {
    if (!this.currentAdvancedFilters) return false;
    return !!(
      (this.currentAdvancedFilters.optional_white_sparks && this.currentAdvancedFilters.optional_white_sparks.length > 0) ||
      (this.currentAdvancedFilters.optional_main_white_sparks && this.currentAdvancedFilters.optional_main_white_sparks.length > 0) ||
      (this.currentAdvancedFilters.lineage_white && this.currentAdvancedFilters.lineage_white.length > 0)
    );
  }
  hasMultipleWhitePriorityGroups(): boolean {
    const priorities = [
      ...(this.currentAdvancedFilters?.optional_white_priorities ?? []),
      ...(this.currentAdvancedFilters?.optional_main_white_priorities ?? []),
      ...(this.currentAdvancedFilters?.lineage_white_priorities ?? []),
    ]
      .map(entry => Number(String(entry).split(':')[1] ?? 0))
      .filter(value => Number.isFinite(value));
    return new Set(priorities).size > 1;
  }
  getSortLabel(): string {
    const option = this.sortOptions.find(o => o.value === this.currentSortBy);
    return option?.label || 'Trending';
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
      'trending': 'trending',
      'win_count': 'win_count',
      'white_count': 'white_count',
      'score': 'score',
      'submitted_at': 'submitted_at', // This maps to last_updated in V2 API
      'upvotes': 'upvotes',
      'downvotes': 'downvotes',
      'trainer_id': 'trainer_id',
      'verified': 'verified',
      'affinity_score': 'affinity_score',
      'blue_stars_sum': 'blue_stars_sum',
      'pink_stars_sum': 'pink_stars_sum',
      'green_stars_sum': 'green_stars_sum',
      'white_stars_sum': 'white_stars_sum'
    };
    return sortMapping[sortBy] || 'trending';
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

  onEntryRecordActionComplete(event: { action: 'bookmark' | 'report'; id: string; bookmarked?: boolean }): void {
    if (event.action === 'report') {
      this.searchRecords();
      return;
    }

    this.bookmarksDirty = true;
    if (this.activeTab === 'bookmarks' && event.bookmarked === false) {
      this.bookmarkRecords = this.bookmarkRecords.filter(r => r.account_id !== event.id);
      this.applyBookmarkFilters();
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

  private sortBookmarks(records: InheritanceRecord[]): InheritanceRecord[] {
    const sortBy = this.currentSortBy;
    return records.sort((a, b) => {
      let va: number, vb: number;
      switch (sortBy) {
        case 'trending': {
          const copyDelta = (b.borrow_copy_count ?? 0) - (a.borrow_copy_count ?? 0);
          if (copyDelta !== 0) return copyDelta;
          return (b.borrow_view_count ?? 0) - (a.borrow_view_count ?? 0);
        }
        case 'affinity_score': va = this.getBookmarkTotalAffinity(a) ?? 0; vb = this.getBookmarkTotalAffinity(b) ?? 0; break;
        case 'win_count': va = this.getBookmarkG1WinCount(a); vb = this.getBookmarkG1WinCount(b); break;
        case 'white_count': va = a.white_count ?? 0; vb = b.white_count ?? 0; break;
        case 'blue_stars_sum': va = a.blue_stars_sum ?? this.getSparkStarSum(a.blue_sparks); vb = b.blue_stars_sum ?? this.getSparkStarSum(b.blue_sparks); break;
        case 'pink_stars_sum': va = a.pink_stars_sum ?? this.getSparkStarSum(a.pink_sparks); vb = b.pink_stars_sum ?? this.getSparkStarSum(b.pink_sparks); break;
        case 'green_stars_sum': va = a.green_stars_sum ?? this.getSparkStarSum(a.green_sparks); vb = b.green_stars_sum ?? this.getSparkStarSum(b.green_sparks); break;
        case 'white_stars_sum': va = a.white_stars_sum ?? this.getSparkStarSum(a.white_sparks); vb = b.white_stars_sum ?? this.getSparkStarSum(b.white_sparks); break;
        case 'score': va = a.parent_rank ?? 0; vb = b.parent_rank ?? 0; break;
        default: return 0; // submitted_at - keep original order (newest first from API)
      }
      return vb - va;
    });
  }

  private getSparkStarSum(sparks: number[] | undefined): number {
    return (sparks ?? []).reduce((total, sparkId) => total + Math.abs(sparkId) % 10, 0);
  }

  private getBookmarkG1WinCount(record: InheritanceRecord): number {
    if (Array.isArray(record.main_win_saddles)) {
      return this.affinityService.countG1RaceWins(record.main_win_saddles);
    }
    return record.win_count ?? 0;
  }

  private getBookmarkTargetCharaId(): number | null {
    return this.toCharaId(this.entryFilterTree?.characterId ?? this.currentAdvancedFilters?.player_chara_id);
  }

  private getBookmarkP2CharaId(): number | null {
    const veteran = this.entrySelectedVeteran;
    if (veteran) {
      return this.toCharaId(veteran.card_id ?? veteran.trained_chara_id);
    }
    return this.toCharaId(this.entryFilterTree?.children?.[1]?.characterId ?? this.currentAdvancedFilters?.p2_main_chara_id);
  }

  private getBookmarkGp2CharaId(positionId: 10 | 20): number | null {
    const succession = this.getBookmarkSelectedVeteranSuccession(positionId);
    if (succession) return this.toCharaId(succession.card_id);
    const childIndex = positionId === 10 ? 0 : 1;
    return this.toCharaId(this.entryFilterTree?.children?.[1]?.children?.[childIndex]?.characterId);
  }

  private getBookmarkSelectedVeteranSuccession(positionId: 10 | 20): SuccessionChara | null {
    return this.entrySelectedVeteran?.succession_chara_array?.find(s => s.position_id === positionId) ?? null;
  }

  private getBookmarkP2WinSaddleIds(): number[] {
    return this.entrySelectedVeteran?.win_saddle_id_array
      ?? this.currentAdvancedFilters?.p2_win_saddle
      ?? this.emptyNumberArray;
  }

  private getBookmarkGp2WinSaddleIds(positionId: 10 | 20): number[] {
    return this.getBookmarkSelectedVeteranSuccession(positionId)?.win_saddle_id_array ?? this.emptyNumberArray;
  }

  private hasBookmarkP2Context(): boolean {
    return this.getBookmarkP2CharaId() !== null
      || this.getBookmarkGp2CharaId(10) !== null
      || this.getBookmarkGp2CharaId(20) !== null
      || this.getBookmarkP2WinSaddleIds().length > 0
      || this.getBookmarkGp2WinSaddleIds(10).length > 0
      || this.getBookmarkGp2WinSaddleIds(20).length > 0;
  }

  private buildBookmarkTreeSlots(record: InheritanceRecord, includeP2: boolean): TreeSlots {
    return {
      target: this.getBookmarkTargetCharaId(),
      p1: this.toCharaId(record.main_parent_id),
      p2: includeP2 ? this.getBookmarkP2CharaId() : null,
      gp1Left: this.toCharaId(record.parent_left_id),
      gp1Right: this.toCharaId(record.parent_right_id),
      gp2Left: includeP2 ? this.getBookmarkGp2CharaId(10) : null,
      gp2Right: includeP2 ? this.getBookmarkGp2CharaId(20) : null,
    };
  }

  private buildBookmarkRaceWins(record: InheritanceRecord, includeP2: boolean): PlannerRaceWins {
    return {
      p1: record.main_win_saddles ?? this.emptyNumberArray,
      p2: includeP2 ? this.getBookmarkP2WinSaddleIds() : this.emptyNumberArray,
      'p1-1': record.left_win_saddles ?? this.emptyNumberArray,
      'p1-2': record.right_win_saddles ?? this.emptyNumberArray,
      'p2-1': includeP2 ? this.getBookmarkGp2WinSaddleIds(10) : this.emptyNumberArray,
      'p2-2': includeP2 ? this.getBookmarkGp2WinSaddleIds(20) : this.emptyNumberArray,
    };
  }

  private getBookmarkTreeAffinity(
    record: InheritanceRecord,
    includeP2: boolean,
  ): TreeAffinityWithRaceResult | null {
    if (!this.affinityService.isReady) return null;
    return this.affinityService.calculateTreeWithRace(
      this.buildBookmarkTreeSlots(record, includeP2),
      this.buildBookmarkRaceWins(record, includeP2),
    );
  }

  private getBookmarkMainBreedingAffinity(record: InheritanceRecord): number | null {
    if (!this.affinityService.isReady || !this.toCharaId(record.main_parent_id)) return null;
    return this.affinityService.getTreeBreedingTotalAffinity(
      this.getBookmarkTreeAffinity(record, false),
      'p1',
    );
  }

  private getBookmarkTotalAffinity(record: InheritanceRecord): number | null {
    if (!this.getBookmarkTargetCharaId() || !this.toCharaId(record.main_parent_id)) {
      return this.getBookmarkMainBreedingAffinity(record) ?? record.affinity_score ?? null;
    }

    return this.getBookmarkTreeAffinity(record, this.hasBookmarkP2Context())?.total
      ?? this.getBookmarkMainBreedingAffinity(record)
      ?? record.affinity_score
      ?? null;
  }

  private getBookmarkRaceAffinity(record: InheritanceRecord): number {
    return this.affinityService.calculateRaceAffinityBreakdown(
      this.buildBookmarkRaceWins(record, this.hasBookmarkP2Context()),
    ).total;
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
      const mainParentCharaId = this.toCharaId(r.main_parent_id);
      if (af.exclude_main_parent_id.some(id => this.toCharaId(id) === mainParentCharaId)) return false;
    }

    if (af.min_win_count && this.getBookmarkG1WinCount(r) < af.min_win_count) return false;
    if (af.min_white_count && (r.white_count ?? 0) < af.min_white_count) return false;
    if (af.parent_rank && (r.parent_rank ?? 0) < af.parent_rank) return false;
    if (af.parent_rarity && (r.parent_rarity ?? 0) < af.parent_rarity) return false;
    if (af.scenario_id?.length && !af.scenario_id.includes(r.scenario_id ?? 0)) return false;

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
      const values = this.parseLocalUqlValueList(notInMatch[2]);
      return !this.getLocalUqlFieldComparableValues(record, notInMatch[1]).some(value => this.localUqlValuesEqual(value, values));
    }

    const inMatch = normalized.match(/^([a-z_][a-z0-9_]*)\s+in\s*\((.*)\)$/i);
    if (inMatch) {
      const values = this.parseLocalUqlValueList(inMatch[2]);
      return this.getLocalUqlFieldComparableValues(record, inMatch[1]).some(value => this.localUqlValuesEqual(value, values));
    }

    const likeMatch = normalized.match(/^([a-z_][a-z0-9_]*)\s+(i?like)\s+['"]?([^'"]*)['"]?$/i);
    if (likeMatch) {
      const fieldText = String(this.getLocalUqlFieldValue(record, likeMatch[1]) ?? '');
      const needle = likeMatch[3].replace(/%/g, '');
      return likeMatch[2].toLowerCase() === 'ilike'
        ? fieldText.toLowerCase().includes(needle.toLowerCase())
        : fieldText.includes(needle);
    }

    const comparisonMatch = normalized.match(/^([a-z_][a-z0-9_]*|\d+|'(?:''|[^'])*'|"(?:\\"|[^"])*")\s*(=|==|!=|<>|>=|<=|>|<)\s*([a-z_][a-z0-9_]*|\d+|'(?:''|[^'])*'|"(?:\\"|[^"])*")$/i);
    if (comparisonMatch) {
      const left = this.resolveLocalUqlComparableValue(record, comparisonMatch[1]);
      const right = this.resolveLocalUqlComparableValue(record, comparisonMatch[3]);
      return this.compareLocalUqlComparableValues(left, comparisonMatch[2], right);
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
    const normalizedField = field.toLowerCase();
    switch (normalizedField) {
      case 'account_id':
      case 'trainer_id': return record.account_id ?? record.trainer_id;
      case 'inheritance_id': return typeof record.id === 'number' ? record.id : Number(record.id) || undefined;
      case 'scenario':
      case 'scenario_id': return record.scenario_id;
      case 'main_chara_id': return this.toCharaId(record.umamusume_id);
      case 'left_chara_id': return this.toCharaId(record.parent_left_id);
      case 'right_chara_id': return this.toCharaId(record.parent_right_id);
      case 'left_parent_id':
      case 'parent_left_id': return record.parent_left_id;
      case 'right_parent_id':
      case 'parent_right_id': return record.parent_right_id;
      case 'followers': return record.follower_num;
      case 'wins':
      case 'win_count': return this.getBookmarkG1WinCount(record);
      case 'trainer_name':
      case 'name': return record.trainer_name;
      case 'affinity':
      case 'affinity_score': return this.getBookmarkTotalAffinity(record);
      case 'race_affinity':
      case 'computed_race_affinity': return this.getBookmarkRaceAffinity(record);
      case 'support_card_count':
      case 'support_cards_count': return record.support_card_id ? 1 : 0;
      case 'blue_stars_sum': return this.sumLocalUqlSparks(record.blue_sparks);
      case 'pink_stars_sum':
      case 'red_stars_sum': return this.sumLocalUqlSparks(record.pink_sparks);
      case 'green_stars_sum': return this.sumLocalUqlSparks(record.green_sparks);
      case 'white_stars_sum': return this.sumLocalUqlSparks(record.white_sparks);
      default: return (record as any)[normalizedField] ?? (record as any)[field];
    }
  }

  private getLocalUqlFieldValues(record: InheritanceRecord, field: string): number[] {
    const value = this.getLocalUqlFieldValue(record, field);
    if (Array.isArray(value)) return value.filter(entry => typeof entry === 'number');
    return typeof value === 'number' ? [value] : [];
  }

  private getLocalUqlFieldComparableValues(record: InheritanceRecord, field: string): Array<string | number> {
    const value = this.getLocalUqlFieldValue(record, field);
    if (Array.isArray(value)) return value.filter(entry => typeof entry === 'number');
    return typeof value === 'number' || typeof value === 'string' ? [value] : [];
  }

  private sumLocalUqlSparks(sparks: number[] | undefined): number {
    return (sparks ?? []).reduce((sum, sparkId) => sum + (sparkId % 10), 0);
  }

  private compareLocalUqlValues(actual: number, operator: string, expected: number): boolean {
    switch (operator) {
      case '=': return actual === expected;
      case '==': return actual === expected;
      case '!=':
      case '<>': return actual !== expected;
      case '>=': return actual >= expected;
      case '<=': return actual <= expected;
      case '>': return actual > expected;
      case '<': return actual < expected;
      default: return true;
    }
  }

  private compareLocalUqlComparableValues(
    actual: string | number | null | undefined,
    operator: string,
    expected: string | number | null | undefined,
  ): boolean {
    const normalizedOperator = operator === '==' ? '=' : operator;
    if (typeof actual === 'string' || typeof expected === 'string') {
      const actualText = String(actual ?? '');
      const expectedText = String(expected ?? '');
      switch (normalizedOperator) {
        case '=': return actualText === expectedText;
        case '!=':
        case '<>': return actualText !== expectedText;
        default: return this.compareLocalUqlValues(Number(actualText || 0), normalizedOperator, Number(expectedText || 0));
      }
    }
    return this.compareLocalUqlValues(Number(actual ?? 0), normalizedOperator, Number(expected ?? 0));
  }

  private resolveLocalUqlComparableValue(record: InheritanceRecord, value: string): string | number | null | undefined {
    if (/^\d+$/.test(value)) return Number(value);
    if (/^'(?:''|[^'])*'$/.test(value)) return value.slice(1, -1).replace(/''/g, "'");
    if (/^"(?:\\"|[^"])*"$/.test(value)) return value.slice(1, -1).replace(/\\"/g, '"');
    return this.getLocalUqlFieldValue(record, value);
  }

  private parseLocalUqlNumberList(valueText: string): number[] {
    return valueText.replace(/[()]/g, '').split(',')
      .map(value => Number(value.trim()))
      .filter(value => Number.isFinite(value));
  }

  private parseLocalUqlValueList(valueText: string): Array<string | number> {
    return this.splitLocalUqlArgs(valueText.replace(/^\s*\(|\)\s*$/g, ''))
      .map(value => this.parseLocalUqlLiteralValue(value.trim()))
      .filter((value): value is string | number => value !== null);
  }

  private parseLocalUqlLiteralValue(value: string): string | number | null {
    if (/^\d+$/.test(value)) return Number(value);
    if (/^'(?:''|[^'])*'$/.test(value)) return value.slice(1, -1).replace(/''/g, "'");
    if (/^"(?:\\"|[^"])*"$/.test(value)) return value.slice(1, -1).replace(/\\"/g, '"');
    return null;
  }

  private localUqlValuesEqual(actual: string | number, expectedValues: Array<string | number>): boolean {
    return expectedValues.some(expected => {
      if (typeof actual === 'string' || typeof expected === 'string') {
        return String(actual) === String(expected);
      }
      return actual === expected;
    });
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
