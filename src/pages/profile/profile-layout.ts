// Stable section IDs keep layout preferences separate from profile data and privacy settings.
export const DEFAULT_PROFILE_SECTIONS = [
  'fan_activity', 'all_time', 'inheritance', 'circle', 'circle_history', 'team_stadium', 'veterans'
] as const;
export type ProfileSectionId = typeof DEFAULT_PROFILE_SECTIONS[number];
