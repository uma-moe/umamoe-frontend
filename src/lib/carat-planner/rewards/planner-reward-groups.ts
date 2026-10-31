import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
import {
  findPlannerEvent,
  resolvePlannerPullDate,
  type CaratPlan,
  type PlannerCompetitiveRewardVariant,
  type PlannerCurrency,
  type PlannerEventBenefit,
  type PlannerFreePullCampaign,
  type PlannerRewardEntry
} from '../carat-planner';
import {
  plannerRewardBundleId,
  plannerRewardBundles,
  plannerCurrencyForSourceItem,
  plannerRewardIsProjectable,
  plannerSourceItemTotals
} from './planner-reward-currencies';
import { plannerRewardAvailabilityWindow } from './planner-reward-availability';
import {
  conditionalRewardScenarioGroup,
  conditionalRewardScenarioSelectionMatches,
  plannerRewardNeedsEnabledOverride,
  plannerRewardSelectionEnabled,
  selectedConditionalRewardAmount
} from './planner-reward-assumptions';
import { plannerTimestampDateKey } from '../planner-calendar';
import {
  campaignState,
  cleanRewardLabel,
  rewardEventTitle,
  type PlannerCampaign
} from './planner-campaigns';
import {
  buildVariableRewardOptions,
  NOT_COUNTED,
  sameRewardAmounts,
  selectedRewardOption,
  type PlannerRewardOption
} from './planner-reward-options';

export interface PlannerRewardBenefitView {
  id: string;
  kind: string;
  text: string;
  itemId?: number;
  amount?: number;
}

export interface PlannerRewardGroup {
  id: string;
  eventId?: string;
  title: string;
  availableAt: string;
  availableUntil?: string;
  imagePath?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  rewards: PlannerRewardEntry[];
  competitiveVariants: PlannerCompetitiveRewardVariant[];
  eventBenefits: PlannerEventBenefit[];
  benefits: PlannerRewardBenefitView[];
  variableOptions: PlannerRewardOption[];
  selectedOption: PlannerRewardOption;
  breakdownTooltip: string;
  searchText: string;
  isPast: boolean;
  event?: TimelineRecord;
}

interface GroupRows {
  eventId?: string;
  rewards: PlannerRewardEntry[];
  competitiveVariants: PlannerCompetitiveRewardVariant[];
  eventBenefits: PlannerEventBenefit[];
}

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const itemIds: Record<string, number> = {
  carats: 43,
  uma_ticket: 41,
  support_ticket: 111,
  rainbow_full_crystal: 144,
  gold_full_crystal: 145,
  rainbow_crystal: 149,
  gold_crystal: 150
};

const currencyLabels: Record<string, string> = {
  carats: 'Carats',
  uma_ticket: 'Uma ticket',
  support_ticket: 'Support ticket',
  rainbow_crystal: 'Rainbow Crystal Shard',
  gold_crystal: 'Gold Crystal Shard',
  rainbow_full_crystal: 'Rainbow Uncap Crystal',
  gold_full_crystal: 'Gold Uncap Crystal'
};

const benefitOrder = (kind: string) => {
  if (kind === 'free_pulls') {
    return 0;
  }

  if (kind.includes('selector')) {
    return 1;
  }

  if (kind.endsWith('_ticket')) {
    return 2;
  }

  if (kind.endsWith('_full_crystal')) {
    return 3;
  }

  if (kind.endsWith('_crystal')) {
    return 4;
  }

  if (kind === 'carats') {
    return 5;
  }

  return 6;
};

function eventFor(group: GroupRows, events: readonly TimelineRecord[]): TimelineRecord | undefined {
  const exact = group.eventId ? findPlannerEvent(group.eventId, events) : undefined;
  if (exact) return exact;
  const ids = [
    ...group.rewards.map((item) => item.gacha_id),
    ...group.eventBenefits.map((item) => item.gacha_id)
  ].filter((id): id is number => Number.isFinite(id));

  for (const id of ids) {
    const event = events.find((event) => event.gachaId === id || event.gachaIds?.includes(id));
    if (event) return event;
  }

  for (const variant of group.competitiveVariants) {
    const event = events.find(
      (event) =>
        event.eventType === variant.competition &&
        (Number(event.id.match(/(?:^|\D)(\d+)(?!.*\d)/)?.[1]) === variant.master_event_id ||
          event.image?.endsWith('/' + variant.master_event_id + '.webp'))
    );

    if (event) return event;
  }

  const masterId = Number(group.eventId?.match(/(?:^|\D)(\d+)(?!.*\d)/)?.[1]);
  return Number.isFinite(masterId)
    ? events.find(
        (event) =>
          Number(event.id.match(/(?:^|\D)(\d+)(?!.*\d)/)?.[1]) === masterId &&
          group.eventId?.replaceAll('-', '_').toLowerCase().includes(event.eventType)
      )
    : undefined;
}

function rewardSource(group: GroupRows): { sourceUrl?: string; sourceLabel?: string } {
  const priority = (value?: string) => {
    if (value === 'global_news') {
      return 0;
    }

    if (value?.startsWith('global_')) {
      return 1;
    }

    if (value === 'jp_news') {
      return 2;
    }

    if (value?.startsWith('jp_')) {
      return 3;
    }

    return 4;
  };

  const candidates = [
    ...group.eventBenefits.filter((item) => item.kind === 'free_pulls'),
    ...group.rewards,
    ...group.eventBenefits,
    ...group.competitiveVariants
  ].sort((a, b) => priority(a.provenance) - priority(b.provenance));

  for (const item of candidates)
    if (/^https?:\/\//i.test(item.source_url?.trim() ?? ''))
      return {
        sourceUrl: item.source_url!.trim(),
        sourceLabel:
          item.provenance === 'global_news' ||
          item.provenance === 'jp_news' ||
          item.source_url!.toLowerCase().includes('/news/')
            ? 'News post'
            : 'Source'
      };

  const labels: Record<string, string> = {
    global_master: 'Global game data',
    global_news: 'Official Global news',
    global_social: 'Official Global social',
    jp_master: 'JP game data',
    jp_master_catalog: 'JP game data',
    jp_master_snapshot: 'JP game data',
    jp_news: 'JP news archive',
    jp_fallback: 'JP news archive',
    configured: 'Planner configuration'
  };

  return { sourceLabel: candidates.map((item) => labels[item.provenance ?? '']).find(Boolean) };
}

function selectedRows(
  rewards: PlannerRewardEntry[],
  plan?: Pick<CaratPlan, 'scenarioSelections' | 'variableRewardSelections'>
): PlannerRewardEntry[] {
  return rewards.map((reward) => {
    const group = conditionalRewardScenarioGroup(reward),
      selection = group ? plan?.scenarioSelections[group] : undefined;

    return group && conditionalRewardScenarioSelectionMatches(reward, selection)
      ? { ...reward, amount: selectedConditionalRewardAmount(reward, selection) }
      : reward;
  });
}

function rewardBreakdown(
  rewards: PlannerRewardEntry[],
  plan?: Pick<CaratPlan, 'scenarioSelections' | 'variableRewardSelections'>
): string {
  const labels: Partial<Record<PlannerCurrency, string>> = {
    uma_ticket: 'Uma ticket',
    support_ticket: 'Support ticket',
    rainbow_crystal: 'Rainbow shard',
    gold_crystal: 'Gold shard',
    rainbow_full_crystal: 'Rainbow Uncap Crystal',
    gold_full_crystal: 'Gold Uncap Crystal'
  };

  const lines = plannerRewardBundles(selectedRows(rewards, plan)).flatMap((bundle) => {
    const carats =
      (bundle.totals.get('free_jewels') ?? 0) + (bundle.totals.get('paid_jewels') ?? 0);

    const amounts = carats > 0 ? [integer.format(carats) + ' Carats'] : [];
    for (const [currency, label] of Object.entries(labels)) {
      const amount = bundle.totals.get(currency as PlannerCurrency) ?? 0;
      if (amount > 0)
        amounts.push(integer.format(amount) + ' ' + label + (amount === 1 ? '' : 's'));
    }

    return amounts.length
      ? [cleanRewardLabel(bundle.label).replace(/ item details$/i, '') + ': ' + amounts.join(', ')]
      : [];
  });

  if (!lines.length) return '';
  const notes = [];
  if (rewards.some((item) => item.provenance?.startsWith('jp_master')))
    notes.push('JP master projection. Global master rewards replace it when available.');
  if (rewards.some((item) => /bingo rewards/i.test(item.label)))
    notes.push(
      'Finite Bingo sheets are included. Repeatable sheets have no fixed maximum and are excluded.'
    );
  return ['Reward breakdown', ...new Set(lines), ...notes].join('\n');
}

function groupBenefits(
  group: GroupRows,
  options: PlannerRewardOption[],
  selection: PlannerRewardOption,
  plan?: Pick<CaratPlan, 'scenarioSelections' | 'variableRewardSelections'>
): PlannerRewardBenefitView[] {
  const benefits: PlannerRewardBenefitView[] = group.eventBenefits
    .filter((item) => item.kind === 'free_pulls')
    .map((item) => {
      const amount = Number.isFinite(item.amount) ? Math.max(0, Number(item.amount)) : undefined;
      const qualifier =
        item.confidence === 'schedule_partitioned'
          ? item.source_url
            ? 'schedule-derived free'
            : 'predicted free'
          : item.confidence === 'schedule_derived'
            ? 'predicted free'
            : 'free';

      return {
        id: item.id,
        kind: item.kind,
        itemId: item.item_id,
        text:
          amount === undefined
            ? item.label
            : integer.format(amount) + ' ' + qualifier + (amount === 1 ? ' pull' : ' pulls'),
        amount
      };
    });

  const totals = new Map<string, number>();
  const add = (currency: string, amount: number) => {
    const kind = currency === 'free_jewels' || currency === 'paid_jewels' ? 'carats' : currency;
    if (amount > 0 && currencyLabels[kind]) totals.set(kind, (totals.get(kind) ?? 0) + amount);
  };

  for (const bundle of plannerRewardBundles(selectedRows(group.rewards, plan)))
    for (const [currency, amount] of bundle.totals) add(currency, amount);
  if (selection.id !== NOT_COUNTED.id)
    for (const [currency, amount] of Object.entries(selection.amounts)) add(currency, amount!);
  for (const [kind, amount] of totals) {
    let text =
      integer.format(amount) +
      ' ' +
      currencyLabels[kind] +
      (kind === 'carats' || amount === 1 ? '' : 's');

    if (kind === 'carats')
      for (const reward of group.rewards) {
        if (
          !['free_jewels', 'paid_jewels'].includes(reward.currency) ||
          Number(reward.amount) !== amount
        )
          continue;
        const match = reward.evidence?.match(
          /^(\d+) days × ([\d,]+) Carats = ([\d,]+) Carats(?:;|$)/i
        );

        if (!match) continue;
        const [days, daily, total] = match
          .slice(1)
          .map((value) => Number(value.replaceAll(',', '')));

        if (
          [days, daily, total].every(Number.isSafeInteger) &&
          days! > 0 &&
          daily! > 0 &&
          total === amount &&
          days! * daily! === total
        ) {
          text =
            integer.format(days!) +
            ' days × ' +
            integer.format(daily!) +
            ' Carats = ' +
            integer.format(amount) +
            ' Carats';
          break;
        }
      }

    benefits.push({ id: 'currency:' + kind, kind, itemId: itemIds[kind], amount, text });
  }

  if (options.length && selection.id === NOT_COUNTED.id)
    benefits.push({
      id: 'competitive-outcomes',
      kind: 'competitive_outcomes',
      text: 'Choose expected result'
    });
  if (
    group.rewards.some((reward) =>
      reward.source_items?.some((item) => !plannerCurrencyForSourceItem(item))
    )
  )
    benefits.push({
      id: 'additional-item-rewards',
      kind: 'other',
      text: 'Additional item rewards'
    });
  else if (!benefits.length && group.rewards.some((reward) => !Number.isFinite(reward.amount)))
    benefits.push({ id: 'reward-details', kind: 'other', text: 'Reward details' });
  return benefits.sort((a, b) => benefitOrder(a.kind) - benefitOrder(b.kind));
}

export function buildPlannerRewardGroups(
  rewards: readonly PlannerRewardEntry[],
  eventBenefits: readonly PlannerEventBenefit[],
  competitiveVariants: readonly PlannerCompetitiveRewardVariant[],
  campaigns: readonly PlannerFreePullCampaign[],
  events: readonly TimelineRecord[],
  start: string,
  today = new Date().toISOString().slice(0, 10),
  plan?: Pick<CaratPlan, 'scenarioSelections' | 'variableRewardSelections'>
): PlannerRewardGroup[] {
  const grouped = new Map<string, GroupRows>();
  const obtain = (id: string, eventId?: string) => {
    const group = grouped.get(id) ?? {
      eventId,
      rewards: [],
      competitiveVariants: [],
      eventBenefits: []
    };

    grouped.set(id, group);
    return group;
  };

  for (const reward of rewards)
    obtain(
      reward.event_id
        ? 'event:' + reward.event_id
        : 'reward:' + reward.available_at + ':' + plannerRewardBundleId(reward),
      reward.event_id
    ).rewards.push(reward);
  for (const variant of competitiveVariants)
    obtain('event:' + variant.event_id, variant.event_id).competitiveVariants.push(variant);
  const managed = new Set(campaigns.map((item) => item.id));
  for (const benefit of eventBenefits)
    if (!(benefit.kind === 'free_pulls' && benefit.campaign_id && managed.has(benefit.campaign_id)))
      obtain('event:' + benefit.event_id, benefit.event_id).eventBenefits.push(benefit);
  const cutoff = start > today ? start : today;
  return [...grouped.entries()]
    .map(([id, original]) => {
      const event = eventFor(original, events);
      const dates = [
        ...original.rewards.map((item) => item.available_at),
        ...original.eventBenefits.map((item) => item.available_at),
        ...original.competitiveVariants.map((item) => item.available_at)
      ]
        .map(plannerTimestampDateKey)
        .filter((date): date is string => Boolean(date))
        .sort();

      const eventDate = event?.date?.toISOString().slice(0, 10) ?? '';
      if (!dates.length && eventDate) dates.push(eventDate);
      const window = plannerRewardAvailabilityWindow(
        original.eventId,
        original.rewards.map((item) => item.available_at),
        events,
        original.rewards.map((item) => item.available_until)
      );

      const isPast = window
        ? window.endsAt < cutoff
        : dates.length > 0 && dates.every((date) => date < cutoff);

      const usable = (value?: string) => {
        const date = plannerTimestampDateKey(value);
        return !date || date >= start;
      };

      const group =
        isPast || !start
          ? original
          : {
              ...original,
              rewards: original.rewards.filter((item) =>
                usable(plannerTimestampDateKey(item.available_until) ?? item.available_at)
              ),
              eventBenefits: original.eventBenefits.filter((item) => usable(item.available_at)),
              competitiveVariants: original.competitiveVariants.filter((item) =>
                usable(item.available_at ?? eventDate)
              )
            };

      const variableOptions = buildVariableRewardOptions(group.competitiveVariants),
        selectedOption = selectedRewardOption(
          plan,
          group.eventId,
          variableOptions,
          group.competitiveVariants,
          event?.eventType
        );

      const benefits = groupBenefits(group, variableOptions, selectedOption, plan);
      const resources =
        original.rewards.length +
        original.eventBenefits.length +
        original.competitiveVariants.length;

      const fallback = group.eventId
        ?.replace(/_/g, '-')
        .toLowerCase()
        .replace(/^news-(?:event-)?/, '')
        .replace(/^event-/, '')
        .replace(/-\d{4}-\d{2}-\d{2}$/, '')
        .replace(/-\d+$/, '');

      const humanize = (value: string) =>
        value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

      const title = cleanRewardLabel(
        (event ? rewardEventTitle(event) : undefined) ??
          (group.eventId && resources > 1
            ? fallback === 'campaign'
              ? 'Campaign rewards'
              : humanize(fallback || 'Event rewards')
            : undefined) ??
          original.rewards[0]?.label ??
          original.eventBenefits[0]?.label ??
          (original.competitiveVariants[0]
            ? humanize(original.competitiveVariants[0].competition) + ' rewards'
            : 'Event rewards')
      );

      return {
        id,
        ...group,
        event,
        title,
        availableAt:
          window?.startsAt ??
          (isPast ? dates.at(-1) : (dates.find((date) => date >= start) ?? dates[0])) ??
          '',
        availableUntil: window?.endsAt,
        imagePath: event?.image,
        ...rewardSource(group),
        benefits,
        variableOptions,
        selectedOption,
        breakdownTooltip: rewardBreakdown(group.rewards, plan),
        searchText: [
          title,
          group.eventId,
          ...original.rewards.flatMap((item) => [
            item.id,
            item.label,
            item.currency,
            item.source_url,
            item.assumption,
            item.evidence
          ]),
          ...original.eventBenefits.flatMap((item) => [item.label, item.kind]),
          ...original.competitiveVariants.flatMap((item) => [item.label, item.competition]),
          ...benefits.map((item) => item.text)
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
        isPast
      };
    })
    .sort((a, b) => {
      if (a.availableAt && b.availableAt) {
        return a.availableAt.localeCompare(b.availableAt) || a.title.localeCompare(b.title);
      }

      if (a.availableAt) {
        return -1;
      }

      if (b.availableAt) {
        return 1;
      }

      return a.title.localeCompare(b.title);
    });
}

export function rewardGroupSelectable(group: PlannerRewardGroup): boolean {
  return (
    group.variableOptions.length > 0 ||
    group.rewards.some(plannerRewardIsProjectable) ||
    group.competitiveVariants.some(
      (item) => item.default_enabled === true && plannerSourceItemTotals(item.source_items).size > 0
    ) ||
    group.eventBenefits.some(
      (item) => item.kind === 'trainee_selector' || item.kind === 'support_selector'
    )
  );
}

export function rewardGroupActive(plan: CaratPlan, group: PlannerRewardGroup): boolean {
  if (group.isPast || (group.eventId && plan.disabledEventIds.includes(group.eventId)))
    return false;
  const enabled = (reward: PlannerRewardEntry) =>
    plannerRewardSelectionEnabled(
      reward,
      plan.scenarioSelections,
      plan.enabledRewardIds.includes(reward.id),
      plan.disabledRewardIds.includes(reward.id)
    );

  const projectable = group.rewards.filter(plannerRewardIsProjectable),
    selector = group.eventBenefits.some(
      (item) => item.kind === 'trainee_selector' || item.kind === 'support_selector'
    );

  if (!projectable.length && !selector)
    return (
      (group.variableOptions.length > 0 && group.selectedOption.id !== NOT_COUNTED.id) ||
      group.rewards.some((reward) => !plannerRewardIsProjectable(reward) && enabled(reward))
    );
  return (
    projectable.every(enabled) &&
    (!selector || Boolean(group.eventId && plan.enabledRewardEventIds.includes(group.eventId)))
  );
}

export function rewardBannerPlanned(plan: CaratPlan, group: PlannerRewardGroup): boolean {
  return Boolean(
    group.eventId &&
    !plan.disabledEventIds.includes(group.eventId) &&
    plan.targets.some(
      (target) =>
        target.eventId === group.eventId &&
        resolvePlannerPullDate(target) >= plan.projectionStartDate
    )
  );
}

export function plannerRewardSummary(
  plan: CaratPlan,
  groups: readonly PlannerRewardGroup[],
  campaigns: readonly PlannerCampaign[]
): { count: number; totalLabel: string } {
  const active = groups.filter((group) => rewardGroupActive(plan, group));
  let carats = 0,
    tickets = 0;

  for (const benefit of active.flatMap((group) => group.benefits)) {
    const amount = Number.isFinite(benefit.amount) ? Math.max(0, benefit.amount!) : 0;
    if (benefit.kind === 'carats') carats += amount;
    else if (benefit.kind === 'uma_ticket' || benefit.kind === 'support_ticket') tickets += amount;
  }

  return {
    count:
      active.length + campaigns.filter((campaign) => campaignState(plan, campaign).ready).length,
    totalLabel: [
      carats > 0 ? integer.format(carats) + ' Carats' : '',
      tickets > 0 ? integer.format(tickets) + (tickets === 1 ? ' ticket' : ' tickets') : ''
    ]
      .filter(Boolean)
      .join(', ')
  };
}

export function updateRewardGroup(
  plan: CaratPlan,
  group: PlannerRewardGroup,
  enabled: boolean
): void {
  const ids = new Set(plan.enabledRewardIds),
    excluded = new Set(plan.disabledRewardIds),
    events = new Set(plan.enabledRewardEventIds),
    disabled = new Set(plan.disabledEventIds);

  for (const reward of group.rewards.filter(plannerRewardIsProjectable)) {
    enabled && plannerRewardNeedsEnabledOverride(reward)
      ? ids.add(reward.id)
      : ids.delete(reward.id);
    group.eventId || enabled ? excluded.delete(reward.id) : excluded.add(reward.id);
  }

  for (const variant of group.competitiveVariants)
    if (variant.default_enabled === true && plannerSourceItemTotals(variant.source_items).size) {
      ids.delete(variant.id);
      excluded.delete(variant.id);
    }

  if (group.eventId) {
    enabled &&
    group.eventBenefits.some(
      (item) => item.kind === 'trainee_selector' || item.kind === 'support_selector'
    )
      ? events.add(group.eventId)
      : events.delete(group.eventId);
    enabled ? disabled.delete(group.eventId) : disabled.add(group.eventId);
  }

  plan.enabledRewardIds = [...ids];
  plan.disabledRewardIds = [...excluded];
  plan.enabledRewardEventIds = [...events];
  plan.disabledEventIds = [...disabled];
  plan.incomePresetEdited = true;
}

export function cycleRewardOption(
  plan: CaratPlan,
  group: PlannerRewardGroup,
  direction: -1 | 1
): void {
  if (!group.eventId) return;
  const options = [NOT_COUNTED, ...group.variableOptions];
  let current = options.findIndex((item) => item.id === group.selectedOption.id);
  if (current < 0)
    current = options.findIndex((item) =>
      sameRewardAmounts(item.amounts, group.selectedOption.amounts)
    );
  const next = Math.max(0, Math.min(options.length - 1, Math.max(0, current) + direction));
  if (next === current) return;
  const option = options[next]!;
  plan.variableRewardSelections[group.eventId] = {
    optionId: option.id,
    label: group.title + ': ' + option.label,
    availableAt: group.event?.estimatedEndDate?.toISOString().slice(0, 10) ?? group.availableAt,
    amounts: { ...option.amounts }
  };

  updateRewardGroup(plan, group, option.id !== NOT_COUNTED.id);
}
