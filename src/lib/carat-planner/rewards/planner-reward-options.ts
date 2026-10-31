import type { CaratPlan, PlannerCompetitiveRewardVariant, PlannerCurrency } from '../carat-planner';
import {
  buildDataDrivenCompetitionOptions,
  COMPETITION_GROUPS,
  resolveDataDrivenCompetitionOption
} from '../income/planner-competition-assumptions';
import { plannerSourceItemTotals } from './planner-reward-currencies';

type Amounts = Partial<Record<PlannerCurrency, number>>;
export interface PlannerRewardOption {
  id: string;
  label: string;
  amountLabel: string;
  amounts: Amounts;
}

export const NOT_COUNTED: PlannerRewardOption = {
  id: '__not_counted__',
  label: 'Result not counted',
  amountLabel: '0 projected',
  amounts: {}
};

const currencies: PlannerCurrency[] = [
  'free_jewels',
  'paid_jewels',
  'uma_ticket',
  'support_ticket',
  'rainbow_crystal',
  'gold_crystal',
  'rainbow_full_crystal',
  'gold_full_crystal'
];

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export function variableAmountLabel(amounts: Amounts): string {
  const carats = (amounts.free_jewels ?? 0) + (amounts.paid_jewels ?? 0);
  const parts = carats > 0 ? [integer.format(carats) + ' Carats'] : [];
  for (const [key, label] of [
    ['uma_ticket', 'Uma tix'],
    ['support_ticket', 'support tix'],
    ['rainbow_crystal', amounts.rainbow_crystal === 1 ? 'rainbow shard' : 'rainbow shards'],
    ['gold_crystal', amounts.gold_crystal === 1 ? 'gold shard' : 'gold shards'],
    ['rainbow_full_crystal', 'Rainbow Uncap Crystals'],
    ['gold_full_crystal', 'Gold Uncap Crystals']
  ] as const) {
    if (amounts[key]) parts.push(integer.format(amounts[key]!) + ' ' + label);
  }

  return parts.join(', ') || 'No projected resources';
}

export function sameRewardAmounts(a: Amounts, b: Amounts): boolean {
  return currencies.every(
    (key) => Math.max(0, Number(a[key]) || 0) === Math.max(0, Number(b[key]) || 0)
  );
}

function withAmount(option: Omit<PlannerRewardOption, 'amountLabel'>): PlannerRewardOption {
  return { ...option, amountLabel: variableAmountLabel(option.amounts) };
}

export function buildVariableRewardOptions(
  variants: readonly PlannerCompetitiveRewardVariant[]
): PlannerRewardOption[] {
  const assumption = COMPETITION_GROUPS.find(
    (group) => group.eventType === variants[0]?.competition && !group.additionalIncome
  );

  if (assumption)
    return assumption.options.map((option) =>
      withAmount({
        id: 'assumption:' + assumption.id + ':' + option.value,
        label: option.label,
        amounts: { ...option.amounts }
      })
    );
  const dataDriven = buildDataDrivenCompetitionOptions(variants);
  if (dataDriven.length)
    return dataDriven.map(({ id, label, amounts }) => withAmount({ id, label, amounts }));
  const usable = variants.filter((variant) => plannerSourceItemTotals(variant.source_items).size);
  const missions = usable.filter((variant) =>
    /event(?: participation)? missions/i.test(variant.label)
  );

  const order = (variant: PlannerCompetitiveRewardVariant) => {
    const range = Number(variant.label.match(/\((\d+)(?:-|\s)/)?.[1]);
    const rank = Number(variant.label.match(/(?:Team rank|rank)\s+(\d+)/i)?.[1]);
    return Number.isFinite(range)
      ? range
      : Number.isFinite(rank)
        ? rank
        : Number(variant.source_items[0]?.order_min) || Number.MAX_SAFE_INTEGER;
  };

  const results = usable
    .filter((variant) => !missions.includes(variant))
    .sort((a, b) => order(a) - order(b) || a.label.localeCompare(b.label));

  const totals: Amounts = {};

  const add = (variant: PlannerCompetitiveRewardVariant) => {
    for (const [currency, amount] of plannerSourceItemTotals(variant.source_items))
      totals[currency] = (totals[currency] ?? 0) + amount;
  };

  const options = results.map((variant) => {
    add(variant);
    return withAmount({
      id: variant.id,
      label: variant.label
        .replace(/^League rank type\s+\d+,\s*/i, '')
        .replace(/\s*\((?:rate|reward set)[^)]+\)\s*$/i, '')
        .trim(),
      amounts: { ...totals }
    });
  });

  if (missions.length) {
    missions.forEach(add);
    options.push(
      withAmount({
        id: missions.map((item) => item.id).join('+'),
        label: 'All milestones + event missions',
        amounts: { ...totals }
      })
    );
  }

  return options;
}

export function selectedRewardOption(
  plan: Pick<CaratPlan, 'variableRewardSelections' | 'scenarioSelections'> | undefined,
  eventId: string | undefined,
  options: readonly PlannerRewardOption[],
  variants: readonly PlannerCompetitiveRewardVariant[],
  eventType?: string
): PlannerRewardOption {
  if (!eventId) return NOT_COUNTED;
  const stored = plan?.variableRewardSelections[eventId];
  if (stored) {
    if (stored.optionId === NOT_COUNTED.id) return NOT_COUNTED;
    const match =
      options.find((option) => option.id === stored.optionId) ??
      options.find((option) => sameRewardAmounts(option.amounts, stored.amounts));

    if (match) return match;
    const separator = stored.label.indexOf(': ');
    return withAmount({
      id: stored.optionId,
      label: separator < 0 ? stored.label : stored.label.slice(separator + 2),
      amounts: { ...stored.amounts }
    });
  }

  const type = variants[0]?.competition ?? eventType;
  const groupId =
    type === 'strongest_team'
      ? 'strongest_team_reward_tier'
      : type === 'legend_race'
        ? 'legend_race_clears'
        : '';

  const assumption = COMPETITION_GROUPS.find(
    (group) => group.eventType === type && !group.additionalIncome
  );

  const chosen = groupId
    ? resolveDataDrivenCompetitionOption(groupId, plan?.scenarioSelections[groupId], variants)
    : assumption?.options.find(
        (option) => option.value === plan?.scenarioSelections[assumption.id]
      );

  if (!chosen) return NOT_COUNTED;
  const id = 'id' in chosen ? chosen.id : 'assumption:' + assumption!.id + ':' + chosen.value;
  return (
    options.find((option) => option.id === id) ??
    options.find((option) => sameRewardAmounts(option.amounts, chosen.amounts)) ??
    NOT_COUNTED
  );
}
