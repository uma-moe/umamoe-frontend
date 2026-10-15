import type { SkillCatalogEntry } from '@/lib/catalog/skill-catalog';
import type { OptimizeResult } from '../../simulator-repository';

/** A form value as a number, or the fallback when it is empty or not a number. */
export const formNumber = (value: string | number | null | undefined, fallback = 0) => {
  const parsed = Number(value);
  return value === '' || value == null || !Number.isFinite(parsed) ? fallback : parsed;
};

/** The best build in a line: what it gains her (time, or runners beaten in real fields) and what it costs. */
export function bestSummary(
  best: OptimizeResult['report']['finalists'][number],
  field: boolean
): string {
  const gain = best.validation_gain ?? best.gain;
  const cost = best.sp_cost.toLocaleString() + ' SP';
  return gain && best.build.purchases.length && gain.mean > 0
    ? (field
        ? 'Beats ' + gain.mean.toFixed(2) + ' more runners a race · '
        : 'Saves ' + gain.mean.toFixed(2) + ' s a race · ') + cost
    : best.build.purchases.length
      ? 'Best build: ' + cost
      : 'Buying nothing scores best';
}

/** The server's message in the page's words, for the errors a reader can fix here. */
export function explainBuildError(
  message: string,
  catalog: Map<number, SkillCatalogEntry>
): string {
  const skill = /skill (\d+)/.exec(message)?.[1];
  const name = skill ? (catalog.get(Number(skill))?.name ?? 'Skill ' + skill) : 'A skill';
  if (/fan_count/.test(message))
    return name + ' grows with her fans. Enter her fans under Skills to buy and search again.';
  // What an older simulator service says to a search that races her alone over a pool of tracks.
  if (
    /runner count must be 2|1\.\.=4 scenarios|needs score_context|unknown field `hp_changes`/.test(
      message
    )
  )
    return 'The simulator service is an older build: it can’t race her alone or over a pool of tracks. Rebuild and restart it, then search again.';
  return message;
}
