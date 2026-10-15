import { describe, expect, it } from 'vitest';
import {
  buildDataDrivenCompetitionOptions,
  competitionIncomeEntries
} from './planner-competition-assumptions';
import {
  createPlan,
  type PlannerCompetitiveRewardVariant,
  type PlannerDataBundle
} from '../carat-planner';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';

const carats = (amount: number) => [{ item_category: 90, item_id: 43, amount }];

describe('planner competition assumptions', () => {
  it('uses the Angular CM result and qualifying income as separate amounts', () => {
    const plan = createPlan();
    plan.scenarioSelections.champions_meeting_result = 'group_b_second';
    plan.scenarioSelections.champions_meeting_round_income = 'competitive';
    const event = {
      id: 'cm',
      eventType: 'champions_meeting',
      date: new Date('2026-02-01T00:00:00Z')
    } as TimelineRecord;

    const bundle = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: [] },
      timelineEvents: [event]
    } satisfies PlannerDataBundle;

    const start = Math.trunc(Date.parse('2026-01-01T00:00:00Z') / 86_400_000);
    const end = Math.trunc(Date.parse('2026-02-01T00:00:00Z') / 86_400_000);
    const income = competitionIncomeEntries(plan, bundle, start, end);
    expect(
      income
        .filter((item) => item.currency === 'free_jewels')
        .reduce((sum, item) => sum + item.amount, 0)
    ).toBe(1_540);
    expect(income.every((item) => item.source === 'rule' && item.date === '2026-02-01')).toBe(true);
  });

  it('builds cumulative Legend Race options from event-specific rows', () => {
    const variants: PlannerCompetitiveRewardVariant[] = [
      {
        id: 'one',
        competition: 'legend_race',
        event_id: 'legend',
        label: 'Opponent one',
        source_items: carats(150)
      },
      {
        id: 'two',
        competition: 'legend_race',
        event_id: 'legend',
        label: 'Opponent two',
        source_items: carats(200)
      }
    ];

    expect(
      buildDataDrivenCompetitionOptions(variants).map((option) => option.amounts.free_jewels)
    ).toEqual([150, 350]);
  });

  it('lets an explicit event outcome override the global final-result assumption', () => {
    const plan = createPlan();
    plan.scenarioSelections.champions_meeting_result = 'champion';
    plan.variableRewardSelections.cm = {
      optionId: 'open_third',
      label: 'Open League 3rd',
      amounts: { free_jewels: 700 },
      availableAt: '2026-02-01'
    };

    const event = {
      id: 'cm',
      eventType: 'champions_meeting',
      date: new Date('2026-02-01T00:00:00Z')
    } as TimelineRecord;

    const bundle = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: [] },
      timelineEvents: [event]
    } satisfies PlannerDataBundle;

    const start = Math.trunc(Date.parse('2026-01-01T00:00:00Z') / 86_400_000);
    const end = Math.trunc(Date.parse('2026-02-01T00:00:00Z') / 86_400_000);
    const income = competitionIncomeEntries(plan, bundle, start, end);
    expect(income).toEqual([
      {
        id: 'competitive:cm:open_third:free_jewels',
        label: 'Open League 3rd',
        date: '2026-02-01',
        currency: 'free_jewels',
        amount: 700,
        source: 'reward'
      }
    ]);
  });
});
