import { WhiteFactorTypePickerComponent } from './white-factor-type-picker.component';
import { FactorService } from '../../../services/factor.service';

describe('WhiteFactorTypePickerComponent', () => {
  let component: WhiteFactorTypePickerComponent;

  beforeEach(() => {
    const factorService = {
      getFactorImageUrl: (factor: { factorId?: string }) => {
        if (factor.factorId === '200330') return '/assets/images/skills/utx_ico_skill_20011.webp';
        if (factor.factorId === '200850') return '/assets/images/skills/utx_ico_skill_30011.webp';
        return null;
      },
    } as unknown as FactorService;
    component = new WhiteFactorTypePickerComponent(factorService);
    component.factors = [
      { id: 200330, text: 'Corner Adept ○', type: 3 },
      { id: 200850, text: 'Hesitant Front Runners', type: 3 },
      { id: 100010, text: 'February S.', type: 2 },
      { id: 300010, text: 'URA Finale', type: 4 },
    ];
    component.embedded = true;
    component.ngOnChanges();
  });

  it('groups factors by their skill effect, race, and scenario types', () => {
    expect(component.categories.some(category => category.key === 'speed')).toBeTrue();
    expect(component.categories.some(category => category.key === 'speed-debuff')).toBeTrue();
    expect(component.categories.some(category => category.key === 'race')).toBeTrue();
    expect(component.categories.some(category => category.key === 'scenario')).toBeTrue();
  });

  it('filters factors by a selected effect icon', () => {
    component.toggleCategory('speed-debuff');

    expect(component.isCategorySelected('speed-debuff')).toBeTrue();
    expect(component.matchingFactors.map(factor => factor.id)).toEqual([200850]);
  });

  it('adds a matching factor to the chosen priority group', () => {
    component.toggleCategory('speed-debuff');
    component.priority = 2;
    const emitSpy = spyOn(component.addFactors, 'emit');

    component.addFactor(component.matchingFactors[0]);

    expect(emitSpy).toHaveBeenCalledWith({
      factorIds: [200850],
      priority: 2,
    });
  });

  it('does not add factors that are already selected', () => {
    component.toggleCategory('speed-debuff');
    component.selectedFactors = [{ factorId: 200850 }];
    const emitSpy = spyOn(component.addFactors, 'emit');

    component.addFactor(component.matchingFactors[0]);

    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('removes an already selected factor when selection toggling is enabled', () => {
    component.toggleCategory('speed-debuff');
    component.selectedFactors = [{ factorId: 200850 }];
    component.allowSelectionToggle = true;
    const emitSpy = spyOn(component.removeFactor, 'emit');

    component.addFactor(component.matchingFactors[0]);

    expect(emitSpy).toHaveBeenCalledOnceWith(200850);
  });

  it('shows upgraded factors below normal factors when Special is selected', () => {
    (component as any).browseableFactors = [
      { id: 1, text: 'Normal Special', categoryKey: 'special', searchText: 'normal special' },
      { id: 2, text: 'Upgraded Special', categoryKey: 'special-upgraded', searchText: 'upgraded special' },
    ];

    component.toggleCategory('special');

    expect(component.normalMatchingFactors.map(factor => factor.id)).toEqual([1]);
    expect(component.upgradedMatchingFactors.map(factor => factor.id)).toEqual([2]);
    expect(component.activeCategoryCount).toBe(1);
  });

  it('uses visibility icons as state indicators in Hide Sparks mode', () => {
    const visibleFactor = component.browseableFactors[0];
    component.actionVerb = 'Hide';
    component.allowSelectionToggle = true;

    expect(component.getFactorActionIcon(visibleFactor)).toBe('visibility');

    component.selectedFactors = [{ factorId: visibleFactor.id }];
    expect(component.getFactorActionIcon(visibleFactor)).toBe('visibility_off');
  });
});
