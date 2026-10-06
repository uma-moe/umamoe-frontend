/** Occurrences count parents carrying a factor, independently of its stars. */
export function occurrenceFields(field: string): string[] {
  const color = /^(blue|pink|green|white)_sparks$/.exec(field)?.[1];
  return color ? ['main', 'left', 'right'].map(scope => `${scope}_${color}_factors`) : [field];
}

export function factorPresence(field: string, levels: number[]): string {
  return field.endsWith('_sparks') || field.endsWith('_white_factors')
    ? `overlaps(${field}, (${levels.join(', ')}))`
    : `${field} in (${levels.join(', ')})`;
}

export function occurrenceComparison(factorId: number, fields: string[], operator: string, count: number): string {
  const presence = [...new Set(fields.flatMap(occurrenceFields))].map(field => factorPresence(field, [1, 2, 3].map(level => factorId * 10 + level)));
  const atLeast = (minimum: number): string => {
    if (minimum <= 0) return '(1 = 1)';
    if (minimum > presence.length) return '(1 = 0)';
    const alternatives: string[] = [];
    // There are at most three parent slots (seven nonempty combinations).
    for (let mask = 1; mask < 1 << presence.length; mask++) {
      const terms = presence.filter((_, index) => mask & (1 << index));
      if (terms.length === minimum) alternatives.push(`(${terms.join(' and ')})`);
    }
    return `(${alternatives.join(' or ')})`;
  };
  switch (operator) {
    case '>=': return atLeast(count);
    case '>': return atLeast(count + 1);
    case '<': return `not ${atLeast(count)}`;
    case '<=': return `not ${atLeast(count + 1)}`;
    case '!=': case '<>': return `(${atLeast(count + 1)} or not ${atLeast(count)})`;
    default: return `(${atLeast(count)} and not ${atLeast(count + 1)})`;
  }
}
