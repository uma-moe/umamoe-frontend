import { createRouter } from 'sv-router';
import { writable } from 'svelte/store';
import type { Component } from 'svelte';
import DeferredPage from './DeferredPage.svelte';
import TimelinePage from '@/pages/timeline/TimelinePage.svelte';
import HomePage from '@/pages/home/HomePage.svelte';
import LegacyRedirectPage from './LegacyRedirectPage.svelte';
import { pendingPageRequests, whenPageRequestsIdle } from '@/services/http/page-request';

type PageLoader = () => Promise<{ default: Component }>;
declare module 'sv-router' { interface RouteMeta { loadPage?: PageLoader; } }

// Angular accepts backend OAuth redirects on any page, including /?token=….
// Route those through the same callback before the router reads the initial URL.
if (typeof location !== 'undefined' && location.pathname !== '/signin') {
  const token = new URLSearchParams(location.search).get('token');
  if (token) history.replaceState(history.state, '', `/signin?${new URLSearchParams({ token })}`);
}

export const pendingRoute = writable<string | null>(null);

function preloadPageData({ pathname }: { pathname: string }): void {
  if (pathname === '/timeline') void import('@/pages/timeline/timeline-repository').then(({ timelineRepository }) => timelineRepository.load()).catch(() => {});
  if (pathname === '/tools/statistics') void import('@/pages/statistics/statistics-repository').then(async ({ statisticsRepository }) => {
    await Promise.all([statisticsRepository.catalog(), statisticsRepository.datasets().then(datasets => datasets[0] && statisticsRepository.global(datasets[0]))]);
  }).catch(() => {});
}

// Public URLs stay stable; each page owns its lazy-loaded implementation.
const pageModules = {
  '/competitive': () => import('@/pages/competitive/CompetitivePage.svelte'),
  '/competitive/race-analysis': () => import('@/pages/race-analysis/RaceAnalysisPage.svelte'),
  '/competitive/cm-data': () => import('@/pages/competitive/CmDataPage.svelte'),
  '/tools/master-data': () => import('@/pages/tools/MasterDataPage.svelte'),
  '/research': () => import('@/pages/research-notes/ResearchPage.svelte'),
  '/research/:noteId': () => import('@/pages/research-notes/ResearchPage.svelte'),
  '/database': () => import('@/pages/database/DatabasePage.svelte'),
  '/circles': () => import('@/pages/clubs/ClubsPage.svelte'),
  '/circles/:id/:exportFormat': () => import('@/pages/clubs/ClubDetailsPage.svelte'),
  '/circles/:id': () => import('@/pages/clubs/ClubDetailsPage.svelte'),
  '/rankings': () => import('@/pages/rankings/RankingsPage.svelte'),
  '/activity/:viewerId': () => import('@/pages/activity/ActivityPage.svelte'),
  '/activity': () => import('@/pages/activity/ActivityPage.svelte'),
  '/tierlist': () => import('@/pages/tierlist/TierlistPage.svelte'),
  '/tools/statistics': () => import('@/pages/statistics/StatisticsPage.svelte'),
  '/tools/lineage-planner': () => import('@/pages/lineage-planner/LineagePlannerPage.svelte'),
  '/tools': () => import('@/pages/tools/ToolsPage.svelte'),
  '/privacy-policy': () => import('@/pages/privacy/PrivacyPage.svelte'),
  '/login': () => import('@/pages/auth/LoginPage.svelte'),
  '/signin': () => import('@/pages/auth/AuthCallbackPage.svelte'),
  '/veterans': () => import('@/pages/veterans/VeteransBrowserPage.svelte'),
  '/veterans/:accountId': () => import('@/pages/veterans/ProfileVeteransPage.svelte'),
  '/profile/:accountId/veterans': () => import('./LegacyRedirectPage.svelte'),
  '/profile/:accountId/cm': () => import('@/pages/cm-logs/CmLogsPage.svelte'),
  '/profile/:accountId/achievements': () => import('@/pages/profile/ProfilePlaceholderPage.svelte'),
  '/profile/:accountId/titles': () => import('@/pages/profile/ProfilePlaceholderPage.svelte'),
  '/profile/:accountId': () => import('@/pages/profile/ProfilePage.svelte'),
  '/settings': () => import('@/pages/settings/SettingsPage.svelte'),
  '/wip': () => import('@/pages/errors/WipPage.svelte'),
  '/inheritance': () => import('./LegacyRedirectPage.svelte'),
  '/support-cards': () => import('./LegacyRedirectPage.svelte'),
  '/shame/:viewerId': () => import('./LegacyRedirectPage.svelte'),
  '/shame': () => import('./LegacyRedirectPage.svelte')
} as const;

let warmingPages = false;
function warmPageModules(): void {
  if (warmingPages) return;
  warmingPages = true;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  // Import code only, not page data. Native modules and hashed HTTP assets are
  // reused on navigation; one import per idle turn keeps startup/input first.
  const pages = [...Object.values(pageModules), () => import('@/pages/timeline/TimelineContent.svelte')];
  // The planner shares its pickers with Database and Veterans.
  pages.unshift(pageModules['/tools/lineage-planner']);
  function next(): void {
    const run = () => {
      if (document.hidden) { document.addEventListener('visibilitychange', next, { once: true }); return; }
      // An idle CPU can still have critical data or page code in flight.
      if (pendingPageRequests) { void whenPageRequestsIdle().then(next); return; }
      const load = pages.shift();
      if (load) void load().catch(() => {}).finally(next);
    };
    if (!pages.length) return;
    if ('requestIdleCallback' in window) window.requestIdleCallback(run);
    else setTimeout(run, 100);
  }
  requestAnimationFrame(() => requestAnimationFrame(next));
}

// The router commits the URL and frame without fetching page code. It resolves inside
// DeferredPage, so an uncached chunk cannot hold the old route on screen.
const pageRoutes = Object.fromEntries(Object.entries(pageModules).map(([path, loadPage]) => [path, {
  meta: { loadPage }, '/': DeferredPage
}])) as { [Path in keyof typeof pageModules]: { meta: { loadPage: PageLoader }; '/': typeof DeferredPage } };

// sv-router detects lazy routes by searching the function body for import().
// Timeline is eager; its nested content imports must not be mistaken for a loader.
const TimelineRoute: typeof TimelinePage = (anchor, props) => TimelinePage(anchor, props);

const productRoutes = {
  hooks: {
    beforeLoad: (context: { pathname: string }) => { pendingRoute.set(context.pathname); preloadPageData(context); },
    afterLoad: () => { pendingRoute.set(null); warmPageModules(); void import('@/lib/catalog/resource-repository').then(({ resourceRepository }) => resourceRepository.revalidate()).catch(() => {}); },
    onError: () => { pendingRoute.set(null); },
    onPreload: (context: { pathname: string; meta: { loadPage?: PageLoader } }) => {
      preloadPageData(context);
      void context.meta.loadPage?.().catch(() => {});
    }
  },
  ...pageRoutes,
  '/': HomePage,
  '/timeline': TimelineRoute,
  '*': LegacyRedirectPage
} as const;

// The gallery is available by direct URL only and stays out of the initial bundle.
export const router = createRouter({
  ...productRoutes,
  '/ui': { meta: { loadPage: () => import('@/pages/ui/UiLabPage.svelte') }, '/': DeferredPage },
  '/ui-lab': { meta: { loadPage: () => import('@/pages/ui/UiLabPage.svelte') }, '/': DeferredPage }
});
