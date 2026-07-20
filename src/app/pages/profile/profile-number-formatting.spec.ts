import { ProfileComponent } from './profile.component';
import { ProfileHeaderComponent } from './profile-header/profile-header.component';

describe('profile number formatting', () => {
  const profileComponent = new ProfileComponent(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  const headerComponent = new ProfileHeaderComponent({} as any, {} as any);

  it('renders nullable API values without throwing', () => {
    expect(profileComponent.formatNumber(null)).toBe('-');
    expect(profileComponent.formatNumber(undefined)).toBe('-');
    expect(profileComponent.formatRank(null)).toBe('-');
    expect(headerComponent.formatNumber(null)).toBe('-');
  });

  it('preserves regular and compact number formatting', () => {
    expect(profileComponent.formatNumber(1234)).toBe((1234).toLocaleString());
    expect(profileComponent.formatNumber(123456)).toBe('123.5K');
    expect(headerComponent.formatNumber(123456)).toBe('123.5K');
  });
});