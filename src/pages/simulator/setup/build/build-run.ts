import type { SkillData } from '@/lib/game-data/skills/skills';
import type { TheorizedBuild } from '../../reports/outcomes/build/build-result';

/** A form value as a number, or the fallback when it is empty or not a number. */
export const formNumber = (value: string | number | null | undefined, fallback = 0) => {
  const parsed = Number(value);
  return value === '' || value == null || !Number.isFinite(parsed) ? fallback : parsed;
};

/** The recommended purchases and cost, without presenting an internal metric as a prediction. */
export function bestSummary(pick: TheorizedBuild): string {
  if (!pick.count) return 'No additional skills recommended';

  return (
    pick.count +
    (pick.count === 1 ? ' skill' : ' skills') +
    ' · ' +
    pick.finalist.sp_cost.toLocaleString('en-US') +
    ' SP'
  );
}

/** The server's message in the page's words, for the errors a reader can fix here. */
export function explainBuildError(message: string, skillLookup: Map<number, SkillData>): string {
  const skill = /skill (\d+)/.exec(message)?.[1];
  const name = skill ? (skillLookup.get(Number(skill))?.name ?? 'Skill ' + skill) : 'A skill';
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
