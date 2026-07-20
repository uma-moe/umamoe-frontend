import { DatabaseFilterComponent } from './database-filter.component';

describe('DatabaseFilterComponent UQL compilation', () => {
  const createComponent = (): DatabaseFilterComponent => new DatabaseFilterComponent(
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
  );

  const factors = [
    { id: '9001', text: 'Uma Stan', type: 2 },
    { id: '9002', text: 'Racing Spirit: Stamina', type: 2 },
    { id: '9003', text: 'Racing Spirit: Stamina +', type: 2 },
    { id: '9004', text: 'Racing Spirit: Wit', type: 2 },
    { id: '9005', text: 'Racing Spirit: Wit +', type: 2 },
  ];

  const validate = (component: DatabaseFilterComponent, query: string): string => {
    component.uqlQuery = query;
    (component as any).validateUqlQuery();
    expect(component.uqlValidationState).withContext(component.uqlValidationMessage).toBe('valid');
    expect(component.compiledUqlQuery).not.toContain('Uma Stan');
    expect(component.compiledUqlQuery).not.toContain('Racing Spirit');
    return component.compiledUqlQuery;
  };

  it('only exposes released scenarios in the picker', () => {
    const component = createComponent();

    expect(component.scenarioOptions).toEqual([
      { id: 1, name: 'URA' },
      { id: 2, name: 'Aoharu' },
      { id: 3, name: 'MANT' },
    ]);
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
