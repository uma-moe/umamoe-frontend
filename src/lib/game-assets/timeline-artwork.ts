import { timelineBanner } from '@/lib/game-assets/art-links';

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

/** Where the site kept the English and Japanese art it synced for a banner before the bucket held it. */
const SYNCED_SITE_ART = /^\/?assets\/timeline-images\/(?:en|jp)\/(.+)$/;

export function timelineEventMasterId(eventId: string | null | undefined): number | undefined {
  const match = eventId?.match(/(?:^|\D)(\d+)(?!.*\d)/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** The banner every event of a type has for its master id, for events without a picture of their own. */
function eventTypeBanner(
  eventType: string | undefined,
  masterEventId: number | undefined
): string | undefined {
  const category = eventType ? EVENT_IMAGE_CATEGORIES[eventType] : undefined;
  if (category === undefined || masterEventId === undefined) return undefined;

  return timelineBanner(`assets/timeline-images/events/${category}/${masterEventId}.webp`);
}

/**
 * The picture of a timeline event: the bucket's banner for its `image_path`, else its type's banner
 * for its master id, else the source picture the timeline names. The bucket already holds the best
 * art for each banner, English where it exists.
 */
export function timelineImage(
  path: string | null | undefined,
  type: string | undefined,
  id: string,
  sourceImage?: string
): string | undefined {
  const hasOwnPicture = Boolean(path) && !path?.endsWith('/');
  if (path && hasOwnPicture) return timelineBanner(path) ?? sourceImage ?? path;

  return eventTypeBanner(type, timelineEventMasterId(id)) ?? sourceImage;
}

/**
 * Planner targets saved before the site loaded its banners from the bucket name the site's own
 * files. Their synced copies sit below `assets/timeline-images/<locale>/` in the layout of the
 * banner's `image_path`, so both translate to the banner's link. Other values are kept.
 */
export function savedTimelineImage(image: string): string {
  const syncedPath = image.match(SYNCED_SITE_ART)?.[1];
  if (syncedPath === undefined) return timelineBanner(image) ?? image;

  const imagePath = syncedPath.startsWith('images/')
    ? `assets/${syncedPath}`
    : `assets/timeline-images/${syncedPath}`;
  return timelineBanner(imagePath) ?? image;
}
