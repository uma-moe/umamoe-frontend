export type UqlValidationState = 'empty' | 'valid' | 'incomplete' | 'invalid';

export type UqlSuggestionKind =
  'field' | 'operator' | 'function' | 'keyword' | 'value' | 'snippet' | 'punctuation';

export type UqlValueContext =
  | 'character'
  | 'legacy'
  | 'support-card'
  | 'race-saddle'
  | 'rank'
  | 'blue-factor'
  | 'pink-factor'
  | 'green-factor'
  | 'white-factor'
  | 'number'
  | 'text';

export type UqlScopeContext = 'main' | 'gp1' | 'gp2' | 'any-gp';

export type UqlFieldType = 'number' | 'string' | 'array' | 'directive';

export type UqlHighlightKind =
  | 'keyword'
  | 'function'
  | 'field'
  | 'operator'
  | 'number'
  | 'string'
  | 'paren'
  | 'identifier'
  | 'text'
  | 'punct'
  | 'ghost'
  | 'cursor';

export interface UqlHighlightSegment {
  text: string;
  displayText?: string;
  kind: UqlHighlightKind;
  sourceStart?: number;
  sourceEnd?: number;
  atomic?: boolean;
  depth?: number;
  imageUrl?: string;
  title?: string;
  valueContext?: UqlValueContext;
  scopeContext?: UqlScopeContext;
  rarityClass?: string;
  badgeText?: string;
  badgeClass?: string;
}

export interface UqlValidationIssue {
  from: number;
  to: number;
  message: string;
  state: Extract<UqlValidationState, 'incomplete' | 'invalid'>;
}

export interface UqlSuggestion {
  label: string;
  insertText: string;
  kind: UqlSuggestionKind;
  detail?: string;
  searchText?: string;
  matchPhrases?: string[];
  priority?: number;
  valueContext?: UqlValueContext;
  scopeContext?: UqlScopeContext;
  backendValue?: string;
  imageUrl?: string;
  rarityClass?: string;
  badgeText?: string;
  badgeClass?: string;
  fieldType?: UqlFieldType;
  cursorOffset?: number;
}

export interface UqlCompletionResult {
  from: number;
  to: number;
  options: UqlSuggestion[];
}

export function isUqlChipSegment(segment: UqlHighlightSegment): boolean {
  if (segment.kind !== 'identifier') return false;
  if (
    segment.imageUrl ||
    segment.valueContext === 'race-saddle' ||
    segment.valueContext === 'legacy'
  )
    return true;
  return Boolean(
    segment.valueContext?.endsWith('-factor') &&
    (segment.atomic || segment.title || segment.displayText)
  );
}
