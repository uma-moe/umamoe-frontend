import { ElementRef } from '@angular/core';
import { DatabaseFilterComponent } from './database-filter.component';

describe('DatabaseFilterComponent white category filters', () => {
  let component: DatabaseFilterComponent;

  beforeEach(() => {
    component = new DatabaseFilterComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      new ElementRef(document.createElement('div')),
      {
        run: (callback: () => unknown) => callback(),
        runOutsideAngular: (callback: () => unknown) => callback(),
      } as any,
      { markForCheck: () => undefined } as any,
      {} as any,
    );
  });

  it('keeps only one compact category editor open', () => {
    component.toggleWhiteCategory('common');
    expect(component.expandedWhiteCategory).toBe('common');

    component.toggleWhiteCategory('race');
    expect(component.expandedWhiteCategory).toBe('race');

    component.toggleWhiteCategory('race');
    expect(component.expandedWhiteCategory).toBeNull();

    component.toggleWhiteCategory('scenario', 'main');
    expect(component.expandedMainWhiteCategory).toBe('scenario');
    expect(component.expandedWhiteCategory).toBeNull();
  });

  it('summarizes and serializes count and star minimums per category', () => {
    component.filterMode = 'advanced';
    component.filterState.min_common_white_count = 2;
    component.filterState.min_common_white_stars_sum = 5;
    component.filterState.min_scenario_white_count = 1;
    component.filterState.min_race_white_stars_sum = 4;
    component.filterState.min_main_common_white_count = 1;
    component.filterState.min_main_common_white_stars_sum = 3;

    expect(component.getWhiteCategorySummary('common')).toBe('2+ factors · 5★+');
    expect(component.getWhiteCategorySummary('scenario')).toBe('1+ factors');
    expect(component.getWhiteCategorySummary('race')).toBe('4★+');
    expect(component.getWhiteCategorySummary('common', 'main')).toBe('1+ factors · 3★+');
    expect(component.getWhiteCategoryTabSummary('common', 'main')).toBe('1 / 3★');

    const serialized = component.getSerializedState({ includeP2Context: false });
    const decoded = JSON.parse(
      decodeURIComponent(
        Array.from(atob(serialized), character =>
          `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`,
        ).join(''),
      ),
    );
    expect(decoded).toEqual(jasmine.objectContaining({
      cwc: 2,
      cws: 5,
      swc: 1,
      rws: 4,
      mcwc: 1,
      mcws: 3,
    }));
  });

  it('compiles friendly category fields into backend UQL fields', () => {
    component.uqlQuery = 'Common white count >= 2 and Scenario white stars >= 3 and Race white count >= 4 and Main common white count >= 1';

    const compiled = (component as any).getCompiledUqlQuery();

    expect(compiled).toBe(
      'common_white_count >= 2 and scenario_white_stars_sum >= 3 and race_white_count >= 4 and main_common_white_count >= 1',
    );
  });
});
