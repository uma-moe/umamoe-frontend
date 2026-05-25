import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, takeUntil } from 'rxjs';
import { RaceResultsDialogComponent, RaceResultsDialogData } from '../race-results-dialog/race-results-dialog.component';
import { RankBadgeComponent } from '../rank-badge/rank-badge.component';
import { LocaleNumberPipe } from '../../pipes/locale-number.pipe';
import { Character } from '../../models/character.model';
import { FactorInfoEntry, SuccessionChara, VeteranMember } from '../../models/profile.model';
import { AffinityService, PlannerRaceWins, TreeSlots } from '../../services/affinity.service';
import { FactorService, SparkInfo } from '../../services/factor.service';
import { CHARACTERS } from '../../data/character.data';
import { LineageNode } from '../../pages/lineage-planner/lineage-planner.model';
import {
  getCardImage,
  getCharacterName,
  getDistanceName,
  getScenarioName,
  getStarDisplay,
} from '../../pages/profile/profile-helpers';

type LineageDisplayMode = 'full' | 'compact';
type LineageAffinityPosition = 'p1' | 'p1-1' | 'p1-2';
type LineageGgpPosition = 'p1-1-1' | 'p1-1-2' | 'p1-2-1' | 'p1-2-2';
type LineagePosition = LineageAffinityPosition | LineageGgpPosition;

interface LineageNodeView {
  position: LineagePosition;
  layer: number;
  label: string;
  node: LineageNode;
  hasContent: boolean;
  name: string;
  image: string | null;
  tagline: string;
  sparks: SparkInfo[];
  visibleSparks: SparkInfo[];
  moreSparkCount: number;
  winCount: number;
  baseAffinity: number | null;
  raceAffinity: number;
  hasBaseAffinity: boolean;
  hasRaceAffinity: boolean;
  totalAffinity: number | null;
}

interface GrandparentGroupView {
  parent: LineageNodeView;
  children: LineageNodeView[];
  hasAnyGreatGrandparent: boolean;
}

@Component({
  selector: 'app-lineage-display',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, MatTooltipModule, RankBadgeComponent, LocaleNumberPipe],
  templateUrl: './lineage-display.component.html',
  styleUrls: ['./lineage-display.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineageDisplayComponent implements OnInit, OnChanges, OnDestroy {
  @Input() veteran: VeteranMember | null = null;
  @Input() targetCharaId: number | null = null;
  @Input() mode: LineageDisplayMode = 'full';
  @Input() showMainSparks = true;
  @Input() clickable = false;
  @Input() showOpenHint = false;
  @Input() framed = true;
  @Input() showPlannerAction = false;
  @Input() showParentScore = false;

  @Output() openVeteran = new EventEmitter<VeteranMember>();
  @Output() openPlanner = new EventEmitter<VeteranMember>();

  parentView: LineageNodeView | null = null;
  grandparentViews: LineageNodeView[] = [];
  grandparentGroups: GrandparentGroupView[] = [];
  hasAnyGrandparent = false;
  hasAnyGreatGrandparent = false;
  parentTags: { label: string; className: string }[] = [];
  parentStars: { filled: boolean; talent: boolean }[] = [];

  private readonly destroy$ = new Subject<void>();
  private readonly nodes = new Map<string, LineageNode>();
  private readonly baseContributions: Record<LineagePosition, number | null> = {
    p1: null,
    'p1-1': null,
    'p1-2': null,
    'p1-1-1': null,
    'p1-1-2': null,
    'p1-2-1': null,
    'p1-2-2': null,
  };

  private readonly nodePositions: { position: LineagePosition; layer: number; label: string }[] = [
    { position: 'p1', layer: 1, label: 'Main' },
    { position: 'p1-1', layer: 2, label: 'Parent 1' },
    { position: 'p1-2', layer: 2, label: 'Parent 2' },
    { position: 'p1-1-1', layer: 3, label: 'Greatparent 1' },
    { position: 'p1-1-2', layer: 3, label: 'Greatparent 2' },
    { position: 'p1-2-1', layer: 3, label: 'Greatparent 3' },
    { position: 'p1-2-2', layer: 3, label: 'Greatparent 4' },
  ];

  private static readonly SPARK_TYPE_ORDER: Record<number, number> = {
    0: 0,
    1: 1,
    5: 2,
    2: 3,
    3: 3,
    4: 3,
  };

  constructor(
    private factorService: FactorService,
    private affinityService: AffinityService,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    this.affinityService.load()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.computeAffinity();
        this.rebuildViews();
        this.cdr.markForCheck();
      });
  }

  ngOnChanges(_: SimpleChanges): void {
    this.buildLineageTree();
    this.computeAffinity();
    this.rebuildViews();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onDisplayClick(): void {
    if (!this.clickable || !this.veteran) return;
    this.openVeteran.emit(this.veteran);
  }

  openLineagePlanner(event: Event): void {
    event.stopPropagation();
    if (!this.veteran) return;
    this.openPlanner.emit(this.veteran);
  }

  trackByPosition(_: number, view: LineageNodeView): string {
    return view.position;
  }

  trackByGroup(_: number, group: GrandparentGroupView): string {
    return group.parent.position;
  }

  trackBySpark(_: number, spark: SparkInfo): string {
    return `${spark.factorId}-${spark.level}-${spark.type}`;
  }

  sparkTypeClass(spark: SparkInfo): string {
    switch (spark.type) {
      case 0: return 'blue-spark';
      case 1: return 'pink-spark';
      case 5: return 'green-spark';
      default: return 'white-spark';
    }
  }

  sparkTypeLabel(spark: SparkInfo): string {
    return AffinityService.getSparkTypeLabel(spark.type);
  }

  sparkDisplayChance(spark: SparkInfo, affinity: number | null): number {
    return this.affinityService.sparkProcChance(spark, affinity ?? 0);
  }

  sparkTooltip(spark: SparkInfo, view: LineageNodeView): string {
    const chance = this.sparkDisplayChance(spark, view.totalAffinity).toFixed(2);
    return `${spark.name} - ${this.sparkTypeLabel(spark)} ${spark.level} star - ${chance}% per inheritance`;
  }

  openRaceResults(view: LineageNodeView, event: Event): void {
    event.stopPropagation();
    const winSaddleIds = this.getWinSaddles(view.node);
    if (!winSaddleIds.length) return;

    this.dialog.open(RaceResultsDialogComponent, {
      data: {
        charId: this.getNodeCardId(view.node) ?? undefined,
        charName: view.name,
        winSaddleIds,
        runRaceIds: [],
      } as RaceResultsDialogData,
      panelClass: 'modern-dialog-panel',
      width: '1100px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false,
    });
  }

  private buildLineageTree(): void {
    this.nodes.clear();
    this.resetBaseContributions();

    for (const definition of this.nodePositions) {
      this.nodes.set(definition.position, {
        position: definition.position,
        layer: definition.layer,
        character: null,
        veteran: null,
        succession: null,
        resolvedSparks: [],
        affinity: null,
        manualWinSaddleIds: [],
        label: definition.label,
      });
    }

    if (!this.veteran) {
      this.parentTags = [];
      this.parentStars = [];
      return;
    }

    this.parentTags = this.getParentTags(this.veteran);
    this.parentStars = getStarDisplay(this.veteran.rarity);

    const parentNode = this.nodes.get('p1');
    if (parentNode) {
      parentNode.character = this.findCharacterForVeteran(this.veteran);
      parentNode.veteran = this.veteran;
      parentNode.resolvedSparks = this.resolveVeteranSparks(this.veteran);
      parentNode.manualWinSaddleIds = this.veteran.win_saddle_id_array ?? [];
    }

    const positionMap: Record<number, LineagePosition> = {
      10: 'p1-1',
      20: 'p1-2',
      11: 'p1-1-1',
      12: 'p1-1-2',
      21: 'p1-2-1',
      22: 'p1-2-2',
    };

    for (const succession of this.veteran.succession_chara_array ?? []) {
      const treePosition = positionMap[succession.position_id];
      if (!treePosition) continue;

      const node = this.nodes.get(treePosition);
      if (!node) continue;

      node.character = this.findCharacterByCardId(succession.card_id);
      node.succession = succession;
      node.veteran = null;
      node.resolvedSparks = node.layer === 3 ? [] : this.resolveSuccessionSparks(succession);
      node.manualWinSaddleIds = succession.win_saddle_id_array ?? [];
    }
  }

  private computeAffinity(): void {
    this.resetBaseContributions();
    this.nodes.forEach(node => node.affinity = null);

    if (!this.affinityService.isReady) return;

    const slots = this.buildTreeSlots();
    const result = this.affinityService.calculateTree(slots);

    if (!result || !slots.p1) return;

    const parentNode = this.nodes.get('p1');
    const grandparentLeft = this.nodes.get('p1-1');
    const grandparentRight = this.nodes.get('p1-2');

    if (!parentNode) return;

    if (slots.target) {
      parentNode.affinity = result.playerP1.pair;
      if (grandparentLeft) grandparentLeft.affinity = slots.gp1Left ? result.playerP1.tripleLeft : null;
      if (grandparentRight) grandparentRight.affinity = slots.gp1Right ? result.playerP1.tripleRight : null;

      this.baseContributions.p1 = result.playerP1.total;
      this.baseContributions['p1-1'] = slots.gp1Left ? result.playerP1.tripleLeft : null;
      this.baseContributions['p1-2'] = slots.gp1Right ? result.playerP1.tripleRight : null;
    } else {
      if (grandparentLeft) grandparentLeft.affinity = slots.gp1Left ? result.p1Breeding.left : null;
      if (grandparentRight) grandparentRight.affinity = slots.gp1Right ? result.p1Breeding.right : null;

      this.baseContributions.p1 = result.p1Breeding.total;
      this.baseContributions['p1-1'] = slots.gp1Left ? result.p1Breeding.left : null;
      this.baseContributions['p1-2'] = slots.gp1Right ? result.p1Breeding.right : null;
    }
  }

  private rebuildViews(): void {
    const raceWinsByPosition = this.buildRaceWinsByPosition();
    this.parentView = this.createNodeView('p1', raceWinsByPosition);
    this.grandparentViews = [this.createNodeView('p1-1', raceWinsByPosition), this.createNodeView('p1-2', raceWinsByPosition)]
      .filter((view): view is LineageNodeView => view !== null);
    this.grandparentGroups = this.grandparentViews.map(parent => {
      const childPositions = this.getGreatGrandparentPositions(parent.position);
      const children = childPositions
        .map(position => this.createNodeView(position, raceWinsByPosition))
        .filter((view): view is LineageNodeView => view !== null);
      return {
        parent,
        children,
        hasAnyGreatGrandparent: children.some(child => child.hasContent),
      };
    });
    this.hasAnyGrandparent = this.grandparentViews.some(view => view.hasContent);
    this.hasAnyGreatGrandparent = this.grandparentGroups.some(group => group.hasAnyGreatGrandparent);
  }

  private createNodeView(position: LineagePosition, raceWinsByPosition: PlannerRaceWins): LineageNodeView | null {
    const node = this.nodes.get(position);
    if (!node) return null;

    const hasContent = this.hasContent(node);
    const sparks = this.sortedSparks(node);
    const baseAffinity = this.baseContributions[position];
    const raceAffinity = this.isAffinityPosition(position)
      ? this.affinityService.getPlannerNodeRaceAffinity(position, raceWinsByPosition)
      : 0;
    const hasBaseAffinity = baseAffinity !== null;
    const hasRaceAffinity = hasBaseAffinity || raceAffinity > 0;
    const combinedAffinity = (baseAffinity ?? 0) + raceAffinity;
    const totalAffinity = combinedAffinity > 0 ? combinedAffinity : null;

    return {
      position,
      layer: node.layer,
      label: node.label,
      node,
      hasContent,
      name: hasContent ? this.getLineageCharacterName(node) : node.label,
      image: hasContent ? this.getLineageCharacterIcon(node) : null,
      tagline: this.getLineageTagline(node),
      sparks,
      visibleSparks: node.layer === 3 ? [] : sparks,
      moreSparkCount: 0,
      winCount: this.getWinSaddles(node).length,
      baseAffinity,
      raceAffinity,
      hasBaseAffinity,
      hasRaceAffinity,
      totalAffinity,
    };
  }

  private getGreatGrandparentPositions(position: LineagePosition): LineageGgpPosition[] {
    switch (position) {
      case 'p1-1': return ['p1-1-1', 'p1-1-2'];
      case 'p1-2': return ['p1-2-1', 'p1-2-2'];
      default: return [];
    }
  }

  private isAffinityPosition(position: LineagePosition): position is LineageAffinityPosition {
    return position === 'p1' || position === 'p1-1' || position === 'p1-2';
  }

  private buildTreeSlots(): TreeSlots {
    return {
      target: this.toCharaId(this.targetCharaId),
      p1: this.getNodeCharaId(this.nodes.get('p1')),
      p2: null,
      gp1Left: this.getNodeCharaId(this.nodes.get('p1-1')),
      gp1Right: this.getNodeCharaId(this.nodes.get('p1-2')),
      gp2Left: null,
      gp2Right: null,
    };
  }

  private buildRaceWinsByPosition(): PlannerRaceWins {
    return {
      p1: this.getWinSaddles(this.nodes.get('p1')),
      'p1-1': this.getWinSaddles(this.nodes.get('p1-1')),
      'p1-2': this.getWinSaddles(this.nodes.get('p1-2')),
    };
  }

  private getParentTags(veteran: VeteranMember): { label: string; className: string }[] {
    const tags: { label: string; className: string }[] = [];
    if (veteran.scenario_id) tags.push({ label: getScenarioName(veteran.scenario_id), className: 'scenario' });
    if (veteran.distance_type) tags.push({ label: getDistanceName(veteran.distance_type), className: 'distance' });
    return tags;
  }

  private resolveVeteranSparks(veteran: VeteranMember): SparkInfo[] {
    if (veteran.factor_info_array?.length) {
      return this.resolveFactorEntries(veteran.factor_info_array);
    }
    if (veteran.inheritance) {
      return this.resolveSparkIds([
        ...(veteran.inheritance.blue_sparks || []),
        ...(veteran.inheritance.pink_sparks || []),
        ...(veteran.inheritance.green_sparks || []),
        ...(veteran.inheritance.white_sparks || []),
      ]);
    }
    return this.resolveSparkIds(veteran.factors ?? []);
  }

  private resolveSuccessionSparks(succession: SuccessionChara): SparkInfo[] {
    if (succession.factor_info_array?.length) {
      return this.resolveFactorEntries(succession.factor_info_array);
    }
    return this.resolveSparkIds(succession.factor_id_array ?? []);
  }

  private resolveFactorEntries(entries: FactorInfoEntry[]): SparkInfo[] {
    return this.resolveSparkIds(entries.map(entry => entry.factor_id));
  }

  private resolveSparkIds(ids: number[]): SparkInfo[] {
    if (!ids.length) return [];
    return this.sortedSparkList(this.factorService.resolveSparks(ids));
  }

  private sortedSparks(node: LineageNode): SparkInfo[] {
    return this.sortedSparkList(node.resolvedSparks ?? []);
  }

  private sortedSparkList(sparks: SparkInfo[]): SparkInfo[] {
    return [...sparks].sort((left, right) => {
      const leftOrder = LineageDisplayComponent.SPARK_TYPE_ORDER[left.type] ?? 3;
      const rightOrder = LineageDisplayComponent.SPARK_TYPE_ORDER[right.type] ?? 3;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return right.level - left.level;
    });
  }

  private hasContent(node: LineageNode | null | undefined): boolean {
    return !!(node && (node.character || node.veteran || node.succession));
  }

  private getLineageCharacterName(node: LineageNode): string {
    if (node.character) return node.character.name;
    const cardId = this.getNodeCardId(node);
    if (cardId) return getCharacterName(cardId) || `Uma #${cardId}`;
    return node.label;
  }

  private getLineageCharacterIcon(node: LineageNode): string | null {
    const cardId = this.getNodeCardId(node);
    return cardId ? getCardImage(cardId) : null;
  }

  private getLineageTagline(node: LineageNode): string {
    if (node.position === 'p1') return this.targetCharaId ? 'Main candidate' : 'Main';
    if (node.layer === 2) return node.position === 'p1-1' ? 'Parent 1' : 'Parent 2';
    return node.label;
  }

  private getNodeCardId(node: LineageNode | null | undefined): number | null {
    if (!node) return null;
    if (node.character?.id) return node.character.id;
    if (node.succession?.card_id) return node.succession.card_id;
    if (node.veteran?.card_id) return node.veteran.card_id;
    if (node.veteran?.trained_chara_id) {
      return this.findCharacterForVeteran(node.veteran)?.id ?? null;
    }
    return null;
  }

  private getNodeCharaId(node: LineageNode | null | undefined): number | null {
    if (!node) return null;
    if (node.veteran) return this.getVeteranCharaId(node.veteran);
    const cardId = this.getNodeCardId(node);
    return this.toCharaId(cardId);
  }

  private getVeteranCharaId(veteran: VeteranMember): number | null {
    if (veteran.card_id) return this.toCharaId(veteran.card_id);
    return this.toCharaId(veteran.trained_chara_id);
  }

  private toCharaId(id: number | null | undefined): number | null {
    if (!id) return null;
    return id >= 10000 ? Math.floor(id / 100) : id;
  }

  private getWinSaddles(node: LineageNode | null | undefined): number[] {
    return node?.manualWinSaddleIds ?? [];
  }

  private resetBaseContributions(): void {
    for (const definition of this.nodePositions) {
      this.baseContributions[definition.position] = null;
    }
  }

  private findCharacterByCardId(cardId: number | null | undefined): Character | null {
    if (!cardId) return null;
    return CHARACTERS.find(character => character.id === cardId)
      ?? CHARACTERS.find(character => Math.floor(character.id / 100) === Math.floor(cardId / 100))
      ?? null;
  }

  private findCharacterForVeteran(veteran: VeteranMember): Character | null {
    if (veteran.card_id) return this.findCharacterByCardId(veteran.card_id);
    if (veteran.trained_chara_id) {
      return this.findCharacterByCardId(veteran.trained_chara_id)
        ?? CHARACTERS.find(character => Math.floor(character.id / 100) === this.toCharaId(veteran.trained_chara_id))
        ?? null;
    }
    return null;
  }
}
