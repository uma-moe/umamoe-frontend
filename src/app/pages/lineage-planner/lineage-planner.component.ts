import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, ViewChild, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { TreeSavesDialogComponent, TreeSavesDialogData, TreeSavesDialogResult, TreeSaveEntry } from './tree-saves-dialog.component';
import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog.component';
import { Subject, takeUntil, of } from 'rxjs';
import { debounceTime, catchError } from 'rxjs/operators';
import { Character } from '../../models/character.model';
import { VeteranMember, SuccessionChara } from '../../models/profile.model';
import { LinkedAccount } from '../../models/auth.model';
import { CharacterService } from '../../services/character.service';
import { ProfileService } from '../../services/profile.service';
import { AuthService } from '../../services/auth.service';
import { FactorService, SparkInfo, Factor } from '../../services/factor.service';
import { AffinityService, TreeSlots, TreeAffinityResult, SparkDisplayMetrics } from '../../services/affinity.service';
import { SKILLS } from '../../data/skills-data';
import { CHARACTERS } from '../../data/character.data';
import { environment } from '../../../environments/environment';
import { PlannerTransferService } from '../../services/planner-transfer.service';
import { LineageNode, TREE_POSITIONS, BTREE_ORDER } from './lineage-planner.model';
import { CharacterSelectDialogComponent } from '../../components/character-select-dialog/character-select-dialog.component';
import { SparkEditorComponent } from '../../components/spark-editor/spark-editor.component';
import { VeteranPickerDialogComponent, VeteranPickerDialogData } from '../../components/veteran-picker-dialog/veteran-picker-dialog.component';
import { RaceResultsDialogComponent, RaceResultsDialogData } from '../../components/race-results-dialog/race-results-dialog.component';
import { RaceWinPickerDialogComponent, RaceWinPickerDialogData } from '../../components/race-results-dialog/race-win-picker-dialog.component';
import { Meta, Title } from '@angular/platform-browser';

@Component({
  selector: 'app-lineage-planner',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTabsModule,
    SparkEditorComponent,
  ],
  templateUrl: './lineage-planner.component.html',
  styleUrl: './lineage-planner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LineagePlannerComponent implements OnInit, OnDestroy, AfterViewInit {
  private destroy$ = new Subject<void>();
  @ViewChild('plannerScroll', { static: false }) plannerScrollRef!: ElementRef<HTMLElement>;
  @ViewChild('plannerContent', { static: false }) plannerContentRef!: ElementRef<HTMLElement>;
  private resizeObserver?: ResizeObserver;
  mobileScale = 1;

  // Tree state
  nodes = new Map<string, LineageNode>();

  // Character search
  characters: Character[] = [];

  // Veteran loading
  linkedAccounts: LinkedAccount[] = [];
  veterans: { [accountId: string]: VeteranMember[] } = {};
  loadingVeterans: { [accountId: string]: boolean } = {};
  selectedAccountId: string | null = null;

  // UI state
  activeNode: string | null = null;
  isLoggedIn = false;

  private static readonly STORAGE_KEY = 'lineage-planner-state-v1';
  private static readonly SAVES_KEY = 'lineage-planner-saves-v1';
  private static readonly EXPORT_VERSION = 1;

  // Affinity
  private affinityRecalc$ = new Subject<void>();
  private queryParamsLoaded = false;
  affinityResult: TreeAffinityResult | null = null;
  affinityTotal: number | null = null;
  affinityPlayerBonus: number | null = null;
  affinityLoading = false;

  // Slot fitter


  // Mobile-only: collapse state for each GP's GGP children
  mobileExpandedGPs: Set<string> = new Set();
  toggleMobileGGPs(gpPosition: string, ev?: Event): void {
    if (ev) { ev.stopPropagation(); }
    if (this.mobileExpandedGPs.has(gpPosition)) {
      this.mobileExpandedGPs.delete(gpPosition);
    } else {
      this.mobileExpandedGPs.add(gpPosition);
    }
    this.cdr.markForCheck();
  }
  isMobileGGPExpanded(gpPosition: string): boolean {
    return this.mobileExpandedGPs.has(gpPosition);
  }

  // Spark odds
  oddsExpanded = true;
  targetInheritance: { name: string; type: number; factorId: string; count: number; learned: number; upgraded: number; gold: number; icon: string | null }[] = [];
  showInheritancePopup = false;

  private skillIconMap = new Map<string, string>();

  // Single source of truth lives in AffinityService; expose for the template.
  readonly baseChanceMatrix = AffinityService.BASE_CHANCE_MATRIX;

  readonly oddsColorGroups = [
    { label: 'Blue', cssClass: 'ot-blue', cols: 1 },
    { label: 'Pink', cssClass: 'ot-pink', cols: 1 },
    { label: 'Green', cssClass: 'ot-green', cols: 1 },
    { label: 'White', cssClass: 'ot-white', cols: 3 },
  ];

  oddsTab = 0;

  get sparkSummary(): { spark: SparkInfo; node: string; charName: string; icon: string; affinity: number; perInh: number; perRun: number }[] {
    const entries: { spark: SparkInfo; node: string; charName: string; icon: string; affinity: number; perInh: number; perRun: number }[] = [];
    for (const p of this.oddsParents) {
      const node = this.nodes.get(p.pos)!;
      if (!node.resolvedSparks?.length) continue;
      for (const spark of node.resolvedSparks) {
        const aff = p.affinity;
        entries.push({
          spark,
          node: p.name,
          charName: p.charName,
          icon: p.icon,
          affinity: aff,
          perInh: this.sparkProcChance(spark, aff),
          perRun: this.sparkRunChance(spark, aff),
        });
      }
    }
    if (this.sparkShowPerRun) {
      entries.sort((a, b) => b.perRun - a.perRun);
    } else {
      entries.sort((a, b) => b.perInh - a.perInh);
    }
    return entries;
  }

  get sparkCombined(): { name: string; type: number; sources: { node: string; charName: string; icon: string; star: number; perInh: number; perRun: number }[]; metrics: SparkDisplayMetrics }[] {
    const map = new Map<string, {
      name: string;
      type: number;
      sparkSources: { spark: SparkInfo; affinity: number }[];
      displaySources: { node: string; charName: string; icon: string; star: number; perInh: number; perRun: number }[];
    }>();
    for (const e of this.sparkSummary) {
      const key = e.spark.name;
      let group = map.get(key);
      if (!group) {
        group = { name: e.spark.name, type: e.spark.type, sparkSources: [], displaySources: [] };
        map.set(key, group);
      }
      // Use each source's own node affinity (same value shown in the per-source rows)
      group.sparkSources.push({ spark: e.spark, affinity: e.affinity });
      group.displaySources.push({ node: e.node, charName: e.charName, icon: e.icon, star: e.spark.level, perInh: e.perInh, perRun: e.perRun });
    }
    const result = [...map.values()].map(g => {
      const metrics = this.affinityService.getSparkMetrics(g.sparkSources, this.sparkShowPerRun);
      return { name: g.name, type: g.type, sources: g.displaySources, metrics };
    });
    result.sort((a, b) => b.metrics.expectedProcs - a.metrics.expectedProcs);
    return result;
  }

  get oddsParents(): { pos: string; name: string; charName: string; icon: string; affinity: number; layer: number }[] {
    if (!this.affinityResult) return [];
    const r = this.affinityResult;
    const build = (pos: string, label: string, affinity: number, layer: number) => {
      const node = this.nodes.get(pos)!;
      return { pos, name: label, charName: this.getCharacterName(node), icon: this.getCharacterIcon(node), affinity, layer };
    };
    const rows = [
      build('p1', 'P1', this.p1SideTotal, 1),
      build('p2', 'P2', this.p2SideTotal, 1),
      build('p1-1', 'GP1-1', this.getNodeAffinity(this.nodes.get('p1-1')!), 2),
      build('p1-2', 'GP1-2', this.getNodeAffinity(this.nodes.get('p1-2')!), 2),
      build('p2-1', 'GP2-1', this.getNodeAffinity(this.nodes.get('p2-1')!), 2),
      build('p2-2', 'GP2-2', this.getNodeAffinity(this.nodes.get('p2-2')!), 2),
    ];
    return rows.filter(r => this.hasContent(this.nodes.get(r.pos)!));
  }

  constructor(
    private http: HttpClient,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private characterService: CharacterService,
    private profileService: ProfileService,
    private authService: AuthService,
    private factorService: FactorService,
    public affinityService: AffinityService,
    private meta: Meta,
    private title: Title,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private plannerTransfer: PlannerTransferService,
  ) {
    this.title.setTitle('Lineage Planner - honse.moe');
    this.meta.addTags([
      { name: 'description', content: 'Plan your full inheritance lineage tree for Umamusume training' },
      { property: 'og:title', content: 'Lineage Planner - honse.moe' },
      { property: 'og:description', content: 'Plan inheritance combinations across 4 generations' },
    ]);
  }

  ngOnInit(): void {
    this.initializeTree();

    for (const s of SKILLS) {
      if (s.icon && !this.skillIconMap.has(s.name)) {
        this.skillIconMap.set(s.name, `assets/images/skills/${s.icon}`);
      }
    }

    // Set up debounced recalc FIRST so it's ready before any data loads
    this.affinityRecalc$
      .pipe(debounceTime(400), takeUntil(this.destroy$))
      .subscribe(() => {
        this.fetchAffinity();
        this.recalculateTargetInheritance();
        this.saveToLocalStorage();
      });

    // Load affinity lookup data - then load query params so affinity is ready
    this.affinityService.load()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!this.queryParamsLoaded) {
          this.queryParamsLoaded = true;
          this.loadFromQueryParams();
        }
      });

    this.characterService.getCharacters()
      .pipe(takeUntil(this.destroy$))
      .subscribe(chars => {
        this.characters = chars;
        this.cdr.markForCheck();
      });

    this.authService.user$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.isLoggedIn = !!user;
        if (user) {
          this.loadLinkedAccounts();
        }
        this.cdr.markForCheck();
      });
  }

  ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver(() => this.updateScale());
    if (this.plannerScrollRef?.nativeElement) {
      this.resizeObserver.observe(this.plannerScrollRef.nativeElement);
    }
    setTimeout(() => this.updateScale());
  }

  private updateScale(): void {
    const scroll = this.plannerScrollRef?.nativeElement;
    const content = this.plannerContentRef?.nativeElement;
    if (!scroll || !content) return;
    // Reset all inline sizing/transform from a previous run before measuring,
    // otherwise scrollWidth still reflects the inflated width we set when
    // scaling down and the tree will never grow back when the viewport does.
    content.style.transform = '';
    content.style.transformOrigin = '';
    content.style.width = '';
    const contentWidth = content.scrollWidth;
    const availableWidth = scroll.clientWidth;
    const scale = contentWidth > availableWidth ? availableWidth / contentWidth : 1;
    if (scale < 1) {
      content.style.transformOrigin = 'top center';
      content.style.transform = `scale(${scale})`;
      content.style.width = `${100 / scale}%`;
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeTree(): void {
    for (const pos of TREE_POSITIONS) {
      this.nodes.set(pos.position, {
        position: pos.position,
        layer: pos.layer,
        character: null,
        veteran: null,
        succession: null,
        resolvedSparks: [],
        affinity: null,
        manualWinSaddleIds: [],
        label: pos.label,
      });
    }
    this.affinityTotal = null;
    this.affinityPlayerBonus = null;
  }

  formatSparkPct(value: number): string {
    return value.toFixed(2) + '%';
  }

  private loadFromQueryParams(): void {
    const from = this.route.snapshot.queryParamMap.get('from');
    if (from === 'db') {
      this.loadFromTransfer();
      return;
    }

    const cards = this.route.snapshot.queryParamMap.get('cards');
    if (!cards) {
      // No query params — try restoring last saved state
      this.loadFromLocalStorage();
      return;
    }

    const ids = cards.split(',').map(s => parseInt(s, 10));
    if (ids.length < 5) return;

    for (let i = 0; i < Math.min(ids.length, BTREE_ORDER.length); i++) {
      const charaId = ids[i];
      if (!charaId) continue;

      const position = BTREE_ORDER[i];
      const node = this.nodes.get(position);
      if (!node) continue;

      const character = charaId > 100000
        ? CHARACTERS.find(c => c.id === charaId)
        : CHARACTERS.find(c => Math.floor(c.id / 100) === charaId);

      if (character) {
        node.character = character;
      }
    }

    this.affinityRecalc$.next();
    this.cdr.markForCheck();
  }

  private loadFromTransfer(): void {
    const data = this.plannerTransfer.take();
    if (!data) {
      // No transfer payload available (e.g. user reloaded a ?from=db URL).
      // Fall back to whatever was persisted previously.
      this.loadFromLocalStorage();
      return;
    }

    const { record, targetCharaId, veteran } = data;

    // Target
    if (targetCharaId) {
      const targetChar = CHARACTERS.find(c => c.id === targetCharaId);
      const targetNode = this.nodes.get('target');
      if (targetChar && targetNode) targetNode.character = targetChar;
    }

    const wrapFactor = (v: number | undefined | null): number[] | null => v != null ? [v] : null;

    this.populateFromRecord('p1', record.main_parent_id,
      wrapFactor(record.main_blue_factors), wrapFactor(record.main_pink_factors),
      wrapFactor(record.main_green_factors), record.main_white_factors ?? null,
      record.main_win_saddles);

    this.populateFromRecord('p1-1', record.parent_left_id,
      wrapFactor(record.left_blue_factors), wrapFactor(record.left_pink_factors),
      wrapFactor(record.left_green_factors), record.left_white_factors ?? null,
      record.left_win_saddles);

    this.populateFromRecord('p1-2', record.parent_right_id,
      wrapFactor(record.right_blue_factors), wrapFactor(record.right_pink_factors),
      wrapFactor(record.right_green_factors), record.right_white_factors ?? null,
      record.right_win_saddles);

    // P2 (veteran)
    if (veteran) {
      this.selectVeteran('p2', veteran);
    }

    this.affinityRecalc$.next();
    this.cdr.markForCheck();
  }

  private populateFromRecord(
    position: string,
    parentId: number | undefined | null,
    blueSparks: number[] | undefined | null,
    pinkSparks: number[] | undefined | null,
    greenSparks: number[] | undefined | null,
    whiteSparks: number[] | undefined | null,
    winSaddles: number[] | undefined | null,
  ): void {
    const node = this.nodes.get(position);
    if (!node || !parentId) return;

    const character = parentId > 100000
      ? CHARACTERS.find(c => c.id === parentId)
      : CHARACTERS.find(c => Math.floor(c.id / 100) === parentId);

    if (character) node.character = character;

    const allSparks = [
      ...(blueSparks || []),
      ...(pinkSparks || []),
      ...(greenSparks || []),
      ...(whiteSparks || []),
    ];
    if (allSparks.length) {
      node.resolvedSparks = this.factorService.resolveSparks(allSparks);
    }

    if (winSaddles?.length) {
      node.manualWinSaddleIds = winSaddles;
    }
  }

  private loadLinkedAccounts(): void {
    this.authService.getLinkedAccounts()
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(accounts => {
        this.linkedAccounts = accounts;
        // Auto-select first account and pre-load its veterans
        if (accounts.length > 0 && !this.selectedAccountId) {
          this.selectedAccountId = accounts[0].account_id;
          this.loadVeterans(accounts[0].account_id);
        }
        this.cdr.markForCheck();
      });
  }

  selectCharacter(position: string, character: Character): void {
    const node = this.nodes.get(position);
    if (!node) return;

    const violation = this.checkPlacementViolation(position, character);
    if (violation) {
      this.showValidationError(violation);
      return;
    }

    node.character = character;
    node.veteran = null;
    node.succession = null;
    node.resolvedSparks = [];
    node.affinity = null;
    node.manualWinSaddleIds = [];
    this.affinityRecalc$.next();
    this.cdr.markForCheck();
  }

  // -- Veteran loading --

  loadVeterans(accountId: string): void {
    if (this.veterans[accountId] !== undefined || this.loadingVeterans[accountId]) return;
    this.loadingVeterans[accountId] = true;
    this.cdr.markForCheck();

    this.profileService.getProfile(accountId)
      .pipe(takeUntil(this.destroy$), catchError(() => of(null)))
      .subscribe(profile => {
        this.loadingVeterans[accountId] = false;
        this.veterans[accountId] = profile?.veterans ?? [];
        this.cdr.markForCheck();
      });
  }

  selectVeteran(position: string, veteran: VeteranMember): void {
    const node = this.nodes.get(position);
    if (!node) return;

    const character = veteran.card_id
      ? this.characters.find(c => c.id === veteran.card_id)
      : veteran.trained_chara_id
        ? this.characters.find(c => Math.floor(c.id / 100) === veteran.trained_chara_id)
        : null;

    if (character) {
      const violation = this.checkPlacementViolation(position, character);
      if (violation) {
        this.showValidationError(violation);
        return;
      }
    }

    node.character = character || null;
    node.veteran = veteran;
    node.succession = null;
    node.resolvedSparks = this.resolveVeteranSparks(veteran);
    node.affinity = null;
    this.activeNode = null;

    // Auto-fill children from succession data if available
    if (veteran.succession_chara_array?.length) {
      this.fillFromSuccession(position, veteran.succession_chara_array);
    }

    this.affinityRecalc$.next();
    this.cdr.markForCheck();
  }

  private fillFromSuccession(parentPosition: string, succession: SuccessionChara[]): void {
    // Map succession position_id to tree positions relative to parentPosition
    // position_id 10 = left parent, 20 = right parent
    // position_id 11, 12 = left parent's parents, 21, 22 = right parent's parents
    const posMap: { [posId: number]: string } = {};

    if (parentPosition === 'target') {
      posMap[10] = 'p1';
      posMap[20] = 'p2';
      posMap[11] = 'p1-1';
      posMap[12] = 'p1-2';
      posMap[21] = 'p2-1';
      posMap[22] = 'p2-2';
    } else if (parentPosition === 'p1') {
      posMap[10] = 'p1-1';
      posMap[20] = 'p1-2';
      posMap[11] = 'p1-1-1';
      posMap[12] = 'p1-1-2';
      posMap[21] = 'p1-2-1';
      posMap[22] = 'p1-2-2';
    } else if (parentPosition === 'p2') {
      posMap[10] = 'p2-1';
      posMap[20] = 'p2-2';
      posMap[11] = 'p2-1-1';
      posMap[12] = 'p2-1-2';
      posMap[21] = 'p2-2-1';
      posMap[22] = 'p2-2-2';
    }
    // Layer 2 parents filling layer 3
    else if (parentPosition === 'p1-1') {
      posMap[10] = 'p1-1-1';
      posMap[20] = 'p1-1-2';
    } else if (parentPosition === 'p1-2') {
      posMap[10] = 'p1-2-1';
      posMap[20] = 'p1-2-2';
    } else if (parentPosition === 'p2-1') {
      posMap[10] = 'p2-1-1';
      posMap[20] = 'p2-1-2';
    } else if (parentPosition === 'p2-2') {
      posMap[10] = 'p2-2-1';
      posMap[20] = 'p2-2-2';
    }

    for (const sc of succession) {
      const treePos = posMap[sc.position_id];
      if (!treePos) continue;

      const node = this.nodes.get(treePos);
      if (!node) continue;

      const character = sc.card_id ? this.characters.find(c => c.id === sc.card_id) : null;
      node.character = character || null;
      node.succession = sc;
      node.veteran = null;
      node.resolvedSparks = this.resolveSuccessionSparks(sc);
    }
  }

  private resolveVeteranSparks(veteran: VeteranMember): SparkInfo[] {
    if (veteran.inheritance) {
      const allSparks = [
        ...(veteran.inheritance.blue_sparks || []),
        ...(veteran.inheritance.pink_sparks || []),
        ...(veteran.inheritance.green_sparks || []),
        ...(veteran.inheritance.white_sparks || []),
      ];
      return this.factorService.resolveSparks(allSparks);
    }
    if (veteran.factor_info_array?.length) {
      return this.factorService.resolveSparks(veteran.factor_info_array.map(f => f.factor_id));
    }
    if (veteran.factors?.length) {
      return this.factorService.resolveSparks(veteran.factors);
    }
    return [];
  }

  private resolveSuccessionSparks(sc: SuccessionChara): SparkInfo[] {
    if (sc.factor_info_array?.length) {
      return this.factorService.resolveSparks(sc.factor_info_array.map(f => f.factor_id));
    }
    if (sc.factor_id_array?.length) {
      return this.factorService.resolveSparks(sc.factor_id_array);
    }
    return [];
  }

  // -- Node helpers --

  getNode(position: string): LineageNode | undefined {
    return this.nodes.get(position);
  }

  getCharacterImage(node: LineageNode): string {
    if (node.character) {
      return `assets/images/characters/${node.character.image}`;
    }
    if (node.succession?.card_id) {
      return `assets/images/characters/chara_stand_${node.succession.card_id}.png`;
    }
    if (node.veteran?.card_id) {
      return `assets/images/characters/chara_stand_${node.veteran.card_id}.png`;
    }
    if (node.veteran?.trained_chara_id) {
      return `assets/images/characters/chara_stand_${node.veteran.trained_chara_id}.png`;
    }
    return '';
  }

  getCharacterName(node: LineageNode): string {
    if (node.character) return node.character.name;
    if (node.succession?.card_id) {
      const c = this.characters.find(ch => ch.id === node.succession!.card_id);
      return c?.name || `Uma #${node.succession.card_id}`;
    }
    if (node.veteran?.card_id) {
      const c = this.characters.find(ch => ch.id === node.veteran!.card_id);
      return c?.name || `Uma #${node.veteran.card_id}`;
    }
    if (node.veteran?.trained_chara_id) {
      const c = this.characters.find(ch => ch.id === node.veteran!.trained_chara_id);
      return c?.name || `Uma #${node.veteran.trained_chara_id}`;
    }
    return '';
  }

  hasContent(node: LineageNode): boolean {
    return !!(node.character || node.veteran || node.succession);
  }

  getSparkLimit(node: LineageNode): number {
    switch (node.layer) {
      case 0: return 10;
      case 1: return 8;
      case 2: return 6;
      case 3: return 5;
      default: return 6;
    }
  }

  getVeteranCharacterName(veteran: VeteranMember): string {
    if (veteran.card_id) {
      const c = this.characters.find(ch => ch.id === veteran.card_id);
      return c?.name || `Uma #${veteran.card_id}`;
    }
    if (veteran.trained_chara_id) {
      const c = this.characters.find(ch => Math.floor(ch.id / 100) === veteran.trained_chara_id);
      return c?.name || `Uma #${veteran.trained_chara_id}`;
    }
    return 'Unknown';
  }

  getVeteranImage(veteran: VeteranMember): string {
    if (veteran.card_id) {
      return `assets/images/character_stand/chara_stand_${veteran.card_id}.png`;
    }
    if (veteran.trained_chara_id) {
      const c = this.characters.find(ch => Math.floor(ch.id / 100) === veteran.trained_chara_id);
      return c ? `assets/images/character_stand/chara_stand_${c.id}.png` : '';
    }
    return '';
  }

  getSparkColor(spark: SparkInfo): string {
    switch (spark.type) {
      case 0: return 'blue';
      case 1: return 'pink';
      case 5: return 'green';
      default: return 'white';
    }
  }

  getChildPositions(position: string): string[] {
    return TREE_POSITIONS
      .filter(p => p.parentPosition === position)
      .map(p => p.position);
  }

  clearNode(position: string): void {
    const node = this.nodes.get(position);
    if (!node) return;
    node.character = null;
    node.veteran = null;
    node.succession = null;
    node.resolvedSparks = [];
    node.affinity = null;
    node.manualWinSaddleIds = [];
    this.affinityRecalc$.next();
    this.cdr.markForCheck();
  }

  clearAll(): void {
    this.initializeTree();
    try { localStorage.removeItem(LineagePlannerComponent.STORAGE_KEY); } catch {}
    this.cdr.markForCheck();
  }

  /** Persist the current tree to localStorage so it survives page reloads. */
  private saveToLocalStorage(): void {
    try {
      const payload = this.buildPayload();
      if (payload.length === 0) {
        localStorage.removeItem(LineagePlannerComponent.STORAGE_KEY);
        return;
      }
      localStorage.setItem(LineagePlannerComponent.STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage may be unavailable (private mode, quota); silently ignore.
    }
  }

  /** Restore tree from localStorage, if present. */
  private loadFromLocalStorage(): void {
    let raw: string | null = null;
    try { raw = localStorage.getItem(LineagePlannerComponent.STORAGE_KEY); } catch { return; }
    if (!raw) return;

    let payload: any[];
    try { payload = JSON.parse(raw); } catch { return; }
    if (!Array.isArray(payload)) return;

    for (const entry of payload) {
      const node = this.nodes.get(entry.position);
      if (!node) continue;

      if (entry.characterId != null) {
        const char = CHARACTERS.find(c => c.id === entry.characterId);
        if (char) node.character = char;
      }
      if (entry.veteran) node.veteran = entry.veteran;
      if (entry.succession) node.succession = entry.succession;
      if (Array.isArray(entry.sparks)) node.resolvedSparks = entry.sparks;
      if (Array.isArray(entry.manualWinSaddleIds)) node.manualWinSaddleIds = entry.manualWinSaddleIds;
    }

    this.affinityRecalc$.next();
    this.cdr.markForCheck();
  }

  // ─── Named saves / Export / Import ─────────────────────────────────────────

  /** Build the serializable payload for the current tree state. */
  private buildPayload(): any[] {
    const payload: any[] = [];
    for (const node of this.nodes.values()) {
      if (!this.hasContent(node)) continue;
      payload.push({
        position: node.position,
        characterId: node.character?.id ?? null,
        sparks: node.resolvedSparks,
        veteran: node.veteran,
        succession: node.succession,
        manualWinSaddleIds: node.manualWinSaddleIds,
      });
    }
    return payload;
  }

  /** Apply a payload (in the same shape as auto-save) to the tree. */
  private applyPayload(payload: any[]): void {
    if (!Array.isArray(payload)) return;
    this.initializeTree();
    for (const entry of payload) {
      const node = this.nodes.get(entry.position);
      if (!node) continue;
      if (entry.characterId != null) {
        const char = CHARACTERS.find(c => c.id === entry.characterId);
        if (char) node.character = char;
      }
      if (entry.veteran) node.veteran = entry.veteran;
      if (entry.succession) node.succession = entry.succession;
      if (Array.isArray(entry.sparks)) node.resolvedSparks = entry.sparks;
      if (Array.isArray(entry.manualWinSaddleIds)) node.manualWinSaddleIds = entry.manualWinSaddleIds;
    }
    this.affinityRecalc$.next();
    this.cdr.markForCheck();
  }

  private readSaves(): { [name: string]: any[] } {
    try {
      const raw = localStorage.getItem(LineagePlannerComponent.SAVES_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch { return {}; }
  }

  private writeSaves(saves: { [name: string]: any[] }): void {
    try {
      localStorage.setItem(LineagePlannerComponent.SAVES_KEY, JSON.stringify(saves));
    } catch {
      this.snackBar.open('Failed to write to localStorage (storage full?)', 'OK', { duration: 4000 });
    }
  }

  /** Open the save/load/export/import dialog. */
  openSavesDialog(): void {
    const saves = this.readSaves();
    const entries: TreeSaveEntry[] = Object.keys(saves)
      .sort((a, b) => a.localeCompare(b))
      .map(name => ({ name, nodeCount: Array.isArray(saves[name]) ? saves[name].length : 0 }));
    const hasCurrent = this.buildPayload().length > 0;

    const ref = this.dialog.open<TreeSavesDialogComponent, TreeSavesDialogData, TreeSavesDialogResult>(
      TreeSavesDialogComponent,
      {
        width: '92vw',
        maxWidth: '560px',
        panelClass: 'modern-dialog-panel',
        autoFocus: false,
        data: { saves: entries, hasCurrent },
      },
    );
    ref.afterClosed().subscribe(result => this.handleSavesDialogResult(result ?? null));
  }

  private async handleSavesDialogResult(result: TreeSavesDialogResult): Promise<void> {
    if (!result) return;
    switch (result.action) {
      case 'save':
        await this.handleSaveAction(result.name);
        break;
      case 'load':
        this.handleLoadAction(result.name);
        break;
      case 'delete':
        await this.handleDeleteAction(result.name);
        break;
      case 'export-clipboard':
        await this.exportToClipboard();
        break;
      case 'export-file':
        this.exportToFile();
        break;
      case 'import-clipboard':
        await this.importFromClipboard();
        break;
      case 'import-file':
        this.importFromFile(result.file);
        break;
    }
  }

  private async confirmDialog(data: ConfirmDialogData): Promise<boolean> {
    const ref = this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        width: '92vw',
        maxWidth: '420px',
        panelClass: 'modern-dialog-panel',
        autoFocus: true,
        data,
      },
    );
    return (await ref.afterClosed().toPromise()) === true;
  }

  private async handleSaveAction(name: string): Promise<void> {
    const payload = this.buildPayload();
    if (payload.length === 0) {
      this.snackBar.open('Nothing to save — tree is empty.', 'OK', { duration: 3000 });
      return;
    }
    const saves = this.readSaves();
    if (saves[name]) {
      const ok = await this.confirmDialog({
        title: 'Overwrite save?',
        message: `A saved tree named "${name}" already exists. Replace it with the current tree?`,
        confirmLabel: 'Overwrite',
        cancelLabel: 'Cancel',
      });
      if (!ok) { this.openSavesDialog(); return; }
    }
    saves[name] = payload;
    this.writeSaves(saves);
    this.snackBar.open(`Saved "${name}".`, 'OK', { duration: 2500 });
  }

  private handleLoadAction(name: string): void {
    const saves = this.readSaves();
    const payload = saves[name];
    if (!payload) {
      this.snackBar.open(`Save "${name}" not found.`, 'OK', { duration: 3000 });
      return;
    }
    this.applyPayload(payload);
    this.snackBar.open(`Loaded "${name}".`, 'OK', { duration: 2500 });
  }

  private async handleDeleteAction(name: string): Promise<void> {
    const ok = await this.confirmDialog({
      title: 'Delete saved tree?',
      message: `"${name}" will be permanently removed from your browser.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) { this.openSavesDialog(); return; }
    const saves = this.readSaves();
    delete saves[name];
    this.writeSaves(saves);
    this.snackBar.open(`Deleted "${name}".`, 'OK', { duration: 2500 });
    this.openSavesDialog();
  }

  /** Build a versioned export envelope as a JSON string. */
  private buildExportString(): string | null {
    const payload = this.buildPayload();
    if (payload.length === 0) return null;
    return JSON.stringify({
      version: LineagePlannerComponent.EXPORT_VERSION,
      type: 'lineage-planner',
      exportedAt: new Date().toISOString(),
      payload,
    });
  }

  /** Parse an import string and return the payload, or null on failure. */
  private parseImportString(raw: string): any[] | null {
    if (!raw) return null;
    let parsed: any;
    try { parsed = JSON.parse(raw.trim()); } catch { return null; }
    // Accept either { version, payload } envelope or a bare payload array.
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.payload)) return parsed.payload;
    return null;
  }

  async exportToClipboard(): Promise<void> {
    const data = this.buildExportString();
    if (!data) {
      this.snackBar.open('Nothing to export — tree is empty.', 'OK', { duration: 3000 });
      return;
    }
    try {
      await navigator.clipboard.writeText(data);
      this.snackBar.open('Copied tree to clipboard.', 'OK', { duration: 2500 });
    } catch {
      this.snackBar.open('Clipboard unavailable. Use "Download .json" instead.', 'OK', { duration: 4000 });
    }
  }

  exportToFile(): void {
    const data = this.buildExportString();
    if (!data) {
      this.snackBar.open('Nothing to export — tree is empty.', 'OK', { duration: 3000 });
      return;
    }
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `lineage-tree-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async importFromClipboard(): Promise<void> {
    let raw = '';
    try {
      raw = await navigator.clipboard.readText();
    } catch {
      this.snackBar.open('Clipboard unavailable. Use "Import .json" instead.', 'OK', { duration: 4000 });
      return;
    }
    this.applyImportString(raw);
  }

  private importFromFile(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      this.applyImportString(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      this.snackBar.open('Failed to read file.', 'OK', { duration: 3000 });
    };
    reader.readAsText(file);
  }

  private applyImportString(raw: string): void {
    const payload = this.parseImportString(raw);
    if (!payload) {
      this.snackBar.open('Invalid tree data — could not parse.', 'OK', { duration: 4000 });
      return;
    }
    this.applyPayload(payload);
    this.snackBar.open('Imported tree.', 'OK', { duration: 2500 });
  }

  toggleNodePicker(position: string, event: Event): void {
    event.stopPropagation();
    this.activeNode = this.activeNode === position ? null : position;
    // Trigger account loading if not yet loaded
    if (this.activeNode && this.linkedAccounts.length === 0) {
      this.loadLinkedAccounts();
    } else if (this.activeNode && this.selectedAccountId && this.veterans[this.selectedAccountId] === undefined) {
      this.loadVeterans(this.selectedAccountId);
    }
    this.cdr.markForCheck();
  }

  openVeteranDialog(position: string, event: Event): void {
    event.stopPropagation();
    const targetNode = this.nodes.get('target');
    const targetCharaId = targetNode ? this.getNodeCharaId(targetNode) : null;
    const dialogRef = this.dialog.open(VeteranPickerDialogComponent, {
      width: '92vw',
      maxWidth: '1100px',
      panelClass: 'modern-dialog-panel',
      autoFocus: false,
      data: {
        linkedAccounts: this.linkedAccounts,
        selectedAccountId: this.selectedAccountId,
        characters: this.characters,
        veterans: this.veterans,
        loadingVeterans: this.loadingVeterans,
        targetCharaId,
      } as VeteranPickerDialogData,
    });
    dialogRef.afterClosed().subscribe((vet: import('../../models/profile.model').VeteranMember | undefined) => {
      if (vet) {
        this.selectVeteran(position, vet);
      }
    });
  }

  openCharacterPicker(position: string, event: Event): void {
    event.stopPropagation();
    // Build affinity targets relative to position so users can quickly find
    // the highest-affinity option for a slot.
    const affinityTargetIds = this.getAffinityTargetsForPosition(position);
    const excludeIds = this.getExcludeIdsForPosition(position);
    const raceWinsByPosition: Record<string, number[]> = {};
    for (const pos of ['target', 'p1', 'p2', 'p1-1', 'p1-2', 'p2-1', 'p2-2']) {
      const n = this.nodes.get(pos);
      raceWinsByPosition[pos] = n ? this.getWinSaddles(n) : [];
    }
    const dialogRef = this.dialog.open(CharacterSelectDialogComponent, {
      width: '90%',
      maxWidth: '600px',
      height: '80vh',
      panelClass: 'modern-dialog-panel',
      data: {
        affinityTargetIds,
        excludeIds,
        slotPosition: position,
        treeSlots: this.buildTreeSlots(),
        raceWinsByPosition,
      }
    });
    dialogRef.afterClosed().subscribe((result: Character | undefined) => {
      if (result) {
        this.selectCharacter(position, result);
        this.activeNode = null;
      }
    });
  }

  openRaceResults(position: string, event: Event): void {
    event.stopPropagation();
    const node = this.nodes.get(position);
    if (!node) return;

    const charName = this.getCharacterName(node);
    const charId = this.getNodeCardId(node) ?? undefined;
    const hasVeteranWins = (node.veteran?.win_saddle_id_array?.length ?? 0) > 0 ||
                           (node.succession?.win_saddle_id_array?.length ?? 0) > 0;

    if (hasVeteranWins) {
      // View-only for veterans/succession with existing race data
      const winSaddleIds = node.veteran?.win_saddle_id_array ?? node.succession?.win_saddle_id_array ?? [];
      this.dialog.open(RaceResultsDialogComponent, {
        data: { charId, charName, winSaddleIds, runRaceIds: [] } as RaceResultsDialogData,
        panelClass: 'modern-dialog-panel',
        width: '1100px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        autoFocus: false,
      });
    } else {
      // Editable picker for manually-selected characters
      const dialogRef = this.dialog.open(RaceWinPickerDialogComponent, {
        data: { charName, charId, winSaddleIds: node.manualWinSaddleIds } as RaceWinPickerDialogData,
        panelClass: 'modern-dialog-panel',
        width: '1100px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        autoFocus: false,
      });
      dialogRef.afterClosed().subscribe((saddleIds: number[] | null) => {
        if (saddleIds != null) {
          node.manualWinSaddleIds = saddleIds;
          this.affinityRecalc$.next();
          this.cdr.markForCheck();
        }
      });
    }
  }

  
  getWinSaddles(node: LineageNode): number[] {
    return node.veteran?.win_saddle_id_array 
      ?? node.succession?.win_saddle_id_array 
      ?? node.manualWinSaddleIds 
      ?? [];
  }

  getSharedRaces(node: LineageNode): number | null {
    if (node.layer === 0) return null;
    const myWins = this.getWinSaddles(node);
    if (!myWins.length) return null;
    // Get target wins
    const targetNode = this.nodes.get('target');
    if (!targetNode || !this.hasContent(targetNode)) return null;
    const targetWins = this.getWinSaddles(targetNode);
    if (!targetWins.length) return null;
    
    let overlap = 0;
    const targetSet = new Set(targetWins);
    for (const w of myWins) {
      if (targetSet.has(w)) overlap++;
    }
    return overlap;
  }

  getWinCount(node: LineageNode): number {
    return node.veteran?.win_saddle_id_array?.length
      ?? node.succession?.win_saddle_id_array?.length
      ?? node.manualWinSaddleIds.length;
  }

  handleImageError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  getNodeCardId(node: LineageNode): number | null {
    if (node.character) return node.character.id;
    if (node.veteran?.card_id) return node.veteran.card_id;
    if (node.veteran?.trained_chara_id) return node.veteran.trained_chara_id;
    if (node.succession?.card_id) return node.succession.card_id;
    return null;
  }

  getNodeCharaId(node: LineageNode): number | null {
    const cardId = this.getNodeCardId(node);
    return cardId ? Math.floor(cardId / 100) : null;
  }

  /**
   * Returns the base chara_ids that should be excluded from the picker for
   * a given position — i.e. characters already used in slots that must
   * differ (same parent can't also be a grandparent, siblings can't share
   * a character, target can't equal its parents, etc.).
   */
  private getExcludeIdsForPosition(position: string): number[] {
    const charaId = (pos: string): number | null => {
      const n = this.nodes.get(pos);
      return n ? this.getNodeCharaId(n) : null;
    };
    const ids = (...positions: string[]): number[] =>
      positions.map(charaId).filter((id): id is number => id !== null);

    switch (position) {
      case 'target':  return ids('p1', 'p2');
      case 'p1':      return ids('target', 'p2', 'p1-1', 'p1-2');
      case 'p2':      return ids('target', 'p1', 'p2-1', 'p2-2');
      case 'p1-1':    return ids('p1', 'p1-2', 'p1-1-1', 'p1-1-2');
      case 'p1-2':    return ids('p1', 'p1-1', 'p1-2-1', 'p1-2-2');
      case 'p2-1':    return ids('p2', 'p2-2', 'p2-1-1', 'p2-1-2');
      case 'p2-2':    return ids('p2', 'p2-1', 'p2-2-1', 'p2-2-2');
      case 'p1-1-1':  return ids('p1-1', 'p1-1-2');
      case 'p1-1-2':  return ids('p1-1', 'p1-1-1');
      case 'p1-2-1':  return ids('p1-2', 'p1-2-2');
      case 'p1-2-2':  return ids('p1-2', 'p1-2-1');
      case 'p2-1-1':  return ids('p2-1', 'p2-1-2');
      case 'p2-1-2':  return ids('p2-1', 'p2-1-1');
      case 'p2-2-1':  return ids('p2-2', 'p2-2-2');
      case 'p2-2-2':  return ids('p2-2', 'p2-2-1');
      default:        return [];
    }
  }

  /**
   * Returns the chara_ids that affinity should be scored against when
   * picking a character for `position`. Picks the related slots in the
   * tree so the resulting score reflects the actual breeding relationship.
   */
  private getAffinityTargetsForPosition(position: string): number[] {
    const ids = (positions: string[]): number[] => {
      const result: number[] = [];
      for (const p of positions) {
        const n = this.nodes.get(p);
        if (!n) continue;
        const id = this.getNodeCharaId(n);
        if (id) result.push(id);
      }
      return result;
    };
    switch (position) {
      case 'target': return ids(['p1', 'p2']);
      case 'p1': return ids(['target', 'p1-1', 'p1-2']);
      case 'p2': return ids(['target', 'p2-1', 'p2-2']);
      case 'p1-1':
      case 'p1-2': return ids(['target', 'p1']);
      case 'p2-1':
      case 'p2-2': return ids(['target', 'p2']);
      default: return ids(['target']);
    }
  }

  getCharacterIcon(node: LineageNode): string {
    if (node.character?.image) {
      return `assets/images/character_stand/${node.character.image}`;
    }
    const cardId = this.getNodeCardId(node);
    if (!cardId) return '';
    return `assets/images/character_stand/chara_stand_${cardId}.png`;
  }

  getCharacterIconById(id: number): string {
    const ch = this.characters.find(c => c.id === id);
    if (ch?.image) return `assets/images/character_stand/${ch.image}`;
    return `assets/images/character_stand/chara_stand_${id}.png`;
  }

  sparkShowPerRun = false;

  onNodeSparksChange(node: LineageNode, sparks: SparkInfo[]): void {
    node.resolvedSparks = sparks;
    this.affinityRecalc$.next();
    this.cdr.markForCheck();
  }

  removeSpark(node: LineageNode, index: number, event: Event): void {
    event.stopPropagation();
    node.resolvedSparks = node.resolvedSparks.filter((_, i) => i !== index);
    this.affinityRecalc$.next();
    this.cdr.markForCheck();
  }


  private static readonly SPARK_TYPE_ORDER: Record<number, number> = {
    0: 0, 1: 1, 5: 2, 2: 3, 3: 3, 4: 3
  };

  isWhiteSpark(spark: SparkInfo): boolean {
    return spark.type === 2 || spark.type === 3 || spark.type === 4;
  }

  sparkProcChance(spark: SparkInfo, affinity: number = 0): number {
    return this.affinityService.sparkProcChance(spark, affinity);
  }

  sparkRunChance(spark: SparkInfo, affinity: number = 0): number {
    return this.affinityService.sparkRunChance(spark, affinity);
  }

  whiteSparkChances(affinity: number): { label: string; pct: number }[] {
    return this.affinityService.whiteSparkChances(affinity);
  }

  sparkDisplayChance(spark: SparkInfo, affinity: number): number {
    return this.affinityService.sparkDisplayChance(spark, affinity, this.sparkShowPerRun);
  }

  clampedChance(base: number, affinity: number): number {
    const chance = this.affinityService.clampedChance(base, affinity);
    if (!this.sparkShowPerRun) {
      return chance;
    }

    const proc = chance / 100;
    const run = 1 - Math.pow(1 - proc, 2);
    return Math.round(Math.min(run * 100, 100) * 100) / 100;
  }

  sparkTypeLabel(spark: SparkInfo): string {
    return AffinityService.getSparkTypeLabel(spark.type);
  }

  sparkTypeLabelByType(type: number): string {
    return AffinityService.getSparkTypeLabel(type);
  }

  sparkStarLabel(spark: SparkInfo): string {
    return spark.level + '★';
  }

  /** Display base proc % for a given spark type at a given star level (1-3). */
  baseChanceForType(type: number, level: number): number {
    return this.affinityService.sparkBaseChance({ type, level } as SparkInfo);
  }

  starsOf(n: number): string {
    return '★'.repeat(n);
  }

  sortedSparks(node: LineageNode): SparkInfo[] {
    if (!node.resolvedSparks?.length) return [];
    return [...node.resolvedSparks].sort((a, b) => {
      const orderA = LineagePlannerComponent.SPARK_TYPE_ORDER[a.type] ?? 3;
      const orderB = LineagePlannerComponent.SPARK_TYPE_ORDER[b.type] ?? 3;
      if (orderA !== orderB) return orderA - orderB;
      return b.level - a.level;
    });
  }

  getNodeAffinity(node: LineageNode): number {
    if (node.layer === 1) {
      // Spark proc on a P1/P2 parent uses the FULL player-side affinity
      // (pair + both triples to grandparents), matching what the header
      // shows as the side total. node.affinity only holds the pair.
      const r = this.affinityResult;
      const sideTotal = r
        ? (node.position === 'p1' ? r.playerP1.total
          : node.position === 'p2' ? r.playerP2.total
          : (node.affinity ?? 0))
        : (node.affinity ?? 0);
      return sideTotal + this.getGPParentOverlap(node);
    }
    if (node.layer === 2) {
      return (node.affinity ?? 0) + this.getGPRaceOverlap(node);
    }
    return node.affinity ?? 0;
  }

  sparkTypeClass(spark: SparkInfo): string {
    return this.typeClass(spark.type);
  }

  typeClass(type: number): string {
    switch (type) {
      case 0: return 'blue-spark';
      case 1: return 'pink-spark';
      case 5: return 'green-spark';
      default: return 'white-spark';
    }
  }

  getOverlappingSaddleIds(node: LineageNode): number[] {
    if (node.layer === 0) return [];
    const myWins = this.getWinSaddles(node);
    if (!myWins.length) return [];
    const targetNode = this.nodes.get('target');
    if (!targetNode || !this.hasContent(targetNode)) return [];
    const targetWins = this.getWinSaddles(targetNode);
    if (!targetWins.length) return [];
    const targetSet = new Set(targetWins);
    return myWins.filter(id => targetSet.has(id));
  }

  getGPParentOverlap(parentNode: LineageNode): number {
    if (parentNode.layer !== 1) return 0;
    const parentWins = this.getWinSaddles(parentNode);
    if (!parentWins.length) return 0;
    const parentSet = new Set(parentWins);
    let total = 0;
    const gp1 = this.nodes.get(parentNode.position + '-1');
    const gp2 = this.nodes.get(parentNode.position + '-2');
    for (const gp of [gp1, gp2]) {
      if (!gp || !this.hasContent(gp)) continue;
      for (const w of this.getWinSaddles(gp)) {
        if (parentSet.has(w)) total++;
      }
    }
    return total;
  }

  getGPRaceOverlap(gpNode: LineageNode): number {
    if (gpNode.layer !== 2) return 0;
    const parentPos = gpNode.position.substring(0, gpNode.position.lastIndexOf('-'));
    const parentNode = this.nodes.get(parentPos);
    if (!parentNode || !this.hasContent(parentNode)) return 0;
    const parentWins = this.getWinSaddles(parentNode);
    if (!parentWins.length) return 0;
    const parentSet = new Set(parentWins);
    const gpWins = this.getWinSaddles(gpNode);
    return gpWins.filter(w => parentSet.has(w)).length;
  }

  getCrossParentRaceOverlap(): number {
    // Cross-parent race affinity is disabled until the later P1/P2 rework.
    return 0;
  }

  getTotalRaceAffinity(): number {
    let total = 0;
    const p1 = this.nodes.get('p1');
    const p2 = this.nodes.get('p2');
    if (p1 && this.hasContent(p1)) total += this.getGPParentOverlap(p1);
    if (p2 && this.hasContent(p2)) total += this.getGPParentOverlap(p2);
    total += this.getCrossParentRaceOverlap();
    return total;
  }

  openOverlapDialog(node: LineageNode, event: Event): void {
    event.stopPropagation();
    const charName = this.getCharacterName(node);
    const charId = this.getNodeCardId(node) ?? undefined;
    const overlapping = this.getOverlappingSaddleIds(node);
    this.dialog.open(RaceResultsDialogComponent, {
      data: { charId, charName, winSaddleIds: overlapping, runRaceIds: [] } as RaceResultsDialogData,
      panelClass: 'modern-dialog-panel',
      width: '1100px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false,
    });
  }

  private buildTreeSlots(): TreeSlots {
    const charaId = (pos: string): number | null => {
      const node = this.nodes.get(pos);
      if (!node) return null;
      const cardId = this.getNodeCardId(node);
      return cardId ? Math.floor(cardId / 100) : null;
    };
    return {
      target: charaId('target'),
      p1: charaId('p1'),
      p2: charaId('p2'),
      gp1Left: charaId('p1-1'),
      gp1Right: charaId('p1-2'),
      gp2Left: charaId('p2-1'),
      gp2Right: charaId('p2-2'),
    };
  }

  private fetchAffinity(): void {
    if (!this.affinityService.isReady) return;

    const slots = this.buildTreeSlots();
    const { target, p1, p2, gp1Left, gp1Right, gp2Left, gp2Right } = slots;

    this.nodes.forEach(n => n.affinity = null);

    const result = this.affinityService.calculateTree(slots);
    this.affinityResult = result;
    this.affinityPlayerBonus = result ? result.playerP1.total + result.playerP2.total : null;

    // Per-node: show what each individual node contributes to player affinity
    if (target && p1) {
      const n = this.nodes.get('p1');
      if (n) n.affinity = this.affinityService.getAff2(target, p1);
    }
    if (target && p2) {
      const n = this.nodes.get('p2');
      if (n) n.affinity = this.affinityService.getAff2(target, p2);
    }
    if (target && p1 && gp1Left) {
      const n = this.nodes.get('p1-1');
      if (n) n.affinity = this.affinityService.getAff3(target, p1, gp1Left);
    }
    if (target && p1 && gp1Right) {
      const n = this.nodes.get('p1-2');
      if (n) n.affinity = this.affinityService.getAff3(target, p1, gp1Right);
    }
    if (target && p2 && gp2Left) {
      const n = this.nodes.get('p2-1');
      if (n) n.affinity = this.affinityService.getAff3(target, p2, gp2Left);
    }
    if (target && p2 && gp2Right) {
      const n = this.nodes.get('p2-2');
      if (n) n.affinity = this.affinityService.getAff3(target, p2, gp2Right);
    }

    // Compute total including race affinity
    const baseTotal = result?.total ?? 0;
    const raceTotal = this.getTotalRaceAffinity();
    this.affinityTotal = result ? baseTotal + raceTotal : null;

    this.cdr.markForCheck();
  }

  private recalculateTargetInheritance(): void {
    const factorCounts = new Map<string, { name: string; count: number }>();

    for (const [pos, node] of this.nodes) {
      if (node.layer === 0 || node.layer > 2 || !node.resolvedSparks?.length) continue;
      for (const spark of node.resolvedSparks) {
        if (spark.type !== 3) continue;
        let entry = factorCounts.get(spark.factorId);
        if (!entry) {
          entry = { name: spark.name, count: 0 };
          factorCounts.set(spark.factorId, entry);
        }
        entry.count++;
      }
    }

    const results: { name: string; type: number; factorId: string; count: number; learned: number; upgraded: number; gold: number; icon: string | null }[] = [];
    for (const [factorId, data] of factorCounts) {
      const mult = Math.pow(1.1, data.count);
      results.push({
        name: data.name,
        type: 0,
        factorId,
        count: data.count,
        learned: Math.round(20 * mult * 100) / 100,
        upgraded: Math.round(25 * mult * 100) / 100,
        gold: Math.round(40 * mult * 100) / 100,
        icon: this.skillIconMap.get(data.name) ?? null,
      });
    }

    results.sort((a, b) => b.learned - a.learned);
    this.targetInheritance = results;
    this.cdr.markForCheck();
  }

  inheritanceTypeClass(type: number): string {
    return 'spark--white';
  }

  // -- Slot fitter --

  

  private static readonly SIBLING_PAIRS: [string, string][] = [
    ['p1-1', 'p1-2'],
    ['p2-1', 'p2-2'],
    ['p1-1-1', 'p1-1-2'],
    ['p1-2-1', 'p1-2-2'],
    ['p2-1-1', 'p2-1-2'],
    ['p2-2-1', 'p2-2-2'],
  ];

  private static readonly PARENT_CHILD: [string, string[]][] = [
    ['p1', ['p1-1', 'p1-2']],
    ['p2', ['p2-1', 'p2-2']],
    ['p1-1', ['p1-1-1', 'p1-1-2']],
    ['p1-2', ['p1-2-1', 'p1-2-2']],
    ['p2-1', ['p2-1-1', 'p2-1-2']],
    ['p2-2', ['p2-2-1', 'p2-2-2']],
  ];

  private getCharaIdForPosition(position: string): number | null {
    const node = this.nodes.get(position);
    if (!node) return null;
    const cardId = this.getNodeCardId(node);
    return cardId ? Math.floor(cardId / 100) : null;
  }

  private checkPlacementViolation(position: string, character: Character): string | null {
    const charaId = Math.floor(character.id / 100);

    // Primary slot constraints: if a conflicting slot is already occupied,
    // this character should never be placeable in the current position.
    const excluded = this.getExcludeIdsForPosition(position);
    for (const blocked of excluded) {
      if (blocked === charaId) {
        return 'This slot cannot use the same character as a conflicting slot.';
      }
    }

    for (const [a, b] of LineagePlannerComponent.SIBLING_PAIRS) {
      const sibling = position === a ? b : position === b ? a : null;
      if (sibling) {
        const siblingCharaId = this.getCharaIdForPosition(sibling);
        if (siblingCharaId === charaId) {
          return 'Both grandparents under the same parent cannot be the same character.';
        }
      }
    }

    for (const [parent, children] of LineagePlannerComponent.PARENT_CHILD) {
      if (position === parent) {
        for (const child of children) {
          if (this.getCharaIdForPosition(child) === charaId) {
            return 'A parent cannot be the same character as its own grandparent.';
          }
        }
      }
      if (children.includes(position)) {
        if (this.getCharaIdForPosition(parent) === charaId) {
          return 'A grandparent cannot be the same character as its parent.';
        }
      }
    }

    return null;
  }

  private showValidationError(message: string): void {
    this.snackBar.open(message, 'OK', {
      duration: 4000,
      panelClass: 'error-snackbar',
    });
  }

  // -- Affinity visual breakdown --

  get affinityBreakdown(): { label: string; chars: string; value: number; pct: number; color: string }[] {
    if (!this.affinityResult) return [];
    const r = this.affinityResult;

    const name = (pos: string): string => {
      const node = this.nodes.get(pos);
      if (!node || !this.hasContent(node)) return '';
      const full = this.getCharacterName(node);
      return full.length > 10 ? full.substring(0, 9) + '\u2026' : full;
    };

    const raw: { label: string; chars: string; value: number; color: string }[] = [
      { label: 'P1', chars: [name('p1'), name('target')].filter(Boolean).join(' \u00d7 '), value: this.nodes.get('p1')?.affinity ?? 0, color: '#64b5f6' },
      { label: 'P2', chars: [name('p2'), name('target')].filter(Boolean).join(' \u00d7 '), value: this.nodes.get('p2')?.affinity ?? 0, color: '#64b5f6' },
      { label: 'GP1-1', chars: [name('p1-1'), name('p1'), name('target')].filter(Boolean).join(' \u00d7 '), value: this.nodes.get('p1-1')?.affinity ?? 0, color: '#ce93d8' },
      { label: 'GP1-2', chars: [name('p1-2'), name('p1'), name('target')].filter(Boolean).join(' \u00d7 '), value: this.nodes.get('p1-2')?.affinity ?? 0, color: '#ce93d8' },
      { label: 'GP2-1', chars: [name('p2-1'), name('p2'), name('target')].filter(Boolean).join(' \u00d7 '), value: this.nodes.get('p2-1')?.affinity ?? 0, color: '#ce93d8' },
      { label: 'GP2-2', chars: [name('p2-2'), name('p2'), name('target')].filter(Boolean).join(' \u00d7 '), value: this.nodes.get('p2-2')?.affinity ?? 0, color: '#ce93d8' },
      { label: 'Legacy', chars: [name('p1'), name('p2')].filter(Boolean).join(' \u00d7 '), value: r.legacy, color: '#81c784' },
    ].filter(x => x.value > 0);

    const globalMax = Math.max(...raw.map(x => x.value), 1);
    return raw.map(x => ({ ...x, pct: Math.round((x.value / globalMax) * 100) }));
  }

  get affinityBreakdownMax(): number {
    return Math.max(...(this.affinityBreakdown.map(x => x.value)), 1);
  }

  get p1SideTotal(): number {
    if (!this.affinityResult) return 0;
    const p1 = this.nodes.get('p1');
    const gpOverlap = p1 ? this.getGPParentOverlap(p1) : 0;
    return this.affinityResult.playerP1.total + gpOverlap;
  }

  get p2SideTotal(): number {
    if (!this.affinityResult) return 0;
    const p2 = this.nodes.get('p2');
    const gpOverlap = p2 ? this.getGPParentOverlap(p2) : 0;
    return this.affinityResult.playerP2.total + gpOverlap;
  }

  get sharedAffinity(): number {
    if (!this.affinityResult) return 0;
    return this.affinityResult.legacy;
  }

  get p1PlayerTriple(): number {
    if (!this.affinityResult) return 0;
    return this.affinityResult.playerP1.tripleLeft + this.affinityResult.playerP1.tripleRight;
  }

  get p2PlayerTriple(): number {
    if (!this.affinityResult) return 0;
    return this.affinityResult.playerP2.tripleLeft + this.affinityResult.playerP2.tripleRight;
  }

  getNodeContribution(node: LineageNode): number | null {
    if (!this.affinityResult) return null;
    const r = this.affinityResult;
    switch (node.position) {
      case 'p1': return this.p1SideTotal;
      case 'p2': return this.p2SideTotal;
      case 'p1-1': return (r.playerP1.tripleLeft + this.getGPRaceOverlap(node)) || null;
      case 'p1-2': return (r.playerP1.tripleRight + this.getGPRaceOverlap(node)) || null;
      case 'p2-1': return (r.playerP2.tripleLeft + this.getGPRaceOverlap(node)) || null;
      case 'p2-2': return (r.playerP2.tripleRight + this.getGPRaceOverlap(node)) || null;
      default: return null;
    }
  }

  getBaseContribution(node: LineageNode): number | null {
    if (!this.affinityResult) return null;
    const r = this.affinityResult;
    switch (node.position) {
      case 'p1': return r.playerP1.total;
      case 'p2': return r.playerP2.total;
      case 'p1-1': return r.playerP1.tripleLeft || null;
      case 'p1-2': return r.playerP1.tripleRight || null;
      case 'p2-1': return r.playerP2.tripleLeft || null;
      case 'p2-2': return r.playerP2.tripleRight || null;
      default: return null;
    }
  }

  /** Combined display total: base affinity + race overlap (used in node chip). */
  getNodeDisplayTotal(node: LineageNode): number | null {
    const base = this.getBaseContribution(node) ?? 0;
    const race = this.getNodeRaceAffinity(node);
    const total = base + race;
    return total > 0 ? total : null;
  }

  /** Breakdown tooltip for the combined affinity chip. */
  getNodeAffinityTooltip(node: LineageNode): string {
    const base = this.getBaseContribution(node) ?? 0;
    const race = this.getNodeRaceAffinity(node);
    if (base && race) return `Base: ${base} + Race: ${race}`;
    if (race) return `Race affinity from shared wins: ${race}`;
    return `Base affinity: ${base}`;
  }

  getNodeRaceAffinity(node: LineageNode): number {
    if (node.layer === 1) {
      return this.getGPParentOverlap(node);
    }
    if (node.layer === 2) {
      return this.getGPRaceOverlap(node);
    }
    return 0;
  }

  getAffinitySymbol(value: number): string {
    if (value >= 150) return '◎';
    if (value >= 100) return '○';
    if (value >= 50) return '△';
    return '';
  }

  /** Next affinity threshold above the current value (or null if maxed). */
  getNextAffinityThreshold(value: number): number | null {
    if (value < 50) return 50;
    if (value < 100) return 100;
    if (value < 150) return 150;
    return null;
  }

  /** Lower bound of the current affinity tier (0, 50, 100, or 150). */
  getCurrentAffinityFloor(value: number): number {
    if (value >= 150) return 150;
    if (value >= 100) return 100;
    if (value >= 50) return 50;
    return 0;
  }

  /** Progress 0..1 toward the next threshold. Returns 1 if maxed. */
  getAffinityTierProgress(value: number): number {
    const next = this.getNextAffinityThreshold(value);
    if (next == null) return 1;
    const floor = this.getCurrentAffinityFloor(value);
    return Math.max(0, Math.min(1, (value - floor) / (next - floor)));
  }

  get currentVeterans(): VeteranMember[] {
    if (!this.selectedAccountId) return [];
    return this.veterans[this.selectedAccountId] ?? [];
  }

  get currentVeteransLoading(): boolean {
    if (!this.selectedAccountId) return false;
    return !!this.loadingVeterans[this.selectedAccountId];
  }

  get layer0(): LineageNode[] { return [this.nodes.get('target')!]; }
  get layer1(): LineageNode[] { return ['p1', 'p2'].map(p => this.nodes.get(p)!); }
  get layer2(): LineageNode[] { return ['p1-1', 'p1-2', 'p2-1', 'p2-2'].map(p => this.nodes.get(p)!); }
  get layer3(): LineageNode[] {
    return ['p1-1-1', 'p1-1-2', 'p1-2-1', 'p1-2-2', 'p2-1-1', 'p2-1-2', 'p2-2-1', 'p2-2-2']
      .map(p => this.nodes.get(p)!);
  }
}
