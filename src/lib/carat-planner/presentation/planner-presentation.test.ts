import { describe, expect, it } from 'vitest';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
import {
  createPlan,
  findGacha,
  plannerPickupGoals,
  plannerTargetEvents,
  projectPlan,
  resolvePlannerPullDate,
  sanitizePlan,
  synchronizePlannerTargets,
  type PlannerGachaEntry,
  type PlannerTarget
} from '../carat-planner';
import {
  filterPlannerBanners,
  plannerPickupOptions,
  plannerPullPlanItems
} from './planner-presentation';

function event(
  id: string,
  title: string,
  date: string,
  extra: Partial<TimelineRecord> = {}
): TimelineRecord {
  return {
    id,
    title,
    date: new Date(date),
    typeLabel: 'Character scout',
    dateLabel: date,
    eventType: 'character_banner',
    gachaIds: [],
    pickupCardIds: [],
    relatedCharacters: [],
    relatedSupportCards: [],
    relatedSupportCardNames: [],
    tags: [],
    plannerRewardAvailable: false,
    ...extra
  };
}

function target(
  id: string,
  start: string,
  end = start,
  extra: Partial<PlannerTarget> = {}
): PlannerTarget {
  return {
    id,
    eventId: id,
    title: id,
    bannerStart: start,
    bannerEnd: end,
    bannerKind: 'character',
    plannedPulls: 10,
    desiredCopies: 1,
    pullTiming: 'end',
    useTickets: false,
    allowPaidJewels: false,
    ...extra
  };
}

describe('Angular Planner search and pull-plan presentation', () => {
  it('offers paid banners even while their master data is unavailable', () => {
    const ready = event('step-up', 'SSR Support Select Step-Up', '2026-09-01', {
      eventType: 'paid_banner',
      gachaType: 14,
      canPlan: true
    });

    const missing = event('future-step-up', 'Select Step-Up', '2026-10-01', {
      eventType: 'support_card_banner',
      gachaType: 14,
      canPlan: false
    });

    expect(filterPlannerBanners([ready, missing], 'step up', '2026-08-01', '2026-08-01')).toEqual([
      ready,
      missing
    ]);
  });

  it('searches banner labels and tags regardless of spaces or hyphens', () => {
    const events = [
      event('step', 'Premium banner', '2026-09-01', {
        eventType: 'paid_banner',
        gachaType: 14,
        gachaLabel: 'Select step-up',
        canPlan: true
      }),
      event('pick', 'Support selection', '2026-09-01', {
        eventType: 'support_card_banner',
        gachaType: 12,
        gachaLabel: 'Pick 2'
      }),
      event('return', 'Oguri Cap', '2026-09-01', { tags: ['rerun-banner'] }),
      event('jp', 'オグリキャップ', '2026-09-01')
    ];

    for (const [id, queries] of [
      ['step', ['stepup', 'step up', 'step-up']],
      ['pick', ['pick2', 'pick 2', 'pick-2']],
      ['return', ['rerun', 're-run']],
      ['jp', ['オグリキャップ']]
    ] as const) {
      for (const query of queries)
        expect(
          filterPlannerBanners(events, query, '2026-08-01', '2026-08-01').map((item) => item.id)
        ).toEqual([id]);
    }
  });

  it('keeps all rate-up options and saved goals within Angular’s 20-goal storage boundary', () => {
    const item = target('banner', '2026-09-01', '2026-09-02', {
      pickupId: 999,
      desiredCopies: 7,
      pickupGoals: Array.from({ length: 22 }, (_, index) => ({
        pickupId: 101301 + index,
        desiredCopies: index + 1
      }))
    });

    const plan = createPlan();
    plan.targets = [item];
    const saved = sanitizePlan(plan)!.targets[0]!;
    expect(saved.pickupGoals).toHaveLength(20);
    expect(saved.pickupId).toBe(101301);
    expect(saved.desiredCopies).toBe(1);
    const empty = { ...item, pickupGoals: [] };

    plan.targets = [empty];
    expect(plannerPickupGoals(sanitizePlan(plan)!.targets[0]!)).toEqual([]);
    const gacha: PlannerGachaEntry = {
      event_id: 'banner',
      gacha_id: 1,
      banner_kind: 'character',
      start_date: '2026-09-01',
      end_date: '2026-09-02',
      pickups: Array.from({ length: 13 }, (_, index) => ({
        pickup_id: 101301 + index,
        rate: index === 0 ? 0.75 : 0.001
      }))
    };

    const options = plannerPickupOptions(
      saved,
      gacha,
      [
        event('banner', 'Banner', '2026-09-01', {
          pickupCardIds: [101301],
          relatedCharacters: ['Mejiro McQueen']
        })
      ],
      { characters: { 1013: { name: 'Mejiro McQueen', skins: {} } }, supports: new Map() }
    );

    expect(options).toHaveLength(20);
    expect(options[0]).toMatchObject({
      name: 'Mejiro McQueen',
      image: '/game-assets/character_thumbs/chara_stand_1013_101301.webp',
      rate: 0.75
    });

    expect(options.at(-1)!.rate).toBeUndefined();
    plan.targets = [{ ...item, pickupGoals: [item.pickupGoals![0]!, item.pickupGoals![0]!] }];
    expect(sanitizePlan(plan)!.targets[0]!.pickupGoals).toHaveLength(1);
  });

  it('refreshes resource-owned metadata, including disabled targets, without changing user choices or timestamps', () => {
    const plan = createPlan();
    plan.targets = [
      target(' Character__1 ', '2026-09-01', '2026-10-01', {
        imagePath: '/old.webp',
        gachaId: 1,
        gachaIds: [1],
        plannedPulls: 345,
        pullTiming: 'custom',
        customPullDate: '2026-10-04',
        pickupGoals: [{ pickupId: 101, desiredCopies: 3 }],
        allowPaidJewels: true,
        ticketLimit: 4
      })
    ];

    plan.disabledEventIds = [plan.targets[0]!.eventId];
    const current = [
      event('character-1', 'Updated banner', '2026-09-20', {
        eventType: 'support_card_banner',
        gachaId: 2
      })
    ];

    const synced = synchronizePlannerTargets(plan, current);
    expect(synced.targets[0]).toEqual({
      ...plan.targets[0],
      title: 'Updated banner',
      bannerKind: 'support',
      bannerStart: '2026-09-20',
      bannerEnd: '2026-09-20',
      gachaId: 2,
      imagePath: undefined,
      gachaIds: undefined
    });

    expect(synced.updatedAt).toBe(plan.updatedAt);
    expect(plan.targets[0]!.bannerStart).toBe('2026-09-01');
    expect(synchronizePlannerTargets(synced, current)).toBe(synced);
    expect(plannerTargetEvents(synced, current)).toEqual([]);
  });

  it('loads imported targets by gacha IDs or saved schedule and pickup goals, with Angular resource date precedence', () => {
    const plan = createPlan();
    const current = [event('character-1', 'Current title', '2026-09-20')];
    plan.targets = [
      target('CHARACTER_1', '2026-09-01', '2026-12-01', { pickupId: 123 }),
      target('imported', '2026-08-01', '2026-08-10', {
        gachaIds: [7],
        pickupGoals: [{ pickupId: 456, desiredCopies: 2 }]
      }),
      target('undated', 'invalid', 'invalid', { gachaId: 8 })
    ];

    const references = plannerTargetEvents(plan, current);
    expect(references[0]).toMatchObject({
      id: 'character-1',
      date: new Date('2026-09-20'),
      estimatedEndDate: undefined,
      pickupCardIds: [123]
    });

    expect(references[1]).toMatchObject({
      id: 'imported',
      gachaIds: [7],
      pickupCardIds: [456],
      date: new Date('2026-08-01')
    });

    expect(references[2]!.date).toBeUndefined();
    const gachas: PlannerGachaEntry[] = [
      {
        gacha_id: 7,
        banner_kind: 'character',
        start_date: '2026-09-25T18:00:00-07:00',
        end_date: '2026-10-03'
      },
      { gacha_id: 8, banner_kind: 'character', start_date: '2026-10-10', end_date: '2026-10-15' },
      {
        event_id: 'character-1',
        gacha_id: 9,
        banner_kind: 'character',
        start_date: '2026-09-21',
        end_date: '2026-09-30'
      }
    ];

    expect(findGacha(plan.targets[0]!, { gachas })).toBe(gachas[2]);
    expect(
      synchronizePlannerTargets(plan, current, gachas).targets.map((item) => [
        item.bannerStart,
        item.bannerEnd
      ])
    ).toEqual([
      ['2026-09-20', '2026-09-30'],
      ['2026-09-26', '2026-10-03'],
      ['2026-10-10', '2026-10-15']
    ]);
  });

  it('ranks full titles and participant names before prefixes, with token and rerun aliases', () => {
    const events = [
      event('prefix', 'Oguri Cap rerun', '2026-08-01'),
      event('participant', 'Autumn pickup', '2026-10-01', { relatedCharacters: ['Oguri Cap'] }),
      event('exact', 'Oguri Cap', '2026-10-20'),
      event('support', 'Summer support', '2026-09-01', {
        eventType: 'support_card_banner',
        pickups: [
          {
            id: '30028',
            name: 'Kitasan Black',
            image: '',
            kind: 'support',
            subLabel: 'SSR Stamina Support',
            searchTerms: ['support', 'stamina']
          }
        ]
      }),
      event('paid', 'Oguri Cap', '2026-08-01', { eventType: 'paid_banner' }),
      event('variant', 'Summer pickup', '2026-09-05', {
        pickups: [
          {
            id: '101302',
            name: 'Mejiro McQueen [End of Sky]',
            image: '',
            kind: 'character',
            subLabel: 'End of Sky variant',
            searchTerms: ['Mejiro McQueen', 'End of Sky']
          }
        ]
      })
    ];

    const find = (query: string) =>
      filterPlannerBanners(events, query, '2026-09-01', '2026-08-29').map((item) => item.id);

    expect(find('Oguri Cap')).toEqual(['exact', 'paid', 'participant', 'prefix']);
    expect(find('ré-vivál')).toEqual(['prefix']);
    expect(find('kitasan stamina')).toEqual(['support']);
    expect(find('End of Sky')).toEqual(['variant']);
    expect(find('')).toEqual(['support', 'variant', 'participant', 'exact', 'paid', 'prefix']);
    expect(
      filterPlannerBanners(events, '', '2026-09-01', '2026-10-05').map((item) => item.id)
    ).toEqual(['exact', 'participant', 'variant', 'support', 'paid', 'prefix']);
    expect(events[0]!.id).toBe('prefix');
  });

  it('uses Angular date fallbacks in both the row order and funding projection', () => {
    const plan = createPlan();
    plan.projectionStartDate = '2026-09-05';
    const custom = target('custom', '2026-09-01', '2026-09-10', { pullTiming: 'custom' });
    expect(resolvePlannerPullDate(custom, '2026-09-20')).toBe('2026-09-01');
    expect(resolvePlannerPullDate({ ...custom, customPullDate: 'invalid' }, '2026-09-20')).toBe(
      '2026-09-01'
    );

    expect(resolvePlannerPullDate({ ...custom, bannerStart: undefined }, '2026-09-20')).toBe(
      '2026-09-20'
    );

    expect(
      resolvePlannerPullDate({ ...custom, pullTiming: 'end', bannerEnd: 'invalid' }, '2026-09-20')
    ).toBe('2026-09-01');

    plan.targets = [custom];
    expect(projectPlan(plan).targets).toEqual([]);
    plan.targets[0]!.customPullDate = '2026-09-06';
    expect(projectPlan(plan).targets[0]?.pullDate).toBe('2026-09-06');
  });

  it('interleaves the latest anniversary before each upcoming pull and keeps past targets last', () => {
    const plan = createPlan();
    plan.projectionStartDate = '2026-09-01';
    plan.targets = [
      target('later', '2026-09-01', '2026-09-30'),
      target('past-old', '2026-08-01'),
      target('first', '2026-09-05'),
      target('past-new', '2026-08-30'),
      target('hidden', '2026-09-01'),
      target('same-day', '2026-09-05')
    ];
    plan.disabledEventIds = ['hidden'];
    const events = [
      event('half', 'Half-Anniversary campaign', '2026-09-02'),
      event('half-part2', '0.5-Year Anniversary', '2026-09-03'),
      event('first-year', '1st Anniversary', '2026-09-20'),
      event('old', '11th Anniversary', '2026-08-01')
    ];

    const items = plannerPullPlanItems(plan, events, '2026-08-29');
    expect(items.map((item) => item.id)).toEqual([
      'anniversary:0.5',
      'target:first',
      'target:same-day',
      'anniversary:1',
      'target:later',
      'target:past-new',
      'target:past-old'
    ]);
    expect(items[0]).toMatchObject({ label: '0.5-Year Anniversary', date: '2026-09-02' });
    expect(items[3]).toMatchObject({ label: '1st Anniversary' });
    expect(items.at(-1)).toMatchObject({ past: true });
  });
});
