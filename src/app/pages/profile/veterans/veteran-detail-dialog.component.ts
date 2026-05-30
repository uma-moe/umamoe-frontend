import { Component, Inject, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MatDialog, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { RankBadgeComponent } from '../../../components/rank-badge/rank-badge.component';
import { LineageDisplayComponent } from '../../../components/lineage-display/lineage-display.component';
import { SkillComponent } from '../../../components/skill/skill.component';
import { RaceResultsDialogComponent, RaceResultsDialogData } from '../../../components/race-results-dialog/race-results-dialog.component';
import { FactorService } from '../../../services/factor.service';
import { PlannerTransferService } from '../../../services/planner-transfer.service';
import { LocaleNumberPipe } from '../../../pipes/locale-number.pipe';
import { VeteranMember, FactorInfoEntry } from '../../../models/profile.model';
import { RACE_SADDLE_DATA } from '../../../data/race-saddle.data';

interface WonRace {
  raceInstanceId: number;
  name: string;
  grade: number;
  gradeLabel: string;
}
import {
  getAptGrade, getRankGrade, getRankGradeColor, getStarDisplay,
  getDistanceName, getRunningStyleName, getScenarioName, getTotalStats,
  getCardImage,
  getCharacterName, sortEncodedSkills,
} from '../profile-helpers';

type FactorColor = 'blue' | 'pink' | 'green' | 'white';

interface ResolvedFactor {
  id: number;
  level: number;
  name: string;
  type: number;
  color: FactorColor;
}

export interface VeteranDetailData {
  veteran: VeteranMember;
}

@Component({
  selector: 'app-veteran-detail-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, MatButtonModule, MatTooltipModule, RankBadgeComponent, LineageDisplayComponent, SkillComponent, LocaleNumberPipe],
  templateUrl: './veteran-detail-dialog.component.html',
  styleUrls: ['./veteran-detail-dialog.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class VeteranDetailDialogComponent {
  v: VeteranMember;
  wonRaces: WonRace[] = [];

  constructor(
    public dialogRef: MatDialogRef<VeteranDetailDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: VeteranDetailData,
    private factorService: FactorService,
    private dialog: MatDialog,
    private plannerTransfer: PlannerTransferService,
    private router: Router,
  ) {
    this.v = data.veteran;
    this.wonRaces = this.resolveWonRaces();
  }

  close(): void {
    this.dialogRef.close();
  }

  private resolveWonRaces(): WonRace[] {
    const saddleIds = new Set(this.v.win_saddle_id_array ?? []);
    if (saddleIds.size === 0) return [];

    const gradeOrder: Record<number, number> = { 100: 0, 200: 1, 300: 2 };
    const gradeLabels: Record<number, string> = { 100: 'G1', 200: 'G2', 300: 'G3' };
    const seen = new Set<number>();
    const races: WonRace[] = [];

    for (const race of (RACE_SADDLE_DATA as any).races) {
      if (seen.has(race.race_instance_id)) continue;
      for (const ws of race.win_saddles ?? []) {
        if (ws.required_race_instance_ids?.length === 1 && saddleIds.has(ws.saddle_id)) {
          seen.add(race.race_instance_id);
          races.push({
            raceInstanceId: race.race_instance_id,
            name: race.short_name || race.name,
            grade: race.grade,
            gradeLabel: gradeLabels[race.grade] || '',
          });
          break;
        }
      }
    }

    races.sort((a, b) => (gradeOrder[a.grade] ?? 9) - (gradeOrder[b.grade] ?? 9));
    return races;
  }

  openRaceHistory(): void {
    const winSaddles = this.v.win_saddle_id_array ?? [];
    const charName = getCharacterName(this.v.card_id);
    this.dialog.open(RaceResultsDialogComponent, {
      data: { charId: this.v.card_id, charName, winSaddleIds: winSaddles, runRaceIds: [] } as RaceResultsDialogData,
      panelClass: 'modern-dialog-panel',
      width: '1100px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false,
    });
  }

  openLineagePlanner(): void {
    this.plannerTransfer.set({ veteran: this.v, veteranPosition: 'p1' });
    const url = this.router.serializeUrl(
      this.router.createUrlTree(['/tools/lineage-planner'], { queryParams: { from: 'db' } })
    );
    window.open(url, '_blank');
  }

  // Re-export helpers
  getCharacterName = getCharacterName;
  getCardImage = getCardImage;
  getAptGrade = getAptGrade;
  getRankGrade = getRankGrade;
  getRankGradeColor = getRankGradeColor;
  getStarDisplay = getStarDisplay;
  getScenarioName = getScenarioName;
  getDistanceName = getDistanceName;
  getRunningStyleName = getRunningStyleName;
  getTotalStats = getTotalStats;
  getEncodedSkills(v: VeteranMember): number[] {
    const skills = v.skill_array && v.skill_array.length > 0
      ? v.skill_array.map(s => s.skill_id * 10 + s.level)
      : v.skills ?? [];
    return sortEncodedSkills(skills);
  }

  getFactors(node: { factor_info_array?: FactorInfoEntry[] | null; factor_id_array?: number[] | null; factors?: number[] | null }): ResolvedFactor[] {
    if (node.factor_info_array && node.factor_info_array.length > 0) {
      return this.resolveFactors(node.factor_info_array);
    }
    return this.resolveFactorIds((node as any).factor_id_array || (node as any).factors);
  }

  private resolveFactors(entries: FactorInfoEntry[]): ResolvedFactor[] {
    const colorOrder: Record<string, number> = { blue: 0, pink: 1, green: 2, white: 3 };
    return entries.map(e => {
      const spark = this.factorService.resolveSpark(e.factor_id);
      return { id: e.factor_id, level: spark.level, name: spark.name, type: spark.type, color: this.factorTypeToColor(spark.type) };
    }).sort((a, b) => (colorOrder[a.color] ?? 9) - (colorOrder[b.color] ?? 9));
  }

  private resolveFactorIds(ids: number[] | null | undefined): ResolvedFactor[] {
    if (!ids || ids.length === 0) return [];
    const colorOrder: Record<string, number> = { blue: 0, pink: 1, green: 2, white: 3 };
    return ids.map(id => {
      const spark = this.factorService.resolveSpark(id);
      return { id, level: spark.level, name: spark.name, type: spark.type, color: this.factorTypeToColor(spark.type) };
    }).sort((a, b) => (colorOrder[a.color] ?? 9) - (colorOrder[b.color] ?? 9));
  }

  private factorTypeToColor(type: number): FactorColor {
    if (type === 0) return 'blue';
    if (type === 1) return 'pink';
    if (type === 5) return 'green';
    return 'white';
  }

  getAffinityScore(v: VeteranMember): number | null {
    return (v.inheritance as any)?.affinity_score ?? null;
  }

  hasLineageTree(): boolean {
    return (this.v.succession_chara_array ?? []).some(succession => succession.position_id === 10 || succession.position_id === 20);
  }
}
