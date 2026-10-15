import englishTimelineImagePathsJson from '@/assets/timeline-images/en/manifest.json';
import japaneseTimelineImagePathsJson from '@/assets/timeline-images/jp/manifest.json';

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
  trainer_skills_test: 'trainer-skills-test'
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
  preferEnglish = true
): string | undefined {
  const category = eventType ? EVENT_IMAGE_CATEGORIES[eventType] : undefined;
  if (!category || !Number.isSafeInteger(masterEventId) || Number(masterEventId) <= 0)
    return undefined;
  const logicalPath = `assets/timeline-images/events/${category}/${masterEventId}.webp`;
  return (
    (preferEnglish ? ENGLISH_TIMELINE_IMAGE_PATHS[logicalPath] : undefined) ??
    JAPANESE_TIMELINE_IMAGE_PATHS[logicalPath]
  );
}

function resolveSourceImagePath(
  imagePath: string | null | undefined,
  eventType: string | null | undefined,
  masterEventId: number | null | undefined,
  preferEnglish: boolean
): string | undefined {
  const bundledFallback = resolveBundledTimelineEventImagePath(
    eventType,
    masterEventId,
    preferEnglish
  );

  if (!imagePath || imagePath.endsWith('/')) return bundledFallback;
  return (
    (preferEnglish ? ENGLISH_TIMELINE_IMAGE_PATHS[imagePath] : undefined) ??
    JAPANESE_TIMELINE_IMAGE_PATHS[imagePath] ??
    bundledFallback ??
    imagePath
  );
}

// prepare-assets already publishes these images. Use the existing manifests
// instead of downloading a second URL table before timeline data can load.
const bundledPaths = new Set([
  ...Object.values(ENGLISH_TIMELINE_IMAGE_PATHS),
  ...Object.values(JAPANESE_TIMELINE_IMAGE_PATHS)
]);

export function timelineImage(
  path: string | null | undefined,
  type: string | undefined,
  id: string,
  sourceImage?: string,
  preferEnglish = true
): string | undefined {
  const resolved = resolveSourceImagePath(path, type, timelineEventMasterId(id), preferEnglish);
  if (!resolved) return sourceImage;
  const localPath = resolved.replace(/^\//, '');
  return bundledPaths.has(localPath) ? `/${localPath}` : (sourceImage ?? resolved);
}
