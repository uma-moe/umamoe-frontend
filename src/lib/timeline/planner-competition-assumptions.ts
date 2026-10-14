import type {
  CaratPlan,
  PlannerCompetitiveRewardVariant,
  PlannerCurrency,
  PlannerDataBundle,
  PlannerLedgerEntry,
} from './carat-planner';
import { plannerSourceItemTotals } from './planner-reward-currencies';
import { plannerUtcDay as utcDay, plannerDayKey } from './planner-calendar';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';

export interface CompetitionOption {
  value: string;
  label: string;
  amounts: Readonly<Partial<Record<PlannerCurrency, number>>>;
}

export interface CompetitionGroup {
  id: string;
  label: string;
  eventType: 'champions_meeting' | 'league_of_heroes';
  additionalIncome?: boolean;
  options: readonly CompetitionOption[];
}

function outcome(value: string, label: string, carats: number, totalTickets: number, rainbow = 0, gold = 0): CompetitionOption {
  const tickets = Math.floor(totalTickets / 2);
  return { value, label, amounts: { free_jewels: carats, uma_ticket: tickets, support_ticket: tickets, ...(rainbow ? { rainbow_crystal: rainbow } : {}), ...(gold ? { gold_crystal: gold } : {}) } };
}

export const COMPETITION_GROUPS: readonly CompetitionGroup[] = [
  { id: 'champions_meeting_result', label: "Champion's Meeting", eventType: 'champions_meeting', options: [
    outcome('champion', 'Champion', 2500, 10), outcome('second', 'Second', 1800, 8), outcome('third', 'Third', 1200, 6),
    outcome('group_b_first', 'Group B 1st', 1200, 6), outcome('group_b_second', 'Group B 2nd', 900, 4), outcome('group_b_third', 'Group B 3rd', 700, 2),
    outcome('open_first', 'Open League 1st', 1000, 6), outcome('open_second', 'Open League 2nd', 850, 4), outcome('open_third', 'Open League 3rd', 700, 2),
  ] },
  { id: 'champions_meeting_round_income', label: 'CM qualifying rounds', eventType: 'champions_meeting', additionalIncome: true, options: [
    { value: 'low_investment', label: 'Low investment', amounts: { free_jewels: 255 } },
    { value: 'competitive', label: 'Competitive', amounts: { free_jewels: 640 } },
    { value: 'meta_highroller', label: 'Meta highroller', amounts: { free_jewels: 1260 } },
  ] },
  { id: 'league_of_heroes_rank', label: 'League of Heroes', eventType: 'league_of_heroes', options: [
    outcome('platinum_4', 'Platinum 4', 3300, 4, 2, 2), outcome('platinum_3', 'Platinum 3', 2800, 4, 2, 2),
    outcome('platinum_2', 'Platinum 2', 2300, 4, 2, 2), outcome('platinum_1', 'Platinum 1', 1800, 4, 2, 2),
    outcome('gold_4', 'Gold 4', 1300, 4, 1, 2), outcome('gold_3', 'Gold 3', 1000, 2, 0, 2),
    outcome('gold_2', 'Gold 2', 700, 2, 0, 1), outcome('gold_1', 'Gold 1', 550, 0), outcome('silver_4', 'Silver 4', 400, 0),
  ] },
] as const;

export interface DataDrivenCompetitionOption {
  id: string;
  label: string;
  amounts: Partial<Record<PlannerCurrency, number>>;
  selectionValue?: string;
}

export function buildDataDrivenCompetitionOptions(variants: readonly PlannerCompetitiveRewardVariant[]): DataDrivenCompetitionOption[] {
  const competition = variants[0]?.competition;
  if (competition !== 'strongest_team' && competition !== 'legend_race') return [];
  const projectable = variants.filter((variant) => plannerSourceItemTotals(variant.source_items).size > 0);
  const missions = projectable.filter((variant) => /event(?: participation)? missions/i.test(variant.label));
  const results = projectable.filter((variant) => !missions.includes(variant)).sort((a, b) => outcomeOrder(a) - outcomeOrder(b) || a.label.localeCompare(b.label));
  const totals: Partial<Record<PlannerCurrency, number>> = {};
  const options = results.map((variant, index) => {
    addAmounts(totals, variant);
    const points = competition === 'strongest_team' ? evaluationPoints(variant.label) : undefined;
    return {
      id: variant.id,
      label: competition === 'legend_race' ? `${index + 1} ${index ? 'opponents' : 'opponent'} cleared` : points === undefined ? cleanLabel(variant.label) : `${points.toLocaleString()}+ evaluation points`,
      amounts: { ...totals },
      selectionValue: competition === 'strongest_team' ? points === undefined ? `tier_${index + 1}` : `points_${points}` : `opponents_${index + 1}`,
    };
  });
  if (competition === 'strongest_team') {
    const all = { ...totals }; missions.forEach((variant) => addAmounts(all, variant));
    return [{ id: [...results, ...missions].map((item) => item.id).join('+'), label: 'All rewards', amounts: all, selectionValue: 'all' }, ...options.reverse()];
  }
  if (missions.length) {
    const all = { ...totals }; missions.forEach((variant) => addAmounts(all, variant));
    return [...options, { id: [...results, ...missions].map((item) => item.id).join('+'), label: 'All opponents + event missions', amounts: all, selectionValue: 'all' }];
  }
  return options;
}

export function resolveDataDrivenCompetitionOption(groupId: string, selection: string | undefined, variants: readonly PlannerCompetitiveRewardVariant[]): DataDrivenCompetitionOption | undefined {
  if (!selection) return undefined;
  const expected = groupId === 'strongest_team_reward_tier' ? 'strongest_team' : groupId === 'legend_race_clears' ? 'legend_race' : undefined;
  if (!expected || variants[0]?.competition !== expected) return undefined;
  const options = buildDataDrivenCompetitionOptions(variants);
  if (selection === 'all') return options.find((option) => option.selectionValue === 'all') ?? options.at(-1);
  const exact = options.find((option) => option.selectionValue === selection);
  if (exact) return exact;
  const selectedNumber = Number(selection.match(/\d+/)?.[0]);
  if (!Number.isInteger(selectedNumber) || selectedNumber < 1) return undefined;
  if (expected === 'strongest_team' && selection.startsWith('points_')) {
    return options.filter((option) => option.selectionValue !== 'all').map((option) => ({ option, threshold: Number(option.selectionValue?.match(/points_(\d+)/)?.[1]) })).filter((entry) => Number.isFinite(entry.threshold) && entry.threshold <= selectedNumber).sort((a, b) => b.threshold - a.threshold)[0]?.option;
  }
  const tiers = options.filter((option) => option.selectionValue !== 'all');
  return tiers[Math.min(selectedNumber, tiers.length) - 1];
}

export function competitionIncomeEntries(plan: CaratPlan, bundle: PlannerDataBundle, fromExclusiveDay: number, throughDay: number): PlannerLedgerEntry[] {
  const entries: PlannerLedgerEntry[] = [];
  const events = bundle.timelineEvents ?? [];
  const disabled = new Set(plan.disabledEventIds);
  const selectedByEvent = plan.variableRewardSelections;
  const push = (id: string, label: string, day: number | undefined, amounts: Partial<Record<PlannerCurrency, number>> | undefined, source: PlannerLedgerEntry['source']) => {
    if (!inRange(day, fromExclusiveDay, throughDay)) return;
    for (const [currency, raw] of Object.entries(amounts ?? {}) as [PlannerCurrency, number][]) {
      const amount = Number.isFinite(raw) ? Math.max(0, Math.trunc(raw)) : 0;
      if (amount) entries.push({ id: `${id}:${currency}`, label, date: plannerDayKey(day), currency, amount, source });
    }
  };
  for (const [eventId, selection] of Object.entries(selectedByEvent)) {
    if (disabled.has(eventId)) continue;
    const event = events.find((item) => item.id === eventId);
    push(`competitive:${eventId}:${selection.optionId}`, selection.label, utcDay(selection.availableAt) ?? eventDay(event), selection.amounts, 'reward');
  }
  for (const group of COMPETITION_GROUPS) {
    const option = group.options.find((item) => item.value === plan.scenarioSelections[group.id]);
    if (!option) continue;
    for (const event of events) {
      if (event.eventType !== group.eventType || disabled.has(event.id) || (!group.additionalIncome && selectedByEvent[event.id])) continue;
      push(`competition-assumption:${event.id}:${option.value}`, `${group.label}: ${option.label}`, eventDay(event), option.amounts, 'rule');
    }
  }
  for (const [groupId, competition, label] of [['strongest_team_reward_tier', 'strongest_team', 'Strongest Team'], ['legend_race_clears', 'legend_race', 'Legend Races']] as const) {
    const variantsByEvent = new Map<string, PlannerCompetitiveRewardVariant[]>();
    for (const variant of bundle.rewards.competitive_variants ?? []) {
      if (variant.competition !== competition) continue;
      const group = variantsByEvent.get(variant.event_id) ?? [];
      group.push(variant); variantsByEvent.set(variant.event_id, group);
    }
    for (const [eventId, variants] of variantsByEvent) {
      if (disabled.has(eventId) || selectedByEvent[eventId]) continue;
      const selection = plan.scenarioSelections[groupId];
      const option = resolveDataDrivenCompetitionOption(groupId, selection, variants);
      if (!option) continue;
      const dates = variants.map(variant => utcDay(variant.available_at)).filter((date): date is number => date !== undefined);
      const masterIds = new Set(variants.map(variant => variant.master_event_id).filter((id): id is number => Number.isFinite(id)));
      const event = events.find(item => item.id === eventId) ?? events.find(item => masterIds.has(Number(item.id.match(/(\d+)$/)?.[1])) || [...masterIds].some(id => item.image?.endsWith(`/${id}.webp`)));
      const available = dates.length ? Math.min(...dates) : eventDay(event);
      push(`competition-assumption:${eventId}:${selection}`, `${label}: ${option.label}`, available, option.amounts, 'rule');
    }
  }
  return entries;
}

function eventDay(event: TimelineRecord | undefined): number | undefined { return utcDay(event?.estimatedEndDate) ?? utcDay(event?.date); }
function addAmounts(target: Partial<Record<PlannerCurrency, number>>, variant: PlannerCompetitiveRewardVariant): void { for (const [currency, amount] of plannerSourceItemTotals(variant.source_items)) target[currency] = (target[currency] ?? 0) + amount; }
function outcomeOrder(variant: PlannerCompetitiveRewardVariant): number {
  const points = evaluationPoints(variant.label);
  if (points !== undefined) return points;
  const rank = Number(variant.label.match(/(?:Team rank|rank)\s+(\d+)/i)?.[1]);
  if (Number.isFinite(rank) && rank > 0) return rank;
  return Number(variant.source_items[0]?.order_min) || Number.MAX_SAFE_INTEGER;
}
function evaluationPoints(label: string): number | undefined { const raw = label.match(/\(([\d,]+)(?:-|\s)/)?.[1] ?? label.match(/^([\d,]+)\+\s+evaluation points$/i)?.[1]; const value = Number(raw?.replaceAll(',', '')); return Number.isFinite(value) && value >= 0 ? value : undefined; }
function cleanLabel(label: string): string { return label.replace(/^League rank type\s+\d+,\s*/i, '').replace(/\s*\((?:rate|reward set)[^)]+\)\s*$/i, '').trim(); }
function inRange(value: number | undefined, from: number, through: number): value is number { return value !== undefined && value > from && value <= through; }
