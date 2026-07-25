import { InheritanceDisplayStateService } from './inheritance-display-state.service';

describe('InheritanceDisplayStateService', () => {
  it('shares white spark section collapse state', () => {
    const service = new InheritanceDisplayStateService();

    expect(service.isWhiteSectionCollapsed('normal')).toBeFalse();

    service.toggleWhiteSection('normal');
    expect(service.isWhiteSectionCollapsed('normal')).toBeTrue();

    service.toggleWhiteSection('normal');
    expect(service.isWhiteSectionCollapsed('normal')).toBeFalse();
  });

  it('keeps the three white spark sections independent', () => {
    const service = new InheritanceDisplayStateService();

    service.toggleWhiteSection('scenario');

    expect(service.isWhiteSectionCollapsed('scenario')).toBeTrue();
    expect(service.isWhiteSectionCollapsed('normal')).toBeFalse();
    expect(service.isWhiteSectionCollapsed('race')).toBeFalse();
  });
});
