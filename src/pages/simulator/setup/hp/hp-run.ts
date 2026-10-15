import { APTITUDE_GRADES, type AptitudeGrade } from '../../requests/stamina-request';

/** The trainee editor holds grades as strings; the request wants the narrow union. */
export function traineeGrades(values: Array<string>): Array<AptitudeGrade> {
  return values.map((value) => APTITUDE_GRADES.find((grade) => grade === value) ?? 'A');
}

/**
 * A simulator from before sampled races rejects the new fields: it names them, or, behind a proxy that keeps only the
 * status, answers 422 (the request no longer fits its JSON shape). Say what to do about it.
 */
export function explainStaminaError(message: string) {
  return /unknown field `(samples|chance|start_spread_m)`|^422\b/.test(message)
    ? 'The simulator running here is an older build that cannot sample races. Rebuild and restart it.'
    : message;
}
