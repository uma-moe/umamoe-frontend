import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { UserProfileResponse, ProfileVisibility } from '../../../models/profile.model';
import { getCharacterById } from '../../../data/character.data';
import { ProfileService } from '../../../services/profile.service';
import { AuthService } from '../../../services/auth.service';
import { LocaleNumberPipe } from '../../../pipes/locale-number.pipe';

@Component({
  selector: 'app-profile-header',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, LocaleNumberPipe],
  template: `
    <div class="page-header">
      <div class="header-content">
        <div class="identity">
          <div class="avatar" *ngIf="profile.inheritance">
            <img [src]="getCharacterImage(profile.inheritance.main_parent_id)"
                 [alt]="getCharacterName(profile.inheritance.main_parent_id)"
                 *ngIf="getCharacterImage(profile.inheritance.main_parent_id)">
            <mat-icon *ngIf="!getCharacterImage(profile.inheritance.main_parent_id)">person</mat-icon>
          </div>
          <div class="avatar" *ngIf="!profile.inheritance">
            <mat-icon>person</mat-icon>
          </div>
          <div class="identity-text">
            <h1>{{ profile.trainer.name || 'Unknown Trainer' }}</h1>
            <div class="meta">
              <span class="meta-id mono">#{{ profile.trainer.account_id }}</span>
              <span class="meta-dot" *ngIf="profile.trainer.follower_num"></span>
              <span *ngIf="profile.trainer.follower_num">{{ profile.trainer.follower_num | localeNumber }} followers</span>
              <span class="meta-dot" *ngIf="profile.trainer.own_follow_num != null"></span>
              <span *ngIf="profile.trainer.own_follow_num != null">{{ profile.trainer.own_follow_num | localeNumber }} following</span>
              <span class="meta-dot" *ngIf="profile.circle"></span>
              <a *ngIf="profile.circle" [routerLink]="['/circles', profile.circle!.circle_id]" class="circle-link">{{ profile.circle!.name }}</a>
              <span class="meta-dot" *ngIf="profile.trainer.team_class != null"></span>
              <span *ngIf="profile.trainer.team_class != null">{{ getTeamClassName(profile.trainer.team_class) }}</span>
              <span class="meta-dot" *ngIf="profile.trainer.rank_score != null"></span>
              <span *ngIf="profile.trainer.rank_score != null" class="mono">★ {{ profile.trainer.rank_score | localeNumber }}</span>
            </div>
          </div>
        </div>
        <p class="comment" *ngIf="profile.trainer.comment">{{ profile.trainer.comment }}</p>
      </div>
    </div>

    <div class="stats-bar">
      <div class="stats-inner">
        <div class="stat" *ngIf="profile.fan_history.alltime">
          <span class="stat-val mono">{{ formatNumber(profile.fan_history.alltime.total_fans) }}</span>
          <span class="stat-lbl">Total Fans</span>
        </div>
        <div class="stat" *ngIf="profile.fan_history.rolling">
          <span class="stat-val mono" [style.color]="getGainColor(profile.fan_history.rolling.gain_7d)">
            {{ profile.fan_history.rolling.gain_7d >= 0 ? '+' : '' }}{{ formatNumber(profile.fan_history.rolling.gain_7d) }}
          </span>
          <span class="stat-lbl">7-Day</span>
        </div>
        <div class="stat" *ngIf="profile.fan_history.alltime">
          <span class="stat-val mono">#{{ profile.fan_history.alltime.rank_total_fans | localeNumber }}</span>
          <span class="stat-lbl">Rank</span>
        </div>
        <div class="stat" *ngIf="profile.trainer.team_evaluation_point != null">
          <span class="stat-val mono">{{ profile.trainer.team_evaluation_point | localeNumber }}</span>
          <span class="stat-lbl">Team Eval</span>
        </div>
        <div class="stat" *ngIf="profile.trainer.best_team_class != null">
          <span class="stat-val mono">{{ getTeamClassName(profile.trainer.best_team_class) }}</span>
          <span class="stat-lbl">Best Class</span>
        </div>
        <div class="stat" *ngIf="profile.fan_history.rolling">
          <span class="stat-val mono" [style.color]="getGainColor(profile.fan_history.rolling.gain_30d)">
            {{ profile.fan_history.rolling.gain_30d >= 0 ? '+' : '' }}{{ formatNumber(profile.fan_history.rolling.gain_30d) }}
          </span>
          <span class="stat-lbl">30-Day</span>
        </div>
      </div>
    </div>

    <div class="owner-controls" *ngIf="isOwnProfile">
      <div class="owner-controls-inner">
        <div class="owner-label">
          <mat-icon>tune</mat-icon>
          <span>Visibility</span>
        </div>
        <div class="owner-row-right">
          <span class="saving-indicator" *ngIf="savingVisibility">
            <mat-icon class="spin-small">sync</mat-icon>
          </span>
          <button class="profile-hidden-toggle" [class.active]="visibility.profile_hidden" (click)="toggleProfileHidden()">
            <span class="toggle-track"><span class="toggle-knob"></span></span>
            <span class="toggle-label">{{ visibility.profile_hidden ? 'Entire Profile Hidden' : 'Profile Visible' }}</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* ── Page header - site-wide gradient banner ── */
    .page-header {
      background: linear-gradient(135deg, rgba(100, 181, 246, 0.1) 0%, rgba(129, 199, 132, 0.1) 100%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding: 2rem 0;
    }
    .header-content {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 2rem;
    }

    /* ── Identity: avatar + name + meta ── */
    .identity {
      display: flex;
      align-items: center;
      gap: 1.25rem;
    }
    .avatar {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.05);
      border: 2px solid rgba(255, 255, 255, 0.12);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
    }
    .avatar img { width: 100%; height: 100%; object-fit: cover; }
    .avatar mat-icon { font-size: 2rem; width: 2rem; height: 2rem; color: rgba(255, 255, 255, 0.25); }
    .identity-text { flex: 1; min-width: 0; }
    .identity-text h1 {
      font-size: 2rem;
      font-weight: 700;
      margin: 0 0 0.4rem;
      line-height: 1.1;
      background: linear-gradient(45deg, #64b5f6, #81c784);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      color: transparent;
    }

    /* ── Meta line - clean inline text ── */
    .meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.8rem;
    }
    .meta-id { color: rgba(255, 255, 255, 0.35); }
    .meta-dot {
      width: 3px; height: 3px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.2);
      flex-shrink: 0;
    }
    .circle-link { color: #64b5f6; text-decoration: none; }
    .circle-link:hover { text-decoration: underline; }

    /* ── Comment ── */
    .comment {
      margin: 0.6rem 0 0;
      padding-left: calc(72px + 1.25rem); /* align with text, not avatar */
      color: rgba(255, 255, 255, 0.3);
      font-size: 0.75rem;
      font-family: monospace;
      word-break: break-all;
    }

    /* ── Stats bar - separate strip below the header ── */
    .stats-bar {
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(255, 255, 255, 0.015);
    }
    .stats-inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 2rem;
      display: flex;
      align-items: stretch;
    }
    .stat {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 0.75rem 0.25rem;
      gap: 2px;
      border-right: 1px solid rgba(255, 255, 255, 0.04);
    }
    .stat:last-child { border-right: none; }
    .stat-val { font-size: 1.1rem; font-weight: 700; color: rgba(255, 255, 255, 0.9); line-height: 1.2; }
    .stat-lbl { font-size: 0.6rem; color: rgba(255, 255, 255, 0.35); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }

    /* ── Owner controls ── */
    .owner-controls { background: rgba(255, 255, 255, 0.02); border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
    .owner-controls-inner { max-width: 1200px; margin: 0 auto; padding: 0.5rem 2rem; display: flex; align-items: center; justify-content: space-between; }
    .owner-label { display: flex; align-items: center; gap: 0.4rem; color: rgba(255, 255, 255, 0.35); font-size: 0.7rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.6px; }
    .owner-label mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .owner-row-right { display: flex; align-items: center; gap: 0.75rem; }
    .saving-indicator { color: rgba(255, 255, 255, 0.3); display: flex; align-items: center; }
    .profile-hidden-toggle { display: flex; align-items: center; gap: 0.5rem; padding: 0; border: none; background: none; cursor: pointer; font-size: 0.8rem; color: rgba(255, 255, 255, 0.6); transition: color 0.2s; }
    .profile-hidden-toggle:hover { color: rgba(255, 255, 255, 0.8); }
    .toggle-track { position: relative; width: 34px; height: 18px; border-radius: 9px; background: rgba(255, 255, 255, 0.12); transition: background 0.25s; flex-shrink: 0; }
    .toggle-knob { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: rgba(255, 255, 255, 0.5); transition: all 0.25s; }
    .toggle-label { font-weight: 500; }
    .profile-hidden-toggle.active { color: #e57373; }
    .profile-hidden-toggle.active .toggle-track { background: rgba(229, 115, 115, 0.35); }
    .profile-hidden-toggle.active .toggle-knob { left: 18px; background: #e57373; }
    @keyframes spin-small { to { transform: rotate(360deg); } }
    .spin-small { animation: spin-small 1s linear infinite; }

    /* ── Responsive ── */
    @media (max-width: 768px) {
      .header-content { padding: 0 1rem; }
      .identity-text h1 { font-size: 1.5rem; }
      .stats-inner { padding: 0 1rem; }
      .comment { padding-left: calc(56px + 1rem); }
    }
    @media (max-width: 600px) {
      .page-header { padding: 1.25rem 0; }
      .identity { gap: 0.75rem; }
      .avatar { width: 56px; height: 56px; }
      .identity-text h1 { font-size: 1.25rem; }
      .meta { gap: 0.35rem; font-size: 0.72rem; }
      .meta-dot { display: none; }
      .comment { padding-left: 0; margin-top: 0.5rem; }
      .stats-inner { flex-wrap: wrap; }
      .stat { flex: 0 0 33.33%; border-right: none; padding: 0.5rem 0.25rem; }
      .stat-val { font-size: 0.9rem; }
      .owner-controls-inner { padding: 0.5rem 1rem; }
    }
    @media (max-width: 400px) {
      .stat { flex: 0 0 50%; }
    }
  `]
})
export class ProfileHeaderComponent implements OnInit {
  @Input() profile!: UserProfileResponse;

  isOwnProfile = false;
  visibility: ProfileVisibility = { profile_hidden: false, hidden_sections: [] };
  savingVisibility = false;

  constructor(
    private profileService: ProfileService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.authService.user$.subscribe(user => {
      if (user) {
        this.authService.getLinkedAccounts().subscribe({
          next: (accounts) => {
            this.isOwnProfile = accounts.some(a => a.account_id === this.profile.trainer.account_id);
            this.profileService.patchProfileCtx({ isOwnProfile: this.isOwnProfile });
            if (this.isOwnProfile) this.loadVisibility();
          },
          error: () => { this.isOwnProfile = false; }
        });
      } else {
        this.isOwnProfile = false;
      }
    });
  }

  private loadVisibility(): void {
    this.profileService.getVisibility(this.profile.trainer.account_id).subscribe({
      next: (v) => { this.visibility = v; this.profileService.patchProfileCtx({ visibility: v }); },
      error: () => { this.visibility = { profile_hidden: false, hidden_sections: [] }; }
    });
  }

  toggleProfileHidden(): void {
    this.visibility.profile_hidden = !this.visibility.profile_hidden;
    this.savingVisibility = true;
    this.profileService.updateVisibility(this.profile.trainer.account_id, this.visibility).subscribe({
      next: (v) => { this.visibility = v; this.savingVisibility = false; this.profileService.patchProfileCtx({ visibility: v }); },
      error: () => { this.savingVisibility = false; }
    });
  }

  getCharacterImage(charId: number): string | null {
    const char = getCharacterById(charId);
    return char ? `assets/images/character_stand/${char.image}` : null;
  }

  getCharacterName(charId: number): string {
    const char = getCharacterById(charId);
    return char?.name || `Character ${charId}`;
  }

  private static compactFmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

  formatNumber(n: number): string {
    if (Math.abs(n) >= 100_000) return ProfileHeaderComponent.compactFmt.format(n);
    return n.toLocaleString();
  }

  getGainColor(gain: number): string {
    if (gain > 0) return '#81c784';
    if (gain < 0) return '#e57373';
    return 'rgba(255,255,255,0.5)';
  }

  getTeamClassName(teamClass: number | null): string {
    if (teamClass == null) return '-';
    const names: Record<number, string> = { 1: 'Class 1', 2: 'Class 2', 3: 'Class 3', 4: 'Class 4', 5: 'Class 5', 6: 'Class 6', 7: 'Open' };
    return names[teamClass] || `Class ${teamClass}`;
  }
}
