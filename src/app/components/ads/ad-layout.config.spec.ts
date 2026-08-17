import { getInContentSlot, getMobileRailSlot } from './ad-layout.config';

describe('ad layout in-content Fuse ID rotation', () => {
  it('uses each configured Fuse ID before wrapping a four-ID surface', () => {
    expect(getInContentSlot('home', 'home', 1).fuseId).toBe('leaderboard_incontent_1');
    expect(getInContentSlot('home', 'home', 2).fuseId).toBe('leaderboard_incontent_2');
    expect(getInContentSlot('home', 'home', 3).fuseId).toBe('leaderboard_incontent_3');
    expect(getInContentSlot('home', 'home', 4).fuseId).toBe('leaderboard_incontent_4');
    expect(getInContentSlot('home', 'home', 5).fuseId).toBe('leaderboard_incontent_1');
    expect(getInContentSlot('home', 'home', 6).fuseId).toBe('leaderboard_incontent_2');
  });

  it('only wraps after the eighth configured Database Fuse ID', () => {
    expect(getMobileRailSlot('database', 'database', 8).fuseId).toBe('database_incontent_8');
    expect(getMobileRailSlot('database', 'database', 9).fuseId).toBe('database_incontent_1');
    expect(getMobileRailSlot('database', 'database', 10).fuseId).toBe('database_incontent_2');
  });

  it('keeps the requested placement index when its Fuse ID wraps', () => {
    const slot = getInContentSlot('home', 'home', 5);

    expect(slot.placement).toBe('home_interscroller_5');
    expect(slot.label).toBe('home in-content 5');
    expect(slot.fuseId).toBe('leaderboard_incontent_1');
  });

  it('returns no Fuse ID when the surface has no configured in-content IDs', () => {
    expect(getInContentSlot('unknown', 'unknown', 1).fuseId).toBe('');
  });
});
