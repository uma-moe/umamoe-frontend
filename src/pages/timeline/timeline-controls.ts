export const filterOptions = [
    { type: 'character_banner', label: 'Characters', color: 'var(--accent-primary)' },
    { type: 'support_card_banner', label: 'Support cards', color: '#ba68c8' },
    { type: 'paid_banner', label: 'Paid banners', color: '#ffb74d' },
    { type: 'story_event', label: 'Story events', color: '#ffb74d' },
    { type: 'campaign', label: 'Campaigns', color: '#4db6ac' },
    { type: 'champions_meeting', label: 'Champions Meeting', color: '#ba68c8' },
    { type: 'legend_race', label: 'Legend Races', color: '#e91e63' },
    { type: 'league_of_heroes', label: 'League of Heroes', color: '#4db6ac' },
    { type: 'masters_challenge', label: 'Masters Challenge', color: '#9575cd' },
    { type: 'trainer_skills_test', label: 'Trainer Skills Test', color: 'var(--accent-primary)' },
    { type: 'factor_research', label: 'Factor Research', color: '#4dd0e1' },
    { type: 'strongest_team', label: 'Strongest Team', color: '#e57373' },
    { type: 'racing_carnival', label: 'Racing Carnival', color: '#ffb74d' },
    { type: 'scenario_release', label: 'Training scenarios', color: '#81c784' }
  ] as const;
export const filterIcons = ['user', 'cards', 'paid', 'book', 'gift', 'trophy', 'race', 'users', 'star', 'book', 'tune', 'users', 'race', 'home'] as const;
export type FilterType = typeof filterOptions[number]['type'];
export const TIMELINE_PREFERENCES_KEY = 'umamoe.timeline.desktop-preferences.v1';
export interface TimelineStatus { filtered: number; total: number; searchPosition: string; plannerEventCount: number; loading: boolean; rewardsLoading: boolean; }
