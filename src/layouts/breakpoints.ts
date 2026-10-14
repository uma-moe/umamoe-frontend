export type ShellLayoutMode = 'mobile' | 'compact' | 'expanded';
export type PageWidth = 'normal' | 'wide' | 'xl';

export interface ScreenLayoutContract {
  id: ShellLayoutMode;
  label: string;
  min: number;
  max?: number;
  navigation: string;
}

export const SCREEN_LAYOUTS: readonly ScreenLayoutContract[] = [
  { id: 'mobile', label: 'Mobile', min: 0, max: 767, navigation: 'Utility header + bottom navigation' },
  { id: 'compact', label: 'Compact', min: 768, max: 1799, navigation: '64px navigation rail; inline ads below 1700px, right ad rail above' },
  { id: 'expanded', label: 'Expanded', min: 1800, navigation: '240px navigation rail' }
] as const;

export const SCREEN_BREAKPOINTS = {
  compact: 768,
  expanded: 1800
} as const;

export const REVIEW_VIEWPORTS = [320, 390, 768, 1024, 1440] as const;
export const ANALYTICS_VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 384, height: 832 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 }
] as const;
export const ANALYTICS_REVIEW_VIEWPORTS = ANALYTICS_VIEWPORTS.map((viewport) => viewport.width);

export const PAGE_LAYOUT = {
  contentMax: 1080,
  frameMax: 1536,
  widths: {
    normal: { contentMax: 1080, frameMax: 1536 },
    wide: { contentMax: 1760, frameMax: 2184 },
    xl: { contentMax: 2184, frameMax: 2560 }
  },
  gutters: { mobile: 4, compact: 24, expanded: 32 },
  ads: {
    railWidth: 160,
    railGap: 20,
    railMin: 1700,
    counterRailMin: 1800,
    balancedRailsMin: 2200,
    leaderboardHeight: 90,
    mobileHeight: 50
  }
} as const;

export function shellLayoutForWidth(width: number): ShellLayoutMode {
  if (width >= SCREEN_BREAKPOINTS.expanded) return 'expanded';
  if (width >= SCREEN_BREAKPOINTS.compact) return 'compact';
  return 'mobile';
}

export function formatScreenRange(layout: ScreenLayoutContract): string {
  if (layout.max === undefined) return `≥${layout.min}px`;
  if (layout.min === 0) return `≤${layout.max}px`;
  return `${layout.min}–${layout.max}px`;
}
