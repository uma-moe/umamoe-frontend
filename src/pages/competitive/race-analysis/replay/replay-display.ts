export type ReplayToggles = ReturnType<typeof defaultReplayToggles>;
export type ReplayToggle = keyof ReplayToggles;

export const defaultReplayToggles = () => ({
  skills: true,
  skillTimers: false,
  blocked: true,
  slopes: true,
  speed: false,
  accel: false,
  raceModes: false,
  course: true,
  positionKeep: false,
  cone: true,
  minimap: false
});

export const replayToggleLabels: Record<ReplayToggle, string> = {
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
  positionKeep: 'Pace Down and Pace Up zones for each running style while position keeping lasts.',
  cone: 'The base vision cone in front of the followed Uma on the course map.',
  minimap: 'A small full-course map that marks the part of the track currently in view.'
};

export const replayToggleGroups: { title: string; keys: ReplayToggle[] }[] = [
  {
    title: 'Runner overlays',
    keys: ['skills', 'skillTimers', 'raceModes', 'blocked', 'speed', 'accel']
  },
  { title: 'Course overlays', keys: ['course', 'slopes', 'positionKeep', 'cone', 'minimap'] }
];
