import type { IconName } from '@/components/icon-types';
import type { NavigationItem, NavigationSubItem } from '@/components/navigation/navigation-types';
import type { PageWidth } from '@/layouts/breakpoints';
import featureManifest from '../../contracts/features.json';
import { toolLinks } from './tool-links';

export type RouteGroup = 'main' | 'community' | 'competitive' | 'research' | 'tools' | 'system';

export const navigationBadges: Readonly<Record<string, 'New' | 'Updated' | undefined>> = {
  '/competitive': 'New',
  '/competitive/race-analysis': 'New',
  '/competitive/cm-data': 'New',
  '/research': 'New',
  '/tools': 'New',
  '/simulator/race': 'New',
  '/tools/skill-explorer': 'New',
  '/simulator/hp': 'New',
  '/simulator/skills': 'New',
  '/tools/master-data': 'New'
};

export interface AppRouteDefinition {
  id: string;
  path: string;
  title: string;
  description: string;
  icon: IconName;
  group: RouteGroup;
  width: PageWidth;
  navigation: 'primary' | 'secondary' | 'hidden';
  source: 'moe' | 'hakuraku' | 'merged';
  adSurface: string | null;
}

export const appRoutes: readonly AppRouteDefinition[] = featureManifest.features.map((feature) => ({
  id: feature.id,
  path: feature.path,
  title: feature.title,
  description: feature.description,
  icon: feature.icon as IconName,
  group: feature.group as RouteGroup,
  width: feature.width as PageWidth,
  navigation: feature.navigation as AppRouteDefinition['navigation'],
  source: feature.source as AppRouteDefinition['source'],
  adSurface: feature.adSurface
}));

function pathMatches(routePath: string, pathname: string): boolean {
  if (routePath === '/') return pathname === '/';
  return pathname === routePath || pathname.startsWith(`${routePath}/`);
}

export function routeDefinitionForPath(pathname: string): AppRouteDefinition | undefined {
  return [...appRoutes]
    .sort((left, right) => right.path.length - left.path.length)
    .find((definition) => pathMatches(definition.path, pathname));
}

function directItem(definition: AppRouteDefinition, pathname: string): NavigationItem {
  return {
    id: definition.id,
    label: definition.title,
    href: definition.path,
    icon: definition.icon,
    badge: navigationBadges[definition.path],
    current: pathMatches(definition.path, pathname)
  };
}

function routesByIds(ids: readonly string[]): AppRouteDefinition[] {
  return ids.flatMap((id) => {
    const route = appRoutes.find((candidate) => candidate.id === id);
    return route ? [route] : [];
  });
}

// The logo remains the Home affordance; tool pages stay under their section. The order
// follows the home page links; Veterans and Activity sit beside their closest section.
const mainRouteIds = [
  'database',
  'veterans',
  'competitive',
  'tools',
  'timeline',
  'clubs',
  'rankings',
  'activity',
  'research'
] as const;

export function navigationForPath(
  pathname: string,
  search = ''
): { main: NavigationItem[]; mobileMore: NavigationItem[] } {
  const plannerActive =
    pathname === '/timeline' && new URLSearchParams(search).get('tab') === 'carat-planner';

  const plannerHref = '/timeline?tab=carat-planner';
  const planner: NavigationSubItem = {
    id: 'carat-planner',
    label: 'Carat Planner',
    href: plannerHref,
    current: plannerActive,
    badge: navigationBadges[plannerHref]
  };

  const main = routesByIds(mainRouteIds).map((route) => {
    const item = directItem(route, pathname);
    const children: NavigationSubItem[] =
      route.id === 'tools'
        ? toolLinks.map((tool) => {
            if (tool.id === 'carat-planner') return planner;

            return {
              id: tool.id,
              label: tool.title,
              href: tool.href,
              badge: navigationBadges[tool.href],
              current: pathMatches(tool.href, pathname)
            };
          })
        : appRoutes
            .filter(
              (child) => child.navigation === 'secondary' && child.path.startsWith(`${route.path}/`)
            )
            .map((child) => directItem(child, pathname));

    if (children.some((child) => child.current)) item.current = true;

    if (route.id === 'timeline')
      children.push(
        {
          id: 'events',
          label: 'Events',
          href: '/timeline?tab=timeline',
          current: item.current && !plannerActive
        },
        planner
      );
    return { ...item, children, expanded: item.current && children.length > 0 };
  });

  const mobilePrimaryIds = new Set<string>(mobilePrimaryRouteIds);
  const mobileMore = main.filter((item) => !mobilePrimaryIds.has(item.id));
  return { main, mobileMore };
}

export const mobilePrimaryRouteIds = ['database', 'clubs', 'rankings', 'activity'] as const;
