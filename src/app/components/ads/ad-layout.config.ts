import { environment } from '../../../environments/environment';

export type AdSlotKind = 'leaderboard' | 'side-rail' | 'sticky-footer' | 'interscroller';

export interface AdSlotConfig {
  placement: string;
  fuseId: string;
  kind: AdSlotKind;
  label: string;
  mobileSizes?: string[];
  sizes: string[];
}

export interface AdRouteConfig {
  enabled: boolean;
  contentTop?: AdSlotConfig;
  reserveLeftRail?: boolean;
  sideRailAnchorMaxWidth?: number;
  sideRailAnchorSelectors?: string[];
  sideRailMaxWidth?: number;
  sideRailOverlay?: boolean;
  sideRailMinWidth?: number;
  sideRailVerticalAnchorSelectors?: string[];
  singleSideRailMaxWidth?: number;
  preferredSideRail?: 'left' | 'right';
  sideRails?: {
    left: AdSlotConfig;
    right: AdSlotConfig;
  };
  inContent?: AdSlotConfig[];
}

export const PUBLIFT_XL_MIN_WIDTH = 1440;

const BOTTOM_POPUP_SIZES = ['1200x90', '970x90', '728x90', '468x90'];
const SIDE_RAIL_SIZES = ['160x600', '120x600'];
const SIDE_RAIL_DEFAULT_ANCHOR_MAX_WIDTH = 1536;
const CONTENT_TOP_SIZES = ['1200x90', '970x90', '728x90', '468x90'];
const IN_CONTENT_SIZES = ['970x90', '728x90', '468x90', '468x60', '320x100', '300x100', '320x50', '300x50'];
const MOBILE_INTERSCROLLER_SIZE_GROUPS = [
  ['320x50', '300x50'],
  ['300x250', '250x250', '300x300'],
  ['320x100', '300x100', '300x250'],
  ['300x300', '300x250', '250x250', '320x50'],
];

const sideSlot = (placement: string, label: string): AdSlotConfig => ({
  placement,
  fuseId: resolveFuseId(placement),
  kind: 'side-rail',
  label,
  sizes: SIDE_RAIL_SIZES,
});

const contentTopSlot = (placement: string, label: string): AdSlotConfig => ({
  placement,
  fuseId: resolveFuseId(placement),
  kind: 'leaderboard',
  label,
  sizes: CONTENT_TOP_SIZES,
});

export function getContentTopSlot(surface: string, label: string): AdSlotConfig {
  return contentTopSlot(`${surface}_content_top`, `${label} content top`);
}

const bottomPopupSlot = (placement: string, label: string): AdSlotConfig => ({
  placement,
  fuseId: resolveFuseId(placement),
  kind: 'sticky-footer',
  label,
  sizes: BOTTOM_POPUP_SIZES,
});

const getMobileInterscrollerSizes = (index: number): string[] => (
  MOBILE_INTERSCROLLER_SIZE_GROUPS[(Math.max(1, index) - 1) % MOBILE_INTERSCROLLER_SIZE_GROUPS.length]
);

const inContentSlot = (placement: string, label: string, index = 1): AdSlotConfig => ({
  placement,
  fuseId: resolveFuseId(placement),
  kind: 'interscroller',
  label,
  mobileSizes: getMobileInterscrollerSizes(index),
  sizes: IN_CONTENT_SIZES,
});

const noAds: AdRouteConfig = { enabled: false };

interface SideRailPageOptions {
  anchorSelectors?: string[];
  contentTop?: boolean;
  inContent?: AdSlotConfig[];
  preferredSideRail?: 'left' | 'right';
  reserveLeftRail?: boolean;
  sideRailAnchorMaxWidth?: number;
  sideRailMaxWidth?: number;
  sideRailSizes?: string[];
  sideRailOverlay?: boolean;
  sideRailMinWidth?: number;
  singleSideRailMaxWidth?: number;
  verticalAnchorSelectors?: string[];
}

export function getLeaderboardInContentSlots(): AdSlotConfig[] {
  return [1, 2, 3, 4, 5, 6, 7, 8].map(index => (
    inContentSlot(`leaderboard_incontent_${index}`, `leaderboard in-content ${index}`, index)
  ));
}

export function getInContentSlot(surface: string, label: string, index = 1): AdSlotConfig {
  return inContentSlot(`${surface}_interscroller_${index}`, `${label} in-content ${index}`, index);
}

export function getMobileRailSlot(surface: string, label: string, index = 1): AdSlotConfig {
  const sizes = getMobileInterscrollerSizes(index);

  return {
    ...inContentSlot(`${surface}_interscroller_${index}`, `${label} mobile rail ${index}`),
    mobileSizes: sizes,
    sizes,
  };
}

function getMobileRailSlots(surface: string, label: string, count = 4): AdSlotConfig[] {
  return Array.from({ length: count }, (_, index) => getMobileRailSlot(surface, label, index + 1));
}

export function getGlobalStickyFooterSlot(): AdSlotConfig {
  return bottomPopupSlot('sticky_footer', 'sticky footer');
}

export function getAdRouteConfig(url: string): AdRouteConfig {
  const path = normalizePath(url);

  if (
    path.startsWith('/privacy-policy')
    || path.startsWith('/login')
    || path.startsWith('/signin')
    || path.startsWith('/settings')
  ) {
    return noAds;
  }

  if (path === '/') {
    return landingPage('home', 'home');
  }

  if (path.startsWith('/timeline')) {
    return sideRailPage('timeline', 'timeline', {
      anchorSelectors: ['.timeline-page .timeline-wrapper', '.timeline-page .page-header'],
      reserveLeftRail: false,
      sideRailOverlay: true,
      singleSideRailMaxWidth: 9999,
    });
  }

  if (path.startsWith('/database')) {
    return sideRailPage('database', 'database', {
      anchorSelectors: ['.inheritance-database .content-container', '.inheritance-database .header-content'],
      inContent: getMobileRailSlots('database', 'database', 8),
      sideRailAnchorMaxWidth: 2048,
    });
  }

  if (path === '/circles' || path.startsWith('/rankings') || path.startsWith('/activity')) {
    const surface = path === '/circles'
      ? 'leaderboard'
      : path.startsWith('/activity')
        ? 'activity'
        : 'rankings';

    return sideRailPage(surface, surface, {
      anchorSelectors: ['.content-container', '.page-header .header-content'],
      inContent: surface === 'leaderboard'
        ? [...getMobileRailSlots(surface, surface), ...getLeaderboardInContentSlots()]
        : undefined,
      sideRailAnchorMaxWidth: surface === 'leaderboard' ? 1536 : undefined,
    });
  }

  if (path.startsWith('/circles/')) {
    return sideRailPage('circle_detail', 'club detail', {
      anchorSelectors: ['.circle-details-page .content-container', '.content-container', '.page-header .header-content'],
    });
  }

  if (path.startsWith('/tierlist')) {
    return sideRailPage('tierlist', 'tierlist', {
      anchorSelectors: ['.tierlist-container'],
    });
  }

  if (path.startsWith('/tools/statistics')) {
    return sideRailPage('statistics', 'statistics', {
      anchorSelectors: ['.statistics-new .main-layout', '.statistics-new .hero-content'],
      preferredSideRail: 'right',
      reserveLeftRail: false,
      sideRailMaxWidth: 160,
      sideRailOverlay: true,
      sideRailSizes: ['160x600', '120x600'],
      singleSideRailMaxWidth: 9999,
    });
  }

  if (path.startsWith('/tools/lineage-planner')) {
    return sideRailPage('lineage_planner', 'lineage planner', {
      anchorSelectors: ['.lineage-planner .planner-scroll', '.lineage-planner .header-content'],
    });
  }

  if (path.startsWith('/tools')) {
    return landingPage('tools', 'tools');
  }

  if (path.startsWith('/profile')) {
    return sideRailPage('profile', 'profile', {
      anchorSelectors: ['.profile-page .content-container', '.content-container'],
    });
  }

  return noAds;
}

export function getPageInitFuseIds(config: AdRouteConfig): string[] {
  const ids = [
    config.contentTop?.fuseId,
    config.sideRails?.left.fuseId,
    config.sideRails?.right.fuseId,
    ...(config.inContent ?? []).map(slot => slot.fuseId),
  ];

  return ids.filter((id): id is string => Boolean(id));
}

function sideRailPage(surface: string, label: string, options: SideRailPageOptions = {}): AdRouteConfig {
  const inContent = options.inContent ?? getMobileRailSlots(surface, label);

  return {
    enabled: true,
    ...(options.contentTop === false ? {} : { contentTop: contentTopSlot(`${surface}_content_top`, `${label} content top`) }),
    preferredSideRail: options.preferredSideRail ?? 'left',
    reserveLeftRail: options.reserveLeftRail ?? true,
    sideRailAnchorMaxWidth: options.sideRailAnchorMaxWidth ?? SIDE_RAIL_DEFAULT_ANCHOR_MAX_WIDTH,
    sideRailAnchorSelectors: options.anchorSelectors,
    sideRailMaxWidth: options.sideRailMaxWidth,
    sideRailOverlay: options.sideRailOverlay,
    sideRailMinWidth: options.sideRailMinWidth,
    sideRailVerticalAnchorSelectors: options.verticalAnchorSelectors,
    singleSideRailMaxWidth: options.singleSideRailMaxWidth,
    sideRails: {
      left: {
        ...sideSlot(`${surface}_sticky_vrec_left`, `${label} left rail`),
        sizes: options.sideRailSizes ?? SIDE_RAIL_SIZES,
      },
      right: {
        ...sideSlot(`${surface}_sticky_vrec_right`, `${label} right rail`),
        sizes: options.sideRailSizes ?? SIDE_RAIL_SIZES,
      },
    },
    ...(inContent.length ? { inContent } : {}),
  };
}

function landingPage(surface: string, label: string): AdRouteConfig {
  return {
    enabled: true,
    inContent: getMobileRailSlots(surface, label),
    preferredSideRail: 'left',
    reserveLeftRail: false,
    sideRailAnchorMaxWidth: 1536,
    sideRailAnchorSelectors: ['.hero-content', '.quick-links'],
    sideRailVerticalAnchorSelectors: ['.hero'],
    sideRails: {
      left: {
        ...sideSlot(`${surface}_sticky_vrec_left`, `${label} left rail`),
        sizes: SIDE_RAIL_SIZES,
      },
      right: {
        ...sideSlot(`${surface}_sticky_vrec_right`, `${label} right rail`),
        sizes: SIDE_RAIL_SIZES,
      },
    },
  };
}

function resolveFuseId(placement: string): string {
  const slots = environment.fuse.slots as Record<string, string>;
  return slots[placement]?.trim() ?? '';
}

function normalizePath(url: string): string {
  const clean = (url || '/').split('?')[0].split('#')[0];
  return clean.startsWith('/') ? clean : `/${clean}`;
}
