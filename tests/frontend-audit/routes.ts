export interface AuditedRoute {
  path: string;
  expectedPath?: RegExp;
  guarded?: boolean;
}

/** Every public route, redirect, parameterized route, profile child and guard. */
export const auditedRoutes: AuditedRoute[] = [
  { path: '/' },
  { path: '/inheritance', expectedPath: /\/database$/ },
  { path: '/support-cards', expectedPath: /\/database$/ },
  { path: '/database' },
  { path: '/circles' },
  { path: '/circles/audit-circle' },
  { path: '/circles/audit-circle/csv' },
  { path: '/rankings' },
  { path: '/activity' },
  { path: '/activity/audit-viewer' },
  { path: '/shame', expectedPath: /\/activity$/ },
  { path: '/shame/audit-viewer', expectedPath: /\/activity\/audit-viewer$/ },
  { path: '/timeline' },
  { path: '/timeline?tab=carat-planner' },
  { path: '/tierlist' },
  { path: '/tools' },
  { path: '/tools/statistics' },
  { path: '/tools/lineage-planner' },
  { path: '/wip' },
  { path: '/privacy-policy' },
  { path: '/login' },
  { path: '/signin' },
  { path: '/profile/audit-account' },
  { path: '/profile/audit-account/veterans' },
  { path: '/profile/audit-account/cm' },
  { path: '/profile/audit-account/achievements' },
  { path: '/profile/audit-account/titles' },
  { path: '/settings', expectedPath: /\/login(?:\?.*)?$/, guarded: true },
  { path: '/definitely-not-a-route', expectedPath: /\/$/ },
];
