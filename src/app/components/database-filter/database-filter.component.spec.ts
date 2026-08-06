import { ElementRef } from '@angular/core';
import { DatabaseFilterComponent } from './database-filter.component';

describe('DatabaseFilterComponent', () => {
  const scenarioNames: Record<number, string> = {
    1: 'URA Finals',
    2: 'Unity Cup',
    3: 'Grand Concert',
    4: 'Trackblazer',
    5: 'Grand Masters',
    6: 'Project L’Arc',
    7: 'U.A.F.',
    8: 'Great Food Festival',
    9: 'Run! Mecha Umamusume',
    10: 'The Twinkle Legends',
    11: 'Design Your Island',
    12: 'The Everlasting Yukoma Hot Springs',
    13: 'Beyond Dreams',
  };

  const createComponent = (): DatabaseFilterComponent => new DatabaseFilterComponent(
    {} as any,
    {
      getFactorImageUrl: () => undefined,
      getScenarioName: (id: number) => scenarioNames[id] ?? `Scenario ${id}`,
      getScenarioLogoUrl: () => undefined,
    } as any,
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

  const factors = [
    { id: '9001', text: 'Uma Stan', type: 2 },
    { id: '9002', text: 'Racing Spirit: Stamina', type: 2 },
    { id: '9003', text: 'Racing Spirit: Stamina +', type: 2 },
    { id: '9004', text: 'Racing Spirit: Wit', type: 2 },
    { id: '9005', text: 'Racing Spirit: Wit +', type: 2 },
    { id: '9006', text: 'Groundwork', type: 2 },
    { id: '9007', text: 'Ignited Spirit WIT', type: 2 },
    { id: '9100', text: 'Visible Unique', type: 5 },
  ];

  const validate = (component: DatabaseFilterComponent, query: string): string => {
    component.uqlQuery = query;
    (component as any).validateUqlQuery();
    expect(component.uqlValidationState).withContext(component.uqlValidationMessage).toBe('valid');
    expect(component.compiledUqlQuery).not.toContain('Uma Stan');
    expect(component.compiledUqlQuery).not.toContain('Racing Spirit');
    return component.compiledUqlQuery;
  };

  describe('white category filters', () => {
    let component: DatabaseFilterComponent;

    beforeEach(() => {
      component = createComponent();
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

  describe('clearing filters', () => {
    afterEach(() => {
      localStorage.removeItem(DatabaseFilterComponent.SAVED_FILTER_STATE_KEY);
      localStorage.removeItem(DatabaseFilterComponent.SAVED_FILTER_MODE_KEY);
    });

    it('does not restore structured filters after a cleared UQL query', () => {
      const component = createComponent();
      component.blueFactorFilters = [{ uuid: 'speed', factorId: 1, min: 3, max: 9 }];
      component.onFilterChange();

      component.filterMode = 'uql';
      component.uqlQuery = 'Wins >= 30';
      component.onUqlChange();

      // This also covers deleting all text in the editor rather than using
      // the Clear current button.
      component.uqlQuery = '';
      component.onUqlChange();
      component.setFilterMode('advanced');

      expect(component.blueFactorFilters).toEqual([]);
      expect(component.uqlQuery).toBe('');
      expect(component.getSerializedState()).toBe('');

      const saved = JSON.parse(localStorage.getItem(DatabaseFilterComponent.SAVED_FILTER_STATE_KEY) || '{}');
      expect(saved.formState).toBe('');
      expect(saved.uqlState).toBe('');
    });

    it('clears both representations through Clear current', () => {
      const component = createComponent();
      component.filterMode = 'uql';
      component.blueFactorFilters = [{ uuid: 'speed', factorId: 1, min: 3, max: 9 }];
      component.uqlQuery = 'Wins >= 30';

      component.clearCurrentFilters();
      component.setFilterMode('advanced');

      expect(component.blueFactorFilters).toEqual([]);
      expect(component.uqlQuery).toBe('');
      expect(component.getSerializedState()).toBe('');
    });
  });

  describe('UQL compilation', () => {
    it('exposes every supported one-based scenario ID independently', () => {
      const component = createComponent();

      expect(component.scenarioOptionIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
      component.onScenarioSelectionChange([1, 3, 4]);
      expect(component.filterState.scenario_id).toEqual([1, 3, 4]);
    });

    it('compiles a scenario display name to its API ID', () => {
      const component = createComponent();
      component.uqlQuery = 'Scenario = URA Finals';

      expect((component as any).getCompiledUqlQuery()).toBe('scenario_id = 1');
    });

    it('compiles a single parenthesized Main has clause before Main has any clauses', () => {
      const component = createComponent();
      (component as any).setFactorOptions(factors);

      const compiled = validate(
        component,
        'Main Dirt >= 2 and Main has (Uma Stan) and Main has any (Racing Spirit: Stamina, Racing Spirit: Stamina +) and Main has any (Racing Spirit: Wit, Racing Spirit: Wit +)',
      );

      expect(compiled).toContain('main_pink_factors');
      expect(compiled).toContain('main_white_factors');
    });

    it('compiles the same clauses when the single Main has clause is last', () => {
      const component = createComponent();
      (component as any).setFactorOptions(factors);

      validate(
        component,
        'Main Dirt >= 2 and Main has any (Racing Spirit: Stamina, Racing Spirit: Stamina +) and Main has any (Racing Spirit: Wit, Racing Spirit: Wit +) and Main has (Uma Stan)',
      );
    });

    it('compiles an explicit three-way skill match for every lineage slot', () => {
      const component = createComponent();
      (component as any).setFactorOptions(factors);

      const compiled = validate(
        component,
        'Main has all (Groundwork, Ignited Spirit WIT) and GP1 has all (Groundwork, Ignited Spirit WIT) and GP2 has all (Groundwork, Ignited Spirit WIT)',
      );

      expect(compiled).toContain('main_white_factors');
      expect(compiled).toContain('left_white_factors');
      expect(compiled).toContain('right_white_factors');
    });

    it('exposes scoped green-factor properties in UQL autocomplete', () => {
      const component = createComponent();

      (component as any).setFactorOptions(factors);

      expect(component.uqlSuggestions.some(suggestion =>
        suggestion.kind === 'field' && suggestion.label === 'Main Visible Unique',
      )).toBeTrue();
    });

    it('revalidates restored UQL when factor data becomes available', () => {
      const component = createComponent();
      component.filterMode = 'uql';
      component.uqlQuery = 'Main has (Uma Stan)';
      const onUqlChange = spyOn(component, 'onUqlChange');

      (component as any).setFactorOptions(factors);

      expect(onUqlChange).toHaveBeenCalledWith({ emitImmediately: true, persist: false });
    });

    it('maps the white skills amount UQL sort to raw white count', () => {
      const component = createComponent();

      expect((component as any).resolveUqlSort('White skills amount')).toEqual({
        match: 'white_count',
        partial: false,
      });
    });
  });
});
