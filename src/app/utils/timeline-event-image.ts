import englishTimelineImagePathsJson from '../../assets/timeline-images/en/manifest.json';
import japaneseTimelineImagePathsJson from '../../assets/timeline-images/jp/manifest.json';

const ENGLISH_TIMELINE_IMAGE_PATHS = englishTimelineImagePathsJson as Record<string, string>;
const JAPANESE_TIMELINE_IMAGE_PATHS = japaneseTimelineImagePathsJson as Record<string, string>;

const EVENT_IMAGE_CATEGORIES: Readonly<Record<string, string>> = {
  campaign: 'campaign',
  champions_meeting: 'champions-meeting',
  factor_research: 'factor-research',
  league_of_heroes: 'league-of-heroes',
  legend_race: 'legend-race',
  masters_challenge: 'masters-challenge',
  racing_carnival: 'racing-carnival',
  scenario_release: 'training-scenario',
  strongest_team: 'strongest-team',
  trainer_skills_test: 'trainer-skills-test',
};

export function timelineEventMasterId(eventId: string | null | undefined): number | undefined {
  const match = eventId?.match(/(?:^|\D)(\d+)(?!.*\d)/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function resolveBundledTimelineEventImagePath(
  eventType: string | null | undefined,
  masterEventId: number | null | undefined,
): string | undefined {
  const category = eventType ? EVENT_IMAGE_CATEGORIES[eventType] : undefined;
  if (!category || !Number.isSafeInteger(masterEventId) || Number(masterEventId) <= 0) return undefined;
  const logicalPath = `assets/timeline-images/events/${category}/${masterEventId}.webp`;
  return ENGLISH_TIMELINE_IMAGE_PATHS[logicalPath]
    ?? JAPANESE_TIMELINE_IMAGE_PATHS[logicalPath];
}
