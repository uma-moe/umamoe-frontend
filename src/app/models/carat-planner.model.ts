export type PlannerCurrency =
  | 'free_jewels'
  | 'paid_jewels'
  | 'uma_ticket'
  | 'support_ticket'
  | 'rainbow_crystal'
  | 'gold_crystal';

export type PlannerBannerKind = 'character' | 'support' | 'paid' | 'other';

export type PlannerIncomeCadence = 'once' | 'daily' | 'weekly' | 'monthly' | 'interval';

export type PlannerDataProvenance =
  | 'global_master'
  | 'jp_master'
  | 'jp_master_catalog'
  | 'jp_master_snapshot'
  | 'global_news'
  | 'global_social'
  | 'jp_news'
  | 'jp_fallback'
  | 'configured';

export type PlannerRateProvenance = PlannerDataProvenance | 'standard_inference';

export type PlannerRateConfidence = 'exact' | 'inferred_standard' | 'unavailable_identity_mismatch';

export interface PlannerBalances {
  freeJewels: number;
  paidJewels: number;
  umaTickets: number;
  supportTickets: number;
  rainbowCrystals: number;
  goldCrystals: number;
}

export interface PlannerCoreResource {
  version?: number | string;
  jewel_cost_per_pull?: number;
  default_spark_pulls?: number;
  gacha_shard_by_event?: Record<string, string>;
  gacha_shard_by_id?: Record<string, string>;
  gacha_shards?: string[];
}

export interface PlannerIncomeRule {
  id: string;
  label: string;
  description?: string;
  category?: string;
  currency: PlannerCurrency;
  amount: number;
  cadence: PlannerIncomeCadence;
  start_date: string;
  end_date?: string | null;
  every?: number;
  weekday?: number;
  day_of_month?: number;
  default_enabled?: boolean;
  scenario_group?: string;
  scenario_option?: string;
  provenance?: PlannerDataProvenance;
}

export interface PlannerIncomeResource {
  version?: number | string;
  rules: PlannerIncomeRule[];
}

export interface PlannerRewardEntry {
  id: string;
  label: string;
  event_id?: string;
  gacha_id?: number;
  currency: PlannerCurrency;
  amount?: number | null;
  available_at: string;
  category?: string;
  default_enabled?: boolean;
  full_completion?: boolean;
  provenance?: PlannerDataProvenance;
  assumption?: string;
  confidence?: string;
  evidence?: string;
  source_items?: PlannerSourceItem[];
  source_url?: string;
}

export interface PlannerSourceItem {
  item_category: number;
  item_id: number;
  amount: number;
  mission_count?: number;
  odds?: number;
  order_min?: number;
  order_max?: number;
  bonus?: number;
}

export interface PlannerRewardResource {
  version?: number | string;
  rewards: PlannerRewardEntry[];
  global_reward_comparison?: PlannerGlobalRewardComparison;
  event_benefits?: PlannerEventBenefit[];
  free_pull_campaigns?: PlannerFreePullCampaign[];
  competitive_variants?: PlannerCompetitiveRewardVariant[];
}

export interface PlannerGlobalRewardComparison {
  news_match_method: 'same_announce_id' | string;
  speculative_method?: 'mean_last_6_complete_calendar_months' | 'mean_last_12_complete_calendar_months' | 'median_last_6_complete_calendar_months' | string;
  archive_as_of?: string;
  observation_start: string;
  observation_end: string;
  observation_days: number;
  observed_months: number;
  matched_news_global_carats: number;
  matched_news_jp_carats: number;
  matched_news_extra_carats: number;
  en_only_news_carats: number;
  social_carats: number;
  social_reward_posts: number;
  social_news_duplicate_reward_items_removed: number;
  social_news_duplicate_carats_removed: number;
  speculative_observed_carats: number;
  speculative_mean_monthly_carats?: number;
  speculative_recent_median_monthly_carats?: number;
  speculative_recent_median_window_start?: string;
  speculative_recent_median_window_end?: string;
  speculative_monthly_carats: number;
  speculative_window_start?: string;
  speculative_window_end?: string;
  speculative_months?: PlannerGlobalRewardMonth[];
  matched_news?: PlannerGlobalNewsComparison[];
  en_only_news?: PlannerGlobalNewsComparison[];
}

export interface PlannerGlobalRewardMonth {
  month: string;
  matched_news_extra_carats: number;
  en_only_news_carats: number;
  social_carats: number;
  total_carats: number;
}

export interface PlannerGlobalNewsComparison {
  announce_id: number;
  title: string;
  global_carats: number;
  jp_carats: number;
  extra_carats: number;
  global_url: string;
  jp_url?: string;
}

export interface PlannerCompetitiveRewardVariant {
  id: string;
  competition: string;
  event_id: string;
  master_event_id: number;
  label: string;
  source_items: PlannerSourceItem[];
  available_at?: string;
  provenance?: PlannerDataProvenance;
  confidence?: string;
  default_enabled?: boolean;
}

export type PlannerEventBenefitKind = 'free_pulls' | 'trainee_selector' | 'support_selector' | string;

export type PlannerEventBenefitEffect = 'ledger' | 'target_free_pulls' | 'informational' | string;

export interface PlannerEventBenefit {
  id: string;
  event_id: string;
  gacha_id?: number;
  campaign_id?: string;
  kind: PlannerEventBenefitKind;
  label: string;
  item_category?: number;
  item_id?: number;
  amount?: number | null;
  available_at: string;
  planner_effect: PlannerEventBenefitEffect;
  provenance?: PlannerDataProvenance;
  confidence?: string;
  source_url?: string;
}

export interface PlannerFreePullCampaignAllocation {
  event_id: string;
  gacha_id?: number;
  pulls: number;
}

export const FREE_PULL_CAMPAIGN_DEFAULT_SELECTION = '__default_schedule__';
export const FREE_PULL_CAMPAIGN_EXCLUDED_SELECTION = '__excluded__';

/** A shared pool whose default daily schedule can span multiple banners. */
export interface PlannerFreePullCampaign {
  id: string;
  label: string;
  total_pulls: number;
  allocation_mode?: 'daily_with_one_time_stock' | string;
  pulls_per_day?: number;
  entitlement_days?: number;
  eligible_gacha_ids?: number[];
  /** Compatibility for early generated resources. */
  stockable?: boolean;
  default_allocations: PlannerFreePullCampaignAllocation[];
  provenance?: PlannerDataProvenance;
  confidence?: string;
  source_url?: string;
}

export interface PlannerPickupRate {
  pickup_id: number;
  label?: string;
  rate: number;
  exchangeable?: boolean;
}

export interface PlannerRarityRate {
  rarity: number;
  rate: number;
}

export interface PlannerGachaEntry {
  event_id?: string;
  gacha_id: number;
  gacha_type?: number;
  banner_kind: PlannerBannerKind;
  start_date: string;
  end_date: string;
  jewel_cost_per_pull?: number;
  spark_pulls?: number;
  free_pulls?: number;
  ticket_currency?: Extract<PlannerCurrency, 'uma_ticket' | 'support_ticket'>;
  pickups?: PlannerPickupRate[];
  /** Every explicitly featured pickup, including lower-rarity SR/R support cards. */
  featured_pickups?: PlannerPickupRate[];
  /** Exact per-draw rarity totals from the game master, expressed as fractions. */
  rarity_rates?: PlannerRarityRate[];
  provenance?: PlannerDataProvenance;
  confidence?: string;
  /** Frontend rate-policy provenance. Present when missing future rates were inferred. */
  rates_provenance?: PlannerRateProvenance;
  /** Distinguishes published master rates from a standard-banner estimate. */
  rates_confidence?: PlannerRateConfidence;
  free_pulls_provenance?: PlannerDataProvenance;
  free_pulls_source_url?: string;
  free_pulls_confidence?: string;
  free_pulls_evidence?: unknown;
}

export interface PlannerGachaResource {
  version?: number | string;
  shard?: string;
  gachas: PlannerGachaEntry[];
}

export interface CaratPlannerTimelineEvent {
  id: string;
  title: string;
  type?: string;
  globalReleaseDate?: Date | string;
  estimatedGlobalDate?: Date | string;
  estimatedEndDate?: Date | string;
  jpReleaseDate?: Date | string;
  imagePath?: string;
  isConfirmed?: boolean;
  plannerDataAvailable?: boolean;
  plannerRewardAvailable?: boolean;
  gachaId?: number;
  gachaIds?: number[];
  gachaType?: number;
  gachaTypeName?: string;
  pickupCardIds?: number[];
  tags?: string[];
  relatedCharacters?: string[];
  relatedSupportCards?: string[];
  relatedSupportCardNames?: string[];
}

export interface PlannerCustomIncome {
  id: string;
  label: string;
  currency: PlannerCurrency;
  amount: number;
  cadence: PlannerIncomeCadence;
  startDate: string;
  endDate?: string;
  every?: number;
}

/** A user-selected outcome for an event whose rewards depend on performance. */
export interface PlannerVariableRewardSelection {
  optionId: string;
  label: string;
  availableAt: string;
  amounts: Partial<Record<PlannerCurrency, number>>;
}

export type PlannerPullTiming = 'start' | 'end' | 'custom';

export interface PlannerPickupGoal {
  pickupId: number;
  desiredCopies: number;
}

export interface PlannerTarget {
  id: string;
  eventId: string;
  gachaId?: number;
  gachaIds?: number[];
  title: string;
  bannerKind: PlannerBannerKind;
  imagePath?: string;
  /** Runtime schedule resolved from planner/timeline resources. Never persisted. */
  bannerStart?: string;
  /** Runtime schedule resolved from planner/timeline resources. Never persisted. */
  bannerEnd?: string;
  pullTiming: PlannerPullTiming;
  customPullDate?: string;
  plannedPulls: number;
  /** @deprecated Use pickupGoals. Retained as the first-goal compatibility view. */
  desiredCopies: number;
  /** @deprecated Use pickupGoals. Retained as the first-goal compatibility view. */
  pickupId?: number;
  pickupGoals?: PlannerPickupGoal[];
  useTickets: boolean;
  ticketLimit?: number;
  allowPaidJewels: boolean;
  /** Rainbow LB crystals the player is willing to spend after pulling this support banner. */
  rainbowCrystalsPlanned?: number;
  /** Gold LB crystals the player is willing to spend after pulling this support banner. */
  goldCrystalsPlanned?: number;
}

export interface CaratPlan {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  projectionStartDate: string;
  balances: PlannerBalances;
  enabledIncomeRuleIds: string[];
  enabledRewardIds: string[];
  /** Fixed or deterministic-variant reward ids explicitly excluded by the user. */
  disabledRewardIds?: string[];
  enabledRewardEventIds: string[];
  disabledEventIds?: string[];
  scenarioSelections: Record<string, string>;
  /** Event id -> selected competitive result and the resulting projected resources. */
  variableRewardSelections?: Record<string, PlannerVariableRewardSelection>;
  /** Optional campaign -> destination event override. Missing means use the published default schedule. */
  freePullCampaignSelections?: Record<string, string>;
  resourceDefaultsApplied?: boolean;
  customIncome: PlannerCustomIncome[];
  targets: PlannerTarget[];
}

export interface CaratPlanCollection {
  version: 1;
  activePlanId: string;
  plans: CaratPlan[];
}

export interface PlannerLedgerEntry {
  id: string;
  label: string;
  date: string;
  currency: PlannerCurrency;
  amount: number;
  source: 'rule' | 'reward' | 'custom';
}

export interface PickupOddsResult {
  draws: number;
  requestedCopies: number;
  exchangeCopies: number;
  randomCopiesNeeded: number;
  pickupRate?: number;
  probability?: number;
  /** Per-pickup marginals. Every exchange copy is available to the evaluated goal. */
  goalOdds?: PickupGoalOddsResult[];
  /** Exact chance that all pickup goals can be completed together. */
  jointProbability?: number;
  /** False when the configured state space is too large for exact calculation. */
  jointProbabilityExact?: boolean;
  /** Exchange copies shared across all exchangeable goals in the joint result. */
  sparkCopiesAvailable?: number;
}

export interface PickupGoalOddsResult {
  pickupId: number;
  requestedCopies: number;
  /** Copies that must come from the banner after applicable LB crystals are assigned. */
  copiesNeededFromPulls: number;
  /** LB crystals assigned to copies two through five of this support card. */
  crystalCopiesApplied: number;
  crystalKind?: 'rainbow' | 'gold';
  exchangeable: boolean;
  exchangeCopiesAvailable: number;
  randomCopiesNeeded: number;
  pickupRate?: number;
  probability?: number;
}

export interface PlannerTargetProjection {
  targetId: string;
  pullDate: string;
  balanceBefore: PlannerBalances;
  balanceAfter: PlannerBalances;
  income: PlannerLedgerEntry[];
  /** Total Carats supplied by enabled event rewards from plan start through this target. */
  rewardCaratsGained: number;
  plannedPulls: number;
  fundedPulls: number;
  freePullsAvailable: number;
  freePullsUsed: number;
  ticketPullsUsed: number;
  freeJewelPulls: number;
  paidJewelPulls: number;
  rainbowCrystalsUsed: number;
  goldCrystalsUsed: number;
  unfilledPulls: number;
  jewelCost: number;
  shortfallJewels: number;
  odds: PickupOddsResult;
}

export interface CaratPlanProjection {
  planId: string;
  targets: PlannerTargetProjection[];
  finalBalances: PlannerBalances;
  unallocatedIncome: PlannerLedgerEntry[];
}

export interface CaratPlannerDataBundle {
  core: PlannerCoreResource;
  income: PlannerIncomeResource;
  rewards: PlannerRewardResource;
}
