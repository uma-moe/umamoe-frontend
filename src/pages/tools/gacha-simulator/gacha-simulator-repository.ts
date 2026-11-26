import { loadCharacters, type CharacterData } from '@/lib/game-data/characters';
import {
  loadSupportCards,
  type SupportCardData
} from '@/lib/game-data/support-cards/support-cards';
import { createFutureGachaPool } from '@/lib/gacha-simulator/future-gacha-pool';
import type { GachaKind, GachaPool, GachaPoolSource } from '@/lib/gacha-simulator/gacha-draw';
import { resolvePlannerGachaRates } from '@/lib/carat-planner/gacha/planner-gacha-rates';
import { timelineRepository, type TimelineRecord } from '@/pages/timeline/timeline-repository';
import { MasterDataSession } from '@/pages/tools/master-data/master-data-session.svelte';
import { parseGachaPools } from './gacha-pool-parser';
import { loadJpGachaCatalog } from './jp-gacha-catalog';

const POOL_QUERY = `
  SELECT data.id, data.card_type, data.cost_single, data.draw_guarantee_rarity,
         available.card_id, available.rarity, available.odds, available.is_pickup
  FROM gacha_data AS data
  JOIN gacha_available AS available ON available.gacha_id = data.id
  WHERE data.type = 3 AND data.card_type IN (1, 2)
  ORDER BY data.id, available.card_id
`;

export interface GachaBanner {
  event: TimelineRecord;
  pool: GachaPool;
}

export interface GachaSimulatorData {
  banners: GachaBanner[];
  characters: ReadonlyMap<number, CharacterData>;
  supports: ReadonlyMap<number, SupportCardData>;
  warning?: string;
}

/** Live and preliminary pools are exact; future JP banners use standard rate inference
 * and a release-date pool estimate, with each source kept visible in the page. */
export class GachaSimulatorRepository {
  #session = new MasterDataSession();

  async load(): Promise<GachaSimulatorData> {
    const [timeline, globalCharacters, globalSupportCards, opened] = await Promise.all([
      timelineRepository.load(),
      loadCharacters(),
      loadSupportCards(),
      this.#session.openPublished()
    ]);

    if (!opened)
      throw new Error(this.#session.loadError || 'The game database could not be opened.');

    const livePools = await this.#readPools('live');
    const pools = new Map(livePools);
    const warnings: string[] = [];
    let displayCharacters = globalCharacters;
    let displaySupports = new Map(globalSupportCards.map((card) => [Number(card.id), card]));

    try {
      if (await this.#session.openPreliminary()) {
        const preliminaryPools = await this.#readPools('preliminary');
        for (const event of timeline.events) {
          if (event.gachaId === undefined) continue;
          const preliminary = preliminaryPools.get(event.gachaId);
          if (preliminary && (event.preliminary || !livePools.has(event.gachaId)))
            pools.set(event.gachaId, preliminary);
        }
      }
    } catch {
      warnings.push('Preliminary pools could not be loaded.');
    }

    const futureEvents = timeline.events.filter(
      (event) =>
        event.gachaType === 3 &&
        event.gachaId !== undefined &&
        !pools.has(event.gachaId) &&
        bannerKind(event) !== undefined &&
        event.jpReleaseDate !== undefined
    );

    if (futureEvents.length) {
      try {
        const jpCatalog = await loadJpGachaCatalog(timeline.catalog.characters, globalSupportCards);
        let added = 0;
        for (const event of futureEvents) {
          const kind = bannerKind(event);
          if (!kind || !event.jpReleaseDate || event.gachaId === undefined) continue;

          try {
            const gacha = resolvePlannerGachaRates(
              {
                event_id: event.id,
                gacha_id: event.gachaId,
                gacha_type: 3,
                banner_kind: kind,
                start_date: event.date.toISOString(),
                end_date: (event.estimatedEndDate ?? event.date).toISOString(),
                pickups: [],
                rarity_rates: [],
                provenance: 'jp_fallback',
                confidence: 'timeline_schedule_defaults'
              },
              {
                featuredPickupIds: event.pickupCardIds,
                gachaType: 3,
                eventType: event.eventType
              }
            );
            pools.set(
              event.gachaId,
              createFutureGachaPool({
                gacha,
                kind,
                jpReleaseDate: event.jpReleaseDate,
                catalog: {
                  characters: [...jpCatalog.characters.values()],
                  supports: [...jpCatalog.supports.values()]
                }
              })
            );
            added++;
          } catch {
            // Collection banners and incomplete JP data stay out rather than using wrong rates.
          }
        }

        if (added < futureEvents.length)
          warnings.push(
            `${futureEvents.length - added} banners without reliable rates are left out.`
          );
        if (added) {
          displayCharacters = new Map([...displayCharacters, ...jpCatalog.characters]);
          displaySupports = new Map([...displaySupports, ...jpCatalog.supports]);
        }
      } catch {
        warnings.push('Future estimated pools could not be loaded.');
      }
    }

    const banners = timeline.events
      .flatMap((event): GachaBanner[] => {
        if (event.gachaId === undefined) return [];
        const pool = pools.get(event.gachaId);
        const kind = bannerKind(event);
        return pool && pool.kind === kind ? [{ event, pool }] : [];
      })
      .sort((left, right) => right.event.date.getTime() - left.event.date.getTime());

    if (!banners.length) throw new Error('No character or support banners are available.');

    return {
      banners,
      characters: displayCharacters,
      supports: displaySupports,
      warning: warnings.length ? [...new Set(warnings)].join(' ') : undefined
    };
  }

  destroy(): void {
    this.#session.destroy();
  }

  async #readPools(source: GachaPoolSource): Promise<Map<number, GachaPool>> {
    await this.#session.run(POOL_QUERY);
    const result = this.#session.result;
    if (this.#session.queryError) throw new Error(this.#session.queryError);
    if (!result) throw new Error('The game database returned no gacha pools.');
    if (result.truncated) throw new Error('The gacha pool response was too large to read safely.');

    return parseGachaPools(result.values, source);
  }
}

function bannerKind(event: TimelineRecord): GachaKind | undefined {
  if (event.eventType === 'character_banner') return 'character';
  if (event.eventType === 'support_card_banner') return 'support';
  return undefined;
}
