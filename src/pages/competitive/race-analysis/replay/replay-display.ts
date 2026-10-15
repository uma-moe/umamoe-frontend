export type ReplayToggles = ReturnType<typeof defaultReplayToggles>;

export const defaultReplayToggles = () => ({
  skills: true,
  blocked: true,
  slopes: true,
  speed: false,
  accel: false,
  course: true,
  positionKeep: false,
  cone: true
});

export const replayToggleLabels = {
  skills: 'Skill labels',
  blocked: 'Block indicator',
  slopes: 'Slopes',
  speed: 'Speed [m/s]',
  accel: 'Acceleration [m/s²]',
  course: 'Course events',
  positionKeep: 'Position Keep',
  cone: 'Base view cone'
};
