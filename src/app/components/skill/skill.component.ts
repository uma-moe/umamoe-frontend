import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { getSkillIcon, getSkillLevel, getSkillName, getSkillRarityClass } from '../../pages/profile/profile-helpers';

@Component({
  selector: 'app-skill',
  standalone: true,
  imports: [CommonModule, MatTooltipModule],
  template: `
    <span class="skill-chip" [ngClass]="rarityClass" [matTooltip]="tooltip">
      <span class="skill-icon-frame" *ngIf="icon">
        <img [src]="icon" class="skill-icon" alt="" (error)="hideIcon($event)">
      </span>
      <span class="skill-name">{{ name }}</span>
      <span class="skill-level">{{ levelLabel }}</span>
    </span>
  `,
  styleUrls: ['./skill.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkillComponent {
  @Input({ required: true }) skillId!: number;
  @Input() compact = false;

  get name(): string {
    return getSkillName(this.skillId);
  }

  get level(): number {
    return getSkillLevel(this.skillId);
  }

  get levelLabel(): string {
    return this.compact ? `Lv${this.level}` : `Lv.${this.level}`;
  }

  get icon(): string | null {
    return getSkillIcon(this.skillId);
  }

  get rarityClass(): string {
    return [getSkillRarityClass(this.skillId), this.compact ? 'skill-chip--compact' : '']
      .filter(Boolean)
      .join(' ');
  }

  get tooltip(): string {
    return `${this.name} Lv.${this.level}`;
  }

  hideIcon(event: Event): void {
    (event.target as HTMLElement).style.display = 'none';
  }
}