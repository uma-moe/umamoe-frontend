export type ReplayToggles = ReturnType<typeof defaultReplayToggles>;
export type ReplayToggle = keyof ReplayToggles;

export const defaultReplayToggles = () => ({
  field: true,
  hpBars: false,
  skills: true,
  skillTimers: true,
  blocked: true,
  slopes: true,
  speed: false,
  accel: false,
  raceModes: false,
  course: true,
  positionKeep: false,
  cone: false,
  minimap: false
});

export const replayToggleLabels: Record<ReplayToggle, string> = {
  field: 'Race field',
  hpBars: 'HP bars',
  skills: 'Skill labels',
  skillTimers: 'Skill timers',
  blocked: 'Block indicator',
  slopes: 'Slopes',
  speed: 'Speed [m/s]',
  accel: 'Acceleration [m/s²]',
  raceModes: 'Race modes',
  course: 'Course events',
  positionKeep: 'Position Keep',
  cone: 'Base view cone',
  minimap: 'Course overview'
};

export const replayToggleHelp: Record<ReplayToggle, string> = {
  field: 'Lists the field in race order over the top-right corner of the replay.',
  hpBars: 'Shows remaining HP beneath each Uma.',
  skills: 'Names skill activations above each Uma. Instant skills stay visible for 2 seconds.',
  skillTimers:
    'Adds the remaining time to skill and race-mode labels. Needs Skill labels or Race modes.',
  blocked: 'Marks front blocking. Short blocks between sparse race frames can be missed.',
  slopes: 'Shades uphills and downhills. The shading is not to scale.',
  speed: 'Recorded speed per frame, interpolated between frames.',
  accel:
    'Detailed simulations use the simulator rate. Recorded races use the speed change between frames.',
  raceModes:
    'Labels Pace Up, Pace Down, Speed Up, Overtake, dueling and rushing. Recorded races only show rushing.',
  course: 'Corners, straights and race phase markers.',
  positionKeep:
    'Pace Down and Pace Up zones while position keeping lasts, measured from the pacemaker when detailed simulation data is available (else the front runner), plus a flag on the pacemaker. Dotted lines behind Umas that can enter front-runner Speed Up mode show the range its entry check uses.',
  cone: 'The base vision cone in front of the followed Uma. Course map only.',
  minimap: 'A small full-course map that marks the part of the track currently in view.'
};

export const replayToggleGroups: { title: string; keys: ReplayToggle[] }[] = [
  {
    title: 'Runner overlays',
    keys: ['field', 'hpBars', 'skills', 'skillTimers', 'raceModes', 'blocked', 'speed', 'accel']
  },
  { title: 'Course overlays', keys: ['course', 'slopes', 'positionKeep', 'cone', 'minimap'] }
];

export interface PixelSnap {
  moving: boolean;
  pixelRatio: number;
}

/**
 * Paused positions snap to whole device pixels, where portraits and text stay sharp. Playback keeps
 * the fractions so motion stays even instead of stepping a pixel at a time.
 */
export function snapPixel(value: number, { moving, pixelRatio }: PixelSnap): number {
  if (moving) return value;

  return Math.round(value * pixelRatio) / pixelRatio;
}

export function stagePixel(value: number, moving: boolean): number {
  return snapPixel(value, { moving, pixelRatio: globalThis.devicePixelRatio || 1 });
}
