import { Component, Input, OnChanges, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

// ══════════════════════════════════════════════════════════════════════════════
//  RANK COLOR CONFIG
//
//  Standard ranks (G → SS+): single hex color for text & border.
//  Ultra ranks   (UG → US):  two colors - 'u' for the "U", 'tier' for the rest.
//
//  Edit values below to change rank badge colors.
// ══════════════════════════════════════════════════════════════════════════════

export const STANDARD_RANK_COLORS: Record<string, string> = {
    'G': '#c6c7c6',
    'F': '#ad97fc',
    'E': '#d675ef',
    'D': '#63baf7',
    'C': '#81d968',
    'B': '#ff7da5',
    'A': '#fa8836',
    'S': '#e7b618',
    'SS': '#ef5350',
};

export const ULTRA_RANK_COLORS: Record<string, { tier: string; u: string }> = {
    'UG': { tier: '#c6c7c6', u: '#de0cf7' },
    'UF': { tier: '#ad97fc', u: '#de0cf7' },
    'UE': { tier: '#d675ef', u: '#de0cf7' },
    'UD': { tier: '#63baf7', u: '#de0cf7' },
    'UC': { tier: '#81d968', u: '#de0cf7' },
    'UB': { tier: '#ff7da5', u: '#de0cf7' },
    'UA': { tier: '#fa8836', u: '#de0cf7' },
    'US': { tier: '#e7b618', u: '#de0cf7' },
};

// ══════════════════════════════════════════════════════════════════════════════

export interface RankInfo {
    /** Full display label, e.g. "B+", "SS", "UG0", "US9" */
    label: string;
    /** Whether this is an Ultra rank */
    isUltra: boolean;
    /** The tier letter: G, F, E, D, C, B, A, S, or SS */
    tierLetter: string;
    /** Sub-level for Ultra ranks (0-9), null for standard */
    subLevel: number | null;
    /** Whether this is a "+" variant (standard only) */
    isPlus: boolean;
    /** Primary color (tier color for ultra, single color for standard) */
    color: string;
    /** "U" letter color (ultra only, null for standard) */
    uColor: string | null;
}

const STANDARD_TIERS = ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS'];
const ULTRA_TIERS = ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'];

// Precomputed lower-bound score for each ultra sublevel, sourced from rating-shared.js.
// Index = tierIdx * 10 + subLevel  (0 = UG0, 79 = US9, 80 = sentinel)
const ULTRA_THRESHOLDS: number[] = [
    // UG0-9
    19600, 20000, 20400, 20800, 21200, 21600, 22100, 22500, 23000, 23400,
    // UF0-9
    23900, 24300, 24800, 25300, 25800, 26300, 26800, 27300, 27800, 28300,
    // UE0-9
    28800, 29400, 29900, 30400, 31000, 31500, 32100, 32700, 33200, 33800,
    // UD0-9
    34400, 35000, 35600, 36200, 36800, 37500, 38100, 38700, 39400, 40000,
    // UC0-9
    40700, 41300, 42000, 42700, 43400, 44000, 44700, 45400, 46200, 46900,
    // UB0-9
    47600, 48300, 49000, 49800, 50500, 51300, 52000, 52800, 53600, 54400,
    // UA0-9
    55200, 55900, 56700, 57500, 58400, 59200, 60000, 60800, 61700, 62500,
    // US0-9
    63400, 64200, 65100, 66400, 67700, 69000, 70300, 71600, 72900, 74400,
    // sentinel (LG start)
    76000,
];

/**
 * Convert a 1-based rarity value (1-98) to rank info.
 *
 *   Rarity  1-18 → Standard: G, G+, F, F+, … SS, SS+
 *   Rarity 19-98 → Ultra:    UG0-UG9, UF0-UF9, … US0-US9
 */
export function getRankInfo(rarity: number): RankInfo {
    const idx = Math.max(0, rarity - 1);

    if (idx < 18) {
        const tierIdx = Math.floor(idx / 2);
        const tier = STANDARD_TIERS[tierIdx] || 'G';
        const isPlus = idx % 2 === 1;
        const color = STANDARD_RANK_COLORS[tier] || '#9e9e9e';
        return {
            label: isPlus ? `${tier}+` : tier,
            isUltra: false, tierLetter: tier,
            subLevel: null, isPlus, color, uColor: null,
        };
    }

    const ultraIdx = idx - 18;
    const tierIdx = Math.floor(ultraIdx / 10);
    const subLevel = ultraIdx % 10;
    const tier = ULTRA_TIERS[tierIdx] || 'G';
    const key = `U${tier}`;
    const colors = ULTRA_RANK_COLORS[key] || { tier: '#9e9e9e', u: '#b0bec5' };
    return {
        label: `U${tier}${subLevel}`,
        isUltra: true, tierLetter: tier,
        subLevel, isPlus: false,
        color: colors.tier, uColor: colors.u,
    };
}

/**
 * Convert a URA evaluation score to a simplified RankInfo.
 * Standard ranks below 19600, ultra ranks (UG0–US9) from 19600 upward.
 */
export function getRankInfoFromScore(score: number): RankInfo {
    // Ultra ranks
    if (score >= ULTRA_THRESHOLDS[0]) {
        let idx = ULTRA_THRESHOLDS.length - 2; // cap at US9
        for (let i = ULTRA_THRESHOLDS.length - 2; i >= 0; i--) {
            if (score >= ULTRA_THRESHOLDS[i]) { idx = i; break; }
        }
        const tierIdx = Math.floor(idx / 10);
        const subLevel = idx % 10;
        const tier = ULTRA_TIERS[tierIdx];
        const key = `U${tier}`;
        const colors = ULTRA_RANK_COLORS[key] || { tier: '#9e9e9e', u: '#b0bec5' };
        return {
            label: `U${tier}${subLevel}`,
            isUltra: true, tierLetter: tier,
            subLevel, isPlus: false,
            color: colors.tier, uColor: colors.u,
        };
    }

    // Standard ranks
    let tier: string;
    let isPlus = false;
    if      (score >= 19200) { tier = 'SS'; isPlus = true; }
    else if (score >= 17500) { tier = 'SS'; }
    else if (score >= 15900) { tier = 'S'; isPlus = true; }
    else if (score >= 14500) { tier = 'S'; }
    else if (score >= 12100) { tier = 'A'; isPlus = true; }
    else if (score >= 10000) { tier = 'A'; }
    else if (score >= 8200) { tier = 'B'; isPlus = true; }
    else if (score >= 6500) { tier = 'B'; }
    else if (score >= 4900) { tier = 'C'; isPlus = true; }
    else if (score >= 3500) { tier = 'C'; }
    else if (score >= 2900) { tier = 'D'; isPlus = true; }
    else if (score >= 2300) { tier = 'D'; }
    else if (score >= 1800) { tier = 'E'; isPlus = true; }
    else if (score >= 1300) { tier = 'E'; }
    else if (score >= 900) { tier = 'F'; isPlus = true; }
    else if (score >= 600) { tier = 'F'; }
    else { tier = 'G'; }

    const color = STANDARD_RANK_COLORS[tier] || '#9e9e9e';
    return {
        label: isPlus ? `${tier}+` : tier,
        isUltra: false, tierLetter: tier,
        subLevel: null, isPlus, color, uColor: null,
    };
}

@Component({
    selector: 'app-rank-badge',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <span class="rank-badge"
          [class.ultra]="rank.isUltra"
          [ngClass]="'size-' + size"
          [style.--rank-color]="rank.color"
          [style.--rank-u-color]="rank.uColor || rank.color">
      <!-- Standard rank -->
      <span class="rank-label" *ngIf="!rank.isUltra">{{ rank.label }}</span>
      <!-- Ultra rank: tier + sublevel (e.g. G1, A+) with ultra border -->
      <span class="rank-label" *ngIf="rank.isUltra">{{ rank.tierLetter }}{{ rank.subLevel }}</span>
    </span>
  `,
    styles: [`
    :host { display: inline-flex; }

    .rank-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      border: 2px solid var(--rank-color);
      background: rgba(0, 0, 0, 0.3);
      flex-shrink: 0;
      position: relative;

      &.size-sm  { width: 28px; height: 28px; }
      &.size-md  { width: 38px; height: 38px; }
      &.size-lg  { width: 46px; height: 46px; }

      /* Ultra: gradient border via pseudo-elements */
      &.ultra {
        border-color: transparent;

        &::before {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--rank-u-color), var(--rank-color));
          z-index: 0;
        }
        &::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.35);
          z-index: 0;
        }
      }
    }

    .rank-label {
      font-weight: 800;
      letter-spacing: -0.02em;
      z-index: 1;
      white-space: nowrap;
      color: var(--rank-color);

      .size-sm &  { font-size: 0.6rem;  }
      .size-md &  { font-size: 0.72rem; }
      .size-lg &  { font-size: 0.85rem; }
    }


  `]
})
export class RankBadgeComponent implements OnChanges {
    /** 1-based rarity (1-98): G, G+, F, … SS+, UG0-UG9, … US0-US9 */
    @Input() rarity?: number;

    /** URA evaluation score - used when rarity is not available (team stadium, veterans) */
    @Input() score?: number;

    /** Badge diameter preset */
    @Input() size: 'sm' | 'md' | 'lg' = 'md';

    rank!: RankInfo;

    ngOnChanges(): void {
        if (this.rarity != null && this.rarity > 0) {
            this.rank = getRankInfo(this.rarity);
        } else if (this.score != null) {
            this.rank = getRankInfoFromScore(this.score);
        } else {
            this.rank = getRankInfo(1); // fallback: G
        }
    }
}
