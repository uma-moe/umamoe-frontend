import {
  PlannerCompetitiveRewardVariant,
  PlannerCurrency,
} from '../models/carat-planner.model';
import {
  isProjectableCompetitiveVariant,
  plannerSourceItemTotals,
} from './planner-reward-currencies';

export type PlannerCompetitionEventType =
  | 'champions_meeting'
  | 'league_of_heroes'
  | 'strongest_team'
  | 'legend_race';

export interface PlannerCompetitionAssumptionOption {
  value: string;
  label: string;
  amounts: Readonly<Partial<Record<PlannerCurrency, number>>>;
}

export interface PlannerCompetitionAssumptionGroup {
  id: string;
  label: string;
  eventType: Extract<PlannerCompetitionEventType, 'champions_meeting' | 'league_of_heroes'>;
  icon: string;
  scheduleLabel: string;
  options: readonly PlannerCompetitionAssumptionOption[];
}

export interface PlannerDataDrivenCompetitionAssumptionGroup {
  id: string;
  label: string;
  eventType: Extract<PlannerCompetitionEventType, 'strongest_team' | 'legend_race'>;
  icon: string;
  scheduleLabel: string;
  selectionMode: 'reward_tier' | 'opponents_cleared';
}

export interface PlannerDataDrivenCompetitionRewardOption {
  id: string;
  label: string;
  amounts: Partial<Record<PlannerCurrency, number>>;
}

function outcome(
  value: string,
  label: string,
  carats: number,
  totalTickets: number,
): PlannerCompetitionAssumptionOption {
  const ticketsPerBanner = Math.floor(totalTickets / 2);
  return {
    value,
    label,
    amounts: {
      free_jewels: carats,
      uma_ticket: ticketsPerBanner,
      support_ticket: ticketsPerBanner,
    },
  };
}

/**
 * Performance assumptions from Henry Handsome Derby's 5.5 calculator.
 * Ticket totals in that sheet are the combined trainee + support tickets,
 * so each even total is split equally between the two banner-specific pools.
 */
export const PLANNER_COMPETITION_ASSUMPTION_GROUPS: readonly PlannerCompetitionAssumptionGroup[] = [
  {
    id: 'champions_meeting_result',
    label: "Champion's Meeting",
    eventType: 'champions_meeting',
    icon: 'emoji_events',
    scheduleLabel: 'Each matching event',
    options: [
      outcome('champion', 'Champion', 3300, 10),
      outcome('second', 'Second', 2400, 8),
      outcome('third', 'Third', 1600, 6),
      outcome('group_b_first', 'Group B 1st', 1800, 6),
      outcome('group_b_second', 'Group B 2nd', 1250, 4),
      outcome('group_b_third', 'Group B 3rd', 1000, 2),
      outcome('open_first', 'Open League 1st', 1500, 6),
      outcome('open_second', 'Open League 2nd', 1250, 4),
      outcome('open_third', 'Open League 3rd', 1000, 2),
    ],
  },
  {
    id: 'league_of_heroes_rank',
    label: 'League of Heroes',
    eventType: 'league_of_heroes',
    icon: 'military_tech',
    scheduleLabel: 'Each matching event',
    options: [
      outcome('platinum_4', 'Platinum 4', 3300, 4),
      outcome('platinum_3', 'Platinum 3', 2800, 4),
      outcome('platinum_2', 'Platinum 2', 2300, 4),
      outcome('platinum_1', 'Platinum 1', 1800, 4),
      outcome('gold_4', 'Gold 4', 1300, 4),
      outcome('gold_3', 'Gold 3', 1000, 2),
      outcome('gold_2', 'Gold 2', 700, 2),
      outcome('gold_1', 'Gold 1', 550, 0),
      outcome('silver_4', 'Silver 4', 400, 0),
    ],
  },
] as const;

/**
 * Global selectors whose projected amount must be derived from each event's
 * generated competitive reward rows. Strongest Team milestone tables can
 * change between events, and Legend Races do not always have the same number
 * of opponents, so fixed totals would make later occurrences inaccurate.
 */
export const PLANNER_DATA_DRIVEN_COMPETITION_ASSUMPTION_GROUPS:
readonly PlannerDataDrivenCompetitionAssumptionGroup[] = [
  {
    id: 'strongest_team_reward_tier',
    label: 'Strongest Team',
    eventType: 'strongest_team',
    icon: 'group_work',
    scheduleLabel: 'Each matching event',
    selectionMode: 'reward_tier',
  },
  {
    id: 'legend_race_clears',
    label: 'Legend Races',
    eventType: 'legend_race',
    icon: 'sports_motorsports',
    scheduleLabel: 'Each matching event',
    selectionMode: 'opponents_cleared',
  },
] as const;

export function buildDataDrivenCompetitionRewardOptions(
  variants: readonly PlannerCompetitiveRewardVariant[],
): PlannerDataDrivenCompetitionRewardOption[] {
  const competition = variants[0]?.competition;
  if (competition !== 'strongest_team' && competition !== 'legend_race') return [];

  const projectable = variants.filter(variant => isProjectableCompetitiveVariant(variant));
  const missionVariants = competition === 'strongest_team'
    ? projectable.filter(variant => /event missions/i.test(variant.label))
    : [];
  const resultVariants = projectable
    .filter(variant => !missionVariants.includes(variant))
    .sort((left, right) => competitiveOutcomeOrder(left) - competitiveOutcomeOrder(right)
      || left.label.localeCompare(right.label));
  const totals: Partial<Record<PlannerCurrency, number>> = {};
  const options = resultVariants.map((variant, index) => {
    addVariantAmounts(totals, variant);
    return {
      id: variant.id,
      label: competition === 'legend_race'
        ? `${index + 1} ${index === 0 ? 'opponent' : 'opponents'} cleared`
        : cleanCompetitiveOutcomeLabel(variant.label),
      amounts: { ...totals },
    };
  });

  if (missionVariants.length > 0) {
    const amounts = { ...totals };
    missionVariants.forEach(variant => addVariantAmounts(amounts, variant));
    options.push({
      id: missionVariants.map(variant => variant.id).join('+'),
      label: 'All milestones + event missions',
      amounts,
    });
  }
  return options;
}

export function resolveDataDrivenCompetitionAssumption(
  groupId: string,
  selectionValue: string | undefined,
  variants: readonly PlannerCompetitiveRewardVariant[],
): PlannerDataDrivenCompetitionRewardOption | undefined {
  if (!selectionValue) return undefined;
  const group = PLANNER_DATA_DRIVEN_COMPETITION_ASSUMPTION_GROUPS.find(item => item.id === groupId);
  if (!group || variants[0]?.competition !== group.eventType) return undefined;
  const options = buildDataDrivenCompetitionRewardOptions(variants);
  if (options.length === 0) return undefined;
  if (selectionValue === 'all') return options[options.length - 1];

  const selectedNumber = Number(selectionValue.match(/\d+/)?.[0]);
  if (!Number.isInteger(selectedNumber) || selectedNumber < 1) return undefined;
  const tierOptions = group.selectionMode === 'reward_tier'
    && /all milestones/i.test(options[options.length - 1].label)
    ? options.slice(0, -1)
    : options;
  if (tierOptions.length === 0) return undefined;
  return tierOptions[Math.min(selectedNumber, tierOptions.length) - 1];
}

export function plannerDataDrivenCompetitionAssumptionGroup(
  groupId: string,
): PlannerDataDrivenCompetitionAssumptionGroup | undefined {
  return PLANNER_DATA_DRIVEN_COMPETITION_ASSUMPTION_GROUPS.find(group => group.id === groupId);
}

export function plannerDataDrivenCompetitionAssumptionForEventType(
  eventType: string | undefined,
): PlannerDataDrivenCompetitionAssumptionGroup | undefined {
  return PLANNER_DATA_DRIVEN_COMPETITION_ASSUMPTION_GROUPS.find(group => group.eventType === eventType);
}

function addVariantAmounts(
  totals: Partial<Record<PlannerCurrency, number>>,
  variant: PlannerCompetitiveRewardVariant,
): void {
  for (const [currency, amount] of plannerSourceItemTotals(variant.source_items)) {
    totals[currency] = (totals[currency] ?? 0) + amount;
  }
}

function competitiveOutcomeOrder(variant: PlannerCompetitiveRewardVariant): number {
  const rangeStart = Number(variant.label.match(/\((\d+)(?:-|\s)/)?.[1]);
  if (Number.isFinite(rangeStart)) return rangeStart;
  const rank = Number(variant.label.match(/(?:Team rank|rank)\s+(\d+)/i)?.[1]);
  if (Number.isFinite(rank)) return rank;
  return Number(variant.source_items[0]?.order_min) || Number.MAX_SAFE_INTEGER;
}

function cleanCompetitiveOutcomeLabel(label: string): string {
  return label
    .replace(/^League rank type\s+\d+,\s*/i, '')
    .replace(/\s*\((?:rate|reward set)[^)]+\)\s*$/i, '')
    .trim();
}

export function plannerCompetitionAssumptionGroup(
  groupId: string,
): PlannerCompetitionAssumptionGroup | PlannerDataDrivenCompetitionAssumptionGroup | undefined {
  return PLANNER_COMPETITION_ASSUMPTION_GROUPS.find(group => group.id === groupId)
    ?? plannerDataDrivenCompetitionAssumptionGroup(groupId);
}
