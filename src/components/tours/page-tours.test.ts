import { describe, expect, it, vi } from 'vitest';
import { pageTourForUrl, pageStepIds, tourSteps } from './page-tours';
import { tourAudience, TOUR_AUDIENCE_KEY } from './tour-state';

describe('Angular page tours', () => {
  it('preserves route matching, all 90 ordered page steps, and the fallback', () => {
    const urls = ['/', '/database?filters=x', '/circles/', '/rankings?tab=gains', '/activity/42', '/tierlist', '/tools', '/timeline?tab=timeline', '/timeline?tab=carat-planner#plans'];
    expect(urls.map(pageTourForUrl)).toEqual(['home','database','clubs','rankings','activity','tierlist','tools','timeline','carat-planner']);
    expect(['/profile/42','/circles/42','/tools/statistics'].map(pageTourForUrl)).toEqual([undefined,undefined,undefined]);
    expect(Object.values(pageStepIds).map(ids => ids.length)).toEqual([8,28,8,6,11,7,5,11,6]);
    const ids = Object.values(pageStepIds).flat();
    expect(new Set(ids).size).toBe(90);
    expect(tourSteps.map(step => step.stepId).sort()).toEqual([...ids,'replay'].sort());
  });
  it('preserves established-visitor signals and the original audience key, including denied storage', () => {
    localStorage.clear();
    expect(tourAudience(localStorage)).toBe('new');
    expect(localStorage.getItem(TOUR_AUDIENCE_KEY)).toBe('new');
    localStorage.setItem('cookie-consent', '{}');
    expect(tourAudience(localStorage)).toBe('new');
    localStorage.removeItem(TOUR_AUDIENCE_KEY);
    expect(tourAudience(localStorage)).toBe('existing');
    localStorage.clear(); localStorage.setItem('resource-meta:characters', '');
    expect(tourAudience(localStorage)).toBe('existing');
    expect(tourAudience(new Proxy({} as Storage, { get() { throw new Error('Storage denied'); } }))).toBe('new');
    localStorage.clear();
    const denied = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('Storage denied'); });
    try { expect(tourAudience()).toBe('new'); } finally { denied.mockRestore(); }
  });
});
