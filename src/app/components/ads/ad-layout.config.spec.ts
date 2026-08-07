import { getAdRouteConfig } from './ad-layout.config';

describe('ad layout config', () => {
  it('never reserves database width for a side rail', () => {
    expect(getAdRouteConfig('/database').reserveLeftRail).toBeFalse();
    expect(getAdRouteConfig('/database?tab=bookmarks').reserveLeftRail).toBeFalse();
  });
});
