import {
  resolveUqlLegacy,
  resolveUqlTarget,
  type UqlContextIssue,
  type UqlContextQuery
} from '@/lib/inheritance/uql/uql-context';
import type { UqlQueryData } from '@/lib/inheritance/uql/uql-compiler';
import type { SelectableParent } from '@/lib/veterans/parents/parent-picker';

export interface DatabaseUqlContext {
  targetId?: number;
  legacy?: SelectableParent;
  pendingLegacy?: string;
  failedLegacy?: string;
  issue?: UqlContextIssue;
}

export interface DatabaseUqlLegacyState {
  parents: SelectableParent[];
  pending: (value: string) => boolean;
  error: string;
}

export function resolveDatabaseUqlContext(
  query: UqlContextQuery,
  characters: UqlQueryData['characters'],
  legacyState: DatabaseUqlLegacyState
): DatabaseUqlContext {
  if (query.issue) return { issue: query.issue };

  let targetId: number | undefined;
  let legacy: SelectableParent | undefined;
  for (const directive of query.directives) {
    if (directive.kind === 'target') {
      const resolution = resolveUqlTarget(directive.value, characters);
      if (!resolution.match)
        return {
          issue: {
            state: resolution.partial ? 'incomplete' : 'invalid',
            message: resolution.partial
              ? 'Choose a target from autocomplete'
              : `Unknown target: ${directive.value}`
          }
        };

      targetId = Number(resolution.match.id);
    } else {
      const resolution = resolveUqlLegacy(directive.value, legacyState.parents, characters);
      if (!resolution.match) {
        if (legacyState.pending(directive.value))
          return {
            pendingLegacy: directive.value,
            issue: { state: 'incomplete', message: 'Loading legacy…' }
          };

        if (legacyState.error)
          return {
            failedLegacy: directive.value,
            issue: { state: 'invalid', message: legacyState.error }
          };

        return {
          issue: {
            state: resolution.partial ? 'incomplete' : 'invalid',
            message: resolution.partial
              ? 'Choose a legacy from autocomplete'
              : `Unknown legacy: ${directive.value}`
          }
        };
      }

      legacy = resolution.match;
    }
  }

  return { targetId, legacy };
}
