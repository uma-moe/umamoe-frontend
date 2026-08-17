import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Optional,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TourAnchorMatMenuDirective } from 'ngx-ui-tour-md-menu';
import { Subject, takeUntil } from 'rxjs';
import {
  CaratPlan,
  CaratPlanCollection,
  CaratPlanProjection,
  CaratPlannerDataBundle,
  CaratPlannerTimelineEvent,
  FREE_PULL_CAMPAIGN_DEFAULT_SELECTION,
  FREE_PULL_CAMPAIGN_EXCLUDED_SELECTION,
  PlannerBannerKind,
  PlannerCompetitiveRewardVariant,
  PlannerCustomIncome,
  PlannerCurrency,
  PlannerEventBenefit,
  PlannerFreePullCampaign,
  PlannerFreePullCampaignAllocation,
  PlannerGachaEntry,
  PlannerIncomeRule,
  PlannerPickupGoal,
  PlannerPickupRate,
  PlannerRewardEntry,
  PlannerTarget,
  PlannerTargetProjection,
} from '../../models/carat-planner.model';
import {
  hasProjectableSourceItems,
  isAutomaticCompetitiveVariant,
  isProjectableCompetitiveVariant,
  plannerCurrencyForSourceItem,
  plannerRewardBundleId,
  plannerRewardBundles,
  plannerSourceItemTotals,
} from '../../utils/planner-reward-currencies';
import { classicChampionsFinalOutcomes, withTimelineRewardFallbacks } from '../../utils/planner-reward-summary';
import {
  resolveBundledTimelineEventImagePath,
  timelineEventMasterId,
} from '../../utils/timeline-event-image';
import {
  buildDataDrivenCompetitionRewardOptions,
  PLANNER_COMPETITION_ASSUMPTION_GROUPS,
  PLANNER_DATA_DRIVEN_COMPETITION_ASSUMPTION_GROUPS,
  plannerCompetitionAssumptionGroup,
  plannerDataDrivenCompetitionAssumptionForEventType,
  plannerDataDrivenCompetitionAssumptionGroup,
  resolveDataDrivenCompetitionAssumption,
} from '../../utils/carat-planner-competition-assumptions';
import {
  CONDITIONAL_REWARDS_NONE_OPTION,
  isLegacyTrainingPassIncomeRule,
  MONTHLY_SHOP_HELP_TEXT,
  MONTHLY_SHOP_SCENARIO_GROUP_ID,
  plannerIncomeAssumptionGroups,
  randomGameplayIncomeRules,
  RANDOM_GAMEPLAY_INCOME_SCENARIO_GROUP_ID,
  SPECULATIVE_INCOME_INCLUDED_OPTION,
  SPECULATIVE_INCOME_MEDIAN_OPTION,
  RACING_CARNIVAL_MISSION_SCENARIO_GROUP_ID,
  SPECULATIVE_INCOME_NONE_OPTION,
  SPECULATIVE_INCOME_SCENARIO_GROUP_ID,
  trainingPassIncomeRules,
  TRAINING_PASS_SCENARIO_GROUP_ID,
  TEMPORARY_STORY_REWARDS_SCENARIO_GROUP_ID,
} from '../../utils/carat-planner-income-assumptions';
import { CaratPlannerCalculationService } from '../../services/carat-planner-calculation.service';
import { CaratPlannerPersistenceService } from '../../services/carat-planner-persistence.service';
import { CaratPlannerResourceService, CaratPlannerResourceState } from '../../services/carat-planner-resource.service';
import {
  CaratPullPoolComposition,
  CaratPullProbabilityResult,
  CaratPullProbabilityService,
} from '../../services/carat-pull-probability.service';
import { TimelineAvatarService } from '../../services/timeline-avatar.service';

const EMPTY_DATA: CaratPlannerDataBundle = {
  core: {},
  income: { rules: [] },
  rewards: { rewards: [], event_benefits: [] },
};
const INTEGER_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const PLANNER_CURRENCY_ITEM_IDS: Readonly<Record<string, number>> = {
  carats: 43,
  uma_ticket: 41,
  support_ticket: 111,
  rainbow_crystal: 149,
  gold_crystal: 150,
};
const PREPARED_PLANNER_ITEM_IDS = new Set([41, 43, 44, 59, 110, 111, 115, 141, 144, 145, 149, 150, 164, 165, 178, 197, 205, 214, 255]);
const VARIABLE_REWARD_NOT_COUNTED = '__not_counted__';
const PLANNER_CHARACTER_PLACEHOLDER = 'assets/images/character_stand/chara_stand_100101.webp';
const PLANNER_SUPPORT_PLACEHOLDER = 'assets/images/support_card/half/support_card_s_30031.webp';
const VISIBLE_REWARD_CURRENCIES = new Set<PlannerCurrency>([
  'free_jewels',
  'paid_jewels',
  'uma_ticket',
  'support_ticket',
]);

function matchesJewelCurrency(currency: string): boolean {
  return currency === 'free_jewels' || currency === 'paid_jewels';
}

type PlannerOutcomeTone = 'miss' | 'below' | 'expected' | 'lucky' | 'neutral';

interface PlannerOutcomeSegment {
  tone: PlannerOutcomeTone;
  semanticLabel: string;
  rangeLabel: string;
  probability: number;
  width: number;
}

interface PlannerPickupOptionView extends PlannerPickupRate {
  label: string;
  subLabel?: string;
  imagePath?: string;
  fallbackImagePath?: string;
  placeholderImagePath?: string;
}

interface PlannerPickupGoalView {
  pickupId: number;
  label: string;
  subLabel?: string;
  imagePath?: string;
  fallbackImagePath?: string;
  placeholderImagePath?: string;
  rate: number;
  desiredCopies: number;
  copiesNeededFromPulls?: number;
  crystalCopiesApplied?: number;
  crystalKind?: 'rainbow' | 'gold';
  probability?: number;
}

interface PlannerScenarioOptionView {
  value: string;
  label: string;
  amountLabel: string;
}

interface PlannerScenarioGroupView {
  id: string;
  label: string;
  scheduleLabel: string;
  helpText?: string;
  sourceUrl?: string;
  options: PlannerScenarioOptionView[];
}

interface PlannerRewardBenefitView {
  id: string;
  kind: string;
  label: string;
  amount?: number | null;
  text: string;
  icon: string;
  iconPath?: string;
  plannerEffect: string;
}

interface PlannerVariableRewardOptionView {
  id: string;
  label: string;
  amountLabel: string;
  amounts: Partial<Record<PlannerCurrency, number>>;
}

const VARIABLE_REWARD_NOT_COUNTED_OPTION: PlannerVariableRewardOptionView = {
  id: VARIABLE_REWARD_NOT_COUNTED,
  label: 'Result not counted',
  amountLabel: '0 projected',
  amounts: {},
};

interface PlannerRewardGroupView {
  id: string;
  eventId?: string;
  title: string;
  availableAt: string;
  imagePath?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  rewards: readonly PlannerRewardEntry[];
  competitiveVariants: readonly PlannerCompetitiveRewardVariant[];
  variableOptions: readonly PlannerVariableRewardOptionView[];
  eventBenefits: readonly PlannerEventBenefit[];
  benefits: readonly PlannerRewardBenefitView[];
  visibleBenefits: readonly PlannerRewardBenefitView[];
  hiddenBenefitCount: number;
  breakdownTooltip: string;
  searchText: string;
  isPast: boolean;
}

interface PlannerFreePullCampaignAllocationView extends PlannerFreePullCampaignAllocation {
  title: string;
  imagePath?: string;
}

interface PlannerFreePullCampaignView {
  id: string;
  campaign: PlannerFreePullCampaign;
  label: string;
  totalPulls: number;
  pullsPerDay?: number;
  allocations: readonly PlannerFreePullCampaignAllocationView[];
  stockDestination?: PlannerFreePullCampaignAllocationView;
  sourceUrl?: string;
  availableAt: string;
  searchText: string;
  isPast: boolean;
}

interface PlannerRewardListItem {
  id: string;
  kind: 'reward' | 'free-pull-campaign';
  availableAt: string;
  isPast: boolean;
  group?: PlannerRewardGroupView;
  campaign?: PlannerFreePullCampaignView;
}

interface PlannerOddsView {
  goals: readonly PlannerPickupGoalView[];
  combined: CaratPullProbabilityResult;
  allGoalsProbability?: number;
  allGoalsStatus?: string;
  ratesAvailable: boolean;
  ratesInferred: boolean;
  segments: readonly PlannerOutcomeSegment[];
}

type PlannerSetupPanel = 'resources' | 'income' | 'rewards';
type RewardSelectionFilter = 'all' | 'included';
type FreePullCampaignChoice = 'schedule' | 'stock';

@Component({
  selector: 'app-carat-planner',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    TourAnchorMatMenuDirective,
  ],
  templateUrl: './carat-planner.component.html',
  styleUrl: './carat-planner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaratPlannerComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private allEvents: readonly CaratPlannerTimelineEvent[] = [];
  private eventById = new Map<string, CaratPlannerTimelineEvent>();
  private eventByGachaId = new Map<number, CaratPlannerTimelineEvent>();
  private eventByTypeAndMasterId = new Map<string, CaratPlannerTimelineEvent>();
  private cachedRewardResources: CaratPlannerDataBundle['rewards'] | null = null;
  private cachedRewardEvents: readonly CaratPlannerTimelineEvent[] | null = null;
  private cachedRewardViewKey = '';
  private rewardGroupSelectableCache = new WeakMap<PlannerRewardGroupView, boolean>();
  private freePullBenefitCache = new WeakMap<PlannerRewardGroupView, boolean>();
  private enabledRewardIdsSource: readonly string[] | null = null;
  private enabledRewardIdsLookup = new Set<string>();
  private disabledEventIdsSource: readonly string[] | null = null;
  private disabledEventIdsLookup = new Set<string>();
  private enabledRewardEventIdsSource: readonly string[] | null = null;
  private enabledRewardEventIdsLookup = new Set<string>();
  private pendingRequestedEventId: string | null = null;
  private handledRequestedEventId: string | null = null;
  private plannerDataReady = false;
  private activePlanResourceKey: string | null = null;
  private planResourceRequest = 0;
  private destroyed = false;
  private deferredRewardSaveFrame: number | undefined;
  private deferredRewardSaveTimer: ReturnType<typeof setTimeout> | undefined;
  private deferredRewardSavePending = false;
  private readonly expandedPickupTargetIds = new Set<string>();
  private readonly pickupGoalCopyMemory = new Map<string, number>();

  @Input() set events(value: readonly CaratPlannerTimelineEvent[] | null | undefined) {
    this.allEvents = value ?? [];
    this.cachedRewardEvents = null;
    this.rebuildEventIndexes();
    this.syncTargetSchedulesFromResources();
    if (this.plannerDataReady) {
      const rewards = withTimelineRewardFallbacks(this.data.rewards, this.allEvents);
      if (rewards !== this.data.rewards) {
        this.data = { ...this.data, rewards };
        if (this.plan) {
          const rewardSelectionChanged = this.syncAutomaticRewardSelection();
          const eventSelectionChanged = this.syncEnabledRewardEventIds();
          if (rewardSelectionChanged || eventSelectionChanged) this.save();
        }
      }
    }
    this.filterEvents();
    this.filterRewards();
    this.tryAddRequestedEvent();
    if (this.plannerDataReady && this.plan) this.recalculate();
  }

  @Input() set requestedEventId(value: string | null | undefined) {
    this.pendingRequestedEventId = value?.trim() || null;
    if (this.pendingRequestedEventId !== this.handledRequestedEventId) {
      this.tryAddRequestedEvent();
    }
  }

  collection!: CaratPlanCollection;
  plan!: CaratPlan;
  data = EMPTY_DATA;
  resourceState: CaratPlannerResourceState = { loading: false, ready: false, usingCache: false, error: null };
  projection: CaratPlanProjection | null = null;
  projectionByTarget = new Map<string, PlannerTargetProjection>();
  gachaByTarget = new Map<string, PlannerGachaEntry>();
  pickupOptionsByTarget = new Map<string, readonly PlannerPickupOptionView[]>();
  pickupGoalViewsByTarget = new Map<string, readonly PlannerPickupGoalView[]>();
  selectedPickupIdsByTarget = new Map<string, ReadonlySet<number>>();
  oddsByTarget = new Map<string, PlannerOddsView>();
  filteredEvents: CaratPlannerTimelineEvent[] = [];
  scenarioGroupOptions: PlannerScenarioGroupView[] = [];
  displayedRules: PlannerIncomeRule[] = [];
  rewardGroups: PlannerRewardGroupView[] = [];
  displayedRewardGroups: PlannerRewardGroupView[] = [];
  displayedRewards: PlannerRewardEntry[] = [];
  freePullCampaignViews: PlannerFreePullCampaignView[] = [];
  displayedFreePullCampaigns: PlannerFreePullCampaignView[] = [];
  displayedRewardItems: PlannerRewardListItem[] = [];
  upcomingRewardGroupCount = 0;
  pastRewardGroupCount = 0;
  eventSearch = '';
  rewardSearch = '';
  rewardSelectionFilter: RewardSelectionFilter = 'all';
  showPastRewards = false;
  showEventPicker = false;
  compactPlannerLayout = typeof window !== 'undefined' && window.innerWidth <= 768;
  eventPickerActiveIndex = 0;
  importError = '';
  activeSetupPanel: PlannerSetupPanel | null = null;

  constructor(
    private readonly calculations: CaratPlannerCalculationService,
    private readonly probabilities: CaratPullProbabilityService,
    private readonly persistence: CaratPlannerPersistenceService,
    private readonly resources: CaratPlannerResourceService,
    private readonly avatars: TimelineAvatarService,
    private readonly cdr: ChangeDetectorRef,
    @Optional() private readonly elementRef: ElementRef<HTMLElement> | null = null,
  ) {}

  ngOnInit(): void {
    this.persistence.collection$.pipe(takeUntil(this.destroy$)).subscribe(collection => {
      this.collection = collection;
      this.plan = this.persistence.activePlan;
      this.syncTargetSchedulesFromResources();
      this.filterEvents();
      this.filterRewards();
      this.tryAddRequestedEvent();
      if (!this.syncActivePlanResources()) this.recalculate();
      this.cdr.markForCheck();
    });
    this.resources.state$.pipe(takeUntil(this.destroy$)).subscribe(state => {
      this.resourceState = state;
      this.cdr.markForCheck();
    });
    this.loadResources();
  }

  retryResources(): void {
    this.loadResources();
  }

  closeEventPicker(): void {
    this.showEventPicker = false;
  }

  onPopoverToggle(event: Event): void {
    const opened = event.currentTarget as HTMLDetailsElement | null;
    if (!opened?.open) return;
    this.closeEventPicker();
    this.plannerRoot()?.querySelectorAll<HTMLDetailsElement>('details.cp-popover[open]').forEach(details => {
      if (details !== opened) details.open = false;
    });
  }

  @HostListener('window:resize')
  onPlannerViewportResize(): void {
    this.compactPlannerLayout = window.innerWidth <= 768;
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    const root = this.plannerRoot();
    const target = event.target;
    if (!root || !(target instanceof Node)) return;

    let changed = false;
    const picker = root.querySelector('.cp-picker--primary');
    if (this.showEventPicker && !picker?.contains(target)) {
      this.showEventPicker = false;
      changed = true;
    }
    root.querySelectorAll<HTMLDetailsElement>('details.cp-popover[open]').forEach(details => {
      if (!details.contains(target)) {
        details.open = false;
        changed = true;
      }
    });
    if (changed) this.cdr.markForCheck();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onDocumentEscape(event: KeyboardEvent): void {
    const root = this.plannerRoot();
    if (!root) return;
    const openPopovers = root.querySelectorAll<HTMLDetailsElement>('details.cp-popover[open]');
    if (!this.showEventPicker && openPopovers.length === 0) return;
    this.showEventPicker = false;
    openPopovers.forEach(details => details.open = false);
    event.preventDefault();
    this.cdr.markForCheck();
  }

  onEventPickerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeEventPicker();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.showEventPicker = true;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      this.eventPickerActiveIndex = this.nextSelectableEventIndex(this.eventPickerActiveIndex, direction);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = this.filteredEvents[this.eventPickerActiveIndex];
      if (selected && !this.isEventAdded(selected.id)) {
        this.addEvent(selected);
      } else {
        this.addFirstMatchingEvent();
      }
    }
  }

  isEventAdded(eventId: string): boolean {
    if ((this.plan.disabledEventIds ?? []).includes(eventId)) return false;
    return this.plan.targets.some(target => target.eventId === eventId)
      || (this.plan.enabledRewardEventIds ?? []).includes(eventId);
  }

  eventDisplayTitle(event: CaratPlannerTimelineEvent): string {
    return this.rewardEventDisplayTitle(event);
  }

  targetDisplayTitle(target: PlannerTarget): string {
    const event = this.allEvents.find(item => item.id === target.eventId);
    if (event) return this.rewardEventDisplayTitle(event);
    return this.cleanRewardLabel(target.title).replace(/\s*\+\s*\d+\s*more\b/gi, '').trim();
  }

  targetBannerStart(target: PlannerTarget): string {
    return this.resolveTargetSchedule(target).start;
  }

  targetBannerEnd(target: PlannerTarget): string {
    return this.resolveTargetSchedule(target).end;
  }

  get activeTargets(): PlannerTarget[] {
    const disabledEventIds = new Set(this.plan?.disabledEventIds ?? []);
    return (this.plan?.targets ?? [])
      .filter(target => !disabledEventIds.has(target.eventId))
      .sort((left, right) => {
        const leftPast = this.isTargetBeforePlan(left);
        const rightPast = this.isTargetBeforePlan(right);
        if (leftPast !== rightPast) return leftPast ? 1 : -1;
        const dateOrder = this.calculations.resolvePullDate(left)
          .localeCompare(this.calculations.resolvePullDate(right));
        return (leftPast ? -dateOrder : dateOrder) || left.id.localeCompare(right.id);
      });
  }

  get plannedPullTotal(): number {
    return this.activeTargets
      .filter(target => !this.isTargetBeforePlan(target))
      .reduce((total, target) => total + Math.max(0, Number(target.plannedPulls) || 0), 0);
  }

  get totalShortfallCarats(): number {
    return this.activeTargets
      .filter(target => !this.isTargetBeforePlan(target))
      .reduce((total, target) =>
        total + Math.max(0, this.projectionByTarget.get(target.id)?.shortfallJewels ?? 0), 0);
  }

  isTargetBeforePlan(target: PlannerTarget): boolean {
    return Boolean(this.plan && this.calculations.isTargetBeforeProjectionStart(this.plan, target));
  }

  get activeRewardCount(): number {
    return this.rewardGroups.filter(group => this.isRewardGroupActive(group)).length
      + this.freePullCampaignViews.filter(campaign => this.isFreePullCampaignReady(campaign)).length;
  }

  get plannedRewardGroupCount(): number {
    return this.rewardGroups.filter(group =>
      this.isRewardGroupActive(group) || this.isRewardGroupLinkedToPlan(group)).length
      + this.freePullCampaignViews.filter(campaign => this.isFreePullCampaignLinked(campaign)).length;
  }

  get visibleRewardGroups(): PlannerRewardGroupView[] {
    return this.visibleRewardItems
      .map(item => item.group)
      .filter((group): group is PlannerRewardGroupView => Boolean(group));
  }

  get visibleFreePullCampaigns(): PlannerFreePullCampaignView[] {
    return this.visibleRewardItems
      .map(item => item.campaign)
      .filter((campaign): campaign is PlannerFreePullCampaignView => Boolean(campaign));
  }

  get visibleRewardItems(): PlannerRewardListItem[] {
    return this.displayedRewardItems;
  }

  get activeIncomeAssumptionCount(): number {
    if (!this.plan) return 0;
    const enabledRuleIds = new Set(this.plan.enabledIncomeRuleIds);
    const recurringSources = this.displayedRules.filter(rule => enabledRuleIds.has(rule.id)).length;
    const selectedScenarios = Object.values(this.plan.scenarioSelections)
      .filter(value => value && value !== SPECULATIVE_INCOME_NONE_OPTION).length;
    const customSources = this.plan.customIncome.filter(item => Number(item.amount) > 0).length;
    return recurringSources + selectedScenarios + customSources;
  }

  get enabledIncomeTotalLabel(): string {
    if (!this.plan) return '';
    const enabledRuleIds = new Set(this.plan.enabledIncomeRuleIds);
    const totals = new Map<PlannerIncomeRule['cadence'], number>();
    const addRule = (rule: PlannerIncomeRule) => {
      if (!matchesJewelCurrency(rule.currency) || !this.matchesSelectedScenario(rule)) return;
      totals.set(rule.cadence, (totals.get(rule.cadence) ?? 0) + Math.max(0, Number(rule.amount) || 0));
    };
    for (const rule of this.data.income.rules) {
      if (isLegacyTrainingPassIncomeRule(rule) || !enabledRuleIds.has(rule.id)) continue;
      addRule(rule);
    }
    for (const rule of trainingPassIncomeRules(
      this.plan.scenarioSelections[TRAINING_PASS_SCENARIO_GROUP_ID],
      this.allEvents,
    )) {
      addRule(rule);
    }
    for (const rule of randomGameplayIncomeRules(
      this.plan.scenarioSelections[RANDOM_GAMEPLAY_INCOME_SCENARIO_GROUP_ID],
      this.plan.projectionStartDate,
    )) {
      addRule(rule);
    }
    const speculativeSelection = this.plan.scenarioSelections[SPECULATIVE_INCOME_SCENARIO_GROUP_ID];
    const speculativeMonthly = speculativeSelection === SPECULATIVE_INCOME_MEDIAN_OPTION
      ? this.data.rewards.global_reward_comparison?.speculative_recent_median_monthly_carats
      : speculativeSelection === SPECULATIVE_INCOME_INCLUDED_OPTION
        ? this.data.rewards.global_reward_comparison?.speculative_monthly_carats
        : 0;
    if (Number(speculativeMonthly) > 0) {
      totals.set('monthly', (totals.get('monthly') ?? 0) + Math.max(0, Number(speculativeMonthly) || 0));
    }
    for (const item of this.plan.customIncome) {
      if (!matchesJewelCurrency(item.currency)) continue;
      totals.set(item.cadence, (totals.get(item.cadence) ?? 0) + Math.max(0, Number(item.amount) || 0));
    }

    const labels: string[] = [];
    const append = (cadence: PlannerIncomeRule['cadence'], suffix: string) => {
      const amount = totals.get(cadence) ?? 0;
      if (amount > 0) labels.push(`+${INTEGER_FORMATTER.format(amount)} ${suffix}`);
    };
    append('daily', '/ day');
    append('weekly', '/ week');
    append('monthly', '/ month');
    append('interval', '/ interval');
    append('once', 'one-time');
    return labels.join(' · ');
  }

  get enabledRewardTotalLabel(): string {
    const activeGroups = this.rewardGroups.filter(group => this.isRewardGroupActive(group));
    const ledgerBenefits = activeGroups.flatMap(group => group.benefits)
      .filter(benefit => benefit.plannerEffect === 'ledger');
    const benefitTotal = (kinds: readonly string[]) => ledgerBenefits.reduce((total, benefit) =>
      kinds.includes(benefit.kind) && Number.isFinite(benefit.amount)
        ? total + Math.max(0, Number(benefit.amount))
        : total, 0);
    const carats = benefitTotal(['carats']);
    const tickets = benefitTotal(['uma_ticket', 'support_ticket']);
    const parts: string[] = [];
    if (carats > 0) parts.push(`${INTEGER_FORMATTER.format(carats)} Carats`);
    if (tickets > 0) parts.push(`${INTEGER_FORMATTER.format(tickets)} ${tickets === 1 ? 'ticket' : 'tickets'}`);
    return parts.join(' · ');
  }

  isRewardActive(reward: PlannerRewardEntry): boolean {
    return this.enabledRewardIds().has(reward.id)
      && (!reward.event_id || !this.disabledEventIds().has(reward.event_id));
  }

  private enabledRewardIds(): ReadonlySet<string> {
    const source = this.plan?.enabledRewardIds ?? [];
    if (this.enabledRewardIdsSource !== source) {
      this.enabledRewardIdsSource = source;
      this.enabledRewardIdsLookup = new Set(source);
    }
    return this.enabledRewardIdsLookup;
  }

  private disabledEventIds(): ReadonlySet<string> {
    const source = this.plan?.disabledEventIds ?? [];
    if (this.disabledEventIdsSource !== source) {
      this.disabledEventIdsSource = source;
      this.disabledEventIdsLookup = new Set(source);
    }
    return this.disabledEventIdsLookup;
  }

  private enabledRewardEventIds(): ReadonlySet<string> {
    const source = this.plan?.enabledRewardEventIds ?? [];
    if (this.enabledRewardEventIdsSource !== source) {
      this.enabledRewardEventIdsSource = source;
      this.enabledRewardEventIdsLookup = new Set(source);
    }
    return this.enabledRewardEventIdsLookup;
  }

  isRewardGroupActive(group: PlannerRewardGroupView): boolean {
    if (group.isPast) return false;
    if (group.eventId && this.disabledEventIds().has(group.eventId)) return false;
    const selectableRewards = group.rewards.filter(reward => this.hasProjectableReward(reward));
    const hasTrackedInformationalBenefit = group.eventBenefits.some(benefit =>
      benefit.kind === 'trainee_selector' || benefit.kind === 'support_selector');
    const variableActive = group.variableOptions.length > 0
      && this.selectedVariableRewardOption(group).id !== VARIABLE_REWARD_NOT_COUNTED;
    const unknownRewardActive = group.rewards.some(reward =>
      !this.hasProjectableReward(reward) && this.isRewardActive(reward));
    if (selectableRewards.length === 0 && !hasTrackedInformationalBenefit) {
      return variableActive || unknownRewardActive;
    }
    const rewardsActive = selectableRewards.length === 0
      || selectableRewards.every(reward => this.isRewardActive(reward));
    const informationalActive = !hasTrackedInformationalBenefit
      || Boolean(group.eventId && this.enabledRewardEventIds().has(group.eventId));
    return rewardsActive && informationalActive;
  }

  isRewardGroupSelectable(group: PlannerRewardGroupView): boolean {
    const cached = this.rewardGroupSelectableCache.get(group);
    if (cached !== undefined) return cached;
    const hasLedgerReward = group.rewards.some(reward => this.hasProjectableReward(reward))
      || group.competitiveVariants.some(variant => isAutomaticCompetitiveVariant(variant))
      || group.variableOptions.length > 0;
    const hasSelector = group.eventBenefits.some(benefit =>
      benefit.kind === 'trainee_selector' || benefit.kind === 'support_selector');
    const selectable = hasLedgerReward || hasSelector;
    this.rewardGroupSelectableCache.set(group, selectable);
    return selectable;
  }

  isAutomaticFreePullGroup(group: PlannerRewardGroupView): boolean {
    return !this.isRewardGroupSelectable(group)
      && this.hasFreePullBenefit(group);
  }

  hasFreePullBenefit(group: PlannerRewardGroupView): boolean {
    const cached = this.freePullBenefitCache.get(group);
    if (cached !== undefined) return cached;
    const hasBenefit = group.eventBenefits.some(benefit =>
      benefit.kind === 'free_pulls' && Number(benefit.amount) > 0);
    this.freePullBenefitCache.set(group, hasBenefit);
    return hasBenefit;
  }

  isRewardGroupBannerActionable(group: PlannerRewardGroupView): boolean {
    if (!this.hasFreePullBenefit(group) || !group.eventId) return false;
    const event = this.eventById.get(group.eventId);
    return Boolean(event && (event.type?.includes('character') || event.type?.includes('support')));
  }

  isRewardGroupActionable(group: PlannerRewardGroupView): boolean {
    return this.isRewardGroupSelectable(group) || this.isRewardGroupBannerActionable(group);
  }

  isRewardGroupActionActive(group: PlannerRewardGroupView): boolean {
    const rewardsActive = !this.isRewardGroupSelectable(group) || this.isRewardGroupActive(group);
    const bannerActive = !this.isRewardGroupBannerActionable(group) || this.isRewardGroupBannerPlanned(group);
    return rewardsActive && bannerActive;
  }

  rewardGroupActionLabel(group: PlannerRewardGroupView): string {
    const verb = this.isRewardGroupActionActive(group) ? 'Remove' : 'Add';
    if (this.isRewardGroupSelectable(group) && this.isRewardGroupBannerActionable(group)) {
      return `${verb} ${group.title} rewards and banner ${verb === 'Remove' ? 'from' : 'to'} the plan`;
    }
    if (this.isRewardGroupSelectable(group)) return `${verb} ${group.title} rewards`;
    return `${verb} ${group.title} banner ${verb === 'Remove' ? 'from' : 'to'} the plan`;
  }

  toggleRewardGroupAction(group: PlannerRewardGroupView): void {
    const enable = !this.isRewardGroupActionActive(group);
    if (this.isRewardGroupSelectable(group)) {
      this.toggleRewardGroup(group, enable);
    }
    if (!this.isRewardGroupBannerActionable(group) || !group.eventId) return;
    const event = this.allEvents.find(item => item.id === group.eventId);
    if (!event) return;
    this.persistence.setEventActive(
      event,
      enable,
      this.plannerDataReady ? this.data.rewards.rewards : [],
      this.plannerDataReady ? this.data.rewards.competitive_variants ?? [] : [],
    );
  }

  isRewardGroupBannerPlanned(group: PlannerRewardGroupView): boolean {
    if (!group.eventId || this.disabledEventIds().has(group.eventId)) return false;
    return this.plan.targets.some(target =>
      target.eventId === group.eventId
      && !this.calculations.isTargetBeforeProjectionStart(this.plan, target));
  }

  isRewardGroupLinkedToPlan(group: PlannerRewardGroupView): boolean {
    return (group.variableOptions.length > 0
      && this.selectedVariableRewardOption(group).id !== VARIABLE_REWARD_NOT_COUNTED)
      || group.eventBenefits.some(benefit =>
      benefit.kind === 'free_pulls' && Number(benefit.amount) > 0)
      && this.isRewardGroupBannerPlanned(group);
  }

  selectedVariableRewardOption(group: PlannerRewardGroupView): PlannerVariableRewardOptionView {
    return this.resolveVariableRewardOption(
      group.eventId,
      group.variableOptions,
      group.competitiveVariants[0]?.competition,
    );
  }

  selectedVariableRewardOptionId(group: PlannerRewardGroupView): string {
    return this.selectedVariableRewardOption(group).id;
  }

  isVariableRewardNotCounted(group: PlannerRewardGroupView): boolean {
    return this.selectedVariableRewardOption(group).id === VARIABLE_REWARD_NOT_COUNTED;
  }

  cycleVariableRewardSelection(group: PlannerRewardGroupView, direction: 1 | -1): void {
    const options = [VARIABLE_REWARD_NOT_COUNTED_OPTION, ...group.variableOptions];
    const selected = this.selectedVariableRewardOption(group);
    let current = options.findIndex(option => option.id === selected.id);
    if (current < 0) {
      current = options.findIndex(option => this.sameVariableRewardAmounts(option.amounts, selected.amounts));
    }
    const next = Math.max(0, Math.min(options.length - 1, Math.max(0, current) + direction));
    if (next === current) return;
    this.setVariableRewardSelection(group, options[next].id);
  }

  setVariableRewardSelection(group: PlannerRewardGroupView, optionId: string): void {
    if (!group.eventId) return;
    const selections = { ...(this.plan.variableRewardSelections ?? {}) };
    const option = optionId === VARIABLE_REWARD_NOT_COUNTED
      ? VARIABLE_REWARD_NOT_COUNTED_OPTION
      : group.variableOptions.find(item => item.id === optionId);
    if (!option) return;

    const event = this.allEvents.find(item => item.id === group.eventId);
    selections[group.eventId] = {
      optionId: option.id,
      label: `${group.title}: ${option.label}`,
      availableAt: this.optionalDateKey(event?.estimatedEndDate) ?? group.availableAt,
      amounts: { ...option.amounts },
    };
    this.plan.variableRewardSelections = selections;
    this.updateRewardGroups([group], option.id !== VARIABLE_REWARD_NOT_COUNTED, true);
  }

  private resolveVariableRewardOption(
    eventId: string | undefined,
    options: readonly PlannerVariableRewardOptionView[],
    competition?: string,
  ): PlannerVariableRewardOptionView {
    if (!eventId) return VARIABLE_REWARD_NOT_COUNTED_OPTION;
    const stored = this.plan.variableRewardSelections?.[eventId];
    if (stored) {
      if (stored.optionId === VARIABLE_REWARD_NOT_COUNTED) return VARIABLE_REWARD_NOT_COUNTED_OPTION;
      const matchingOption = options.find(option => option.id === stored.optionId)
        ?? options.find(option => this.sameVariableRewardAmounts(option.amounts, stored.amounts));
      if (matchingOption) return matchingOption;
      const separator = stored.label.indexOf(': ');
      return {
        id: stored.optionId,
        label: separator >= 0 ? stored.label.slice(separator + 2) : stored.label,
        amountLabel: this.variableAmountLabel(stored.amounts),
        amounts: { ...stored.amounts },
      };
    }

    const eventType = competition ?? this.allEvents.find(event => event.id === eventId)?.type;
    const dataDrivenGroup = plannerDataDrivenCompetitionAssumptionForEventType(eventType);
    if (dataDrivenGroup) {
      const selected = resolveDataDrivenCompetitionAssumption(
        dataDrivenGroup.id,
        this.plan.scenarioSelections[dataDrivenGroup.id],
        this.data.rewards.competitive_variants?.filter(variant => variant.event_id === eventId) ?? [],
      );
      if (!selected) return VARIABLE_REWARD_NOT_COUNTED_OPTION;
      return options.find(option => option.id === selected.id)
        ?? options.find(option => this.sameVariableRewardAmounts(option.amounts, selected.amounts))
        ?? VARIABLE_REWARD_NOT_COUNTED_OPTION;
    }
    const assumptionGroup = PLANNER_COMPETITION_ASSUMPTION_GROUPS.find(group => group.eventType === eventType);
    const selectedValue = assumptionGroup && this.plan.scenarioSelections[assumptionGroup.id];
    const selectedAssumption = assumptionGroup?.options.find(option => option.value === selectedValue);
    if (!assumptionGroup || !selectedAssumption) return VARIABLE_REWARD_NOT_COUNTED_OPTION;
    const stableId = this.competitionAssumptionRewardOptionId(assumptionGroup.id, selectedAssumption.value);
    return options.find(option => option.id === stableId)
      ?? options.find(option => this.sameVariableRewardAmounts(option.amounts, selectedAssumption.amounts))
      ?? VARIABLE_REWARD_NOT_COUNTED_OPTION;
  }

  private sameVariableRewardAmounts(
    left: Partial<Record<PlannerCurrency, number>>,
    right: Partial<Record<PlannerCurrency, number>>,
  ): boolean {
    return [...VISIBLE_REWARD_CURRENCIES].every(currency =>
      Math.max(0, Number(left[currency]) || 0) === Math.max(0, Number(right[currency]) || 0));
  }

  freePullCampaignScheduleLabel(campaign: PlannerFreePullCampaignView): string {
    return campaign.allocations
      .map(allocation => `${INTEGER_FORMATTER.format(allocation.pulls)} ${allocation.title}`)
      .join(' + ');
  }

  freePullCampaignStockLabel(campaign: PlannerFreePullCampaignView): string {
    const destination = campaign.stockDestination;
    return destination
      ? `All ${INTEGER_FORMATTER.format(campaign.totalPulls)} on ${destination.title}`
      : `${INTEGER_FORMATTER.format(campaign.totalPulls)} pulls`;
  }

  isFreePullCampaignChoiceSelected(
    campaign: PlannerFreePullCampaignView,
    choice: FreePullCampaignChoice,
  ): boolean {
    const stored = this.plan.freePullCampaignSelections?.[campaign.id];
    if (choice === 'stock') {
      return Boolean(campaign.stockDestination && stored === campaign.stockDestination.event_id);
    }
    if (stored === FREE_PULL_CAMPAIGN_EXCLUDED_SELECTION) return false;
    if (stored === FREE_PULL_CAMPAIGN_DEFAULT_SELECTION) return true;
    if (stored) return false;
    return this.freePullCampaignTargetsReady(campaign.allocations);
  }

  isFreePullCampaignChoiceReady(
    campaign: PlannerFreePullCampaignView,
    choice: FreePullCampaignChoice,
  ): boolean {
    const allocations = choice === 'stock' && campaign.stockDestination
      ? [campaign.stockDestination]
      : campaign.allocations;
    return this.freePullCampaignTargetsReady(allocations);
  }

  isFreePullCampaignReady(campaign: PlannerFreePullCampaignView): boolean {
    if (this.isFreePullCampaignChoiceSelected(campaign, 'stock')) {
      return this.isFreePullCampaignChoiceReady(campaign, 'stock');
    }
    return this.isFreePullCampaignChoiceSelected(campaign, 'schedule')
      && this.isFreePullCampaignChoiceReady(campaign, 'schedule');
  }

  isFreePullCampaignLinked(campaign: PlannerFreePullCampaignView): boolean {
    const stored = this.plan.freePullCampaignSelections?.[campaign.id];
    if (stored === FREE_PULL_CAMPAIGN_EXCLUDED_SELECTION) return false;
    if (stored) return true;
    return campaign.allocations.some(allocation => this.isCampaignAllocationPlanned(allocation));
  }

  canSelectFreePullCampaign(
    campaign: PlannerFreePullCampaignView,
    choice: FreePullCampaignChoice,
  ): boolean {
    const allocations = choice === 'stock' && campaign.stockDestination
      ? [campaign.stockDestination]
      : campaign.allocations;
    return allocations.length > 0 && allocations.every(allocation => Boolean(this.findCampaignEvent(allocation)));
  }

  selectFreePullCampaign(campaign: PlannerFreePullCampaignView, choice: FreePullCampaignChoice): void {
    const selectedAndReady = this.isFreePullCampaignChoiceSelected(campaign, choice)
      && this.isFreePullCampaignChoiceReady(campaign, choice);
    if (selectedAndReady) {
      this.plan.freePullCampaignSelections = {
        ...(this.plan.freePullCampaignSelections ?? {}),
        [campaign.id]: FREE_PULL_CAMPAIGN_EXCLUDED_SELECTION,
      };
      this.save();
      return;
    }

    const allocations = choice === 'stock' && campaign.stockDestination
      ? [campaign.stockDestination]
      : campaign.allocations;
    if (!allocations.length) return;

    const events = allocations.map(allocation => this.findCampaignEvent(allocation));
    if (events.some((event): event is undefined => !event)) return;

    let nextPlan = this.plan;
    const seenEventIds = new Set<string>();
    for (const event of events) {
      if (!event || seenEventIds.has(event.id)) continue;
      seenEventIds.add(event.id);
      nextPlan = this.persistence.setEventActive(
        event,
        true,
        this.plannerDataReady ? this.data.rewards.rewards : [],
        this.plannerDataReady ? this.data.rewards.competitive_variants ?? [] : [],
      );
    }

    const selections = { ...(nextPlan.freePullCampaignSelections ?? {}) };
    selections[campaign.id] = choice === 'stock' && campaign.stockDestination
      ? campaign.stockDestination.event_id
      : FREE_PULL_CAMPAIGN_DEFAULT_SELECTION;
    nextPlan.freePullCampaignSelections = selections;
    this.plan = nextPlan;
    this.save();
  }

  toggleFreePullCampaignPlan(campaign: PlannerFreePullCampaignView): void {
    const choice: FreePullCampaignChoice = this.isFreePullCampaignChoiceSelected(campaign, 'stock')
      ? 'stock'
      : 'schedule';
    this.selectFreePullCampaign(campaign, choice);
  }

  switchFreePullCampaignAllocation(campaign: PlannerFreePullCampaignView): void {
    const choice: FreePullCampaignChoice = this.isFreePullCampaignChoiceSelected(campaign, 'stock')
      ? 'schedule'
      : 'stock';
    this.selectFreePullCampaign(campaign, choice);
  }

  toggleRewardGroupSelection(group: PlannerRewardGroupView): void {
    if (!this.isRewardGroupSelectable(group)) return;
    this.toggleRewardGroup(group, !this.isRewardGroupActive(group));
  }

  toggleRewardGroupBanner(group: PlannerRewardGroupView): void {
    if (!this.isRewardGroupBannerActionable(group) || !group.eventId) return;
    const event = this.allEvents.find(item => item.id === group.eventId);
    if (!event) return;
    this.persistence.setEventActive(
      event,
      !this.isRewardGroupBannerPlanned(group),
      this.plannerDataReady ? this.data.rewards.rewards : [],
      this.plannerDataReady ? this.data.rewards.competitive_variants ?? [] : [],
    );
  }

  addFirstMatchingEvent(): void {
    const event = this.filteredEvents.find(item => !this.isEventAdded(item.id));
    if (event) {
      this.addEvent(event);
    }
  }

  projectionStartChanged(): void {
    this.save();
    this.filterEvents();
    this.filterRewards();
  }

  toggleSetupPanel(panel: PlannerSetupPanel): void {
    this.activeSetupPanel = this.activeSetupPanel === panel ? null : panel;
  }

  toggleAssumptions(): void {
    this.activeSetupPanel = this.activeSetupPanel ? null : 'resources';
  }

  selectSetupPanel(panel: PlannerSetupPanel): void {
    this.activeSetupPanel = panel;
  }

  private loadResources(): void {
    void this.resources.loadInitial().then(data => {
      if (this.destroyed) return;
      this.data = {
        ...data,
        rewards: withTimelineRewardFallbacks(data.rewards, this.allEvents),
      };
      const rewardSelectionChanged = this.syncAutomaticRewardSelection();
      this.rebuildAssumptionViews();
      this.plannerDataReady = true;
      this.activePlanResourceKey = null;
      this.syncActivePlanResources(true);
      if (this.plan && (rewardSelectionChanged || this.syncEnabledRewardEventIds())) {
        this.save();
      }
      this.tryAddRequestedEvent();
      this.cdr.markForCheck();
    }).catch(() => {
      if (!this.destroyed) this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    const flushDeferredRewardSave = this.deferredRewardSavePending;
    if (this.deferredRewardSaveFrame !== undefined && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.deferredRewardSaveFrame);
    }
    if (this.deferredRewardSaveTimer !== undefined) clearTimeout(this.deferredRewardSaveTimer);
    this.deferredRewardSaveFrame = undefined;
    this.deferredRewardSaveTimer = undefined;
    this.deferredRewardSavePending = false;
    this.destroyed = true;
    this.planResourceRequest++;
    this.destroy$.next();
    this.destroy$.complete();
    if (flushDeferredRewardSave && this.plan) this.persistence.savePlan(this.plan);
  }

  selectPlan(planId: string): void {
    this.persistence.setActive(planId);
  }

  createPlan(): void {
    this.persistence.createPlan('New plan');
  }

  duplicatePlan(): void {
    this.persistence.duplicatePlan(this.plan.id);
  }

  deletePlan(): void {
    if (this.collection.plans.length > 1 && confirm(`Delete "${this.plan.name}"?`)) {
      this.persistence.deletePlan(this.plan.id);
    }
  }

  save(): void {
    this.persistence.savePlan(this.plan);
  }

  searchEvents(value: string): void {
    this.eventSearch = value;
    this.showEventPicker = true;
    this.filterEvents();
    this.eventPickerActiveIndex = this.nextSelectableEventIndex(-1, 1);
  }

  addEvent(event: CaratPlannerTimelineEvent): void {
    if (event.plannerRewardAvailable && !this.plannerDataReady) return;
    this.persistence.setEventActive(
      event,
      true,
      this.plannerDataReady ? this.data.rewards.rewards : [],
      this.plannerDataReady ? this.data.rewards.competitive_variants ?? [] : [],
    );
    this.showEventPicker = false;
    this.eventSearch = '';
  }

  removeTarget(targetId: string): void {
    const target = this.plan.targets.find(item => item.id === targetId);
    if (!target) return;
    this.expandedPickupTargetIds.delete(targetId);
    const event = this.allEvents.find(item => item.id === target.eventId) ?? {
      id: target.eventId,
      title: target.title,
      type: `${target.bannerKind}_banner`,
      globalReleaseDate: target.bannerStart,
      estimatedEndDate: target.bannerEnd,
      imagePath: target.imagePath,
      gachaId: target.gachaId,
      gachaIds: target.gachaIds,
      pickupCardIds: target.pickupGoals?.map(goal => goal.pickupId)
        ?? (target.pickupId === undefined ? [] : [target.pickupId]),
      plannerRewardAvailable: (this.plan.enabledRewardEventIds ?? []).includes(target.eventId),
    };
    this.persistence.setEventActive(event, false);
  }

  addCustomIncome(): void {
    const item: PlannerCustomIncome = {
      id: this.id('income'),
      label: 'Custom income',
      currency: 'free_jewels',
      amount: 0,
      cadence: 'once',
      startDate: this.plan.projectionStartDate,
      every: 1,
    };
    this.plan.customIncome.push(item);
    this.save();
  }

  removeCustomIncome(id: string): void {
    this.plan.customIncome = this.plan.customIncome.filter(item => item.id !== id);
    this.save();
  }

  toggleRule(rule: PlannerIncomeRule, enabled: boolean): void {
    const values = new Set(this.plan.enabledIncomeRuleIds);
    enabled ? values.add(rule.id) : values.delete(rule.id);
    this.plan.enabledIncomeRuleIds = [...values];
    this.save();
  }

  toggleReward(reward: PlannerRewardEntry, enabled: boolean): void {
    const values = new Set(this.plan.enabledRewardIds);
    const disabled = new Set(this.plan.disabledRewardIds ?? []);
    enabled ? values.add(reward.id) : values.delete(reward.id);
    enabled ? disabled.delete(reward.id) : disabled.add(reward.id);
    this.plan.enabledRewardIds = [...values];
    this.plan.disabledRewardIds = [...disabled];
    if (enabled && reward.event_id) {
      this.plan.disabledEventIds = (this.plan.disabledEventIds ?? []).filter(eventId => eventId !== reward.event_id);
    }
    this.syncEnabledRewardEventIds();
    this.save();
  }

  toggleRewardGroup(group: PlannerRewardGroupView, enabled: boolean): void {
    this.updateRewardGroups([group], enabled);
  }

  setDisplayedRewardsEnabled(enabled: boolean): void {
    if (this.displayedRewardGroups.length > 0) {
      this.updateRewardGroups(this.displayedRewardGroups, enabled);
      return;
    }

    const values = new Set(this.plan.enabledRewardIds);
    const disabled = new Set(this.plan.disabledRewardIds ?? []);
    const eventIdsToEnable = new Set<string>();
    for (const reward of this.displayedRewards) {
      if (enabled) {
        values.add(reward.id);
        disabled.delete(reward.id);
        if (reward.event_id) eventIdsToEnable.add(reward.event_id);
      } else {
        values.delete(reward.id);
        disabled.add(reward.id);
      }
    }
    this.plan.enabledRewardIds = [...values];
    this.plan.disabledRewardIds = [...disabled];
    if (enabled && eventIdsToEnable.size) {
      this.plan.disabledEventIds = (this.plan.disabledEventIds ?? [])
        .filter(eventId => !eventIdsToEnable.has(eventId));
    }
    this.syncEnabledRewardEventIds();
    this.save();
  }

  private updateRewardGroups(groups: readonly PlannerRewardGroupView[], enabled: boolean, deferSave = false): void {
    const rewardIds = new Set(this.plan.enabledRewardIds);
    const disabledRewardIds = new Set(this.plan.disabledRewardIds ?? []);
    const eventIds = new Set(this.plan.enabledRewardEventIds ?? []);
    const disabledEventIds = new Set(this.plan.disabledEventIds ?? []);
    const affectedEventIds = new Set(groups
      .map(group => group.eventId)
      .filter((eventId): eventId is string => Boolean(eventId)));

    for (const group of groups) {
      for (const reward of group.rewards) {
        if (!this.hasProjectableReward(reward)) continue;
        enabled ? rewardIds.add(reward.id) : rewardIds.delete(reward.id);
        enabled ? disabledRewardIds.delete(reward.id) : disabledRewardIds.add(reward.id);
      }
      for (const variant of group.competitiveVariants) {
        if (!isAutomaticCompetitiveVariant(variant)) continue;
        enabled ? rewardIds.add(variant.id) : rewardIds.delete(variant.id);
        enabled ? disabledRewardIds.delete(variant.id) : disabledRewardIds.add(variant.id);
      }
      if (group.eventId) {
        enabled ? eventIds.add(group.eventId) : eventIds.delete(group.eventId);
        if (group.variableOptions.length > 0) {
          enabled ? disabledEventIds.delete(group.eventId) : disabledEventIds.add(group.eventId);
        }
      }
    }

    this.plan.enabledRewardIds = [...rewardIds];
    this.plan.disabledRewardIds = [...disabledRewardIds];
    this.plan.enabledRewardEventIds = [...eventIds];
    if (enabled) {
      for (const eventId of affectedEventIds) disabledEventIds.delete(eventId);
    }
    this.plan.disabledEventIds = [...disabledEventIds];
    this.syncEnabledRewardEventIds();
    deferSave ? this.scheduleRewardSaveAfterPaint() : this.save();
  }

  private scheduleRewardSaveAfterPaint(): void {
    this.cdr.markForCheck();
    if (!this.elementRef || typeof requestAnimationFrame !== 'function') {
      this.save();
      return;
    }

    this.deferredRewardSavePending = true;
    if (this.deferredRewardSaveFrame !== undefined || this.deferredRewardSaveTimer !== undefined) return;
    this.deferredRewardSaveFrame = requestAnimationFrame(() => {
      this.deferredRewardSaveFrame = undefined;
      this.deferredRewardSaveTimer = setTimeout(() => {
        this.deferredRewardSaveTimer = undefined;
        if (!this.deferredRewardSavePending || this.destroyed) return;
        this.deferredRewardSavePending = false;
        this.save();
      }, 0);
    });
  }

  rewardDetailsTooltip(reward: PlannerRewardEntry): string {
    const confidenceNote = reward.confidence === 'historical_partial'
      ? 'Historical partial snapshot; totals may be incomplete.'
      : '';
    const evidence = reward.evidence?.replace(/\s+/g, ' ').trim();
    if (evidence) {
      const excerpt = evidence.length > 220 ? `${evidence.slice(0, 217)}...` : evidence;
      return [confidenceNote, excerpt].filter(Boolean).join(' ');
    }
    if (reward.source_items?.length) {
      const itemCount = reward.source_items.reduce((total, item) => total + Math.max(0, Number(item.mission_count) || 1), 0);
      return [
        confidenceNote,
        `${itemCount} source reward ${itemCount === 1 ? 'entry' : 'entries'} extracted from the event data.`,
      ].filter(Boolean).join(' ');
    }
    return confidenceNote;
  }

  setScenario(group: string, option: string): void {
    if (option) {
      this.plan.scenarioSelections[group] = option;
    } else if (group === SPECULATIVE_INCOME_SCENARIO_GROUP_ID
      || group === TEMPORARY_STORY_REWARDS_SCENARIO_GROUP_ID
      || group === RACING_CARNIVAL_MISSION_SCENARIO_GROUP_ID) {
      this.plan.scenarioSelections[group] = group === SPECULATIVE_INCOME_SCENARIO_GROUP_ID
        ? SPECULATIVE_INCOME_NONE_OPTION
        : CONDITIONAL_REWARDS_NONE_OPTION;
    } else {
      delete this.plan.scenarioSelections[group];
    }
    const values = new Set(this.plan.enabledIncomeRuleIds);
    for (const rule of this.data.income.rules.filter(item => item.scenario_group === group)) {
      values.add(rule.id);
    }
    this.plan.enabledIncomeRuleIds = [...values];
    const dataDrivenGroup = plannerDataDrivenCompetitionAssumptionGroup(group);
    if (dataDrivenGroup) {
      const affectedEventIds = new Set((this.data.rewards.competitive_variants ?? [])
        .filter(variant => variant.competition === dataDrivenGroup.eventType)
        .map(variant => variant.event_id));
      const selections = { ...(this.plan.variableRewardSelections ?? {}) };
      affectedEventIds.forEach(eventId => delete selections[eventId]);
      this.plan.variableRewardSelections = selections;
    }
    this.save();
  }

  cycleScenario(group: PlannerScenarioGroupView, direction: 1 | -1): void {
    const values = ['', ...group.options.map(option => option.value)];
    const current = Math.max(0, values.indexOf(this.plan.scenarioSelections[group.id] ?? ''));
    const next = (current + direction + values.length) % values.length;
    this.setScenario(group.id, values[next]);
  }

  scenarioGroupIcon(groupId: string): string {
    if (groupId === TRAINING_PASS_SCENARIO_GROUP_ID) return 'fact_check';
    if (groupId === MONTHLY_SHOP_SCENARIO_GROUP_ID) return 'storefront';
    if (groupId === SPECULATIVE_INCOME_SCENARIO_GROUP_ID) return 'auto_graph';
    if (groupId === RANDOM_GAMEPLAY_INCOME_SCENARIO_GROUP_ID) return 'casino';
    if (groupId === TEMPORARY_STORY_REWARDS_SCENARIO_GROUP_ID) return 'menu_book';
    if (groupId === RACING_CARNIVAL_MISSION_SCENARIO_GROUP_ID) return 'flag';
    if (groupId === 'team_trials_class') return 'stadium';
    if (groupId === 'club_rank') return 'groups';
    const competition = plannerCompetitionAssumptionGroup(groupId);
    if (competition) return competition.icon;
    return 'tune';
  }

  scenarioOptionIconPath(groupId: string, optionValue: string): string | null {
    if (groupId !== 'club_rank') return null;
    const rank = Number(optionValue.match(/\d+/)?.[0]);
    if (!Number.isInteger(rank) || rank < 1 || rank > 11) return null;
    return `assets/images/icon/circle_rank/utx_ico_circle_rank_${String(rank).padStart(2, '0')}.webp`;
  }

  selectedScenarioOption(group: PlannerScenarioGroupView): PlannerScenarioOptionView | null {
    const selectedValue = this.plan.scenarioSelections[group.id];
    return group.options.find(option => option.value === selectedValue) ?? null;
  }

  incomeRuleIconPath(_rule: PlannerIncomeRule): string | null {
    return null;
  }

  incomeRuleScheduleLabel(rule: PlannerIncomeRule): string {
    switch (rule.cadence) {
      case 'daily': return 'Every day';
      case 'weekly': {
        const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return Number.isInteger(rule.weekday) && rule.weekday! >= 0 && rule.weekday! < weekdays.length
          ? `Every ${weekdays[rule.weekday!]}`
          : 'Every week';
      }
      case 'monthly': return rule.day_of_month ? `Day ${rule.day_of_month} each month` : 'Every month';
      case 'interval': return `Every ${Math.max(1, Number(rule.every) || 1)} days`;
      case 'once': return 'One-time income';
    }
  }

  rewardIconPath(_reward: PlannerRewardEntry): string | null {
    return null;
  }

  private rebuildAssumptionViews(): void {
    const groups = new Map<string, Set<string>>();
    for (const rule of this.data.income.rules) {
      if (rule.scenario_group && rule.scenario_option) {
        const options = groups.get(rule.scenario_group) ?? new Set<string>();
        options.add(rule.scenario_option);
        groups.set(rule.scenario_group, options);
      }
    }
    const resourceGroups = [...groups].map(([id, options]) => ({
      id,
      label: id === 'team_trials_class'
        ? 'Team Trials class'
        : id === 'club_rank'
          ? 'Club rank'
          : id === MONTHLY_SHOP_SCENARIO_GROUP_ID
            ? 'Monthly shop tickets'
            : this.humanize(id),
      scheduleLabel: this.scenarioScheduleLabel(id),
      helpText: id === MONTHLY_SHOP_SCENARIO_GROUP_ID ? MONTHLY_SHOP_HELP_TEXT : undefined,
      options: [...options]
        .sort((left, right) => this.scenarioOptionNumber(left) - this.scenarioOptionNumber(right))
        .map(value => ({
          value,
          label: this.scenarioOptionLabel(id, value),
          amountLabel: this.scenarioOptionAmountLabel(id, value),
        })),
    }));
    const competitionGroups = PLANNER_COMPETITION_ASSUMPTION_GROUPS.map(group => ({
      id: group.id,
      label: group.label,
      scheduleLabel: group.scheduleLabel,
      options: group.options.map(option => ({
        value: option.value,
        label: option.label,
        amountLabel: this.competitionAssumptionAmountLabel(option.amounts),
      })),
    }));
    this.scenarioGroupOptions = [
      ...resourceGroups,
      ...competitionGroups,
      ...this.dataDrivenCompetitionScenarioGroups(),
      ...plannerIncomeAssumptionGroups(
        this.allEvents,
        this.data.rewards.global_reward_comparison,
      ).map(group => ({
        ...group,
        options: group.options.map(option => ({
          value: option.value,
          label: option.label,
          amountLabel: option.amountLabel,
        })),
      })),
    ];
    this.displayedRules = this.data.income.rules.filter(rule =>
      !rule.scenario_group && !isLegacyTrainingPassIncomeRule(rule));
    this.filterRewards();
  }

  private dataDrivenCompetitionScenarioGroups(): PlannerScenarioGroupView[] {
    return PLANNER_DATA_DRIVEN_COMPETITION_ASSUMPTION_GROUPS.flatMap(group => {
      const variantsByEvent = new Map<string, PlannerCompetitiveRewardVariant[]>();
      for (const variant of this.data.rewards.competitive_variants ?? []) {
        if (variant.competition !== group.eventType) continue;
        const variants = variantsByEvent.get(variant.event_id) ?? [];
        variants.push(variant);
        variantsByEvent.set(variant.event_id, variants);
      }
      const eventVariants = [...variantsByEvent.values()]
        .filter(variants => buildDataDrivenCompetitionRewardOptions(variants).length > 0);
      if (eventVariants.length === 0) return [];

      if (group.selectionMode === 'opponents_cleared') {
        const options: PlannerScenarioOptionView[] = [1, 2, 3].map(count => ({
          value: `opponents_${count}`,
          label: `${count} ${count === 1 ? 'opponent' : 'opponents'} cleared`,
          amountLabel: this.dataDrivenScenarioAmountLabel(group.id, `opponents_${count}`, eventVariants),
        }));
        options.push({
          value: 'all',
          label: 'All opponents cleared',
          amountLabel: this.dataDrivenScenarioAmountLabel(group.id, 'all', eventVariants),
        });
        return [{
          id: group.id,
          label: group.label,
          scheduleLabel: group.scheduleLabel,
          options,
        }];
      }

      const representative = eventVariants
        .map(variants => buildDataDrivenCompetitionRewardOptions(variants))
        .sort((left, right) => right.length - left.length)[0];
      const options = representative.map((option, index) => {
        const value = option.selectionValue
          ?? (/all (?:milestones|rewards)/i.test(option.label) ? 'all' : `tier_${index + 1}`);
        return {
          value,
          label: option.label,
          amountLabel: this.dataDrivenScenarioAmountLabel(group.id, value, eventVariants),
        };
      });
      return options.length === 0 ? [] : [{
        id: group.id,
        label: group.label,
        scheduleLabel: group.scheduleLabel,
        options,
      }];
    });
  }

  private dataDrivenScenarioAmountLabel(
    groupId: string,
    selectionValue: string,
    eventVariants: readonly (readonly PlannerCompetitiveRewardVariant[])[],
  ): string {
    const labels = new Set(eventVariants
      .map(variants => resolveDataDrivenCompetitionAssumption(groupId, selectionValue, variants))
      .filter((option): option is NonNullable<typeof option> => Boolean(option))
      .map(option => this.competitionAssumptionAmountLabel(option.amounts))
      .filter(Boolean));
    if (labels.size === 1) return [...labels][0];
    return labels.size > 1 ? 'Varies by event' : '';
  }

  searchRewards(value: string): void {
    this.rewardSearch = value;
    this.filterRewards();
  }

  setRewardSelectionFilter(filter: RewardSelectionFilter): void {
    if (this.rewardSelectionFilter === filter) return;
    this.rewardSelectionFilter = filter;
    this.filterRewards();
  }

  setPastRewardsVisible(visible: boolean): void {
    if (this.showPastRewards === visible) return;
    this.showPastRewards = visible;
    this.filterRewards();
  }

  isPastRewardGroup(group: PlannerRewardGroupView): boolean {
    return group.isPast;
  }

  private filterRewards(): void {
    const query = this.rewardSearch.trim().toLowerCase();
    const viewKey = this.rewardViewKey();
    if (this.cachedRewardResources !== this.data.rewards
      || this.cachedRewardEvents !== this.allEvents
      || this.cachedRewardViewKey !== viewKey) {
      this.rewardGroupSelectableCache = new WeakMap<PlannerRewardGroupView, boolean>();
      this.freePullBenefitCache = new WeakMap<PlannerRewardGroupView, boolean>();
      this.freePullCampaignViews = this.buildFreePullCampaignViews();
      this.rewardGroups = this.buildRewardGroups();
      this.cachedRewardResources = this.data.rewards;
      this.cachedRewardEvents = this.allEvents;
      this.cachedRewardViewKey = viewKey;
    }
    const matchingCampaigns = this.freePullCampaignViews
      .filter(campaign => !query || campaign.searchText.includes(query))
      .filter(campaign => this.rewardSelectionFilter === 'all' || this.isFreePullCampaignLinked(campaign));
    this.displayedFreePullCampaigns = matchingCampaigns
      .filter(campaign => campaign.isPast === this.showPastRewards);
    const matching = this.rewardGroups
      .filter(group => !query || group.searchText.includes(query))
      .filter(group => this.rewardSelectionFilter === 'all'
        || this.isRewardGroupActive(group)
        || this.isRewardGroupLinkedToPlan(group));
    const upcoming = matching
      .filter(group => !this.isPastRewardGroup(group))
      .sort((left, right) => this.compareRewardDates(left, right, 1));
    const past = matching
      .filter(group => this.isPastRewardGroup(group))
      .sort((left, right) => this.compareRewardDates(left, right, -1));
    this.upcomingRewardGroupCount = matching.filter(group => !this.isPastRewardGroup(group)).length
      + matchingCampaigns.filter(campaign => !campaign.isPast).length;
    this.pastRewardGroupCount = matching.length + matchingCampaigns.length - this.upcomingRewardGroupCount;
    this.displayedRewardGroups = this.showPastRewards ? past : upcoming;
    const direction = this.showPastRewards ? -1 : 1;
    this.displayedRewardItems = [
      ...this.displayedRewardGroups.map(group => ({
        id: `group:${group.id}`,
        kind: 'reward' as const,
        availableAt: group.availableAt,
        isPast: group.isPast,
        group,
      })),
      ...this.displayedFreePullCampaigns.map(campaign => ({
        id: `campaign:${campaign.id}`,
        kind: 'free-pull-campaign' as const,
        availableAt: campaign.availableAt,
        isPast: campaign.isPast,
        campaign,
      })),
    ].sort((left, right) => this.compareRewardListItems(left, right, direction));
    this.displayedRewards = this.displayedRewardGroups.flatMap(group => [...group.rewards]);
    this.cdr.markForCheck();
  }

  private rewardViewKey(): string {
    if (!this.plan) return '';
    const scenarios = Object.entries(this.plan.scenarioSelections ?? {})
      .sort(([left], [right]) => left.localeCompare(right));
    const variableSelections = Object.entries(this.plan.variableRewardSelections ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([eventId, selection]) => [
        eventId,
        selection.optionId,
        selection.availableAt,
        Object.entries(selection.amounts ?? {}).sort(([left], [right]) => left.localeCompare(right)),
      ]);
    return JSON.stringify([this.plan.projectionStartDate, scenarios, variableSelections]);
  }

  private compareRewardDates(left: PlannerRewardGroupView, right: PlannerRewardGroupView, direction: 1 | -1): number {
    const leftDate = this.optionalDateKey(left.availableAt);
    const rightDate = this.optionalDateKey(right.availableAt);
    if (!leftDate && !rightDate) return left.title.localeCompare(right.title);
    if (!leftDate) return 1;
    if (!rightDate) return -1;
    return direction * leftDate.localeCompare(rightDate) || left.title.localeCompare(right.title);
  }

  private compareRewardListItems(
    left: PlannerRewardListItem,
    right: PlannerRewardListItem,
    direction: 1 | -1,
  ): number {
    const leftDate = this.optionalDateKey(left.availableAt);
    const rightDate = this.optionalDateKey(right.availableAt);
    if (!leftDate && !rightDate) return left.id.localeCompare(right.id);
    if (!leftDate) return 1;
    if (!rightDate) return -1;
    return direction * leftDate.localeCompare(rightDate) || left.id.localeCompare(right.id);
  }

  private buildFreePullCampaignViews(): PlannerFreePullCampaignView[] {
    const projectionStart = this.optionalDateKey(this.plan?.projectionStartDate);
    return (this.data.rewards.free_pull_campaigns ?? [])
      .filter(campaign => Boolean(campaign.id) && Number(campaign.total_pulls) > 0)
      .map(campaign => {
        const allocations = (campaign.default_allocations ?? [])
          .filter(allocation => Boolean(allocation.event_id) && Number(allocation.pulls) > 0)
          .map(allocation => {
            const event = this.findCampaignEvent(allocation);
            return {
              ...allocation,
              pulls: Math.max(0, Math.trunc(Number(allocation.pulls) || 0)),
              title: event
                ? this.rewardEventDisplayTitle(event)
                : `Gacha ${allocation.gacha_id ?? allocation.event_id}`,
              imagePath: event?.imagePath,
            } satisfies PlannerFreePullCampaignAllocationView;
          });
        const supportsStock = allocations.length > 1 && (
          campaign.stockable === true
          || campaign.allocation_mode === 'daily_with_one_time_stock'
        );
        const eventDates = allocations
          .map(allocation => this.findCampaignEvent(allocation))
          .map(event => this.optionalDateKey(
            event?.globalReleaseDate ?? event?.estimatedGlobalDate ?? event?.jpReleaseDate,
          ))
          .filter((date): date is string => Boolean(date));
        const isPast = Boolean(projectionStart && eventDates.length > 0
          && eventDates.every(date => date < projectionStart));
        const orderedDates = [...eventDates].sort();
        const usableDates = projectionStart ? orderedDates.filter(date => date >= projectionStart) : orderedDates;
        const availableAt = isPast
          ? orderedDates[orderedDates.length - 1] ?? ''
          : usableDates[0] ?? orderedDates[0] ?? '';
        const rawLabel = campaign.label?.trim() ?? '';
        const cleanedRawLabel = this.cleanRewardLabel(rawLabel);
        const totalPulls = Math.max(0, Math.trunc(Number(campaign.total_pulls) || 0));
        const label = !cleanedRawLabel
          || cleanedRawLabel.length > 64
          || /free\s+(?:gacha|pull)/i.test(cleanedRawLabel)
          ? `${INTEGER_FORMATTER.format(totalPulls)} free-pull campaign`
          : cleanedRawLabel;
        const sourceUrl = campaign.source_url?.trim();
        return {
          id: campaign.id,
          campaign,
          label,
          totalPulls,
          pullsPerDay: Number(campaign.pulls_per_day) > 0
            ? Math.trunc(Number(campaign.pulls_per_day))
            : undefined,
          allocations,
          stockDestination: supportsStock ? allocations[allocations.length - 1] : undefined,
          sourceUrl: sourceUrl && /^https?:\/\//i.test(sourceUrl) ? sourceUrl : undefined,
          availableAt,
          searchText: [
            label,
            rawLabel,
            'free pulls',
            supportsStock ? 'gacha stock' : '',
            ...allocations.flatMap(allocation => [allocation.title, String(allocation.pulls)]),
          ].filter(Boolean).join(' ').toLowerCase(),
          isPast,
        } satisfies PlannerFreePullCampaignView;
      })
      .filter(campaign => campaign.allocations.length > 0);
  }

  private findCampaignEvent(
    allocation: Pick<PlannerFreePullCampaignAllocation, 'event_id' | 'gacha_id'>,
  ): CaratPlannerTimelineEvent | undefined {
    return this.eventById.get(allocation.event_id)
      ?? (allocation.gacha_id === undefined ? undefined : this.eventByGachaId.get(allocation.gacha_id));
  }

  private isCampaignAllocationPlanned(allocation: PlannerFreePullCampaignAllocationView): boolean {
    const event = this.findCampaignEvent(allocation);
    if (event) return this.isEventPlanned(event.id);
    if ((this.plan.disabledEventIds ?? []).includes(allocation.event_id)) return false;
    return this.plan.targets.some(target =>
      target.eventId === allocation.event_id
      || (allocation.gacha_id !== undefined
        && (target.gachaId === allocation.gacha_id || (target.gachaIds ?? []).includes(allocation.gacha_id))),
    );
  }

  private freePullCampaignTargetsReady(
    allocations: readonly PlannerFreePullCampaignAllocationView[],
  ): boolean {
    return allocations.length > 0 && allocations.every(allocation => this.isCampaignAllocationPlanned(allocation));
  }

  private isEventPlanned(eventId: string): boolean {
    return !(this.plan.disabledEventIds ?? []).includes(eventId)
      && this.plan.targets.some(target =>
        target.eventId === eventId && !this.calculations.isTargetBeforeProjectionStart(this.plan, target));
  }

  private buildRewardGroups(): PlannerRewardGroupView[] {
    const grouped = new Map<string, {
      eventId?: string;
      rewards: PlannerRewardEntry[];
      competitiveVariants: PlannerCompetitiveRewardVariant[];
      eventBenefits: PlannerEventBenefit[];
    }>();

    for (const reward of this.data.rewards.rewards ?? []) {
      const id = reward.event_id
        ? `event:${reward.event_id}`
        : `reward:${reward.available_at}:${plannerRewardBundleId(reward)}`;
      const group = grouped.get(id) ?? {
        eventId: reward.event_id,
        rewards: [],
        competitiveVariants: [],
        eventBenefits: [],
      };
      group.rewards.push(reward);
      grouped.set(id, group);
    }
    for (const variant of this.data.rewards.competitive_variants ?? []) {
      const id = `event:${variant.event_id}`;
      const group = grouped.get(id) ?? {
        eventId: variant.event_id,
        rewards: [],
        competitiveVariants: [],
        eventBenefits: [],
      };
      group.competitiveVariants.push(variant);
      grouped.set(id, group);
    }
    const managedCampaignIds = new Set(
      (this.data.rewards.free_pull_campaigns ?? []).map(campaign => campaign.id),
    );
    for (const benefit of this.data.rewards.event_benefits ?? []) {
      if (benefit.kind === 'free_pulls'
        && benefit.campaign_id
        && managedCampaignIds.has(benefit.campaign_id)) continue;
      const id = `event:${benefit.event_id}`;
      const group = grouped.get(id) ?? {
        eventId: benefit.event_id,
        rewards: [],
        competitiveVariants: [],
        eventBenefits: [],
      };
      group.eventBenefits.push(benefit);
      grouped.set(id, group);
    }

    return [...grouped.entries()]
      .map(([id, group]) => {
        const event = this.findRewardGroupEvent(
          group.eventId,
          group.rewards,
          group.eventBenefits,
          group.competitiveVariants,
        );
        const dates = [
          ...group.rewards.map(reward => reward.available_at),
          ...group.eventBenefits.map(benefit => benefit.available_at),
          ...group.competitiveVariants.map(variant => variant.available_at),
        ].map(value => this.optionalDateKey(value))
          .filter((value): value is string => Boolean(value))
          .sort();
        const eventDate = this.optionalDateKey(event?.globalReleaseDate ?? event?.estimatedGlobalDate ?? event?.jpReleaseDate);
        if (dates.length === 0 && eventDate) dates.push(eventDate);
        const projectionStart = this.optionalDateKey(this.plan?.projectionStartDate);
        const usableDates = projectionStart ? dates.filter(date => date >= projectionStart) : dates;
        const isPast = Boolean(projectionStart && dates.length > 0 && usableDates.length === 0);
        const applicableRewards = isPast || !projectionStart
          ? group.rewards
          : group.rewards.filter(reward => this.isRewardDateUsable(reward.available_at, projectionStart));
        const applicableBenefits = isPast || !projectionStart
          ? group.eventBenefits
          : group.eventBenefits.filter(benefit => this.isRewardDateUsable(benefit.available_at, projectionStart));
        const applicableVariants = isPast || !projectionStart
          ? group.competitiveVariants
          : group.competitiveVariants.filter(variant =>
            this.isRewardDateUsable(variant.available_at ?? eventDate ?? '', projectionStart));
        const variableOptions = this.buildVariableRewardOptions(applicableVariants);
        const benefits = this.buildRewardBenefitViews(
          group.eventId,
          applicableRewards,
          applicableBenefits,
          variableOptions,
          applicableVariants,
        );
        const breakdownTooltip = this.buildRewardBreakdownTooltip(applicableRewards);
        const source = this.rewardGroupSource(applicableRewards, applicableBenefits);
        const groupedResourceCount = group.rewards.length
          + group.eventBenefits.length
          + group.competitiveVariants.length;
        const title = this.cleanRewardLabel((event ? this.rewardEventDisplayTitle(event) : undefined)
          ?? (group.eventId && groupedResourceCount > 1
            ? this.humanize(group.eventId).replace(/^./, character => character.toLowerCase())
            : undefined)
          ?? group.rewards[0]?.label
          ?? group.eventBenefits[0]?.label
          ?? (group.competitiveVariants[0]
            ? `${this.humanize(group.competitiveVariants[0].competition)} rewards`
            : undefined)
          ?? 'Event rewards');
        const firstVariant = group.competitiveVariants[0];
        return {
          id,
          eventId: group.eventId,
          title,
          availableAt: isPast ? dates[dates.length - 1] : usableDates[0] ?? dates[0] ?? '',
          imagePath: event?.imagePath
            ?? resolveBundledTimelineEventImagePath(firstVariant?.competition, firstVariant?.master_event_id),
          sourceUrl: source?.url,
          sourceLabel: source?.label,
          rewards: applicableRewards,
          competitiveVariants: applicableVariants,
          variableOptions,
          eventBenefits: applicableBenefits,
          benefits,
          visibleBenefits: benefits,
          hiddenBenefitCount: 0,
          breakdownTooltip,
          searchText: [
            title,
            group.eventId,
            ...group.rewards.flatMap(reward => [reward.label, reward.currency]),
            ...group.eventBenefits.flatMap(benefit => [benefit.label, benefit.kind]),
            ...group.competitiveVariants.flatMap(variant => [variant.label, variant.competition]),
            ...benefits.map(benefit => benefit.text),
          ].filter(Boolean).join(' ').toLowerCase(),
          isPast,
        } satisfies PlannerRewardGroupView;
      })
      .sort((left, right) => this.compareRewardDates(left, right, 1));
  }

  private findRewardGroupEvent(
    eventId: string | undefined,
    rewards: readonly PlannerRewardEntry[],
    eventBenefits: readonly PlannerEventBenefit[],
    competitiveVariants: readonly PlannerCompetitiveRewardVariant[],
  ): CaratPlannerTimelineEvent | undefined {
    if (eventId) {
      const exact = this.eventById.get(eventId);
      if (exact) return exact;
    }

    const gachaIds = new Set<number>([
      ...rewards.map(reward => reward.gacha_id),
      ...eventBenefits.map(benefit => benefit.gacha_id),
    ].filter((id): id is number => Number.isFinite(id)));
    if (gachaIds.size > 0) {
      for (const gachaId of gachaIds) {
        const gachaMatch = this.eventByGachaId.get(gachaId);
        if (gachaMatch) return gachaMatch;
      }
    }

    for (const variant of competitiveVariants) {
      const masterMatch = this.eventByTypeAndMasterId.get(
        `${variant.competition}:${variant.master_event_id}`,
      );
      if (masterMatch) return masterMatch;
    }

    const eventMasterId = timelineEventMasterId(eventId);
    if (eventMasterId !== undefined && eventId) {
      const normalizedId = eventId.replace(/-/g, '_').toLowerCase();
      return this.allEvents.find(event =>
        timelineEventMasterId(event.id) === eventMasterId
        && Boolean(event.type && normalizedId.includes(event.type)));
    }
    return undefined;
  }

  private rewardEventDisplayTitle(event: CaratPlannerTimelineEvent): string {
    const title = (event.title?.trim() || 'Event rewards').replace(/["'”](?=[!?.,]+$)/g, '');
    if (!/\+\s*\d+\s*more\b/i.test(title)) return title;
    const preferredNames = [
      event.relatedCharacters,
      event.relatedSupportCardNames,
      event.relatedSupportCards,
    ].find(values => values?.some(name => name.trim())) ?? [];
    const names = [...new Set(preferredNames.map(name => name.trim()).filter(Boolean))];
    if (names.length > 0) return names.join(', ');
    return title.replace(/\s*\+\s*\d+\s*more\b/gi, '').trim();
  }

  private cleanRewardLabel(value: string): string {
    return value
      .replace(/(\bVol\.\s*\d+)["'\u201c\u201d\u2018\u2019]+/giu, '$1')
      .replace(/["'\u201c\u201d\u2018\u2019]+([!?]+)["'\u201c\u201d\u2018\u2019]*$/u, '$1')
      .replace(/["'\u201c\u201d\u2018\u2019]+$/u, '')
      .trim();
  }

  private buildRewardBreakdownTooltip(rewards: readonly PlannerRewardEntry[]): string {
    const lines = plannerRewardBundles(rewards)
      .map(bundle => {
        const carats = (bundle.totals.get('free_jewels') ?? 0) + (bundle.totals.get('paid_jewels') ?? 0);
        const amounts = [
          carats > 0 ? `${INTEGER_FORMATTER.format(carats)} Carats` : '',
          this.rewardBreakdownAmount(bundle.totals.get('uma_ticket'), 'Uma ticket'),
          this.rewardBreakdownAmount(bundle.totals.get('support_ticket'), 'Support ticket'),
          this.rewardBreakdownAmount(bundle.totals.get('rainbow_crystal'), 'Rainbow shard'),
          this.rewardBreakdownAmount(bundle.totals.get('gold_crystal'), 'Gold shard'),
        ].filter(Boolean);
        return amounts.length > 0
          ? `${this.cleanRewardLabel(bundle.label).replace(/ item details$/i, '')}: ${amounts.join(' · ')}`
          : '';
      })
      .filter(Boolean);
    const uniqueLines = [...new Set(lines)];
    if (uniqueLines.length === 0) return '';

    const notes: string[] = [];
    if (rewards.some(reward => reward.provenance?.startsWith('jp_master'))) {
      notes.push('JP master projection; Global master rewards replace it when available.');
    }
    if (rewards.some(reward => /bingo rewards/i.test(reward.label))) {
      notes.push('Finite Bingo sheets are included. Repeatable sheets have no fixed maximum and are excluded.');
    }
    return ['Reward breakdown', ...uniqueLines, ...notes].join('\n');
  }

  private rewardBreakdownAmount(amount: number | undefined, singular: string): string {
    if (!Number.isFinite(amount) || Number(amount) <= 0) return '';
    const value = Math.trunc(Number(amount));
    return `${INTEGER_FORMATTER.format(value)} ${singular}${value === 1 ? '' : 's'}`;
  }

  private isRewardDateUsable(value: string, projectionStart: string): boolean {
    const date = this.optionalDateKey(value);
    return !date || date >= projectionStart;
  }

  private rewardGroupSource(
    rewards: readonly PlannerRewardEntry[],
    eventBenefits: readonly PlannerEventBenefit[],
  ): { url: string; label: string } | undefined {
    const candidates = [
      ...eventBenefits.filter(benefit => benefit.kind === 'free_pulls'),
      ...rewards,
      ...eventBenefits,
    ].map((candidate, index) => ({ candidate, index }))
      .sort((left, right) => {
        const priority = (provenance: string | undefined): number => {
          if (provenance === 'global_news') return 0;
          if (provenance?.startsWith('global_')) return 1;
          if (provenance === 'jp_news') return 2;
          if (provenance?.startsWith('jp_')) return 3;
          return 4;
        };
        return priority(left.candidate.provenance) - priority(right.candidate.provenance)
          || left.index - right.index;
      })
      .map(({ candidate }) => candidate);
    for (const candidate of candidates) {
      const url = candidate.source_url?.trim();
      if (!url || !/^https?:\/\//i.test(url)) continue;
      const isNews = candidate.provenance === 'global_news'
        || candidate.provenance === 'jp_news'
        || url.toLowerCase().includes('/news/');
      return { url, label: isNews ? 'News post' : 'Source' };
    }
    return undefined;
  }

  private buildRewardBenefitViews(
    eventId: string | undefined,
    rewards: readonly PlannerRewardEntry[],
    eventBenefits: readonly PlannerEventBenefit[],
    variableOptions: readonly PlannerVariableRewardOptionView[],
    competitiveVariants: readonly PlannerCompetitiveRewardVariant[],
  ): PlannerRewardBenefitView[] {
    const benefits: PlannerRewardBenefitView[] = eventBenefits
      .filter(benefit => benefit.kind === 'free_pulls')
      .map(benefit => ({
        id: benefit.id,
        kind: benefit.kind,
        label: benefit.label,
        amount: benefit.amount,
        text: this.eventBenefitText(benefit),
        icon: this.rewardBenefitIcon(benefit.kind),
        iconPath: this.rewardBenefitItemIcon(benefit.kind, benefit.item_id),
        plannerEffect: benefit.planner_effect,
      }));
    const totals = new Map<string, number>();
    const addCurrency = (currency: PlannerCurrency, amount: number) => {
      if (amount <= 0 || !VISIBLE_REWARD_CURRENCIES.has(currency)) return;
      const kind = this.rewardKindForCurrency(currency);
      totals.set(kind, (totals.get(kind) ?? 0) + amount);
    };
    for (const bundle of plannerRewardBundles(rewards)) {
      for (const [currency, amount] of bundle.totals) addCurrency(currency, amount);
    }
    const selection = this.resolveVariableRewardOption(
      eventId,
      variableOptions,
      competitiveVariants[0]?.competition,
    );
    if (selection.id !== VARIABLE_REWARD_NOT_COUNTED) {
      for (const [currency, amount] of Object.entries(selection.amounts) as [PlannerCurrency, number][]) {
        addCurrency(currency, Number(amount));
      }
    }
    for (const [kind, amount] of totals) {
      benefits.push({
        id: `currency:${kind}`,
        kind,
        label: this.rewardCurrencyLabel(kind, amount),
        amount,
        text: `${INTEGER_FORMATTER.format(amount)} ${this.rewardCurrencyLabel(kind, amount)}`,
        icon: this.rewardBenefitIcon(kind),
        iconPath: this.rewardBenefitItemIcon(kind),
        plannerEffect: 'ledger',
      });
    }
    if (variableOptions.length > 0 && selection.id === VARIABLE_REWARD_NOT_COUNTED) {
      benefits.push({
        id: 'competitive-outcomes',
        kind: 'competitive_outcomes',
        label: 'Rewards vary by result',
        amount: null,
        text: 'Choose expected result',
        icon: 'emoji_events',
        plannerEffect: 'informational',
      });
    }
    const hasUnmappedItems = rewards.some(reward => reward.source_items?.some(item =>
      !plannerCurrencyForSourceItem(item)));
    if (hasUnmappedItems) {
      benefits.push({
        id: 'additional-item-rewards',
        kind: 'other',
        label: 'Additional item rewards',
        amount: null,
        text: 'Additional item rewards',
        icon: 'redeem',
        plannerEffect: 'informational',
      });
    } else if (benefits.length === 0 && rewards.some(reward => !Number.isFinite(reward.amount))) {
      benefits.push({
        id: 'reward-details',
        kind: 'other',
        label: 'Reward details',
        amount: null,
        text: 'Reward details',
        icon: 'redeem',
        plannerEffect: 'informational',
      });
    }
    return benefits.sort((left, right) => this.rewardBenefitOrder(left.kind) - this.rewardBenefitOrder(right.kind));
  }

  private buildVariableRewardOptions(
    variants: readonly PlannerCompetitiveRewardVariant[],
  ): PlannerVariableRewardOptionView[] {
    const competition = variants[0]?.competition;
    const assumptionGroup = PLANNER_COMPETITION_ASSUMPTION_GROUPS.find(group => group.eventType === competition);
    if (assumptionGroup) {
      return assumptionGroup.options.map(option => ({
        id: this.competitionAssumptionRewardOptionId(assumptionGroup.id, option.value),
        label: option.label,
        amountLabel: this.variableAmountLabel(option.amounts),
        amounts: { ...option.amounts },
      }));
    }

    const dataDrivenOptions = buildDataDrivenCompetitionRewardOptions(variants);
    if (dataDrivenOptions.length > 0) {
      return dataDrivenOptions.map(option => ({
        ...option,
        amountLabel: this.variableAmountLabel(option.amounts),
      }));
    }

    const projectable = variants.filter(variant => isProjectableCompetitiveVariant(variant));
    if (competition === 'champions_meeting') {
      return classicChampionsFinalOutcomes().map(outcome => {
        const amounts: Partial<Record<PlannerCurrency, number>> = {};
        for (const item of outcome.items) {
          const currency = this.outcomeItemCurrency(item.key);
          if (currency) amounts[currency] = (amounts[currency] ?? 0) + item.amount;
        }
        return { id: outcome.key, label: outcome.label, amountLabel: this.variableAmountLabel(amounts), amounts };
      });
    }
    if (projectable.length === 0) return [];

    const missionVariants = projectable.filter(variant => /event missions/i.test(variant.label));
    const resultVariants = projectable
      .filter(variant => !missionVariants.includes(variant))
      .sort((left, right) => this.competitiveOutcomeOrder(left) - this.competitiveOutcomeOrder(right)
        || left.label.localeCompare(right.label));
    const totals: Partial<Record<PlannerCurrency, number>> = {};
    const options = resultVariants.map((variant, index) => {
      for (const [currency, amount] of plannerSourceItemTotals(variant.source_items)) {
        totals[currency] = (totals[currency] ?? 0) + amount;
      }
      const amounts = { ...totals };
      const label = variant.competition === 'legend_race'
        ? `${index + 1} ${index === 0 ? 'opponent' : 'opponents'} cleared`
        : this.cleanCompetitiveOutcomeLabel(variant.label);
      return { id: variant.id, label, amountLabel: this.variableAmountLabel(amounts), amounts };
    });

    if (missionVariants.length > 0) {
      const amounts = { ...totals };
      for (const mission of missionVariants) {
        for (const [currency, amount] of plannerSourceItemTotals(mission.source_items)) {
          amounts[currency] = (amounts[currency] ?? 0) + amount;
        }
      }
      options.push({
        id: missionVariants.map(variant => variant.id).join('+'),
        label: 'All milestones + event missions',
        amountLabel: this.variableAmountLabel(amounts),
        amounts,
      });
    }
    return options;
  }

  private competitiveOutcomeOrder(variant: PlannerCompetitiveRewardVariant): number {
    const rangeStart = Number(variant.label.match(/\((\d+)(?:-|\s)/)?.[1]);
    if (Number.isFinite(rangeStart)) return rangeStart;
    const rank = Number(variant.label.match(/(?:Team rank|rank)\s+(\d+)/i)?.[1]);
    if (Number.isFinite(rank)) return rank;
    return Number(variant.source_items[0]?.order_min) || Number.MAX_SAFE_INTEGER;
  }

  private cleanCompetitiveOutcomeLabel(label: string): string {
    return label
      .replace(/^League rank type\s+\d+,\s*/i, '')
      .replace(/\s*\((?:rate|reward set)[^)]+\)\s*$/i, '')
      .trim();
  }

  private outcomeItemCurrency(key: string): PlannerCurrency | undefined {
    if (key === 'carats') return 'free_jewels';
    if (key === 'uma-ticket') return 'uma_ticket';
    if (key === 'support-ticket') return 'support_ticket';
    return undefined;
  }

  private competitionAssumptionRewardOptionId(groupId: string, optionValue: string): string {
    return `assumption:${groupId}:${optionValue}`;
  }

  private variableAmountLabel(amounts: Partial<Record<PlannerCurrency, number>>): string {
    const parts: string[] = [];
    const carats = (amounts.free_jewels ?? 0) + (amounts.paid_jewels ?? 0);
    if (carats > 0) parts.push(`${INTEGER_FORMATTER.format(carats)} Carats`);
    if (amounts.uma_ticket) parts.push(`${INTEGER_FORMATTER.format(amounts.uma_ticket)} Uma tix`);
    if (amounts.support_ticket) parts.push(`${INTEGER_FORMATTER.format(amounts.support_ticket)} support tix`);
    return parts.join(' · ') || 'No Carats or tickets';
  }

  private rewardKindForCurrency(currency: PlannerCurrency): string {
    return matchesJewelCurrency(currency) ? 'carats' : currency;
  }

  private eventBenefitText(benefit: PlannerEventBenefit): string {
    const amount = Number.isFinite(benefit.amount) ? Math.max(0, Number(benefit.amount)) : null;
    if (benefit.kind === 'free_pulls' && amount !== null) {
      if (benefit.confidence === 'schedule_partitioned') {
        const qualifier = benefit.source_url ? 'schedule-derived free' : 'predicted free';
        return `${INTEGER_FORMATTER.format(amount)} ${qualifier} ${amount === 1 ? 'pull' : 'pulls'}`;
      }
      const predicted = benefit.confidence === 'schedule_derived';
      return `${INTEGER_FORMATTER.format(amount)} ${predicted ? 'predicted free' : 'free'} ${amount === 1 ? 'pull' : 'pulls'}`;
    }
    if ((benefit.kind === 'trainee_selector' || benefit.kind === 'support_selector') && amount !== null && amount > 1) {
      return `${benefit.label} ×${INTEGER_FORMATTER.format(amount)}`;
    }
    return benefit.label;
  }

  private rewardCurrencyLabel(kind: string, amount: number): string {
    if (kind === 'carats') return 'Carats';
    if (kind === 'uma_ticket') return amount === 1 ? 'Uma ticket' : 'Uma tickets';
    if (kind === 'support_ticket') return amount === 1 ? 'Support ticket' : 'Support tickets';
    if (kind === 'rainbow_crystal') return amount === 1 ? 'Rainbow Crystal Shard' : 'Rainbow Crystal Shards';
    if (kind === 'gold_crystal') return amount === 1 ? 'Gold Crystal Shard' : 'Gold Crystal Shards';
    return amount === 1 ? 'reward' : 'rewards';
  }

  private rewardBenefitIcon(kind: string): string {
    if (kind === 'free_pulls') return 'casino';
    if (kind === 'trainee_selector') return 'person';
    if (kind === 'support_selector' || kind === 'support_ticket') return 'style';
    if (kind === 'uma_ticket') return 'confirmation_number';
    if (kind === 'carats') return 'diamond';
    if (kind === 'rainbow_crystal' || kind === 'gold_crystal') return 'auto_awesome';
    return 'redeem';
  }

  private rewardBenefitItemIcon(kind: string, itemId?: number): string | undefined {
    const resolvedItemId = Number(itemId ?? PLANNER_CURRENCY_ITEM_IDS[kind]);
    if (!Number.isInteger(resolvedItemId) || !PREPARED_PLANNER_ITEM_IDS.has(resolvedItemId)) return undefined;
    return `assets/images/item/item_icon_${resolvedItemId.toString().padStart(5, '0')}.webp`;
  }

  private rewardBenefitOrder(kind: string): number {
    if (kind === 'free_pulls') return 0;
    if (kind === 'trainee_selector' || kind === 'support_selector') return 1;
    if (kind === 'uma_ticket' || kind === 'support_ticket') return 2;
    if (kind === 'rainbow_crystal' || kind === 'gold_crystal') return 3;
    if (kind === 'carats') return 4;
    return 5;
  }

  private humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
  }

  private scenarioOptionLabel(groupId: string, value: string): string {
    const number = this.scenarioOptionNumber(value);
    if (groupId === 'team_trials_class' && number > 0) return `Class ${number}`;
    if (groupId === 'club_rank' && number > 0) {
      return ['D', 'D+', 'C', 'C+', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'SS'][number - 1]
        ?? this.humanize(value);
    }
    return this.humanize(value);
  }

  private scenarioOptionNumber(value: string): number {
    return Number(value.match(/\d+/)?.[0]) || Number.MAX_SAFE_INTEGER;
  }

  private scenarioOptionAmountLabel(groupId: string, value: string): string {
    const rules = this.data.income.rules.filter(rule =>
      rule.scenario_group === groupId
      && rule.scenario_option === value);
    if (groupId === MONTHLY_SHOP_SCENARIO_GROUP_ID) {
      const umaTickets = rules
        .filter(rule => rule.currency === 'uma_ticket')
        .reduce((total, rule) => total + Math.max(0, Number(rule.amount) || 0), 0);
      const supportTickets = rules
        .filter(rule => rule.currency === 'support_ticket')
        .reduce((total, rule) => total + Math.max(0, Number(rule.amount) || 0), 0);
      return umaTickets > 0 || supportTickets > 0
        ? `+${INTEGER_FORMATTER.format(umaTickets)} Uma + ${INTEGER_FORMATTER.format(supportTickets)} support / mo`
        : '';
    }
    const jewelRules = rules.filter(rule => matchesJewelCurrency(rule.currency));
    const amount = jewelRules.reduce((total, rule) => total + Math.max(0, Number(rule.amount) || 0), 0);
    if (amount <= 0) return '';
    const cadence = jewelRules[0]?.cadence;
    const suffix = cadence === 'daily' ? '/day'
      : cadence === 'weekly' ? '/wk'
        : cadence === 'monthly' ? '/mo'
          : cadence === 'interval' ? '/period'
            : '';
    return `+${INTEGER_FORMATTER.format(amount)}${suffix}`;
  }

  private scenarioScheduleLabel(groupId: string): string {
    if (groupId === MONTHLY_SHOP_SCENARIO_GROUP_ID) {
      return 'Monthly; requires Friend Points and Clovers';
    }
    const rule = this.data.income.rules.find(item => item.scenario_group === groupId);
    if (!rule) return 'Optional income';
    if (rule.cadence === 'weekly') return 'Weekly payout';
    if (rule.cadence === 'monthly') return 'Monthly payout';
    if (rule.cadence === 'daily') return 'Daily payout';
    return this.incomeRuleScheduleLabel(rule);
  }

  private competitionAssumptionAmountLabel(
    amounts: Readonly<Partial<Record<PlannerCurrency, number>>>,
  ): string {
    const carats = (amounts.free_jewels ?? 0) + (amounts.paid_jewels ?? 0);
    const tickets = (amounts.uma_ticket ?? 0) + (amounts.support_ticket ?? 0);
    const parts = carats > 0 ? [`+${INTEGER_FORMATTER.format(carats)}`] : [];
    if (tickets > 0) parts.push(`${INTEGER_FORMATTER.format(tickets)} tix`);
    return `${parts.join(' + ')} / event`;
  }

  pickupOptions(target: PlannerTarget): readonly PlannerPickupOptionView[] {
    return this.pickupOptionsByTarget.get(target.id) ?? [];
  }

  trackByPickupOption(_: number, pickup: PlannerPickupOptionView): number {
    return pickup.pickup_id;
  }

  trackByPickupGoal(_: number, goal: PlannerPickupGoalView): number {
    return goal.pickupId;
  }

  setPickupDetailsOpen(targetId: string, event: Event): void {
    const open = (event.currentTarget as HTMLDetailsElement | null)?.open === true;
    open ? this.expandedPickupTargetIds.add(targetId) : this.expandedPickupTargetIds.delete(targetId);
  }

  isPickupDetailsOpen(targetId: string): boolean {
    return this.expandedPickupTargetIds.has(targetId);
  }

  isPickupGoalSelected(target: PlannerTarget, pickupId: number): boolean {
    return this.selectedPickupIdsByTarget.get(target.id)?.has(pickupId)
      ?? this.pickupGoals(target).some(goal => goal.pickupId === pickupId);
  }

  pickupGoalView(target: PlannerTarget, pickupId: number): PlannerPickupGoalView | undefined {
    return this.pickupGoalViewsByTarget.get(target.id)?.find(goal => goal.pickupId === pickupId);
  }

  togglePickupGoal(target: PlannerTarget, pickupId: number): void {
    const normalizedId = Number(pickupId);
    if (!Number.isFinite(normalizedId)) return;

    const goals = this.pickupGoals(target);
    const existingIndex = goals.findIndex(goal => goal.pickupId === normalizedId);
    const memoryKey = this.pickupGoalMemoryKey(target.id, normalizedId);
    if (existingIndex >= 0) {
      this.pickupGoalCopyMemory.set(memoryKey, goals[existingIndex].desiredCopies);
      target.pickupGoals = goals.filter((_, index) => index !== existingIndex);
    } else {
      target.pickupGoals = [...goals, {
        pickupId: normalizedId,
        desiredCopies: this.pickupGoalCopyMemory.get(memoryKey) ?? 1,
      }];
    }
    this.syncLegacyPickupGoal(target);
    this.save();
  }

  adjustPickupGoalCopies(target: PlannerTarget, pickupId: number, delta: -1 | 1): void {
    const goals = this.pickupGoals(target);
    const goal = goals.find(item => item.pickupId === pickupId);
    if (!goal) return;
    const maximum = target.bannerKind === 'support' ? 5 : 20;
    goal.desiredCopies = Math.max(1, Math.min(maximum, goal.desiredCopies + delta));
    target.pickupGoals = goals;
    this.pickupGoalCopyMemory.set(this.pickupGoalMemoryKey(target.id, pickupId), goal.desiredCopies);
    this.syncLegacyPickupGoal(target);
    this.save();
  }

  adjustTargetLbCrystals(target: PlannerTarget, kind: 'rainbow' | 'gold', delta: -1 | 1): void {
    const property = kind === 'rainbow' ? 'rainbowCrystalsPlanned' : 'goldCrystalsPlanned';
    target[property] = Math.max(0, Math.min(20, Math.trunc(target[property] ?? 0) + delta));
    this.save();
  }

  adjustTargetPulls(target: PlannerTarget, delta: -100 | -10 | 10 | 100): void {
    const current = Math.max(0, Math.trunc(Number(target.plannedPulls) || 0));
    target.plannedPulls = Math.max(0, Math.min(5000, current + delta));
    this.save();
  }

  formatProbability(value: number, digits = 1): string {
    if (!Number.isFinite(value)) return '\u2014';
    const percentage = value * 100;
    const decimals = percentage > 0 && percentage < 0.1 ? 2 : digits;
    return `${percentage.toFixed(decimals)}%`;
  }

  formatCopies(value: number): string {
    return value.toFixed(value >= 10 ? 1 : 2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  }

  pickupGoalOddsLabel(goal: PlannerPickupGoalView): string {
    return goal.probability === undefined ? 'Unavailable' : this.formatProbability(goal.probability);
  }

  pickupGoalRequirementLabel(goal: PlannerPickupGoalView): string {
    const copiesNeeded = goal.copiesNeededFromPulls ?? goal.desiredCopies;
    const copiesLabel = copiesNeeded === 1 ? 'copy' : 'copies';
    const base = `${copiesNeeded} ${copiesLabel} required`;
    const crystalCopies = goal.crystalCopiesApplied ?? 0;
    if (!crystalCopies || !goal.crystalKind) return base;
    return `${base} + ${crystalCopies} ${goal.crystalKind === 'rainbow' ? 'Rainbow Uncap' : 'Gold Uncap'}`;
  }

  pickupGoalOddsAriaLabel(goal: PlannerPickupGoalView): string {
    if (goal.probability === undefined) return `Odds unavailable for ${goal.label}`;
    const copiesNeeded = goal.copiesNeededFromPulls ?? goal.desiredCopies;
    const copies = copiesNeeded === 1 ? 'copy' : 'copies';
    const base = `${this.formatProbability(goal.probability)} chance of at least ${copiesNeeded} ${copies} of ${goal.label}`;
    const crystalCopies = goal.crystalCopiesApplied ?? 0;
    if (!crystalCopies || !goal.crystalKind) return base;
    const crystalLabel = `${goal.crystalKind} Uncap ${crystalCopies === 1 ? 'Crystal' : 'Crystals'}`;
    return `${base}; ${crystalCopies} ${crystalLabel} ${crystalCopies === 1 ? 'supplies' : 'supply'} the remaining limit breaks toward ${goal.desiredCopies} total copies`;
  }

  trackByOutcome(_: number, item: PlannerOutcomeSegment): string {
    return item.tone;
  }

  outcomeDistributionLabel(odds: PlannerOddsView): string {
    const exchanges = odds.combined.guaranteedHits > 0
      ? ` Includes ${odds.combined.guaranteedHits} exchange ${odds.combined.guaranteedHits === 1 ? 'copy' : 'copies'}.`
      : '';
    const outcomes = odds.segments
      .map(segment => `${segment.semanticLabel}, ${segment.rangeLabel}, ${this.formatProbability(segment.probability)}`)
      .join('; ');
    return `Selected rate-up outcome distribution at ${odds.combined.pulls} pulls: ${outcomes}.${exchanges}`;
  }

  topRarityLabel(target: PlannerTarget): string {
    return this.gachaByTarget.get(target.id)?.banner_kind === 'support' ? 'SSR' : '3\u2605';
  }

  poolSegmentWidth(rate: number, pool: CaratPullPoolComposition): number {
    return pool.topRarityRate > 0 ? rate / pool.topRarityRate * 100 : 0;
  }

  poolDistributionLabel(target: PlannerTarget, pool: CaratPullPoolComposition): string {
    const rarity = this.topRarityLabel(target);
    return `${rarity} pool per draw: selected featured ${this.formatProbability(pool.selectedRateUpRate, 2)}, `
      + `other featured ${this.formatProbability(pool.unselectedFeaturedRate, 2)}, `
      + `off-banner ${this.formatProbability(pool.offBannerTopRarityRate, 2)}; `
      + `total ${this.formatProbability(pool.topRarityRate, 2)}.`;
  }

  freePullsTooltip(target: PlannerTarget): string {
    const gacha = this.gachaByTarget.get(target.id);
    const freePulls = Math.max(0, Number(gacha?.free_pulls) || 0);
    if (!gacha || freePulls === 0) return 'No free-pull campaign is attached to this banner.';

    const confidence = gacha.free_pulls_confidence === 'schedule_partitioned'
      || gacha.free_pulls_confidence === 'schedule_derived'
      ? 'Schedule-partitioned across overlapping banners'
      : gacha.free_pulls_confidence === 'exact'
        ? 'Exact campaign-to-banner match'
        : gacha.free_pulls_confidence === 'source_text'
          ? 'Read directly from the campaign text'
          : 'Best available campaign match';
    const provenance = gacha.free_pulls_provenance === 'jp_news'
      ? 'Japanese news post'
      : gacha.free_pulls_provenance === 'global_master'
        ? 'Global master data'
        : gacha.free_pulls_provenance === 'global_news'
          ? 'Global news post'
          : gacha.free_pulls_provenance === 'jp_fallback'
            ? 'Japanese fallback data'
            : 'Planner resource data';
    return `${freePulls} free pulls. ${confidence}. Source: ${provenance}.`;
  }


  targetTicketBalanceAtPull(target: PlannerTarget, result: PlannerTargetProjection): number {
    return this.targetTicketCurrency(target) === 'support_ticket'
      ? result.balanceBefore.supportTickets
      : result.balanceBefore.umaTickets;
  }

  targetTicketIconPath(target: PlannerTarget): string {
    return this.targetTicketCurrency(target) === 'support_ticket'
      ? 'assets/images/item/item_icon_00111.webp'
      : 'assets/images/item/item_icon_00041.webp';
  }

  targetTicketUsageLabel(target: PlannerTarget, result: PlannerTargetProjection): string {
    const available = this.targetTicketBalanceAtPull(target, result);
    const remaining = Math.max(0, available - result.ticketPullsUsed);
    const label = this.targetTicketCurrency(target) === 'support_ticket' ? 'support tickets' : 'Trainee tickets';
    return result.ticketPullsUsed > 0
      ? `${available} ${label} available at pull; ${result.ticketPullsUsed} used and ${remaining} remaining`
      : `${available} ${label} available at pull; none used`;
  }

  craftedCrystalCount(shards: number | null | undefined): number {
    return Math.floor(Math.max(0, Number(shards) || 0) / 20);
  }

  targetResourcesAtPullAriaLabel(target: PlannerTarget, result: PlannerTargetProjection): string {
    const parts: string[] = [];
    if (this.targetTicketCurrency(target)) parts.push(this.targetTicketUsageLabel(target, result));
    if (target.bannerKind === 'support') {
      parts.push(`${this.craftedCrystalCount(result.balanceBefore.rainbowCrystals)} rainbow Uncap Crystals`);
      parts.push(`${this.craftedCrystalCount(result.balanceBefore.goldCrystals)} gold Uncap Crystals`);
    }
    return `At pull date: ${parts.join(', ')}`;
  }

  private targetTicketCurrency(
    target: PlannerTarget,
  ): Extract<PlannerCurrency, 'uma_ticket' | 'support_ticket'> | undefined {
    return this.gachaByTarget.get(target.id)?.ticket_currency
      ?? (target.bannerKind === 'character'
        ? 'uma_ticket'
        : target.bannerKind === 'support' ? 'support_ticket' : undefined);
  }
  fundingBreakdownTooltip(result: PlannerTargetProjection): string {
    const parts = [`${result.fundedPulls} of ${result.plannedPulls} planned pulls funded`];
    if (result.freePullsUsed > 0) parts.push(`${result.freePullsUsed} campaign free pulls`);
    if (result.ticketPullsUsed > 0) parts.push(`${result.ticketPullsUsed} tickets`);
    if (result.freeJewelPulls > 0) parts.push(`${result.freeJewelPulls} pulls from free Carats`);
    if (result.paidJewelPulls > 0) parts.push(`${result.paidJewelPulls} pulls from paid Carats`);
    if (result.shortfallJewels > 0) parts.push(`${INTEGER_FORMATTER.format(result.shortfallJewels)} Carats short`);
    parts.push(`${INTEGER_FORMATTER.format(result.balanceAfter.freeJewels)} free Carats after`);
    if (result.balanceAfter.paidJewels > 0) {
      parts.push(`${INTEGER_FORMATTER.format(result.balanceAfter.paidJewels)} paid Carats after`);
    }
    return parts.join('. ');
  }

  fundingInlineLabel(target: PlannerTarget, result: PlannerTargetProjection): string {
    const resourcePulls = result.ticketPullsUsed + result.freeJewelPulls + result.paidJewelPulls;
    const parts = result.shortfallJewels > 0
      ? [`${INTEGER_FORMATTER.format(result.shortfallJewels)} Carats short`]
      : [];
    parts.push(`${INTEGER_FORMATTER.format(resourcePulls)} from resources`);
    if (result.freePullsUsed > 0) {
      const gacha = this.gachaByTarget.get(target.id);
      const predicted = gacha?.free_pulls_provenance === 'jp_news'
        || gacha?.free_pulls_confidence === 'schedule_partitioned'
        || gacha?.free_pulls_confidence === 'schedule_derived';
      parts.push(`${INTEGER_FORMATTER.format(result.freePullsUsed)} ${predicted ? 'predicted free' : 'free'}`);
    }
    return parts.join(' · ');
  }

  exportPlan(): void {
    const blob = new Blob([this.persistence.exportPlan()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.plan.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'carat-plan'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async importPlan(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      this.persistence.importJson(await file.text());
      this.importError = '';
    } catch (error) {
      this.importError = error instanceof Error ? error.message : 'Unable to import plan.';
    } finally {
      input.value = '';
      this.cdr.markForCheck();
    }
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  trackByRewardBenefit(_: number, benefit: PlannerRewardBenefitView): string {
    return benefit.id;
  }

  private applyResourceDefaults(): boolean {
    if (this.plan.resourceDefaultsApplied) return false;
    this.plan.enabledIncomeRuleIds = this.data.income.rules.filter(rule => rule.default_enabled && !rule.scenario_group).map(rule => rule.id);
    this.syncEnabledRewardEventIds();
    this.plan.resourceDefaultsApplied = true;
    this.save();
    return true;
  }

  private syncAutomaticRewardSelection(): boolean {
    if (!this.plan) return false;
    const disabledRewardIds = new Set(this.plan.disabledRewardIds ?? []);
    const nextEnabledRewardIds = [
      ...this.data.rewards.rewards
        .filter(reward => this.hasProjectableReward(reward)
          && (reward.default_enabled !== false || this.plan.enabledRewardIds.includes(reward.id)))
        .map(reward => reward.id),
      ...(this.data.rewards.competitive_variants ?? [])
        .filter(variant => isAutomaticCompetitiveVariant(variant))
        .map(variant => variant.id),
    ]
      .filter(rewardId => !disabledRewardIds.has(rewardId))
      .sort();
    const current = [...this.plan.enabledRewardIds].sort();
    const changed = current.length !== nextEnabledRewardIds.length
      || current.some((rewardId, index) => rewardId !== nextEnabledRewardIds[index]);
    if (changed) this.plan.enabledRewardIds = nextEnabledRewardIds;
    return changed;
  }

  private syncEnabledRewardEventIds(): boolean {
    if (!this.plan) return false;
    const enabledRewardIds = new Set(this.plan.enabledRewardIds);
    const disabledEventIds = new Set(this.plan.disabledEventIds ?? []);
    const loadedRewardEventIds = new Set(this.data.rewards.rewards
      .map(reward => reward.event_id)
      .filter((eventId): eventId is string => Boolean(eventId)));
    (this.data.rewards.competitive_variants ?? [])
      .map(variant => variant.event_id)
      .filter(Boolean)
      .forEach(eventId => loadedRewardEventIds.add(eventId));
    const allBenefitEventIds = new Set((this.data.rewards.event_benefits ?? [])
      .map(benefit => benefit.event_id)
      .filter(Boolean));
    const selectorBenefitEventIds = new Set((this.data.rewards.event_benefits ?? [])
      .filter(benefit => benefit.kind === 'trainee_selector' || benefit.kind === 'support_selector')
      .map(benefit => benefit.event_id)
      .filter(Boolean));
    allBenefitEventIds.forEach(eventId => loadedRewardEventIds.add(eventId));
    const nextEventIds = new Set((this.plan.enabledRewardEventIds ?? [])
      .filter(eventId => !disabledEventIds.has(eventId)
        && (!loadedRewardEventIds.has(eventId) || selectorBenefitEventIds.has(eventId))));
    this.data.rewards.rewards
      .filter(reward =>
        Boolean(reward.event_id)
        && this.hasProjectableReward(reward)
        && enabledRewardIds.has(reward.id)
        && !disabledEventIds.has(reward.event_id!)
      )
      .forEach(reward => nextEventIds.add(reward.event_id!));
    (this.data.rewards.competitive_variants ?? [])
      .filter(variant =>
        isAutomaticCompetitiveVariant(variant)
        && enabledRewardIds.has(variant.id)
        && !disabledEventIds.has(variant.event_id))
      .forEach(variant => nextEventIds.add(variant.event_id));
    const next = [...nextEventIds].sort();
    const current = [...(this.plan.enabledRewardEventIds ?? [])].sort();
    if (current.length === next.length && current.every((eventId, index) => eventId === next[index])) {
      return false;
    }
    this.plan.enabledRewardEventIds = next;
    return true;
  }

  private matchesSelectedScenario(rule: PlannerIncomeRule): boolean {
    return !rule.scenario_group
      || this.plan.scenarioSelections[rule.scenario_group] === rule.scenario_option;
  }

  private async loadTargetGachas(): Promise<void> {
    const events = this.plan.targets
      .filter(target => !(this.plan.disabledEventIds ?? []).includes(target.eventId))
      .filter(target => target.bannerKind === 'character' || target.bannerKind === 'support')
      .map(target => {
        const event = this.allEvents.find(item => item.id === target.eventId);
        const selectedPickupIds = this.pickupGoals(target).map(goal => goal.pickupId);
        if (event) {
          return event.pickupCardIds?.length || selectedPickupIds.length === 0
            ? event
            : { ...event, pickupCardIds: selectedPickupIds };
        }
        return {
          id: target.eventId,
          title: target.title,
          type: `${target.bannerKind}_banner`,
          gachaId: target.gachaId,
          gachaIds: target.gachaIds,
          globalReleaseDate: target.bannerStart,
          pickupCardIds: selectedPickupIds,
        };
      });
    await this.resources.loadGachasForEvents(events);
  }

  private syncActivePlanResources(force = false): boolean {
    if (!this.plan || !this.plannerDataReady || this.destroyed) return false;
    if (this.applyResourceDefaults()) return true;

    const key = this.planResourceKey();
    if (!force && key === this.activePlanResourceKey) return false;
    this.activePlanResourceKey = key;
    const request = ++this.planResourceRequest;

    void this.loadTargetGachas().then(() => {
      if (this.destroyed || request !== this.planResourceRequest) return;
      this.recalculate();
      this.cdr.markForCheck();
    }).catch(() => {
      if (!this.destroyed && request === this.planResourceRequest) this.cdr.markForCheck();
    });
    return true;
  }

  private hasProjectableReward(reward: PlannerRewardEntry): boolean {
    // Structured bundles copy every source item onto a qualitative companion
    // row for inspection. Currency siblings carry the actual ledger values.
    if (/-items$/i.test(reward.id) || / item details$/i.test(reward.label)) return false;
    if (Number.isFinite(reward.amount) && Number(reward.amount) > 0) return true;
    return hasProjectableSourceItems(reward.source_items);
  }

  private planResourceKey(): string {
    const targets = this.plan.targets
      .filter(target => !(this.plan.disabledEventIds ?? []).includes(target.eventId))
      .filter(target => !this.isTargetBeforePlan(target))
      .filter(target => target.bannerKind === 'character' || target.bannerKind === 'support')
      .map(target => ({
        eventId: target.eventId,
        gachaId: target.gachaId,
        gachaIds: [...(target.gachaIds ?? [])].sort((left, right) => left - right),
      }))
      .sort((left, right) => left.eventId.localeCompare(right.eventId));
    return JSON.stringify({ planId: this.plan.id, targets });
  }

  private recalculate(): void {
    if (!this.plan) return;
    this.syncTargetSchedulesFromResources();
    const gachas = this.resources.loadedGachas;
    this.gachaByTarget.clear();
    this.pickupOptionsByTarget.clear();
    this.pickupGoalViewsByTarget.clear();
    this.selectedPickupIdsByTarget.clear();
    for (const target of this.activeTargets) {
      const ids = new Set([target.gachaId, ...(target.gachaIds ?? [])]);
      const gacha = gachas.find(item => item.event_id === target.eventId) ?? gachas.find(item => ids.has(item.gacha_id));
      if (gacha) this.gachaByTarget.set(target.id, gacha);
    }
    this.projection = this.calculations.project(this.plan, this.data, gachas, this.allEvents);
    this.projectionByTarget = new Map(this.projection.targets.map(item => [item.targetId, item]));
    this.oddsByTarget.clear();
    for (const target of this.activeTargets) {
      const gacha = this.gachaByTarget.get(target.id);
      const result = this.projectionByTarget.get(target.id);
      if (!result) continue;

      const options = this.buildPickupOptions(target, gacha);
      this.pickupOptionsByTarget.set(target.id, options);
      const selectedGoals = this.pickupGoals(target);
      selectedGoals.forEach(goal => {
        this.pickupGoalCopyMemory.set(this.pickupGoalMemoryKey(target.id, goal.pickupId), goal.desiredCopies);
      });
      const goals = selectedGoals.map(goal => {
        const option = options.find(item => item.pickup_id === goal.pickupId)
          ?? this.buildPickupOption(target, { pickup_id: goal.pickupId, rate: Number.NaN });
        const goalOdds = result.odds.goalOdds?.find(item => item.pickupId === goal.pickupId);
        return {
          pickupId: goal.pickupId,
          label: option.label,
          subLabel: option.subLabel,
          imagePath: option.imagePath,
          fallbackImagePath: option.fallbackImagePath,
          placeholderImagePath: option.placeholderImagePath,
          rate: option.rate,
          desiredCopies: goal.desiredCopies,
          copiesNeededFromPulls: goalOdds?.copiesNeededFromPulls,
          crystalCopiesApplied: goalOdds?.crystalCopiesApplied,
          crystalKind: goalOdds?.crystalKind,
          probability: goalOdds?.probability,
        } satisfies PlannerPickupGoalView;
      });
      this.pickupGoalViewsByTarget.set(target.id, goals);
      this.selectedPickupIdsByTarget.set(target.id, new Set(goals.map(goal => goal.pickupId)));

      const validSelectedOptions = goals
        .map(goal => options.find(option => option.pickup_id === goal.pickupId))
        .filter((option): option is PlannerPickupOptionView => !!option && Number.isFinite(option.rate));
      const ratesAvailable = goals.length > 0 && validSelectedOptions.length === goals.length;
      const sparkPulls = gacha?.spark_pulls ?? this.data.core.default_spark_pulls;
      const allRateUpRates = options
        .map(option => option.rate)
        .filter(rate => Number.isFinite(rate));
      const topRarityRate = gacha?.rarity_rates?.find(rate => rate.rarity === 3)?.rate;
      const combined = this.probabilities.calculate({
        pulls: result.fundedPulls,
        rateUpRates: validSelectedOptions.map(option => option.rate),
        allRateUpRates: allRateUpRates.length === options.length ? allRateUpRates : undefined,
        topRarityRate,
        sparkPulls,
        sparkExchangeable: validSelectedOptions.some(option => option.exchangeable !== false),
      });
      this.oddsByTarget.set(target.id, {
        goals,
        combined,
        allGoalsProbability: ratesAvailable && result.odds.jointProbabilityExact
          ? result.odds.jointProbability
          : undefined,
        allGoalsStatus: this.allGoalsStatus(result, goals, ratesAvailable),
        ratesAvailable,
        ratesInferred: gacha?.rates_confidence === 'inferred_standard',
        segments: this.outcomeSegments(combined),
      });
    }
  }

  private pickupGoals(target: PlannerTarget): PlannerPickupGoal[] {
    const maximum = target.bannerKind === 'support' ? 5 : 20;
    const normalize = (value: number) => Math.max(1, Math.min(maximum, Math.trunc(value) || 1));
    if (target.pickupGoals) {
      return target.pickupGoals.map(goal => ({
        ...goal,
        desiredCopies: normalize(goal.desiredCopies),
      }));
    }
    return target.pickupId === undefined
      ? []
      : [{ pickupId: target.pickupId, desiredCopies: normalize(target.desiredCopies) }];
  }

  private syncLegacyPickupGoal(target: PlannerTarget): void {
    const firstGoal = target.pickupGoals?.[0];
    target.pickupId = firstGoal?.pickupId;
    target.desiredCopies = firstGoal?.desiredCopies ?? 1;
  }

  private pickupGoalMemoryKey(targetId: string, pickupId: number): string {
    return `${targetId}:${pickupId}`;
  }

  private buildPickupOptions(target: PlannerTarget, gacha?: PlannerGachaEntry): PlannerPickupOptionView[] {
    const protectedPickups = gacha?.pickups ?? [];
    const event = this.allEvents.find(item => item.id === target.eventId);
    const publicFallbacks = protectedPickups.length === 0
      ? (event?.pickupCardIds ?? []).map(pickupId => ({ pickup_id: pickupId, rate: Number.NaN }))
      : [];
    const sources: PlannerPickupRate[] = [...protectedPickups, ...publicFallbacks];
    const selectedIds = this.pickupGoals(target).map(goal => goal.pickupId);
    for (const pickupId of selectedIds) {
      if (!sources.some(item => item.pickup_id === pickupId)) {
        sources.push({ pickup_id: pickupId, rate: Number.NaN });
      }
    }
    const seen = new Set<number>();
    return sources
      .filter(pickup => {
        if (!Number.isFinite(pickup.pickup_id) || seen.has(pickup.pickup_id)) return false;
        seen.add(pickup.pickup_id);
        return true;
      })
      .map(pickup => this.buildPickupOption(target, pickup));
  }

  private buildPickupOption(target: PlannerTarget, pickup: PlannerPickupRate): PlannerPickupOptionView {
    const event = this.allEvents.find(item => item.id === target.eventId);
    const pickupIndex = event?.pickupCardIds?.indexOf(pickup.pickup_id) ?? -1;
    const relatedName = pickupIndex >= 0
      ? target.bannerKind === 'support'
        ? event?.relatedSupportCards?.[pickupIndex]
        : event?.relatedCharacters?.[pickupIndex]
      : undefined;
    const supportTitle = target.bannerKind === 'support' && pickupIndex >= 0
      ? event?.relatedSupportCardNames?.[pickupIndex]
      : undefined;
    const resourceLabel = pickup.label?.trim();
    const displayNameHint = relatedName && !this.isGenericPickupLabel(relatedName)
      ? relatedName
      : resourceLabel && !this.isGenericPickupLabel(resourceLabel)
        ? resourceLabel
        : undefined;
    const avatar = this.avatars.getPickupAvatarByKind(
      target.bannerKind === 'support' ? 'support' : 'character',
      pickup.pickup_id,
      displayNameHint,
    );
    const resolvedName = avatar?.displayName
      ?? displayNameHint
      ?? `${target.bannerKind === 'support' ? 'Support' : 'Character'} ${pickup.pickup_id}`;
    const label = supportTitle
      && !this.isGenericPickupLabel(supportTitle)
      && supportTitle.toLowerCase() !== resolvedName.toLowerCase()
      ? `${resolvedName} — ${supportTitle}`
      : resolvedName;
    const placeholderImagePath = target.bannerKind === 'support'
      ? PLANNER_SUPPORT_PLACEHOLDER
      : PLANNER_CHARACTER_PLACEHOLDER;
    return {
      ...pickup,
      label,
      subLabel: avatar?.subLabel,
      imagePath: avatar?.imageUrl ?? placeholderImagePath,
      fallbackImagePath: avatar?.fallbackImageUrl,
      placeholderImagePath,
    };
  }

  onPickupImageError(event: Event, fallbackImagePath?: string, placeholderImagePath?: string): void {
    const image = event.target as HTMLImageElement | null;
    if (!image) return;

    if (fallbackImagePath && image.dataset['fallbackApplied'] !== 'true') {
      image.dataset['fallbackApplied'] = 'true';
      image.src = fallbackImagePath;
      return;
    }

    if (placeholderImagePath && image.dataset['placeholderApplied'] !== 'true') {
      image.dataset['placeholderApplied'] = 'true';
      image.src = placeholderImagePath;
      return;
    }

    image.hidden = true;
    image.parentElement?.classList.add('is-missing');
  }

  private isGenericPickupLabel(label: string): boolean {
    return /^(?:umamusume|character|support(?: card)?)\s+\d+$/i.test(label);
  }

  private allGoalsStatus(
    result: PlannerTargetProjection,
    goals: readonly PlannerPickupGoalView[],
    ratesAvailable: boolean,
  ): string {
    if (goals.length === 0) return 'Choose at least one pickup';
    if (!ratesAvailable) return 'Published rate unavailable';
    if (!result.odds.jointProbabilityExact) return 'Goal combination is too large to calculate exactly';
    const sparks = result.odds.sparkCopiesAvailable ?? 0;
    const crystals = (result.odds.goalOdds ?? []).reduce(
      (total, goal) => total + goal.crystalCopiesApplied,
      0,
    );
    const parts: string[] = [];
    if (sparks > 0) parts.push(`${sparks} shared exchange ${sparks === 1 ? 'copy' : 'copies'}`);
    if (crystals > 0) parts.push(`${crystals} Uncap ${crystals === 1 ? 'Crystal' : 'Crystals'}`);
    return parts.length ? `${parts.join(' + ')} included` : 'Exact joint chance';
  }

  private outcomeSegments(result: CaratPullProbabilityResult): PlannerOutcomeSegment[] {
    if (result.pulls === 0 || result.combinedRateUpRate <= 0) {
      return [{
        tone: 'neutral',
        semanticLabel: result.guaranteedHits > 0 ? 'Exchange copies only' : 'No chance configured',
        rangeLabel: this.copyRangeLabel(result.guaranteedHits, result.guaranteedHits),
        probability: 1,
        width: 100,
      }];
    }

    const lowerQuartile = result.buckets.find(bucket => bucket.cumulativeProbability >= 0.25)?.randomHits ?? 0;
    const upperQuartile = result.buckets.find(bucket => bucket.cumulativeProbability >= 0.75)?.randomHits
      ?? result.buckets.at(-1)?.randomHits
      ?? 0;
    const groups = new Map<PlannerOutcomeTone, {
      semanticLabel: string;
      probability: number;
      minHits: number;
      maxHits: number;
    }>();

    for (const bucket of result.buckets) {
      if (bucket.probability <= 0) continue;
      const tone: PlannerOutcomeTone = bucket.randomHits === 0
        ? 'miss'
        : bucket.randomHits < lowerQuartile
          ? 'below'
          : bucket.randomHits <= upperQuartile
            ? 'expected'
            : 'lucky';
      const semanticLabel = tone === 'miss'
        ? result.guaranteedHits > 0 ? 'Exchange only' : 'No rate-up'
        : tone === 'below'
          ? 'Below expected'
          : tone === 'expected'
            ? 'Expected range'
            : 'Above expected';
      const existing = groups.get(tone);
      if (existing) {
        existing.probability += bucket.probability;
        existing.minHits = Math.min(existing.minHits, bucket.hits);
        existing.maxHits = Math.max(existing.maxHits, bucket.hits);
      } else {
        groups.set(tone, {
          semanticLabel,
          probability: bucket.probability,
          minHits: bucket.hits,
          maxHits: bucket.hits,
        });
      }
    }

    const orderedTones: readonly PlannerOutcomeTone[] = ['miss', 'below', 'expected', 'lucky'];
    return orderedTones.flatMap(tone => {
      const group = groups.get(tone);
      if (!group || group.probability < 1e-12) return [];
      return [{
        tone,
        semanticLabel: group.semanticLabel,
        rangeLabel: tone === 'lucky'
          ? `${group.minHits} or more ${group.minHits === 1 ? 'copy' : 'copies'}`
          : this.copyRangeLabel(group.minHits, group.maxHits),
        probability: group.probability,
        width: Math.max(0, group.probability * 100),
      }];
    });
  }

  private copyRangeLabel(minHits: number, maxHits: number): string {
    if (minHits === maxHits) return `${minHits} ${minHits === 1 ? 'copy' : 'copies'}`;
    return `${minHits}\u2013${maxHits} copies`;
  }

  private nextSelectableEventIndex(start: number, direction: 1 | -1): number {
    if (!this.filteredEvents.length) return 0;
    let index = start;
    for (let attempt = 0; attempt < this.filteredEvents.length; attempt++) {
      index = (index + direction + this.filteredEvents.length) % this.filteredEvents.length;
      if (!this.isEventAdded(this.filteredEvents[index].id)) return index;
    }
    return Math.max(0, Math.min(start, this.filteredEvents.length - 1));
  }

  private filterEvents(): void {
    const query = this.eventSearch.trim();
    const referenceDate = [new Date().toISOString().slice(0, 10), this.plan?.projectionStartDate ?? '']
      .sort()
      .at(-1) ?? new Date().toISOString().slice(0, 10);
    this.filteredEvents = this.allEvents
      .filter(event => {
        const kind = this.bannerKind(event.type);
        return kind === 'character' || kind === 'support';
      })
      .filter(event => !query || this.eventMatchesPickerSearch(event, query))
      .sort((a, b) => {
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();
        if (query) {
          const aMatchRank = this.eventPickerMatchRank(a, query);
          const bMatchRank = this.eventPickerMatchRank(b, query);
          if (aMatchRank !== bMatchRank) return aMatchRank - bMatchRank;
        }

        const aDate = this.dateKey(a.globalReleaseDate ?? a.estimatedGlobalDate ?? a.jpReleaseDate);
        const bDate = this.dateKey(b.globalReleaseDate ?? b.estimatedGlobalDate ?? b.jpReleaseDate);
        const aUpcoming = aDate >= referenceDate;
        const bUpcoming = bDate >= referenceDate;
        if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
        const dateOrder = aUpcoming ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
        return dateOrder || aTitle.localeCompare(bTitle);
      });
    this.cdr?.markForCheck();
  }

  private eventMatchesPickerSearch(event: CaratPlannerTimelineEvent, query: string): boolean {
    const searchKey = this.normalizeSearchValue(query);
    if (!searchKey) return true;
    const values = this.eventPickerSearchValues(event).map(value => this.normalizeSearchValue(value));
    const tokens = query
      .split(/[^a-z0-9]+/i)
      .map(value => this.normalizeSearchValue(value))
      .filter(Boolean);
    return values.some(value => value.includes(searchKey))
      || tokens.every(token => values.some(value => value.includes(token)));
  }

  private eventPickerMatchRank(event: CaratPlannerTimelineEvent, query: string): number {
    const searchKey = this.normalizeSearchValue(query);
    const title = this.normalizeSearchValue(event.title);
    const participantValues = this.eventPickerSearchValues(event)
      .slice(1)
      .map(value => this.normalizeSearchValue(value));
    if (title === searchKey) return 0;
    if (participantValues.some(value => value === searchKey)) return 1;
    if (title.startsWith(searchKey)) return 2;
    if (participantValues.some(value => value.startsWith(searchKey))) return 3;
    return 4;
  }

  private eventPickerSearchValues(event: CaratPlannerTimelineEvent): string[] {
    const kind = this.bannerKind(event.type);
    return [
      event.title,
      ...(event.relatedCharacters ?? []),
      ...(event.relatedSupportCards ?? []),
      ...(event.relatedSupportCardNames ?? []),
      ...(event.tags ?? []),
      event.type ?? '',
      event.gachaTypeName ?? '',
      kind === 'character' ? 'uma character trainee scout banner' : '',
      kind === 'support' ? 'support card scout banner' : '',
      this.isRerunBanner(event) ? 'rerun re-run revival returning encore' : '',
    ].filter(value => value.length > 0);
  }

  private isRerunBanner(event: CaratPlannerTimelineEvent): boolean {
    return [event.title, event.type, event.gachaTypeName, ...(event.tags ?? [])]
      .some(value => /rerun|re-run|revival|returning|encore/i.test(value ?? ''));
  }

  private normalizeSearchValue(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }

  private tryAddRequestedEvent(): void {
    const eventId = this.pendingRequestedEventId;
    if (!eventId || !this.plan || eventId === this.handledRequestedEventId) return;
    const event = this.allEvents.find(item => item.id === eventId);
    if (!event) return;
    if (event.plannerRewardAvailable && !this.plannerDataReady) return;
    this.handledRequestedEventId = eventId;
    this.addEvent(event);
  }

  private bannerKind(type?: string): PlannerBannerKind {
    if (type?.includes('character')) return 'character';
    if (type?.includes('support')) return 'support';
    if (type?.includes('paid')) return 'paid';
    return 'other';
  }

  private rebuildEventIndexes(): void {
    this.eventById = new Map();
    this.eventByGachaId = new Map();
    this.eventByTypeAndMasterId = new Map();
    for (const event of this.allEvents) {
      if (!this.eventById.has(event.id)) this.eventById.set(event.id, event);
      const gachaIds = [event.gachaId, ...(event.gachaIds ?? [])]
        .filter((id): id is number => Number.isFinite(id));
      for (const gachaId of gachaIds) {
        if (!this.eventByGachaId.has(gachaId)) this.eventByGachaId.set(gachaId, event);
      }
      if (!event.type) continue;
      const masterIds = [
        timelineEventMasterId(event.id),
        Number(event.imagePath?.match(/\/(\d+)\.webp$/)?.[1]),
      ].filter((id): id is number => Number.isFinite(id));
      for (const masterId of masterIds) {
        const key = `${event.type}:${masterId}`;
        if (!this.eventByTypeAndMasterId.has(key)) this.eventByTypeAndMasterId.set(key, event);
      }
    }
  }

  private syncTargetSchedulesFromResources(): void {
    if (!this.plan) return;
    for (const target of this.plan.targets) {
      const schedule = this.resolveTargetSchedule(target);
      if (schedule.start) target.bannerStart = schedule.start;
      else delete target.bannerStart;
      if (schedule.end) target.bannerEnd = schedule.end;
      else delete target.bannerEnd;
    }
  }

  private resolveTargetSchedule(target: PlannerTarget): { start: string; end: string } {
    const event = this.allEvents.find(item => item.id === target.eventId);
    const ids = new Set([target.gachaId, ...(target.gachaIds ?? [])]);
    const gachas = this.resources.loadedGachas ?? [];
    const gacha = gachas.find(item => item.event_id === target.eventId)
      ?? gachas.find(item => ids.has(item.gacha_id));
    const resourceStart = this.optionalDateKey(
      event?.globalReleaseDate ?? event?.estimatedGlobalDate ?? event?.jpReleaseDate,
    ) ?? this.optionalDateKey(gacha?.start_date);
    const start = resourceStart ?? this.optionalDateKey(target.bannerStart) ?? '';
    const resourceEnd = this.optionalDateKey(event?.estimatedEndDate)
      ?? this.optionalDateKey(gacha?.end_date)
      ?? (resourceStart ? start : null);
    const end = resourceEnd ?? this.optionalDateKey(target.bannerEnd) ?? start;
    return { start, end };
  }

  private dateKey(value?: Date | string): string {
    if (!value) return new Date().toISOString().slice(0, 10);
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  }

  private optionalDateKey(value?: Date | string): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }

  private id(prefix: string): string {
    return `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  }

  private plannerRoot(): HTMLElement | null {
    return this.elementRef?.nativeElement ?? null;
  }
}
