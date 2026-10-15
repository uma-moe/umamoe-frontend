import { maskUqlStrings } from './uql-text';

export interface UqlSparkHighlight {
  global: Set<number>;
  main: Set<number>;
  left: Set<number>;
  right: Set<number>;
  optionalWhite: Set<number>;
  optionalMainWhite: Set<number>;
  lineageWhite: Set<number>;
}

/** Extract Angular's spark requirements once per compiled query, not once per chip. */
export function buildUqlSparkHighlight(compiled: string): UqlSparkHighlight {
  const highlight: UqlSparkHighlight = {
    global: new Set(),
    main: new Set(),
    left: new Set(),
    right: new Set(),
    optionalWhite: new Set(),
    optionalMainWhite: new Set(),
    lineageWhite: new Set()
  };

  const functions =
    /\b(?:contains|has|overlaps|any|has_all|contains_all|all)\s*\(\s*(?<functionField>\w+)\s*,\s*(?:\((?<functionList>[\d,\s]+)\)|(?<functionId>\d+))\s*\)/;

  const comparisons =
    /\b(?<field>\w+)\s*(?<excluded>not\s+)?(?<operator>in\b|>=|<=|=|>|<)\s*(?:\((?<list>[\d,\s]+)\)|(?<id>\d+)\b)/;

  const scoring =
    /\b(?<scoring>optional_white|optional_main_white|optional_any_white|lineage_white)\s*\(\s*(?:\((?<scoringList>[\d,\s]+)\)|(?<scoringIds>\d+(?:\s*,\s*\d+)*))[^()]*\)/;

  const tokens = new RegExp(
    [functions.source, comparisons.source, scoring.source, '\\b(?:not|and|or)\\b', '[()]'].join(
      '|'
    ),
    'gi'
  );

  const scopes: boolean[] = [];
  let negated = false;
  for (const match of maskUqlStrings(compiled).matchAll(tokens)) {
    const token = match[0].toLowerCase();
    if (token === 'not') {
      negated = true;
      continue;
    }

    if (token === '(') {
      scopes.push(negated);
      negated = false;
      continue;
    }

    if (token === ')') {
      scopes.pop();
      negated = false;
      continue;
    }

    if (token === 'and' || token === 'or') {
      negated = false;
      continue;
    }

    const groups = match.groups!;
    const excluded = negated || scopes.includes(true) || Boolean(groups.excluded);
    negated = false;
    if (excluded) continue;
    const numbers = (value: string) =>
      value
        .split(',')
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0);

    if (groups.scoring) {
      const target =
        groups.scoring.toLowerCase() === 'optional_main_white'
          ? highlight.optionalMainWhite
          : groups.scoring.toLowerCase() === 'lineage_white'
            ? highlight.lineageWhite
            : highlight.optionalWhite;

      numbers(groups.scoringList ?? groups.scoringIds!).forEach((id) => target.add(id));
      continue;
    }

    const field = (groups.functionField ?? groups.field!).toLowerCase();
    if (
      !/^(?:(?:blue|pink|green|white)_sparks|(?:main|left|right)_(?:(?:blue|pink|green|white)_factors|white_sparks)|main_parent_white_sparks)$/.test(
        field
      )
    )
      continue;
    const owner = /^(main|left|right)_/.exec(field)?.[1] as 'main' | 'left' | 'right' | undefined;
    const target = highlight[owner ?? 'global'];
    const ids = numbers(groups.functionList ?? groups.functionId ?? groups.list ?? groups.id!);
    for (const id of ids) {
      const operator = groups.operator;
      if (!operator || operator === '=' || operator.toLowerCase() === 'in') {
        target.add(id);
        continue;
      }

      const factor = Math.floor(id / 10),
        level = id % 10;

      if (!factor) continue;
      for (let stars = 1; stars <= 9; stars++) {
        if (
          operator === '>='
            ? stars >= level
            : operator === '>'
              ? stars > level
              : operator === '<='
                ? stars <= level
                : stars < level
        )
          target.add(factor * 10 + stars);
      }
    }
  }

  return highlight;
}
