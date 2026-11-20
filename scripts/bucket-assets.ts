import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Plugin } from 'vite';

export type BucketLookups = {
  /** Timeline banner links by the timeline's `image_path`. */
  timelineBanners: ReadonlyMap<string, string>;
  /** The timeline `image_path` each synced overlay of the site's manifests stands for. */
  timelineOverlays: ReadonlyMap<string, string>;
};

type BucketRule = {
  pattern: RegExp;
  link: (match: RegExpMatchArray) => string | undefined;
};

/** Local folders of game art. A path below them that the bucket cannot answer is a 404, not the local copy. */
const GAME_ART_FOLDERS = [
  'assets/timeline-images/',
  'assets/images/campaign/',
  'assets/images/character/',
  'assets/images/character_stand/',
  'assets/images/icon/',
  'assets/images/item/',
  'assets/images/legend/',
  'assets/images/paid/',
  'assets/images/race-thumbnails/',
  'assets/images/scenario/',
  'assets/images/skills/',
  'assets/images/story/',
  'assets/images/support/',
  'assets/images/support_card/',
  'assets/images/timeline/',
  'game-assets/'
];

const RUNNING_STYLES = ['front', 'pace', 'late', 'end'];

const WEATHER = ['sunny', 'cloudy', 'rainy', 'snowy'];

const TRACK_DETAILS: ReadonlyMap<string, string> = new Map([
  ['Sunny', 'weather/sunny'],
  ['Cloudy', 'weather/cloudy'],
  ['Rainy', 'weather/rainy'],
  ['Snowy', 'weather/snowy'],
  ['Spring', 'seasons/spring'],
  ['Summer', 'seasons/summer'],
  ['Fall', 'seasons/fall'],
  ['Winter', 'seasons/winter'],
  ['Firm', 'ground-conditions/firm'],
  ['Good', 'ground-conditions/good'],
  ['Soft', 'ground-conditions/soft'],
  ['Heavy', 'ground-conditions/heavy']
]);

const RULES: readonly BucketRule[] = [
  {
    pattern:
      /^(?:assets\/images\/character_stand\/chara_stand_|game-assets\/character_thumbs\/chara_stand_\d+_)(\d+)\.(?:webp|png)$/,
    link: ([, card]) => `/art/umas/${card}/stand.webp`
  },
  {
    pattern: /^game-assets\/umamusume_icons\/chr_icon_(\d+)\.webp$/,
    link: ([, character]) => `/art/characters/${character}/icon.webp`
  },
  {
    pattern:
      /^(?:assets\/images\/support_card\/full|game-assets\/umamusume_cards)\/tex_support_card_(\d+)\.(?:webp|png)$/,
    link: ([, card]) => `/art/support-cards/${card}/card.webp`
  },
  {
    pattern: /^assets\/images\/support_card\/half\/support_card_s_(\d+)\.(?:webp|png)$/,
    link: ([, card]) => `/art/support-cards/${card}/half.webp`
  },
  {
    pattern:
      /^(?:assets\/images\/(?:icon\/)?skills|game-assets\/skill_icons)\/utx_ico_skill_(\d+)\.(?:webp|png)$/,
    link: ([, icon]) => `/art/skills/icons/${icon}.webp`
  },
  {
    pattern: /^assets\/images\/item\/item_icon_(\d+)\.webp$/,
    link: ([, item]) => `/art/items/${item}.webp`
  },
  {
    pattern:
      /^(?:assets\/images\/race-thumbnails|game-assets\/textures\/race_banners)\/thum_race_rt_000_(\d+)_00\.webp$/,
    link: ([, race]) => `/art/races/banners/${race}.webp`
  },
  {
    pattern: /^assets\/images\/icon\/ranks\/utx_txt_rank_(\d+)\.(?:webp|png)$/,
    link: ([, rank]) => `/art/ui/ranks/${rank}.webp`
  },
  {
    pattern:
      /^(?:game-assets\/textures\/uma_ranks|assets\/images\/icon\/statusrank)\/utx_ico_statusrank_(\d+)\.(?:webp|png)$/,
    link: ([, rank]) => `/art/ui/status-ranks/${rank}.webp`
  },
  {
    pattern: /^assets\/images\/icon\/circle_rank\/utx_ico_circle_rank_(\d+)\.(?:webp|png)$/,
    link: ([, rank]) => `/art/ui/circle-ranks/${rank}.webp`
  },
  {
    pattern:
      /^(?:assets\/images\/icon\/stats|game-assets\/textures)\/(speed|stamina|power|guts|wit|friend|group)\.(?:webp|png)$/,
    link: ([, stat]) => `/art/ui/stats/${stat}.webp`
  },
  {
    pattern: /^game-assets\/textures\/(awful|bad|normal|good|great)\.webp$/,
    link: ([, mood]) => `/art/ui/moods/${mood}.webp`
  },
  {
    pattern: /^game-assets\/textures\/(front|pace|late|end)\.webp$/,
    link: ([, style]) => `/art/ui/running-styles/labels/${style}.webp`
  },
  {
    pattern: /^game-assets\/textures\/utx_ico_runstyle_(\d+)\.webp$/,
    link: ([, index]) => indexedLink('/art/ui/running-styles/icons/', RUNNING_STYLES, index)
  },
  {
    pattern: /^game-assets\/textures\/utx_ico_weather_(\d+)\.png$/,
    link: ([, index]) => indexedLink('/art/ui/weather/', WEATHER, index)
  },
  {
    pattern: /^game-assets\/textures\/utx_ico_timezone_(\d+)\.png$/,
    link: ([, time]) => `/art/ui/times-of-day/${time}.webp`
  },
  {
    pattern: /^game-assets\/track_details\/(\w+)\.webp$/,
    link: ([, detail]) => trackDetailLink(detail)
  },
  {
    pattern: /^game-assets\/support-rarity\/(r|sr|ssr)\.png$/,
    link: ([, rarity]) => `/art/ui/support-rarities/${rarity}.webp`
  }
];

function indexedLink(
  folder: string,
  names: readonly string[],
  index: string | undefined
): string | undefined {
  const name = index === undefined ? undefined : names[Number(index)];
  return name === undefined ? undefined : `${folder}${name}.webp`;
}

function trackDetailLink(detail: string | undefined): string | undefined {
  const picture = detail === undefined ? undefined : TRACK_DETAILS.get(detail);
  return picture === undefined ? undefined : `/art/ui/${picture}.webp`;
}

/** The site path below the web root; art the app imports is served from `/src/assets/` in dev. */
function sitePath(path: string): string {
  return path.replace(/^\//, '').replace(/^src\/assets\//, 'assets/');
}

export function isGameArtPath(path: string): boolean {
  const relative = sitePath(path);
  return GAME_ART_FOLDERS.some((folder) => relative.startsWith(folder));
}

/** The bucket link that replaces a local game-art path, from the bucket root. */
export function bucketAssetLink(path: string, lookups: BucketLookups): string | undefined {
  const relative = sitePath(path);
  const imagePath = lookups.timelineOverlays.get(relative) ?? relative;
  const banner = lookups.timelineBanners.get(imagePath);
  if (banner !== undefined) return banner;

  for (const rule of RULES) {
    const match = relative.match(rule.pattern);
    if (match) return rule.link(match);
  }
  return undefined;
}

function readTimelineBanners(document: unknown): Map<string, string> {
  const images =
    typeof document === 'object' && document !== null && 'images' in document
      ? document.images
      : undefined;
  if (typeof images !== 'object' || images === null) {
    throw new Error('art/timeline/index.json has no images');
  }

  const banners = new Map<string, string>();
  for (const [imagePath, link] of Object.entries(images)) {
    if (typeof link === 'string') banners.set(imagePath, link);
  }
  return banners;
}

async function readTimelineOverlays(rootDirectory: string): Promise<Map<string, string>> {
  const overlays = new Map<string, string>();
  for (const locale of ['jp', 'en']) {
    const manifestPath = join(rootDirectory, 'src/assets/timeline-images', locale, 'manifest.json');
    const manifest: Record<string, unknown> = JSON.parse(await readFile(manifestPath, 'utf8'));
    for (const [imagePath, overlay] of Object.entries(manifest)) {
      if (typeof overlay === 'string') overlays.set(overlay, imagePath);
    }
  }
  return overlays;
}

export async function loadBucketLookups({
  origin,
  rootDirectory
}: {
  origin: string;
  rootDirectory: string;
}): Promise<BucketLookups> {
  const response = await fetch(`${origin}/art/timeline/index.json`);
  if (!response.ok) throw new Error(`art/timeline/index.json answered ${response.status}`);

  return {
    timelineBanners: readTimelineBanners(await response.json()),
    timelineOverlays: await readTimelineOverlays(rootDirectory)
  };
}

/** Vite asks for an imported image as a module (`?import&url`) before the browser loads the image itself. */
function isModuleRequest(query: string): boolean {
  const parameters = new URLSearchParams(query);
  return ['import', 'url', 'raw', 'inline'].some((flag) => parameters.has(flag));
}

/** Dev only: answers the site's local game-art paths with redirects to the asset bucket. */
export function bucketAssets({
  origin,
  rootDirectory
}: {
  origin: string;
  rootDirectory: string;
}): Plugin {
  return {
    name: 'bucket-assets',
    apply: 'serve',
    async configureServer(server) {
      const logger = server.config.logger;
      const lookups = await loadBucketLookups({ origin, rootDirectory });
      const reported = new Set<string>();
      logger.info(`Game art loads from ${origin} (${lookups.timelineBanners.size} timeline banners).`);

      server.middlewares.use((request, response, next) => {
        const [encodedPath = '', query = ''] = (request.url ?? '').split('?');
        const path = decodeURIComponent(encodedPath);
        if (isModuleRequest(query) || !isGameArtPath(path)) {
          next();
          return;
        }

        const link = bucketAssetLink(path, lookups);
        if (link === undefined) {
          if (!reported.has(path)) {
            reported.add(path);
            logger.warn(`No bucket file for ${path}`);
          }
          response.statusCode = 404;
          response.end();
          return;
        }

        response.statusCode = 302;
        response.setHeader('Location', origin + link);
        response.setHeader('Cache-Control', 'no-store');
        response.end();
      });
    }
  };
}
