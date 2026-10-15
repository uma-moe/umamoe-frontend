import { isUqlQuoteStart, uqlDelimiterIssue } from './uql-text';
import type { UqlCharacter } from './uql-compiler';
import type { SelectableParent } from '@/lib/veterans/parent-picker';

export interface UqlContextDirective { kind: 'target' | 'legacy'; value: string; }
export interface UqlContextIssue { state: 'incomplete' | 'invalid'; message: string; }
export interface UqlContextQuery { predicate: string; directives: UqlContextDirective[]; issue?: UqlContextIssue; }

export function splitUqlClauses(query: string): string[] {
  const clauses: string[] = []; let start = 0; let depth = 0; let quote = '';
  for (let index = 0; index < query.length; index++) {
    const character = query.charAt(index);
    if (quote) { if (character === quote && query[index + 1] === quote) index++; else if (character === quote) quote = ''; continue; }
    if (isUqlQuoteStart(query, index)) { quote = character; continue; }
    if (character === '(' || character === '[') depth++;
    else if (character === ')' || character === ']') depth--;
    if (depth === 0 && /^and\b/i.test(query.slice(index)) && (!query[index - 1] || /\s|\)/.test(query[index - 1]!)) && (!query[index + 3] || /\s|\(/.test(query[index + 3]!))) {
      clauses.push(query.slice(start, index).trim()); index += 2; start = index + 1;
    }
  }
  clauses.push(query.slice(start).trim());
  return clauses;
}

function directiveValue(value: string): string {
  const text = value.trim();
  if (/^(['"])[\s\S]*\1$/.test(text)) return directiveValue(text.slice(1, -1).replace(/''/g, "'").replace(/""/g, '"'));
  return text.startsWith('[') && text.endsWith(']') ? text.slice(1, -1).trim() : text;
}
export function parseUqlContext(query: string): UqlContextQuery {
  const expression = query.trim().replace(/^where\b\s*/i, '').replace(/;\s*$/, '').trim();
  const directives: UqlContextDirective[] = []; const predicates: string[] = [];
  const issue = uqlDelimiterIssue(expression);
  if (issue) return { predicate: expression, directives, issue };
  for (const clause of splitUqlClauses(expression)) {
    const match = clause.match(/^(target|owned\s+legacy|your\s+legacy|my\s+legacy|legacy)\s*(not\s+in|has\s+any|has\s+all|has|!=|<>|>=|<=|==|=|>|<|in|contains)\s*([\s\S]*)$/i);
    if (!match) { predicates.push(clause); continue; }
    const kind = /^target$/i.test(match[1]!) ? 'target' : 'legacy';
    if (!['=', '=='].includes(match[2]!)) return { predicate: expression, directives, issue: { state: 'invalid', message: `${match[1]} only supports =` } };
    const value = directiveValue(match[3]!);
    directives.push({ kind, value });
    if (!value) return { predicate: expression, directives, issue: { state: 'incomplete', message: `Choose a ${kind}` } };
  }
  if (expression && predicates.some(clause => !clause)) return { predicate: expression, directives, issue: { state: 'incomplete', message: 'Finish the boolean operator' } };
  return { predicate: predicates.filter(Boolean).join(' and '), directives };
}

const normalize = (value: string) => value.toLocaleLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
export function resolveUqlTarget(value: string, characters: readonly UqlCharacter[]) {
  const name = normalize(value);
  const candidates = characters.map(character => ({ character, names: [character.displayName, character.name, character.skin, character.id].filter(Boolean).map(normalize) }));
  return { match: candidates.find(candidate => candidate.names.includes(name))?.character, partial: !name || candidates.some(candidate => candidate.names.some(candidateName => candidateName.startsWith(name))) };
}

export function uqlLegacyHints(value: string): { uuid?: string; accountId?: string; memberId?: number; name: string } {
  const uuid = value.match(/#([A-Za-z0-9_-]+)\s*$/)?.[1];
  if (uuid && !/^\d+$/.test(uuid)) return { uuid, name: value.replace(/\s*#[^#]+$/, '').trim() };
  const accountMember = value.match(/^([A-Za-z0-9_-]+):(\d+)$/);
  const accountId = accountMember?.[1] ?? value.match(/@([A-Za-z0-9_-]+)\s*$/)?.[1];
  const member = accountMember?.[2] ?? value.match(/(?:#|member\s+)(\d+)(?=\s*(?:@|$))/i)?.[1];
  return { accountId, memberId: member ? Number(member) : undefined, name: accountMember ? '' : value.replace(/\s*@[^@]+$/, '').replace(/\s*(?:#|member\s+)\d+$/i, '').trim() };
}
export function uqlLegacyName(parent: SelectableParent, characters: readonly UqlCharacter[]): string {
  return characters.find(character => Number(character.id) === parent.card_id)?.name
    ?? characters.find(character => Math.floor(Number(character.id) / 100) === parent.trained_chara_id)?.name
    ?? parent.name ?? 'Unknown';
}
export function uqlLegacyDisplay(parent: SelectableParent, characters: readonly UqlCharacter[]): string {
  const name = uqlLegacyName(parent, characters);
  if (parent.share_source === 'veteran' && parent.id) return `${name} #${parent.id}`;
  if (parent.member_id != null) return `${name} #${parent.member_id}${parent.trainer_id ? ` @${parent.trainer_id}` : ''}`;
  return name;
}
export function resolveUqlLegacy(value: string, parents: readonly SelectableParent[], characters: readonly UqlCharacter[]) {
  const hint = uqlLegacyHints(value); const name = normalize(value);
  const candidates = parents.map(parent => ({ parent, names: [uqlLegacyDisplay(parent, characters), uqlLegacyName(parent, characters), parent.name ?? '', `${uqlLegacyName(parent, characters)} ${parent.member_id}`, `${parent.trainer_id}:${parent.member_id}`].filter(Boolean).map(normalize) }));
  const match = hint.uuid ? parents.find(parent => String(parent.id) === hint.uuid)
    : hint.memberId !== undefined ? parents.find(parent => parent.member_id === hint.memberId && (!hint.accountId || parent.trainer_id === hint.accountId))
    : hint.accountId ? parents.find(parent => parent.trainer_id === hint.accountId && normalize(uqlLegacyName(parent, characters)) === normalize(hint.name))
    : candidates.find(candidate => candidate.names.includes(name))?.parent;
  return { match, partial: !name || candidates.some(candidate => candidate.names.some(candidateName => candidateName.startsWith(name))) };
}
export function setUqlLegacy(query: string, parent: SelectableParent, characters: readonly UqlCharacter[]): string {
  const clauses = splitUqlClauses(query.trim().replace(/^where\b\s*/i, '').replace(/;\s*$/, ''));
  const replacement = `owned legacy = [${uqlLegacyDisplay(parent, characters)}]`;
  const index = clauses.findIndex(clause => /^(?:owned\s+legacy|your\s+legacy|my\s+legacy|legacy)\s*=\s*\[\s*\]$/i.test(clause));
  if (index >= 0) clauses[index] = replacement; else clauses.push(replacement);
  return clauses.filter(Boolean).join(' and ');
}
