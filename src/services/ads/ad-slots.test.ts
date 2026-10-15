import { expect, it } from 'vitest';
import { adSurfaceForRoute, fuseIdForPlacement } from './ad-slots';

it('uses configured publisher IDs for inline placements, aliases and intentionally disabled rails', () => {
  expect(adSurfaceForRoute('clubs')).toBe('leaderboard');
  expect(fuseIdForPlacement('database_interscroller_1')).toBe('database_incontent_1');
  expect(fuseIdForPlacement('timeline_interscroller_1')).toBe('leaderboard_incontent_1');
  expect(fuseIdForPlacement('statistics_interscroller_1')).toBe('stadiumstat_incontent_1');
  expect(fuseIdForPlacement('statistics_sticky_vrec_right')).toBe('stadiumstat_sticky_vrec_rhs');
  expect(fuseIdForPlacement('statistics_sticky_vrec_left')).toBe('');
  expect(fuseIdForPlacement('unknown_slot')).toBe('');
});
