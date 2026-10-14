import type { CaratPlan, PlannerCustomIncome, PlannerDataBundle, PlannerIncomeRule, PlannerTarget } from '../../../src/lib/timeline/carat-planner';
import type { TimelineRecord } from '../../../src/pages/timeline/timeline-repository';

export function plannerLedgerCases(base: CaratPlan) {
  const target = (id: string, date: string): PlannerTarget => ({ id, eventId: id, title: id, bannerKind: 'character', bannerStart: date, bannerEnd: date, pullTiming: 'end', plannedPulls: 0, desiredCopies: 1, useTickets: false, allowPaidJewels: false });
  const custom = (id: string, amount: number, startDate = '2026-09-01', extra: Partial<PlannerCustomIncome> = {}): PlannerCustomIncome => ({ id, label: id, amount, currency: 'free_jewels', cadence: 'once', startDate, ...extra });
  const event = (id: string, eventType: string, date = '2026-09-01', end = '2026-09-03', image = '') => ({ id, eventType, title: id, date: new Date(date), estimatedEndDate: new Date(end), image }) as TimelineRecord;
  const rule = (extra: Partial<PlannerIncomeRule> = {}): PlannerIncomeRule => ({ id: 'daily', label: 'Daily', currency: 'free_jewels', amount: 1, cadence: 'daily', start_date: '2026-09-01', ...extra });
  const cases: { name: string; plan: CaratPlan; data: PlannerDataBundle; through: string }[] = [];
  const add = (name: string, plan: Partial<CaratPlan> = {}, data: Partial<PlannerDataBundle> = {}, through = '2026-09-03') => cases.push({ name, through,
    plan: { ...structuredClone(base), id: name, projectionStartDate: '2026-09-01', balances: { freeJewels: 100, paidJewels: 0, umaTickets: 0, supportTickets: 0, rainbowCrystals: 0, goldCrystals: 0, rainbowFullCrystals: 0, goldFullCrystals: 0 }, scenarioSelections: {}, variableRewardSelections: {}, enabledIncomeRuleIds: [], enabledRewardIds: [], disabledRewardIds: [], enabledRewardEventIds: [], disabledEventIds: [], customIncome: [], targets: [target('target', through)], ...plan },
    data: { core: {}, income: { rules: [] }, rewards: { rewards: [] }, ...data }
  });
  add('deduction-before-gift', { customIncome: [custom('deduct', -200), custom('gift', 100, '2026-09-02')] });
  add('same-date-deduction-first', { customIncome: [custom('a-deduction', -200), custom('z-gift', 100)] });
  add('same-date-gift-first', { customIncome: [custom('z-deduction', -200), custom('a-gift', 100)] });
  add('recurring-deduction', { customIncome: [custom('daily', -80, '2026-09-01', { cadence: 'daily' }), custom('gift', 100, '2026-09-03')] });
  add('fraction-truncated-per-occurrence', { enabledIncomeRuleIds: ['daily'] }, { income: { rules: [rule({ amount: 1.9 })] } });
  add('daily-occurrence-ceiling', { enabledIncomeRuleIds: ['daily'] }, { income: { rules: [rule()] } }, '2060-01-01');
  add('old-rule-past-occurrence-ceiling', { enabledIncomeRuleIds: ['daily'] }, { income: { rules: [rule({ start_date: '1990-01-01' })] } });
  add('monthly-last-day', { projectionStartDate: '2026-01-01', enabledIncomeRuleIds: ['daily'] }, { income: { rules: [rule({ cadence: 'monthly', start_date: '2026-01-31' })] } }, '2026-03-31');
  add('monthly-interval-and-end', { projectionStartDate: '2026-01-01', enabledIncomeRuleIds: ['daily'] }, { income: { rules: [rule({ cadence: 'monthly', start_date: '2026-01-31', every: 3, end_date: '2026-04-29' })] } }, '2026-10-31');
  add('weekday-zero-means-sunday', { enabledIncomeRuleIds: ['daily'] }, { income: { rules: [rule({ cadence: 'weekly', weekday: 0 })] } }, '2026-09-20');
  add('invalid-weekday-keeps-anchor', { enabledIncomeRuleIds: ['daily'] }, { income: { rules: [rule({ cadence: 'weekly', weekday: Number.NaN })] } }, '2026-09-20');
  add('explicit-rule-end', { enabledIncomeRuleIds: ['daily'] }, { income: { rules: [rule({ end_date: '2026-09-02' })] } });
  add('negative-reward-and-later-gift', { customIncome: [custom('gift', 50, '2026-09-03')] }, { rewards: { rewards: [{ id: 'deduct', label: 'Deduction', currency: 'free_jewels', amount: -200, available_at: '2026-09-02', default_enabled: true }] } });
  add('ongoing-reward-collected-at-start', {}, { rewards: { rewards: [{ id: 'ongoing', event_id: 'ongoing', label: 'Ongoing event', currency: 'free_jewels', amount: 50, available_at: '2026-08-20', available_until: '2026-09-02', default_enabled: true }] } });
  add('reward-event-id-does-not-enable-excluded-gift', { enabledRewardEventIds: ['story'], scenarioSelections: { story_event_rewards: 'none' } }, { rewards: { rewards: [{ id: 'story', event_id: 'story', label: 'Story event rewards', assumption: 'full_completion', currency: 'free_jewels', amount: 1500, available_at: '2026-09-01' }] } });
  const cm = event('cm', 'champions_meeting');
  add('competition-end-date', { scenarioSelections: { champions_meeting_result: 'champion', champions_meeting_round_income: 'competitive' }, targets: [target('early', '2026-09-02'), target('late', '2026-09-03')] }, { timelineEvents: [cm] });
  const variants = [{ id: 'one', event_id: 'legend', competition: 'legend_race', label: 'Opponent one', available_at: '2026-09-03', source_items: [{ item_category: 90, item_id: 43, amount: 150 }] }, { id: 'two', event_id: 'legend', competition: 'legend_race', label: 'Opponent two', available_at: '2026-09-01', source_items: [{ item_category: 90, item_id: 43, amount: 200 }] }];
  add('variant-earliest-published-date', { scenarioSelections: { legend_race_clears: 'all' } }, { timelineEvents: [event('legend', 'legend_race')], rewards: { rewards: [], competitive_variants: variants } });
  add('variant-master-id-fallback', { scenarioSelections: { legend_race_clears: 'all' } }, { timelineEvents: [event('renamed-event', 'legend_race', '2026-09-01', '2026-09-03', '/race/44.webp')], rewards: { rewards: [], competitive_variants: variants.map(item => ({ ...item, available_at: undefined, master_event_id: 44 })) } });
  add('explicit-result-keeps-qualifiers', { scenarioSelections: { champions_meeting_result: 'champion', champions_meeting_round_income: 'competitive' }, variableRewardSelections: { cm: { optionId: 'chosen', label: 'Chosen', availableAt: '', amounts: { free_jewels: 700 } } } }, { timelineEvents: [cm] });
  add('disabled-event-income', { scenarioSelections: { champions_meeting_result: 'champion' }, disabledEventIds: ['cm'] }, { timelineEvents: [cm] });
  const comparison = { observation_end: '2026-01-31', speculative_monthly_carats: 2800, speculative_recent_median_monthly_carats: 1400 };
  add('speculative-monthly-checkpoints-before-deduction', { projectionStartDate: '2026-01-31', scenarioSelections: { speculative_income: 'include' }, customIncome: [custom('deduct', -5000, '2026-03-01')] }, { rewards: { rewards: [], global_reward_comparison: comparison } }, '2026-03-15');
  add('speculative-intermediate-pull-date', { projectionStartDate: '2026-01-31', scenarioSelections: { speculative_income: 'median' }, targets: [target('first', '2026-02-14'), target('second', '2026-03-15')] }, { rewards: { rewards: [], global_reward_comparison: comparison } }, '2026-03-15');
  add('weekly-huge-interval-still-has-first-entry', { enabledIncomeRuleIds: ['daily'] }, { income: { rules: [rule({ cadence: 'weekly', every: Number.MAX_VALUE })] } });
  add('resource-date-rollover', { projectionStartDate: '2027-01-01', enabledIncomeRuleIds: ['daily'] }, { income: { rules: [rule({ start_date: '2026-13-05' })] } }, '2027-01-07');
  add('no-target-leaves-income-unallocated', { targets: [], customIncome: [custom('gift', 100)] }, {}, '2026-09-01');
  add('funding-between-deductions-and-gifts', {
    customIncome: [custom('spent', -200), custom('gift', 450, '2026-09-02'), custom('spent-again', -200, '2026-09-03'), custom('tickets', 3, '2026-09-04', { currency: 'uma_ticket' })],
    targets: [target('first', '2026-09-02'), target('second', '2026-09-04')].map(item => ({ ...item, plannedPulls: 2, useTickets: true }))
  }, {}, '2026-09-04');
  return cases;
}
