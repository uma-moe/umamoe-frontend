import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, OnInit, OnChanges, ChangeDetectorRef, DestroyRef, SimpleChanges } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { InheritanceRecord } from '../../models/inheritance.model';
import { FactorService, SparkInfo } from '../../services/factor.service';
import { AffinityService, SparkDisplayMetrics, TreeAffinityResult, TreeSlots } from '../../services/affinity.service';
import { getCharacterById } from '../../data/character.data';
import { ResolveSparksPipe } from '../../pipes/resolve-sparks.pipe';
import { TrainerIdFormatPipe } from '../../pipes/trainer-id-format.pipe';
import { RaceResultsDialogComponent, RaceResultsDialogData } from '../race-results-dialog/race-results-dialog.component';
import { RankBadgeComponent } from '../rank-badge/rank-badge.component';
import { LocaleNumberPipe } from '../../pipes/locale-number.pipe';

interface CombinedSparkSourceEntry {
    level: number;
    parentKey: 'main' | 'left' | 'right';
}

interface P2SparkSourceEntry {
    id: number;
    source: 'main' | 'left' | 'right';
}

interface CombinedP2SourceEntry {
    level: number;
    source: 'main' | 'left' | 'right';
}

interface CombinedSparkInfo extends SparkInfo {
    p2Level: number;
    p1Sources: CombinedSparkSourceEntry[];
    p2Sources: CombinedP2SourceEntry[];
}

interface P2SparkDisplayEntry {
    spark: SparkInfo;
    affinity: number;
    source: 'main' | 'left' | 'right';
}

@Component({
    selector: 'app-inheritance-entry',
    standalone: true,
    imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule, MatDialogModule, MatSnackBarModule, ResolveSparksPipe, TrainerIdFormatPipe, DatePipe, DecimalPipe, RankBadgeComponent, LocaleNumberPipe],
    templateUrl: './inheritance-entry.component.html',
    styleUrl: './inheritance-entry.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class InheritanceEntryComponent implements OnInit, OnChanges {
    /** The inheritance record to display */
    @Input({ required: true }) record!: InheritanceRecord;

    /** Support card image URL (pre-resolved by parent) */
    @Input() supportCardImageUrl: string | null = null;

    /** Support card limit break count */
    @Input() supportCardLimitBreak: number | null = null;

    /** Whether to show the database-specific header (trainer info, actions, verification) */
    @Input() showDatabaseHeader = false;

    /** Whether this record has max followers */
    @Input() isMaxFollowers = false;

    /** Text/icon for the report action. Database uses this as an outdated marker; profile uses it as an update request. */
    @Input() reportButtonText = 'Outdated';
    @Input() reportButtonIcon = 'person_off';
    @Input() reportButtonTooltip = 'Report this user as unavailable or friend list full';

    /** Function to check if a spark matches active filters (database only) */
    @Input() sparkMatchFn?: (spark: SparkInfo, record: InheritanceRecord) => boolean;

    /** Function to get the level contributed by the main parent */
    @Input() mainParentLevelFn?: (spark: SparkInfo, record: InheritanceRecord) => string | undefined;

    @Input() isBookmarked = false;
    @Input() showBookmarkButton = false;
    @Input() isLoggedIn = true;

    @Output() copyInfo = new EventEmitter<InheritanceRecord>();
    @Output() copyTrainerId = new EventEmitter<{ accountId: string; event: Event }>();
    @Output() reportUnavailable = new EventEmitter<{ accountId: string; event: Event }>();
    @Output() openInPlanner = new EventEmitter<InheritanceRecord>();
    @Output() bookmarkToggle = new EventEmitter<{ id: string; bookmarked: boolean }>();

    /** Spark display mode - driven by parent (global toggle) */
    @Input() sparkViewMode: 'merged' | 'split' = 'merged';
    /** Currently focused parent in split view */
    selectedParent: 'main' | 'left' | 'right' | null = null;

    @Input() targetCharaId: number | null = null;
    @Input() p2CharaId: number | null = null;
    @Input() gp2LeftCharaId: number | null = null;
    @Input() gp2RightCharaId: number | null = null;
    @Input() p2WinSaddleIds: number[] | null = null;
    @Input() gp2LeftWinSaddleIds: number[] | null = null;
    @Input() gp2RightWinSaddleIds: number[] | null = null;
    @Input() sparkShowPerRun = false;
    @Output() sparkShowPerRunChange = new EventEmitter<boolean>();
    @Input() showP2Sparks = false;
    @Output() showP2SparksChange = new EventEmitter<boolean>();

    // Keep numeric formatting consistent across score and spark displays.
    private readonly uiLocale = Intl.NumberFormat().resolvedOptions().locale;
    private readonly twoDecimalFormatOptions: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    private readonly numberFormatterCache = new Map<string, Intl.NumberFormat>();
    private readonly sharedWinsCache = new WeakMap<readonly number[], WeakMap<readonly number[], number>>();
    private readonly treeAffinityCache = new Map<string, TreeAffinityResult | null>();
    private readonly emptyNumberArray: number[] = [];
    private readonly singleSparkArrayCache = new Map<number, number[]>();
    private readonly mergedSparkCache = new Map<string, CombinedSparkInfo[]>();
    private readonly p2SparkDisplayCache = new Map<string, P2SparkDisplayEntry[]>();
    private recordTotalAffinityCacheKey: string | null = null;
    private recordTotalAffinityCacheValue: number | null = null;

    constructor(
        private factorService: FactorService,
        private dialog: MatDialog,
        private affinityService: AffinityService,
        private snackBar: MatSnackBar,
        private cdr: ChangeDetectorRef,
        private destroyRef: DestroyRef,
    ) {}

    ngOnInit(): void {
        this.affinityService.load()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                this.clearComputedCaches();
                this.cdr.markForCheck();
            });
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (
            changes['record'] || changes['targetCharaId'] || changes['p2CharaId'] ||
            changes['gp2LeftCharaId'] || changes['gp2RightCharaId'] || changes['p2WinSaddleIds'] ||
            changes['gp2LeftWinSaddleIds'] || changes['gp2RightWinSaddleIds'] || changes['showP2Sparks'] ||
            changes['p2BlueSparks'] || changes['p2PinkSparks'] || changes['p2GreenSparks'] || changes['p2WhiteSparks'] ||
            changes['p2BlueSparkSources'] || changes['p2PinkSparkSources'] || changes['p2GreenSparkSources'] || changes['p2WhiteSparkSources']
        ) {
            this.clearComputedCaches();
        }
    }

    private clearComputedCaches(): void {
        this.treeAffinityCache.clear();
        this.recordTotalAffinityCacheKey = null;
        this.mergedSparkCache.clear();
        this.p2SparkDisplayCache.clear();
    }

    onBookmarkToggle(event: Event): void {
        event.stopPropagation();
        if (!this.isLoggedIn) {
            this.snackBar.open('Sign in to bookmark records', 'Close', { duration: 3000 });
            return;
        }
        this.bookmarkToggle.emit({ id: this.record.account_id ?? String(this.record.id), bookmarked: !this.isBookmarked });
    }

    isV2Record(): boolean {
        return typeof this.record.id === 'number';
    }

    getCharacterImage(charId: number): string | null {
        const char = getCharacterById(charId);
        return char ? `assets/images/character_stand/${char.image}` : null;
    }

    getCharacterName(charId: number): string {
        const char = getCharacterById(charId);
        return char?.name || `Character ${charId}`;
    }

    getCharacterImageUrl(charaId: number): string {
        return `/assets/images/character_stand/chara_stand_${charaId}.webp`;
    }

    getSupportCardImageUrl(supportCardId: number): string {
        return `/assets/images/support_card/half/support_card_s_${supportCardId}.webp`;
    }

    handleSupportCardImageError(event: Event): void {
        const img = event.target as HTMLImageElement;
        const wrapper = img.closest('.support-card-section');
        if (wrapper) wrapper.classList.add('image-error');
    }

    getLimitBreakArray(count: number): { filled: boolean }[] {
        return Array.from({ length: 4 }, (_, i) => ({ filled: i < count }));
    }

    getRarityIcon(rarity: number): string {
        const idx = rarity < 11 ? '0' + (rarity - 1) : String(rarity - 1);
        return `/assets/images/icon/ranks/utx_txt_rank_${idx}.webp`;
    }

    resolveSparks(sparkIds: number[]): SparkInfo[] {
        return this.factorService.resolveSparks(sparkIds);
    }

    isSparkMatched(spark: SparkInfo): boolean {
        return this.sparkMatchFn ? this.sparkMatchFn(spark, this.record) : false;
    }

    getLevelFromMainParent(spark: SparkInfo): string | undefined {
        return this.mainParentLevelFn ? this.mainParentLevelFn(spark, this.record) : undefined;
    }

    getBlueStarsSum(): number {
        return (this.record.blue_sparks || []).reduce((sum, id) => sum + (id % 10), 0);
    }

    selectParent(parent: 'main' | 'left' | 'right', event: Event): void {
        event.stopPropagation();
        this.selectedParent = this.selectedParent === parent ? null : parent;
    }

    /** Wraps a single nullable factor ID in an array for use with the resolveSparks pipe */
    getParentSingleSpark(id: number | undefined): number[] {
        if (!id) return this.emptyNumberArray;
        const cached = this.singleSparkArrayCache.get(id);
        if (cached) return cached;
        const value = [id];
        this.singleSparkArrayCache.set(id, value);
        return value;
    }

    getSelectedBlueFactor(): number[] {
        return this.getParentSingleSpark(
            this.selectedParent === 'main' ? this.record.main_blue_factors
            : this.selectedParent === 'left' ? this.record.left_blue_factors
            : this.selectedParent === 'right' ? this.record.right_blue_factors
            : undefined
        );
    }

    getSelectedPinkFactor(): number[] {
        return this.getParentSingleSpark(
            this.selectedParent === 'main' ? this.record.main_pink_factors
            : this.selectedParent === 'left' ? this.record.left_pink_factors
            : this.selectedParent === 'right' ? this.record.right_pink_factors
            : undefined
        );
    }

    getSelectedGreenFactor(): number[] {
        return this.getParentSingleSpark(
            this.selectedParent === 'main' ? this.record.main_green_factors
            : this.selectedParent === 'left' ? this.record.left_green_factors
            : this.selectedParent === 'right' ? this.record.right_green_factors
            : undefined
        );
    }

    getSelectedWhiteFactors(): number[] {
        if (!this.selectedParent) return [];
        const arr = this.selectedParent === 'main' ? this.record.main_white_factors
                  : this.selectedParent === 'left' ? this.record.left_white_factors
                  : this.record.right_white_factors;
        return arr ?? [];
    }

    hasWinSaddles(parent: 'main' | 'left' | 'right'): boolean {
        const saddles = parent === 'main' ? this.record.main_win_saddles
                      : parent === 'left' ? this.record.left_win_saddles
                      : this.record.right_win_saddles;
        return !!saddles && saddles.length > 0;
    }

    openRaceResults(parent: 'main' | 'left' | 'right', event: Event): void {
        event.stopPropagation();
        const saddles = parent === 'main' ? this.record.main_win_saddles ?? []
                      : parent === 'left' ? this.record.left_win_saddles ?? []
                      : this.record.right_win_saddles ?? [];
        const charId = parent === 'main' ? this.record.main_parent_id
                     : parent === 'left' ? this.record.parent_left_id
                     : this.record.parent_right_id;
        const charName = charId ? this.getCharacterName(charId) : 'Parent';
        const runRaceIds = parent === 'main' ? (this.record.race_results ?? []) : [];
        this.dialog.open(RaceResultsDialogComponent, {
            data: { charId, charName, winSaddleIds: saddles, runRaceIds } as RaceResultsDialogData,
            panelClass: 'modern-dialog-panel',
            width: '1100px',
            maxWidth: '95vw',
            maxHeight: '90vh',
            autoFocus: false,
        });
    }

    getPinkStarsSum(): number {
        return (this.record.pink_sparks || []).reduce((sum, id) => sum + (id % 10), 0);
    }

    getGreenStarsSum(): number {
        return (this.record.green_sparks || []).reduce((sum, id) => sum + (id % 10), 0);
    }

    getWhiteStarsSum(): number {
        return (this.record.white_sparks || []).reduce((sum, id) => sum + (id % 10), 0);
    }

    onCopyInfo(event: Event): void {
        event.stopPropagation();
        this.copyInfo.emit(this.record);
    }

    onCopyTrainerId(event: Event): void {
        event.stopPropagation();
        const id = this.record.account_id || this.record.trainer_id || '';
        this.copyTrainerId.emit({ accountId: id, event });
    }

    onReportUnavailable(event: Event): void {
        event.stopPropagation();
        const id = this.record.account_id || this.record.trainer_id || '';
        this.reportUnavailable.emit({ accountId: id, event });
    }

    private getParentCharaId(parentId: number | undefined): number | null {
        if (!parentId) return null;
        return parentId >= 10000 ? Math.floor(parentId / 100) : parentId;
    }

    private countSharedWins(
        primary: readonly number[] | null | undefined,
        secondary: readonly number[] | null | undefined,
    ): number {
        if (!primary?.length || !secondary?.length) return 0;
        let secondaryCache = this.sharedWinsCache.get(primary);
        const cachedCount = secondaryCache?.get(secondary);
        if (cachedCount !== undefined) return cachedCount;

        const secondarySet = new Set(secondary);
        const count = primary.filter(w => secondarySet.has(w)).length;
        if (!secondaryCache) {
            secondaryCache = new WeakMap<readonly number[], number>();
            this.sharedWinsCache.set(primary, secondaryCache);
        }
        secondaryCache.set(secondary, count);
        return count;
    }

    getMainCharaId(): number | null {
        return this.getParentCharaId(this.record.main_parent_id);
    }

    getLeftCharaId(): number | null {
        return this.getParentCharaId(this.record.parent_left_id);
    }

    getRightCharaId(): number | null {
        return this.getParentCharaId(this.record.parent_right_id);
    }

    private buildTreeSlots(includeP2: boolean): TreeSlots {
        return {
            target: this.targetCharaId,
            p1: this.getMainCharaId(),
            p2: includeP2 ? this.p2CharaId : null,
            gp1Left: this.getLeftCharaId(),
            gp1Right: this.getRightCharaId(),
            gp2Left: includeP2 ? this.gp2LeftCharaId : null,
            gp2Right: includeP2 ? this.gp2RightCharaId : null,
        };
    }

    private getTreeAffinity(includeP2: boolean): TreeAffinityResult | null {
        if (!this.affinityService.isReady) return null;
        const slots = this.buildTreeSlots(includeP2);
        const cacheKey = this.getTreeAffinityCacheKey(includeP2, slots);
        if (this.treeAffinityCache.has(cacheKey)) {
            return this.treeAffinityCache.get(cacheKey) ?? null;
        }

        const result = this.affinityService.calculateTree(slots);
        this.treeAffinityCache.set(cacheKey, result);
        return result;
    }

    private getTreeAffinityCacheKey(includeP2: boolean, slots: TreeSlots): string {
        return [
            includeP2 ? 1 : 0,
            slots.target ?? '',
            slots.p1 ?? '',
            slots.p2 ?? '',
            slots.gp1Left ?? '',
            slots.gp1Right ?? '',
            slots.gp2Left ?? '',
            slots.gp2Right ?? '',
        ].join('|');
    }

    private hasP2Context(): boolean {
        return this.p2CharaId !== null || this.gp2LeftCharaId !== null || this.gp2RightCharaId !== null;
    }

    getRecordTotalAffinity(): number | null {
        const cacheKey = this.getRecordTotalAffinityCacheKey();
        if (this.recordTotalAffinityCacheKey === cacheKey) {
            return this.recordTotalAffinityCacheValue;
        }

        let value: number | null;
        if (!this.targetCharaId || !this.getMainCharaId()) {
            value = this.record.affinity_score ?? this.getMainBreedingBaseAffinity();
            this.recordTotalAffinityCacheKey = cacheKey;
            this.recordTotalAffinityCacheValue = value;
            return value;
        }

        const result = this.getTreeAffinity(this.hasP2Context());
        if (!result) {
            value = this.record.affinity_score ?? this.getMainBreedingBaseAffinity();
            this.recordTotalAffinityCacheKey = cacheKey;
            this.recordTotalAffinityCacheValue = value;
            return value;
        }

        // Shared tree affinity handles the base aff2/aff3 math. Race overlap is
        // still local, and when a selected P2 legacy is present we need both the
        // P1-side and P2-side parent/GP race wins on top of that base total.
        value = result.relationTotal + this.getMainRaceCount() + this.getP2RaceCount();
        this.recordTotalAffinityCacheKey = cacheKey;
        this.recordTotalAffinityCacheValue = value;
        return value;
    }

    private getRecordTotalAffinityCacheKey(): string {
        return [
            this.record.id,
            this.record.affinity_score ?? '',
            this.targetCharaId ?? '',
            this.p2CharaId ?? '',
            this.gp2LeftCharaId ?? '',
            this.gp2RightCharaId ?? '',
            this.getMainCharaId() ?? '',
            this.getLeftCharaId() ?? '',
            this.getRightCharaId() ?? '',
            (this.record.main_win_saddles ?? []).join(','),
            (this.record.left_win_saddles ?? []).join(','),
            (this.record.right_win_saddles ?? []).join(','),
            (this.p2WinSaddleIds ?? []).join(','),
            (this.gp2LeftWinSaddleIds ?? []).join(','),
            (this.gp2RightWinSaddleIds ?? []).join(','),
        ].join('|');
    }

    getParentAffinity(parent: 'main' | 'right'): number | null {
        if (!this.targetCharaId || !this.affinityService.isReady) return null;
        const parentId = parent === 'main' ? this.getMainCharaId() : this.getRightCharaId();
        if (!parentId) return null;
        return this.affinityService.getAff2(this.targetCharaId, parentId);
    }

    getParentRaceAffinity(parent: 'main' | 'right'): number {
        const mainSaddles = this.record.main_win_saddles ?? [];
        if (parent === 'main') {
            const leftSaddles = new Set(this.record.left_win_saddles ?? []);
            const rightSaddles = new Set(this.record.right_win_saddles ?? []);
            return mainSaddles.filter(w => leftSaddles.has(w)).length
                 + mainSaddles.filter(w => rightSaddles.has(w)).length;
        } else {
            const rightSaddles = this.record.right_win_saddles ?? [];
            return 0;
        }
    }

    getMainBaseAffinity(): number | null {
        if (!this.targetCharaId || !this.getMainCharaId()) return null;
        return this.getTreeAffinity(false)?.playerP1.total ?? null;
    }

    /**
     * Breeding total for p1's subtree (no target) = base breeding + race overlap.
     */
    getMainBreedingBaseAffinity(): number | null {
        const mainId = this.getMainCharaId();
        if (!this.affinityService.isReady || !mainId) return null;
        const base = this.getTreeAffinity(false)?.p1Breeding.total ?? 0;
        const race = this.getMainRaceCount();
        const total = base + race;
        return total > 0 ? total : null;
    }

    /**
     * Breeding total between p1 and a specific grandparent = aff2(p1, gp) + race overlap.
     */
    getMainBreedingPair(side: 'left' | 'right'): number | null {
        const mainId = this.getMainCharaId();
        if (!this.affinityService.isReady || !mainId) return null;
        const result = this.getTreeAffinity(false);
        if (!result) return null;
        const base = side === 'left' ? result.p1Breeding.left : result.p1Breeding.right;
        const race = this.getGrandparentRaceCount(side);
        const total = base + race;
        return total > 0 ? total : null;
    }

    /** Not used — kept for safety. */
    getGpCrossBreeding(): number | null { return null; }

    getMainBreedingTooltip(): string {
        const mainId = this.getMainCharaId();
        if (!this.affinityService.isReady || !mainId) return '';

        const base = this.getTreeAffinity(false)?.p1Breeding.total ?? 0;
        const race = this.getMainRaceCount();

        if (base && race) return `Base: ${base} + Race: ${race}`;
        if (race) return `Race: ${race}`;
        return `Base: ${base}`;
    }

    getMainBreedingPairTooltip(side: 'left' | 'right'): string {
        if (!this.affinityService.isReady || !this.getMainCharaId()) return '';
        const result = this.getTreeAffinity(false);
        if (!result) return '';

        const base = side === 'left' ? result.p1Breeding.left : result.p1Breeding.right;
        const race = this.getGrandparentRaceCount(side);

        if (base && race) return `Base: ${base} + Race: ${race}`;
        if (race) return `Race: ${race}`;
        return `Base: ${base}`;
    }

    getMainRaceCount(): number {
           return this.countSharedWins(this.record.main_win_saddles, this.record.left_win_saddles)
               + this.countSharedWins(this.record.main_win_saddles, this.record.right_win_saddles);
    }

    getMainTotalAffinity(): number | null {
        const base = this.getMainBaseAffinity();
        if (base === null) return null;
        return base + this.getMainRaceCount();
    }

    getMainAffinityTooltip(): string {
        const base = this.getMainBaseAffinity();
        const race = this.getMainRaceCount();
        const parts: string[] = [];
        if (base !== null) parts.push(`Base: ${base}`);
        if (race) parts.push(`Race: ${race}`);
        return parts.join(' + ');
    }

    getGrandparentBaseAffinity(side: 'left' | 'right'): number | null {
        if (!this.targetCharaId || !this.getMainCharaId()) return null;
        const result = this.getTreeAffinity(false);
        if (!result) return null;
        return side === 'left' ? result.playerP1.tripleLeft : result.playerP1.tripleRight;
    }

    getGrandparentRaceCount(side: 'left' | 'right'): number {
        return this.countSharedWins(
            this.record.main_win_saddles,
            side === 'left' ? this.record.left_win_saddles : this.record.right_win_saddles,
        );
    }

    getP2RaceCount(): number {
        return this.countSharedWins(this.p2WinSaddleIds, this.gp2LeftWinSaddleIds)
             + this.countSharedWins(this.p2WinSaddleIds, this.gp2RightWinSaddleIds);
    }

    getP2GrandparentRaceCount(side: 'left' | 'right'): number {
        return this.countSharedWins(
            this.p2WinSaddleIds,
            side === 'left' ? this.gp2LeftWinSaddleIds : this.gp2RightWinSaddleIds,
        );
    }

    getGrandparentTotalAffinity(side: 'left' | 'right'): number | null {
        const base = this.getGrandparentBaseAffinity(side);
        if (base === null) return null;
        return base + this.getGrandparentRaceCount(side);
    }

    getGrandparentAffinityTooltip(side: 'left' | 'right'): string {
        const base = this.getGrandparentBaseAffinity(side);
        const race = this.getGrandparentRaceCount(side);
        const parts: string[] = [];
        if (base !== null) parts.push(`Base: ${base}`);
        if (race) parts.push(`Race: ${race}`);
        return parts.join(' + ');
    }

    getCrossParentAffinity(): number | null {
        const mainId = this.getMainCharaId();
        if (!this.affinityService.isReady || !mainId || !this.p2CharaId) return null;
        return this.getTreeAffinity(true)?.legacy ?? null;
    }

    getCrossParentRaceAffinity(): number {
        const mainSaddles = this.record.main_win_saddles ?? [];
        const rightSaddles = new Set(this.record.right_win_saddles ?? []);
        return mainSaddles.filter(w => rightSaddles.has(w)).length;
    }

    getP2BaseAffinity(): number {
        if (!this.targetCharaId || !this.affinityService.isReady || !this.p2CharaId) return 0;
        return this.getTreeAffinity(true)?.playerP2.total ?? 0;
    }

    /**
     * Per-source affinity for P2 spark proc chance calculation.
     *
     * In the database UI the user is browsing potential P1 candidates with a
     * fixed P2 legacy (the selected veteran). The affinity that boosts a P2
     * spark when actually breeding this combination is the sum of:
     *   1. Target-side affinity vs the P2 node (only available if a target
     *      character is selected in the filter):
     *        - 'main'  : aff2(target,p2) + aff3(target,p2,gp2L) + aff3(target,p2,gp2R)
     *        - 'left'  : aff3(target, p2, gp2Left)
     *        - 'right' : aff3(target, p2, gp2Right)
     *   2. Legacy/breeding affinity between the record's P1 main horse and
     *      the corresponding P2 node (works even without a target — this is
     *      the "P2 legacy" contribution the user is browsing for):
     *        - 'main'  : aff2(p1Main, p2)
     *        - 'left'  : aff2(p1Main, gp2Left)
     *        - 'right' : aff2(p1Main, gp2Right)
     */
    getP2AffinityForSource(source: 'main' | 'left' | 'right'): number {
        if (!this.affinityService.isReady) return 0;
        let affinity = 0;
        const mergedTree = this.getTreeAffinity(true);

        // 1. Target-side contribution
        if (this.targetCharaId && this.p2CharaId && mergedTree) {
            if (source === 'main') {
                affinity += mergedTree.playerP2.total;
            } else {
                affinity += source === 'left' ? mergedTree.playerP2.tripleLeft : mergedTree.playerP2.tripleRight;
            }
        }

        // 2. Local race-overlap contribution on the selected P2 side.
        affinity += source === 'main'
            ? this.getP2RaceCount()
            : this.getP2GrandparentRaceCount(source);

        // 3. Legacy contribution (P1 main horse vs P2 node)
        const p1MainId = this.getMainCharaId();
        if (p1MainId) {
            if (source === 'main') {
                affinity += mergedTree?.legacy ?? 0;
            } else {
                const gpId = source === 'left' ? this.gp2LeftCharaId : this.gp2RightCharaId;
                if (gpId) {
                    affinity += this.affinityService.getAff2(p1MainId, gpId);
                }
            }
        }

        // 4. Fallback: if we couldn't compute anything direct (missing IDs),
        //    use the server-side relation total so P2 sparks at least reflect
        //    the same affinity boost the spark would actually receive in-game.
        if (affinity === 0 && this.record.affinity_score) {
            return this.getRecordTotalAffinity() ?? this.record.affinity_score;
        }

        return affinity;
    }

    getLegacyAffinity(): number {
        const mainId = this.getMainCharaId();
        if (!this.affinityService.isReady || !mainId || !this.p2CharaId) return 0;
        return this.getTreeAffinity(true)?.legacy ?? 0;
    }

    getP2TotalAffinity(): number {
        return this.getP2BaseAffinity() + this.getP2RaceCount() + this.getLegacyAffinity();
    }

    getMergedAffinity(): number {
        return this.getRecordTotalAffinity() ?? 0;
    }

    getSplitAffinity(): number {
        return this.getMainTotalAffinity() ?? 0;
    }

    canComputeAffinity(): boolean {
        return this.targetCharaId !== null && this.affinityService.isReady && this.getMainCharaId() !== null;
    }

    hasDisplayAffinity(): boolean {
        return this.getRecordTotalAffinity() !== null;
    }

    private resolveDisplayAffinity(): number {
        if (this.canComputeAffinity()) {
            return (this.sparkViewMode === 'merged' && !this.selectedParent)
                ? this.getMergedAffinity()
                : this.getSplitAffinity();
        }
        return this.getRecordTotalAffinity() ?? 0;
    }

    sparkDisplayChance(spark: SparkInfo, affinityOverride?: number): number {
        const affinity = affinityOverride ?? this.resolveDisplayAffinity();
        return this.affinityService.sparkDisplayChance(spark, affinity, this.sparkShowPerRun);
    }

    /**
     * Resolve P2 spark id+source pairs into entries that carry the spark and the
     * correct per-source affinity. Used by the split view to render each P2
     * spark with the affinity that actually governs its proc chance.
     */
    resolveP2SparksWithAffinity(
        entries: P2SparkSourceEntry[] | null | undefined,
    ): P2SparkDisplayEntry[] {
        if (!entries?.length) return [];
        const cacheKey = `p2|${this.sparkShowPerRun ? 1 : 0}|${this.p2SourceKey(entries)}|${this.affinityContextKey()}`;
        const cached = this.p2SparkDisplayCache.get(cacheKey);
        if (cached) return cached;
        const out: P2SparkDisplayEntry[] = [];
        for (const { id, source } of entries) {
            if (!id) continue;
            const aff = this.getP2AffinityForSource(source);
            for (const spark of this.factorService.resolveSparks([id])) {
                out.push({ spark, affinity: aff, source });
            }
        }
        this.p2SparkDisplayCache.set(cacheKey, out);
        return out;
    }

    toggleSparkMode(event: Event): void {
        event.stopPropagation();
        this.sparkShowPerRun = !this.sparkShowPerRun;
        this.sparkShowPerRunChange.emit(this.sparkShowPerRun);
    }

    toggleShowP2Sparks(event: Event): void {
        event.stopPropagation();
        this.showP2Sparks = !this.showP2Sparks;
        this.showP2SparksChange.emit(this.showP2Sparks);
    }

    get hasP2Sparks(): boolean {
        return !!this.p2BlueSparks?.length || !!this.p2PinkSparks?.length
            || !!this.p2GreenSparks?.length || !!this.p2WhiteSparks?.length;
    }

    @Input() p2BlueSparks: number[] | null = null;
    @Input() p2PinkSparks: number[] | null = null;
    @Input() p2GreenSparks: number[] | null = null;
    @Input() p2WhiteSparks: number[] | null = null;
    @Input() p2BlueSparkSources: P2SparkSourceEntry[] | null = null;
    @Input() p2PinkSparkSources: P2SparkSourceEntry[] | null = null;
    @Input() p2GreenSparkSources: P2SparkSourceEntry[] | null = null;
    @Input() p2WhiteSparkSources: P2SparkSourceEntry[] | null = null;

    getP2BlueSparks(): number[] { return this.p2BlueSparks ?? this.emptyNumberArray; }
    getP2PinkSparks(): number[] { return this.p2PinkSparks ?? this.emptyNumberArray; }
    getP2GreenSparks(): number[] { return this.p2GreenSparks ?? this.emptyNumberArray; }
    getP2WhiteSparks(): number[] { return this.p2WhiteSparks ?? this.emptyNumberArray; }

    getMergedBlueSparks(): CombinedSparkInfo[] {
        return this.getMergedColorSparks('blue', [this.record.main_blue_factors, this.record.left_blue_factors, this.record.right_blue_factors], this.getP2BlueSparks(), this.p2BlueSparkSources);
    }

    getMergedPinkSparks(): CombinedSparkInfo[] {
        return this.getMergedColorSparks('pink', [this.record.main_pink_factors, this.record.left_pink_factors, this.record.right_pink_factors], this.getP2PinkSparks(), this.p2PinkSparkSources);
    }

    getMergedGreenSparks(): CombinedSparkInfo[] {
        return this.getMergedColorSparks('green', [this.record.main_green_factors, this.record.left_green_factors, this.record.right_green_factors], this.getP2GreenSparks(), this.p2GreenSparkSources);
    }

    getMergedWhiteSparks(): CombinedSparkInfo[] {
        const p2Ids = this.showP2Sparks ? this.getP2WhiteSparks() : this.emptyNumberArray;
        const p2Sources = this.showP2Sparks ? this.p2WhiteSparkSources : null;
        const cacheKey = this.mergedSparkCacheKey('white', [
            ...(this.record.main_white_factors ?? []),
            ...(this.record.left_white_factors ?? []),
            ...(this.record.right_white_factors ?? []),
        ], p2Ids, p2Sources);
        const cached = this.mergedSparkCache.get(cacheKey);
        if (cached) return cached;
        const value = this.combineWhiteSparks(p2Ids, p2Sources);
        this.mergedSparkCache.set(cacheKey, value);
        return value;
    }

    getP2BlueSparkEntries(): P2SparkDisplayEntry[] { return this.resolveP2SparksWithAffinity(this.p2BlueSparkSources); }
    getP2PinkSparkEntries(): P2SparkDisplayEntry[] { return this.resolveP2SparksWithAffinity(this.p2PinkSparkSources); }
    getP2GreenSparkEntries(): P2SparkDisplayEntry[] { return this.resolveP2SparksWithAffinity(this.p2GreenSparkSources); }
    getP2WhiteSparkEntries(): P2SparkDisplayEntry[] { return this.resolveP2SparksWithAffinity(this.p2WhiteSparkSources); }

    private getMergedColorSparks(
        color: 'blue' | 'pink' | 'green',
        p1Ids: (number | undefined)[],
        p2Ids: number[],
        p2SourceEntries?: P2SparkSourceEntry[] | null,
    ): CombinedSparkInfo[] {
        const effectiveP2Ids = this.showP2Sparks ? p2Ids : this.emptyNumberArray;
        const effectiveP2Sources = this.showP2Sparks ? p2SourceEntries : null;
        const cacheKey = this.mergedSparkCacheKey(color, p1Ids, effectiveP2Ids, effectiveP2Sources);
        const cached = this.mergedSparkCache.get(cacheKey);
        if (cached) return cached;
        const value = this.combineSparks(p1Ids, effectiveP2Ids, effectiveP2Sources);
        this.mergedSparkCache.set(cacheKey, value);
        return value;
    }

    private mergedSparkCacheKey(
        color: string,
        p1Ids: (number | undefined)[],
        p2Ids: number[],
        p2SourceEntries?: P2SparkSourceEntry[] | null,
    ): string {
        return [
            this.record.id,
            color,
            this.showP2Sparks ? 1 : 0,
            p1Ids.filter(Boolean).join(','),
            p2Ids.join(','),
            this.p2SourceKey(p2SourceEntries),
            this.affinityContextKey(),
        ].join('|');
    }

    private p2SourceKey(entries: P2SparkSourceEntry[] | null | undefined): string {
        return entries?.length ? entries.map(entry => `${entry.id}:${entry.source}`).join(',') : '';
    }

    private affinityContextKey(): string {
        return [
            this.targetCharaId ?? '',
            this.p2CharaId ?? '',
            this.gp2LeftCharaId ?? '',
            this.gp2RightCharaId ?? '',
            (this.p2WinSaddleIds ?? []).join(','),
            (this.gp2LeftWinSaddleIds ?? []).join(','),
            (this.gp2RightWinSaddleIds ?? []).join(','),
        ].join(':');
    }

    trackBySparkInfo(_: number, spark: SparkInfo): string {
        return `${spark.factorId}:${spark.level}:${spark.type}`;
    }

    trackByCombinedSpark(_: number, spark: CombinedSparkInfo): string {
        return `${spark.factorId}:${spark.level}:${spark.p2Level}:${spark.type}`;
    }

    trackByP2SparkEntry(_: number, entry: P2SparkDisplayEntry): string {
        return `${entry.spark.factorId}:${entry.spark.level}:${entry.source}:${entry.affinity}`;
    }

    // HTML-facing: p1Ids order MUST be [main, left, right]
    combineSparks(
        p1Ids: (number | undefined)[],
        p2Ids: number[],
        p2SourceEntries?: P2SparkSourceEntry[] | null,
    ): CombinedSparkInfo[] {
        const keys: ('main' | 'left' | 'right')[] = ['main', 'left', 'right'];
        const labeled = p1Ids
            .map((id, i) => ({ id, key: keys[i] ?? 'main' as 'main' }))
            .filter((s): s is { id: number; key: 'main' | 'left' | 'right' } => !!s.id);
        const p2Labeled = (p2SourceEntries?.length
            ? p2SourceEntries
            : p2Ids.map(id => ({ id, source: 'main' as const }))
        ).filter(s => !!s.id);
        return this.combineSparksSources(labeled, p2Labeled);
    }

    private combineSparksSources(
        p1Labeled: { id: number; key: 'main' | 'left' | 'right' }[],
        p2Labeled: { id: number; source: 'main' | 'left' | 'right' }[]
    ): CombinedSparkInfo[] {
        const groups = new Map<string, { spark: SparkInfo; p1Sources: CombinedSparkSourceEntry[]; p2Sources: CombinedP2SourceEntry[] }>();

        for (const { id, key } of p1Labeled) {
            for (const s of this.factorService.resolveSparks([id])) {
                let g = groups.get(s.factorId);
                if (!g) { g = { spark: s, p1Sources: [], p2Sources: [] }; groups.set(s.factorId, g); }
                g.p1Sources.push({ level: s.level, parentKey: key });
            }
        }
        for (const { id, source } of p2Labeled) {
            for (const s of this.factorService.resolveSparks([id])) {
                let g = groups.get(s.factorId);
                if (!g) { g = { spark: s, p1Sources: [], p2Sources: [] }; groups.set(s.factorId, g); }
                g.p2Sources.push({ level: s.level, source });
            }
        }

        return [...groups.values()].map(g => {
            const p1Total = g.p1Sources.reduce((a, s) => a + s.level, 0);
            const p2Total = g.p2Sources.reduce((a, s) => a + s.level, 0);
            return {
                ...g.spark,
                level: p1Total + p2Total,
                p2Level: p2Total,
                p1Sources: g.p1Sources,
                p2Sources: g.p2Sources,
            };
        });
    }

    combineWhiteSparks(p2Ids: number[], p2SourceEntries?: P2SparkSourceEntry[] | null): CombinedSparkInfo[] {
        const mainIds = (this.record?.main_white_factors || []).map(id => ({ id, key: 'main' as const }));
        const leftIds  = (this.record?.left_white_factors  || []).map(id => ({ id, key: 'left'  as const }));
        const rightIds = (this.record?.right_white_factors || []).map(id => ({ id, key: 'right' as const }));
        const p2Labeled = (p2SourceEntries?.length
            ? p2SourceEntries
            : p2Ids.map(id => ({ id, source: 'main' as const }))
        ).filter(s => !!s.id);
        return this.combineSparksSources([...mainIds, ...leftIds, ...rightIds], p2Labeled);
    }

    combinedSparkDisplayChance(sparkInfo: CombinedSparkInfo): string {
        const affinityForKey = (key: 'main' | 'left' | 'right'): number => {
            if (key === 'main') {
                return this.getMainTotalAffinity() ?? this.getMainBreedingBaseAffinity() ?? this.record.affinity_score ?? 0;
            }
            return this.getGrandparentTotalAffinity(key) ?? this.getMainBreedingPair(key) ?? 0;
        };
        const sources = [
            ...sparkInfo.p1Sources.map(s => ({ spark: { ...sparkInfo, level: s.level }, affinity: affinityForKey(s.parentKey) })),
            ...sparkInfo.p2Sources.map(s => ({
                spark: { ...sparkInfo, level: s.level },
                affinity: this.getP2AffinityForSource(s.source),
            })),
        ];
        const m = this.affinityService.getSparkMetrics(sources, this.sparkShowPerRun);
        const isWhiteSpark = sparkInfo.type >= 2 && sparkInfo.type <= 4;
        if (isWhiteSpark) {
            return `${this.formatNumber(m.procChancePct, this.twoDecimalFormatOptions)}%`;
        }

        // Show expected procs when ≥1, proc chance otherwise — same logic as the planner.
        // Always use 2 decimals with locale-aware formatting.
        return m.expectedProcs >= 1
            ? `${this.formatNumber(m.expectedProcs, this.twoDecimalFormatOptions)}x`
            : `${this.formatNumber(m.procChancePct, this.twoDecimalFormatOptions)}%`;
    }

    formatSparkPct(value: number): string {
        return `${this.formatNumber(value, this.twoDecimalFormatOptions)}%`;
    }

    private formatNumber(value: number, options: Intl.NumberFormatOptions): string {
        const cacheKey = `${options.minimumFractionDigits ?? ''}|${options.maximumFractionDigits ?? ''}|${options.notation ?? ''}`;
        let formatter = this.numberFormatterCache.get(cacheKey);
        if (!formatter) {
            formatter = new Intl.NumberFormat(this.uiLocale, options);
            this.numberFormatterCache.set(cacheKey, formatter);
        }
        return formatter.format(value);
    }
}
