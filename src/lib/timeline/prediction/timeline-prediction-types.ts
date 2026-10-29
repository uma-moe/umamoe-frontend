interface BannerTimelineResourceCalculation {
  jp_launch_date?: string | null;
  global_launch_date?: string | null;
  fallback_acceleration_rate?: number;
  observed_acceleration_rate?: number;
  confirmed_anchor_count?: number;
  character_banner_month_count_likelihoods?: unknown;
  character_banner_gap_likelihoods?: unknown;
  character_banner_weekday_likelihoods?: unknown;
  character_banner_month_day_likelihoods?: unknown;
  event_type_calendar_likelihoods?: unknown;
  latest_closed_global_month?: string | null;
  unconfirmed_schedule_floor?: string | null;
  latest_confirmed_jp_date?: string | null;
  latest_confirmed_global_date?: string | null;
}

interface BannerTimelineResourcePrediction {
  kind?: string;
  acceleration_rate?: number;
  schedule_adjustment_days?: number;
  calendar_likelihood?: BannerTimelineResourceCalendarLikelihood;
  anchor_jp_date?: string | null;
  anchor_global_date?: string | null;
}

interface BannerTimelineResourceCalendarLikelihood {
  month_character_banner_count?: number;
  month_character_banner_count_probability?: number;
  weekday?: string;
  weekday_probability?: number;
  day_of_month?: number;
  day_of_month_probability?: number;
  previous_character_gap_days?: number;
  previous_character_gap_probability?: number;
  next_character_gap_days?: number;
  next_character_gap_probability?: number;
  score?: number;
}

export function parseResourceDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function toTimelineCalculation(
  calculation?: BannerTimelineResourceCalculation
): TimelineCalculation | null {
  if (!calculation) {
    return null;
  }

  return {
    jpLaunchDate: parseResourceDate(calculation.jp_launch_date),
    globalLaunchDate: parseResourceDate(calculation.global_launch_date),
    fallbackAccelerationRate:
      typeof calculation.fallback_acceleration_rate === 'number'
        ? calculation.fallback_acceleration_rate
        : undefined,
    observedAccelerationRate:
      typeof calculation.observed_acceleration_rate === 'number'
        ? calculation.observed_acceleration_rate
        : undefined,
    confirmedAnchorCount:
      typeof calculation.confirmed_anchor_count === 'number'
        ? calculation.confirmed_anchor_count
        : undefined,
    characterBannerMonthCountLikelihoods: toCountLikelihoodArray(
      calculation.character_banner_month_count_likelihoods
    ),
    characterBannerGapLikelihoods: toCountLikelihoodArray(
      calculation.character_banner_gap_likelihoods
    ),
    characterBannerWeekdayLikelihoods: toNamedLikelihoodArray(
      calculation.character_banner_weekday_likelihoods
    ),
    characterBannerMonthDayLikelihoods: toCountLikelihoodArray(
      calculation.character_banner_month_day_likelihoods
    ),
    eventTypeCalendarLikelihoods: toEventTypeCalendarLikelihoods(
      calculation.event_type_calendar_likelihoods
    ),
    latestClosedGlobalMonth: calculation.latest_closed_global_month || undefined,
    unconfirmedScheduleFloor: parseResourceDate(calculation.unconfirmed_schedule_floor),
    latestConfirmedJpDate: parseResourceDate(calculation.latest_confirmed_jp_date),
    latestConfirmedGlobalDate: parseResourceDate(calculation.latest_confirmed_global_date)
  };
}

export function toTimelinePrediction(
  prediction?: BannerTimelineResourcePrediction
): TimelinePrediction | undefined {
  if (!prediction || !isPredictionKind(prediction.kind)) {
    return undefined;
  }

  return {
    kind: prediction.kind,
    accelerationRate:
      typeof prediction.acceleration_rate === 'number' ? prediction.acceleration_rate : undefined,
    scheduleAdjustmentDays:
      typeof prediction.schedule_adjustment_days === 'number'
        ? prediction.schedule_adjustment_days
        : undefined,
    calendarLikelihood: toCalendarLikelihood(prediction.calendar_likelihood),
    anchorJpDate: parseResourceDate(prediction.anchor_jp_date),
    anchorGlobalDate: parseResourceDate(prediction.anchor_global_date)
  };
}

function isPredictionKind(value: string | undefined): value is TimelinePrediction['kind'] {
  return (
    value === 'confirmed' ||
    value === 'interpolated' ||
    value === 'extrapolated' ||
    value === 'fallback'
  );
}

function toCalendarLikelihood(
  value?: BannerTimelineResourceCalendarLikelihood
): TimelineCalendarLikelihood | undefined {
  if (
    !value ||
    typeof value.month_character_banner_count !== 'number' ||
    typeof value.month_character_banner_count_probability !== 'number' ||
    typeof value.weekday !== 'string' ||
    typeof value.weekday_probability !== 'number' ||
    typeof value.day_of_month !== 'number' ||
    typeof value.day_of_month_probability !== 'number' ||
    typeof value.score !== 'number'
  ) {
    return undefined;
  }

  return {
    monthCharacterBannerCount: value.month_character_banner_count,
    monthCharacterBannerCountProbability: value.month_character_banner_count_probability,
    weekday: value.weekday,
    weekdayProbability: value.weekday_probability,
    dayOfMonth: value.day_of_month,
    dayOfMonthProbability: value.day_of_month_probability,
    previousCharacterGapDays:
      typeof value.previous_character_gap_days === 'number'
        ? value.previous_character_gap_days
        : undefined,
    previousCharacterGapProbability:
      typeof value.previous_character_gap_probability === 'number'
        ? value.previous_character_gap_probability
        : undefined,
    nextCharacterGapDays:
      typeof value.next_character_gap_days === 'number' ? value.next_character_gap_days : undefined,
    nextCharacterGapProbability:
      typeof value.next_character_gap_probability === 'number'
        ? value.next_character_gap_probability
        : undefined,
    score: value.score
  };
}

function toEventTypeCalendarLikelihoods(value: unknown): TimelineEventTypeCalendarLikelihood[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as Record<string, unknown>;
      const type = typeof record['type'] === 'string' ? record['type'] : undefined;
      const samples = record['samples'];
      if (!type || typeof samples !== 'number') {
        return null;
      }

      return {
        type,
        samples,
        weekdayLikelihoods: toNamedLikelihoodArray(record['weekday_likelihoods']),
        monthDayLikelihoods: toCountLikelihoodArray(record['month_day_likelihoods'])
      };
    })
    .filter((item): item is TimelineEventTypeCalendarLikelihood => item !== null);
}

function toCountLikelihoodArray(value: unknown): TimelineCountLikelihood[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as Record<string, unknown>;
      return typeof record['value'] === 'number' &&
        typeof record['samples'] === 'number' &&
        typeof record['probability'] === 'number'
        ? {
            value: record['value'],
            samples: record['samples'],
            probability: record['probability']
          }
        : null;
    })
    .filter((item): item is TimelineCountLikelihood => item !== null);
}

function toNamedLikelihoodArray(value: unknown): TimelineNamedLikelihood[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as Record<string, unknown>;
      return typeof record['value'] === 'string' &&
        typeof record['samples'] === 'number' &&
        typeof record['probability'] === 'number'
        ? {
            value: record['value'],
            samples: record['samples'],
            probability: record['probability']
          }
        : null;
    })
    .filter((item): item is TimelineNamedLikelihood => item !== null);
}

export interface TimelinePrediction {
  kind: 'confirmed' | 'interpolated' | 'extrapolated' | 'fallback';
  accelerationRate?: number;
  scheduleAdjustmentDays?: number;
  calendarLikelihood?: TimelineCalendarLikelihood;
  anchorJpDate?: Date;
  anchorGlobalDate?: Date;
}

export interface TimelineCalendarLikelihood {
  monthCharacterBannerCount: number;
  monthCharacterBannerCountProbability: number;
  weekday: string;
  weekdayProbability: number;
  dayOfMonth: number;
  dayOfMonthProbability: number;
  previousCharacterGapDays?: number;
  previousCharacterGapProbability?: number;
  nextCharacterGapDays?: number;
  nextCharacterGapProbability?: number;
  score: number;
}

export interface TimelineCountLikelihood {
  value: number;
  samples: number;
  probability: number;
}

export interface TimelineNamedLikelihood {
  value: string;
  samples: number;
  probability: number;
}

export interface TimelineEventTypeCalendarLikelihood {
  type: string;
  samples: number;
  weekdayLikelihoods: TimelineNamedLikelihood[];
  monthDayLikelihoods: TimelineCountLikelihood[];
}

export interface TimelineCalculation {
  jpLaunchDate?: Date;
  globalLaunchDate?: Date;
  fallbackAccelerationRate?: number;
  observedAccelerationRate?: number;
  confirmedAnchorCount?: number;
  characterBannerMonthCountLikelihoods: TimelineCountLikelihood[];
  characterBannerGapLikelihoods: TimelineCountLikelihood[];
  characterBannerWeekdayLikelihoods: TimelineNamedLikelihood[];
  characterBannerMonthDayLikelihoods: TimelineCountLikelihood[];
  eventTypeCalendarLikelihoods: TimelineEventTypeCalendarLikelihood[];
  latestClosedGlobalMonth?: string;
  unconfirmedScheduleFloor?: Date;
  latestConfirmedJpDate?: Date;
  latestConfirmedGlobalDate?: Date;
}
