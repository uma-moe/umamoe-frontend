/**
 * Labels for the simulator's own `race_type` vocabulary.
 *
 * The accepted values live with the request contract in `stamina-request.ts`;
 * this is only how they read in a picker or a summary line.
 */

import { RACE_TYPES, type RaceType } from './stamina-request';

export const RACE_TYPE_LABELS: Record<RaceType, string> = {
  0: 'Champions Meeting',
  5: 'Champions Meeting (alt)',
  6: 'Career',
  7: 'Career (team)',
  8: 'Champions Meeting (win rate)',
  14: 'Team Trials'
};

/** Ready for `SelectField`; keeps the simulator's numeric `race_type` as the option value. */
export const RACE_TYPE_OPTIONS: Array<{ value: string; label: string }> = RACE_TYPES.map((raceType) => ({
  value: String(raceType),
  label: RACE_TYPE_LABELS[raceType]
}));

/** Label for a raw `race_type`, falling back to the number when unknown. */
export function raceTypeLabel(raceType: number): string {
  const match = RACE_TYPES.find((candidate) => candidate === raceType);
  return match === undefined ? `Race type ${raceType}` : RACE_TYPE_LABELS[match];
}
