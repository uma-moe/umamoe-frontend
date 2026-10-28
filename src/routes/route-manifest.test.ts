import { describe, expect, it } from 'vitest';
import featureManifest from '../../contracts/features.json';
import { appRoutes, navigationForPath, routeDefinitionForPath } from './route-manifest';

describe('Application route manifest', () => {
  it('uses the versioned feature contract as its single source', () => {
    expect(appRoutes).toHaveLength(featureManifest.features.length);
    expect(appRoutes.map((route) => route.id)).toEqual(
      featureManifest.features.map((feature) => feature.id)
    );
  });

  it('exposes the standalone Veterans destination alongside existing product navigation', () => {
    const navigation = navigationForPath('/database');
    expect(navigation.main.map((item) => item.id)).toEqual([
      'database',
      'veterans',
      'competitive',
      'tools',
      'timeline',
      'clubs',
      'rankings',
      'activity',
      'research'
    ]);
    expect(navigation.mobileMore.map((item) => item.id)).toEqual([
      'veterans',
      'competitive',
      'tools',
      'timeline',
      'research'
    ]);
    expect(navigation.main.find((item) => item.id === 'database')?.current).toBe(true);
    expect(navigation.main.some((item) => item.id === 'statistics')).toBe(false);
    expect(navigation.main.some((item) => item.id === 'lineage-planner')).toBe(false);
    expect(
      appRoutes.filter((route) => route.source === 'hakuraku').map((route) => route.id)
    ).toEqual(['competitive', 'race-analysis', 'cm-data', 'master-data', 'research']);
  });

  it('assigns only the two approved page widths', () => {
    expect(new Set(appRoutes.map((route) => route.width))).toEqual(new Set(['normal', 'wide']));
    expect(routeDefinitionForPath('/tools')?.width).toBe('normal');
    expect(routeDefinitionForPath('/database')?.width).toBe('wide');
  });

  it('groups tools and highlights the selected Timeline tab, including history URLs', () => {
    const tools = navigationForPath('/tools/lineage-planner').main.find(
      (item) => item.id === 'tools'
    )!;

    expect(tools.children?.map((child) => child.href)).toEqual([
      '/tools/statistics',
      '/tools/lineage-planner',
      '/tools/skill-explorer',
      '/tools/master-data',
      '/simulator/skills',
      '/timeline?tab=carat-planner'
    ]);
    expect(tools.expanded).toBe(true);
    expect(tools.children?.filter((child) => child.current).map((child) => child.id)).toEqual([
      'lineage-planner'
    ]);
    for (const search of ['', '?tab=timeline', '?tab=carat-planner&banner=example']) {
      const timeline = navigationForPath('/timeline', search).main.find(
        (item) => item.id === 'timeline'
      )!;

      expect(timeline.children?.filter((child) => child.current).map((child) => child.id)).toEqual([
        search.includes('carat-planner') ? 'carat-planner' : 'events'
      ]);
    }
  });

  it('groups the migrated race pages under Competitive and keeps Research separate', () => {
    const navigation = navigationForPath('/competitive/cm-data').main;
    const competitive = navigation.find((item) => item.id === 'competitive')!;
    expect(competitive.expanded).toBe(true);
    expect(competitive.children?.filter((item) => item.current).map((item) => item.id)).toEqual([
      'cm-data'
    ]);
    expect(competitive.children?.map((item) => item.id)).toEqual(['race-analysis', 'cm-data']);
    expect(routeDefinitionForPath('/research/spot-struggle')?.id).toBe('research');
  });

  it('keeps the Build Optimizer selected under Tools at its simulator URL', () => {
    const navigation = navigationForPath('/simulator/skills');
    const tools = navigation.main.find((item) => item.id === 'tools');

    expect(tools?.current).toBe(true);
    expect(tools?.expanded).toBe(true);
    expect(tools?.children?.filter((child) => child.current).map((child) => child.id)).toEqual([
      'build-optimizer'
    ]);
    expect(routeDefinitionForPath('/simulator/skills')?.id).toBe('build-optimizer');
  });

  it('excludes the support card tierlist from all product routes and navigation', () => {
    const navigation = navigationForPath('/');

    expect(appRoutes.some((route) => route.path === '/tierlist')).toBe(false);
    expect(navigation.main.some((item) => item.id === 'tierlist')).toBe(false);
    expect(navigation.mobileMore.some((item) => item.id === 'tierlist')).toBe(false);
  });
});
