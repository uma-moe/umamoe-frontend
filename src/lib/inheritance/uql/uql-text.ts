/** Apostrophes inside readable names (King's, L'Arc) are not SQL quotes. */
export function isUqlQuoteStart(text: string, index: number): boolean {
  const character = text.charAt(index);
  return (
    character === '"' ||
    (character === "'" && !/[A-Za-z0-9_\u00C0-\uFFFF]/.test(text.charAt(index - 1)))
  );
}

export function findUqlStringEnd(text: string, start: number): number {
  const quote = text.charAt(start);
  for (let index = start + 1; index < text.length; index++) {
    if (text.charAt(index) !== quote) continue;
    if (text.charAt(index + 1) === quote) index++;
    else return index + 1;
  }

  return text.length;
}

export function replaceOutsideUqlStrings(
  query: string,
  replace: (segment: string) => string
): string {
  let result = '',
    start = 0;

  for (let index = 0; index < query.length; index++) {
    if (!isUqlQuoteStart(query, index)) continue;
    const end = findUqlStringEnd(query, index);
    result += replace(query.slice(start, index)) + query.slice(index, end);
    start = end;
    index = end - 1;
  }

  return result + replace(query.slice(start));
}

export function maskUqlStrings(query: string): string {
  let result = '',
    start = 0;

  for (let index = 0; index < query.length; index++) {
    if (!isUqlQuoteStart(query, index)) continue;
    const end = findUqlStringEnd(query, index);
    result += query.slice(start, index) + ' '.repeat(end - index);
    start = end;
    index = end - 1;
  }

  return result + query.slice(start);
}

export function uqlDelimiterIssue(
  query: string
): { state: 'incomplete' | 'invalid'; message: string } | null {
  const stack: string[] = [];
  let quote = '';
  for (let index = 0; index < query.length; index++) {
    const character = query.charAt(index);
    if (quote) {
      if (character === quote && query[index + 1] === quote) index++;
      else if (character === quote) quote = '';
      continue;
    }

    if (isUqlQuoteStart(query, index)) {
      quote = character;
      continue;
    }

    if (character === '(' || character === '[') stack.push(character);
    if (character === ')' || character === ']') {
      const expected = character === ')' ? '(' : '[';
      if (stack.pop() !== expected)
        return {
          state: 'invalid',
          message: `Unexpected closing ${character === ')' ? 'parenthesis' : 'bracket'}`
        };
    }
  }

  if (quote) return { state: 'incomplete', message: 'Finish the string literal' };

  if (stack.length)
    return {
      state: 'incomplete',
      message: stack.at(-1) === '(' ? 'Close the parentheses' : 'Close the brackets'
    };

  return null;
}
