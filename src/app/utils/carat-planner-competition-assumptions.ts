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
  icon?: string;
  amounts: Readonly<Partial<Record<PlannerCurrency, number>>>;
}

export interface PlannerCompetitionAssumptionGroup {
  id: string;
  label: string;
  eventType: Extract<PlannerCompetitionEventType, 'champions_meeting' | 'league_of_heroes'>;
  icon: string;
  scheduleLabel: string;
  helpText?: string;
  sourceUrl?: string;
  additionalIncome?: boolean;
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
  selectionValue?: string;
}

function outcome(
  value: string,
  label: string,
  carats: number,
  totalTickets: number,
  rainbowShards = 0,
  goldShards = 0,
): PlannerCompetitionAssumptionOption {
  const ticketsPerBanner = Math.floor(totalTickets / 2);
  return {
    value,
    label,
    amounts: {
      free_jewels: carats,
      uma_ticket: ticketsPerBanner,
      support_ticket: ticketsPerBanner,
      ...(rainbowShards > 0 ? { rainbow_crystal: rainbowShards } : {}),
      ...(goldShards > 0 ? { gold_crystal: goldShards } : {}),
    },
  };
}

/**
 * Final placements and qualifying-round income are separate so selecting a
 * participation profile cannot silently change the chosen final result.
 * Ticket totals are combined trainee + support tickets and are split equally
 * between the two banner-specific pools.
 */
export const PLANNER_COMPETITION_ASSUMPTION_GROUPS: readonly PlannerCompetitionAssumptionGroup[] = [
  {
    id: 'champions_meeting_result',
    label: "Champion's Meeting",
    eventType: 'champions_meeting',
    icon: 'emoji_events',
    scheduleLabel: 'Final placement reward only',
    options: [
      outcome('champion', 'Champion', 2500, 10),
      outcome('second', 'Second', 1800, 8),
      outcome('third', 'Third', 1200, 6),
      outcome('group_b_first', 'Group B 1st', 1200, 6),
      outcome('group_b_second', 'Group B 2nd', 900, 4),
      outcome('group_b_third', 'Group B 3rd', 700, 2),
      outcome('open_first', 'Open League 1st', 1000, 6),
      outcome('open_second', 'Open League 2nd', 850, 4),
      outcome('open_third', 'Open League 3rd', 700, 2),
    ],
  },
  {
    id: 'champions_meeting_round_income',
    label: 'CM qualifying rounds',
    eventType: 'champions_meeting',
    icon: 'sports_score',
    scheduleLabel: 'Round 1 + Round 2 of each event',
    helpText: [
      'Estimated Graded League Carats from the two qualifying rounds. Final placement rewards are counted separately.',
      '',
      'Low investment: 6 entries per round, averaging 1–2 wins; Round 2 uses Group B payouts (105 + 150 = 255).',
      'Competitive: all 8 entries per round, averaging 3 wins; Round 2 uses Group A payouts (240 + 400 = 640).',
      'Meta highroller: all 8 entries per round, averaging 4–5 wins; Round 2 uses Group A payouts (360 + 900 = 1,260).',
    ].join('\n'),
    sourceUrl: 'https://game8.jp/umamusume/390471',
    additionalIncome: true,
    options: [
      {
        value: 'low_investment',
        label: 'Low investment',
        icon: 'savings',
        amounts: { free_jewels: 255 },
      },
      {
        value: 'competitive',
        label: 'Competitive',
        icon: 'emoji_events',
        amounts: { free_jewels: 640 },
      },
      {
        value: 'meta_highroller',
        label: 'Meta highroller',
        icon: 'diamond',
        amounts: { free_jewels: 1260 },
      },
    ],
  },
  {
    id: 'league_of_heroes_rank',
    label: 'League of Heroes',
    eventType: 'league_of_heroes',
    icon: 'military_tech',
    scheduleLabel: 'Each matching event',
    options: [
      outcome('platinum_4', 'Platinum 4', 3300, 4, 2, 2),
      outcome('platinum_3', 'Platinum 3', 2800, 4, 2, 2),
      outcome('platinum_2', 'Platinum 2', 2300, 4, 2, 2),
      outcome('platinum_1', 'Platinum 1', 1800, 4, 2, 2),
      outcome('gold_4', 'Gold 4', 1300, 4, 1, 2),
      outcome('gold_3', 'Gold 3', 1000, 2, 0, 2),
      outcome('gold_2', 'Gold 2', 700, 2, 0, 1),
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
  const missionVariants = competition === 'strongest_team' || competition === 'legend_race'
    ? projectable.filter(variant => /event(?: participation)? missions/i.test(variant.label))
    : [];
  const resultVariants = projectable
    .filter(variant => !missionVariants.includes(variant))
    .sort((left, right) => competitiveOutcomeOrder(left) - competitiveOutcomeOrder(right)
      || left.label.localeCompare(right.label));
  const totals: Partial<Record<PlannerCurrency, number>> = {};
  const options = resultVariants.map((variant, index) => {
    addVariantAmounts(totals, variant);
    const evaluationPoints = competition === 'strongest_team'
      ? evaluationPointThreshold(variant.label)
      : undefined;
    return {
      id: variant.id,
      label: competition === 'legend_race'
        ? `${index + 1} ${index === 0 ? 'opponent' : 'opponents'} cleared`
        : evaluationPoints !== undefined
          ? `${evaluationPoints.toLocaleString('en-US')}+ evaluation points`
          : cleanCompetitiveOutcomeLabel(variant.label),
      amounts: { ...totals },
      selectionValue: competition === 'strongest_team'
        ? evaluationPoints !== undefined
          ? `points_${evaluationPoints}`
          : `tier_${index + 1}`
        : undefined,
    };
  });

  if (competition === 'strongest_team') {
    const amounts = { ...totals };
    missionVariants.forEach(variant => addVariantAmounts(amounts, variant));
    return [
      {
        id: [...resultVariants, ...missionVariants].map(variant => variant.id).join('+'),
        label: 'All rewards',
        amounts,
        selectionValue: 'all',
      },
      ...options.reverse(),
    ];
  }
  if (competition === 'legend_race' && missionVariants.length > 0) {
    const amounts = { ...totals };
    missionVariants.forEach(variant => addVariantAmounts(amounts, variant));
    return [
      ...options,
      {
        id: [...resultVariants, ...missionVariants].map(variant => variant.id).join('+'),
        label: 'All opponents + event missions',
        amounts,
        selectionValue: 'all',
      },
    ];
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
  if (selectionValue === 'all') {
    return options.find(option => option.selectionValue === 'all') ?? options[options.length - 1];
  }

  if (group.selectionMode === 'reward_tier') {
    const exact = options.find(option => option.selectionValue === selectionValue);
    if (exact) return exact;

    const selectedPoints = Number(selectionValue.match(/^points_(\d+)$/)?.[1]);
    if (Number.isInteger(selectedPoints) && selectedPoints >= 0) {
      return options
        .filter(option => option.selectionValue !== 'all')
        .map(option => ({ option, threshold: dataDrivenOptionThreshold(option) }))
        .filter((entry): entry is { option: PlannerDataDrivenCompetitionRewardOption; threshold: number } =>
          entry.threshold !== undefined && entry.threshold <= selectedPoints)
        .sort((left, right) => right.threshold - left.threshold)[0]?.option;
    }
  }

  const selectedNumber = Number(selectionValue.match(/\d+/)?.[0]);
  if (!Number.isInteger(selectedNumber) || selectedNumber < 1) return undefined;
  const tierOptions = group.selectionMode === 'reward_tier'
    ? options
      .filter(option => option.selectionValue !== 'all')
      .sort((left, right) => (dataDrivenOptionThreshold(left) ?? Number.MAX_SAFE_INTEGER)
        - (dataDrivenOptionThreshold(right) ?? Number.MAX_SAFE_INTEGER))
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
  const rangeStart = evaluationPointThreshold(variant.label);
  if (rangeStart !== undefined) return rangeStart;
  const rank = Number(variant.label.match(/(?:Team rank|rank)\s+(\d+)/i)?.[1]);
  if (Number.isFinite(rank)) return rank;
  return Number(variant.source_items[0]?.order_min) || Number.MAX_SAFE_INTEGER;
}

function evaluationPointThreshold(label: string): number | undefined {
  const raw = label.match(/\(([\d,]+)(?:-|\s)/)?.[1]
    ?? label.match(/^([\d,]+)\+\s+evaluation points$/i)?.[1];
  if (!raw) return undefined;
  const value = Number(raw.replace(/,/g, ''));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function dataDrivenOptionThreshold(
  option: PlannerDataDrivenCompetitionRewardOption,
): number | undefined {
  const fromValue = Number(option.selectionValue?.match(/^points_(\d+)$/)?.[1]);
  if (Number.isFinite(fromValue)) return fromValue;
  return evaluationPointThreshold(option.label);
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
