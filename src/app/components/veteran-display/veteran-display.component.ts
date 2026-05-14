import {
  Component, Input, Output, EventEmitter, OnChanges, SimpleChanges,
  ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { VeteranMember } from '../../models/profile.model';
import { Character } from '../../models/character.model';
import { CHARACTERS } from '../../data/character.data';
import { FactorService } from '../../services/factor.service';
import { AffinityService } from '../../services/affinity.service';
import { getCharacterName, getStarDisplay } from '../../pages/profile/profile-helpers';
import { Subscription } from 'rxjs';

interface ResolvedSpark {
  factorId: string;
  level: number;
  name: string;
  color: 'blue' | 'pink' | 'green' | 'white';
}

interface ResolvedParent {
  name: string;
  position: string;
  image: string;
  charaId: number | null;
  sparks: ResolvedSpark[];
  affinity: number;
  raceAffinity: number;
  winSaddles: number[];
}

@Component({
  selector: 'app-veteran-display',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  templateUrl: './veteran-display.component.html',
  styleUrls: ['./veteran-display.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VeteranDisplayComponent implements OnChanges, OnInit, OnDestroy {
  @Input() veteran: VeteranMember | null = null;
  @Input() targetCharaId: number | null = null;
  @Output() affinityChanged = new EventEmitter<number>();

  name = '';
  image = '';
  rarity: number | null = null;
  sparks: ResolvedSpark[] = [];
  parents: ResolvedParent[] = [];
  affinity = 0;
  blueSum = 0;
  pinkSum = 0;
  greenSum = 0;

  private affSub?: Subscription;

  constructor(
    private factorService: FactorService,
    private affinityService: AffinityService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.affSub = this.affinityService.load().subscribe(() => {
      this.computeAffinity();
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.affSub?.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['veteran'] || changes['targetCharaId']) {
      this.resolve();
    }
  }

  private resolve(): void {
    const vet = this.veteran;
    if (!vet) {
      this.name = '';
      this.image = '';
      this.rarity = null;
      this.sparks = [];
      this.parents = [];
      this.affinity = 0;
      this.blueSum = 0;
      this.pinkSum = 0;
      this.greenSum = 0;
      return;
    }

    this.name = this.resolveName(vet);
    this.image = this.resolveImage(vet);
    this.rarity = vet.rarity ?? null;
    this.sparks = this.resolveSparks(vet);
    this.parents = this.resolveParents(vet);
    this.blueSum = this.sparks.filter(s => s.color === 'blue').reduce((sum, s) => sum + s.level, 0);
    this.pinkSum = this.sparks.filter(s => s.color === 'pink').reduce((sum, s) => sum + s.level, 0);
    this.greenSum = this.sparks.filter(s => s.color === 'green').reduce((sum, s) => sum + s.level, 0);

    // Compute per-parent affinity against the target
    this.computeAffinity();

    this.cdr.markForCheck();
  }

  private computeAffinity(): void {
    const vetCharaId = this.veteran ? this.getCharaId(this.veteran) : null;
    const vetWins = new Set(this.veteran?.win_saddle_id_array ?? []);
    if (this.targetCharaId && vetCharaId && this.affinityService.isReady && this.parents.length) {
      const pair = this.affinityService.getAff2(this.targetCharaId, vetCharaId);
      for (const p of this.parents) {
        p.affinity = p.charaId
          ? this.affinityService.getAff3(this.targetCharaId, vetCharaId, p.charaId)
          : 0;
        p.raceAffinity = vetWins.size ? p.winSaddles.filter(w => vetWins.has(w)).length : 0;
      }
      this.affinity = pair + this.parents.reduce((sum, p) => sum + p.affinity + p.raceAffinity, 0);
    } else {
      for (const p of this.parents) { p.affinity = 0; p.raceAffinity = 0; }
      this.affinity = 0;
    }

    this.affinityChanged.emit(this.affinity);
    this.cdr.markForCheck();
  }

  private resolveName(vet: VeteranMember): string {
    if (vet.card_id) return getCharacterName(vet.card_id);
    if (vet.trained_chara_id) {
      const c = CHARACTERS.find(ch => Math.floor(ch.id / 100) === vet.trained_chara_id);
      return c ? getCharacterName(c.id) : `Uma #${vet.trained_chara_id}`;
    }
    return 'Unknown';
  }

  private resolveImage(vet: VeteranMember): string {
    if (vet.card_id) return `assets/images/character_stand/chara_stand_${vet.card_id}.webp`;
    if (vet.trained_chara_id) {
      const c = CHARACTERS.find(ch => Math.floor(ch.id / 100) === vet.trained_chara_id);
      return c ? `assets/images/character_stand/chara_stand_${c.id}.webp` : '';
    }
    return '';
  }

  private getCharaId(vet: VeteranMember): number | null {
    if (vet.card_id) return Math.floor(vet.card_id / 100);
    return vet.trained_chara_id ?? null;
  }

  private sparkTypeToColor(type: number): ResolvedSpark['color'] {
    if (type === 0) return 'blue';
    if (type === 1) return 'pink';
    if (type === 5) return 'green';
    return 'white';
  }

  private resolveSparks(vet: VeteranMember): ResolvedSpark[] {
    const colorOrder: Record<string, number> = { blue: 0, pink: 1, green: 2, white: 3 };
    let resolved: ResolvedSpark[];

    if (vet.factor_info_array?.length) {
      resolved = vet.factor_info_array.map(entry => {
        const spark = this.factorService.resolveSpark(entry.factor_id);
        return { factorId: spark.factorId, level: spark.level, name: spark.name, color: this.sparkTypeToColor(spark.type) };
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
        return { factorId: spark.factorId, level: spark.level, name: spark.name, color: this.sparkTypeToColor(spark.type) };
      });
    } else if (vet.factors?.length) {
      resolved = vet.factors.map(id => {
        const spark = this.factorService.resolveSpark(id);
        return { factorId: spark.factorId, level: spark.level, name: spark.name, color: this.sparkTypeToColor(spark.type) };
      });
    } else {
      resolved = [];
    }

    resolved.sort((a, b) => {
      const cmpColor = (colorOrder[a.color] ?? 9) - (colorOrder[b.color] ?? 9);
      return cmpColor !== 0 ? cmpColor : b.level - a.level;
    });

    return resolved;
  }

  private resolveParents(vet: VeteranMember): ResolvedParent[] {
    if (!vet.succession_chara_array?.length) return [];

    const posLabels: Record<number, string> = { 10: 'P1', 20: 'P2' };
    const colorOrder: Record<string, number> = { blue: 0, pink: 1, green: 2, white: 3 };
    const parents: ResolvedParent[] = [];

    for (const sc of vet.succession_chara_array) {
      if (sc.position_id !== 10 && sc.position_id !== 20) continue;
      const ids = sc.factor_info_array?.length
        ? sc.factor_info_array.map(e => e.factor_id)
        : sc.factor_id_array || [];

      const sparks = ids.map(id => {
        const spark = this.factorService.resolveSpark(id);
        return { factorId: spark.factorId, level: spark.level, name: spark.name, color: this.sparkTypeToColor(spark.type) } as ResolvedSpark;
      }).sort((a, b) => {
        const cmpColor = (colorOrder[a.color] ?? 9) - (colorOrder[b.color] ?? 9);
        return cmpColor !== 0 ? cmpColor : b.level - a.level;
      });

      parents.push({
        name: getCharacterName(sc.card_id),
        position: posLabels[sc.position_id] || `P${sc.position_id}`,
        image: sc.card_id ? `assets/images/character_stand/chara_stand_${sc.card_id}.webp` : '',
        charaId: sc.card_id ? Math.floor(sc.card_id / 100) : null,
        sparks,
        affinity: 0,
        raceAffinity: 0,
        winSaddles: sc.win_saddle_id_array ?? [],
      });
    }

    return parents;
  }

  getStarDisplay = getStarDisplay;

  onImgError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  getParentTotalAffinity(parent: ResolvedParent): number {
    return parent.affinity + parent.raceAffinity;
  }

  getParentAffinityTooltip(parent: ResolvedParent): string {
    const parts: string[] = [];

    if (parent.affinity) {
      parts.push(`Base: ${parent.affinity}`);
    }

    if (parent.raceAffinity) {
      parts.push(`Race: ${parent.raceAffinity}`);
    }

    return parts.length ? parts.join(' + ') : 'Base: 0';
  }
}
