import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
import type { TimelineCalculation, TimelineCountLikelihood, TimelineEventTypeCalendarLikelihood, TimelineNamedLikelihood, TimelinePrediction } from './timeline-prediction-types';

export interface TimelinePredictionMetric {
  label: string;
  value: string;
}

export interface TimelinePredictionAlternative {
  label: string;
  probabilityLabel: string;
  reason: string;
  date: Date;
  fitScore: number;
}

export interface TimelinePredictionInsight {
  title: string;
  subtitle: string;
  scoreLabel?: string;
  scoreTone?: 'strong' | 'medium' | 'weak';
  fitScore?: number;
  fitLabel?: string;
  metrics: TimelinePredictionMetric[];
  alternatives: TimelinePredictionAlternative[];
}

interface TimelineCalendarModel {
  monthDayLikelihoods: TimelineCountLikelihood[];
  weekdayLikelihoods: TimelineNamedLikelihood[];
  gapLikelihoods: TimelineCountLikelihood[];
  typeModel?: TimelineEventTypeCalendarLikelihood;
}

interface FitSignal {
  label: string;
  value: number;
  weight: number;
  samples?: number;
}

interface OutcomeFit {
  score: number;
  calendarScore: number;
  scheduleScore: number;
  reason: string;
}


const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const weekdayIndex = Object.fromEntries(weekdayNames.map((name, index) => [name, index]));

export function buildTimelinePrediction(event: TimelineRecord, calculation?: TimelineCalculation | null): TimelinePredictionInsight | null {
  if (!event.prediction) return null;
  const prediction = event.prediction;
  const likelihood = prediction.calendarLikelihood;
  const date = event.date;
  const outcomeFit = scoreOutcome(date, event, calculation, date, true);
  const metrics: TimelinePredictionMetric[] = [
    {
      label: 'Source',
      value: kindLabel(prediction.kind)
    }
  ];

  if (typeof prediction.scheduleAdjustmentDays === 'number' && prediction.scheduleAdjustmentDays !== 0) {
    metrics.push({
      label: 'Schedule shift',
      value: `${prediction.scheduleAdjustmentDays > 0 ? '+' : ''}${prediction.scheduleAdjustmentDays}d`
    });
  }

  if (typeof prediction.accelerationRate === 'number') {
    metrics.push({
      label: 'Catch-up rate',
      value: formatPercent(prediction.accelerationRate)
    });
  }

  if (prediction.anchorGlobalDate) {
    metrics.push({
      label: 'Global anchor',
      value: formatShortDate(prediction.anchorGlobalDate)
    });
  }

  if (prediction.anchorJpDate) {
    metrics.push({
      label: 'JP anchor',
      value: formatShortDate(prediction.anchorJpDate)
    });
  }

  if (likelihood) {
    metrics.push(
      {
        label: 'Month shape',
        value: `${likelihood.monthCharacterBannerCount} char banners (${formatPercent(likelihood.monthCharacterBannerCountProbability)})`
      },
      {
        label: 'Weekday',
        value: `${titleCase(likelihood.weekday)} (${formatPercent(likelihood.weekdayProbability)})`
      },
      {
        label: 'Month day',
        value: `${likelihood.dayOfMonth} (${formatPercent(likelihood.dayOfMonthProbability)})`
      }
    );

    if (typeof likelihood.previousCharacterGapDays === 'number' && typeof likelihood.previousCharacterGapProbability === 'number') {
      metrics.push({
        label: 'Prev char gap',
        value: `${likelihood.previousCharacterGapDays}d (${formatPercent(likelihood.previousCharacterGapProbability)})`
      });
    }

    if (typeof likelihood.nextCharacterGapDays === 'number' && typeof likelihood.nextCharacterGapProbability === 'number') {
      metrics.push({
        label: 'Next char gap',
        value: `${likelihood.nextCharacterGapDays}d (${formatPercent(likelihood.nextCharacterGapProbability)})`
      });
    }
  }

  return {
    title: !event.predicted ? 'Confirmed date' : 'Prediction',
    subtitle: subtitleForPrediction(prediction),
    scoreLabel: outcomeFit ? `Date fit ${formatPercent(outcomeFit.score)}` : undefined,
    scoreTone: outcomeFit ? fitTone(outcomeFit.score) : undefined,
    fitScore: outcomeFit?.score,
    fitLabel: outcomeFit ? formatPercent(outcomeFit.score) : undefined,
    metrics,
    alternatives: !event.predicted ? [] : buildAlternatives(event, calculation)
  };
}

function buildAlternatives(event: TimelineRecord, calculation?: TimelineCalculation | null): TimelinePredictionAlternative[] {
  const currentDate = event.date;
  if (!currentDate || !calculation) {
    return [];
  }

  const calendarModel = getCalendarModel(event, calculation);

  const candidates = new Map<string, Date>();
  const currentKey = dateKey(currentDate);
  const year = currentDate.getUTCFullYear();
  const month = currentDate.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const addCandidate = (date: Date | null): void => {
    if (!date || date.getUTCMonth() !== month || date.getUTCFullYear() !== year) {
      return;
    }
    const key = dateKey(date);
    if (key !== currentKey) {
      candidates.set(key, date);
    }
  };

  topLikelihoods(calendarModel.monthDayLikelihoods, 8).forEach(likelihood => {
    if (likelihood.value < 1 || likelihood.value > daysInMonth) {
      return;
    }

    addCandidate(withUtcDay(currentDate, likelihood.value));
  });

  topLikelihoods(calendarModel.weekdayLikelihoods, 7).forEach(likelihood => {
    const weekday = weekdayIndex[likelihood.value.toLowerCase()];
    if (weekday === undefined) {
      return;
    }

    nearestWeekdaysInMonth(currentDate, weekday, 2).forEach(addCandidate);
  });

  [-3, -2, -1, 1, 2, 3].forEach(offset => {
    addCandidate(addUtcDays(currentDate, offset));
  });

  return Array.from(candidates.values())
    .map(date => {
      const fit = scoreOutcome(date, event, calculation, currentDate, false);
      if (!fit) {
        return null;
      }

      return {
        date,
        label: formatShortDate(date),
        probabilityLabel: formatPercent(fit.score),
        reason: fit.reason,
        fitScore: fit.score
      };
    })
    .filter((alternative): alternative is TimelinePredictionAlternative => alternative !== null)
    .sort((a, b) => {
      const fitDiff = b.fitScore - a.fitScore;
      if (fitDiff !== 0) {
        return fitDiff;
      }
      return Math.abs(a.date.getTime() - currentDate.getTime()) - Math.abs(b.date.getTime() - currentDate.getTime());
    })
    .slice(0, 4);
}

function scoreOutcome(
  date: Date | undefined,
  event: TimelineRecord,
  calculation: TimelineCalculation | null | undefined,
  currentDate: Date | undefined,
  isCurrent: boolean
): OutcomeFit | null {
  if (!date || !event.prediction) {
    return null;
  }

  const scheduleScore = scoreSchedule(date, event, calculation, currentDate, isCurrent);
  const calendarSignals = calendarSignalsForDate(date, event, calculation, currentDate, isCurrent);
  const calendarScore = weightedAverage(calendarSignals);
  const calendarComponent = calendarScore ?? event.prediction.calendarLikelihood?.score ?? 0.25;
  const scheduleWeight = event.prediction.kind === 'fallback' ? 0.55 : 0.68;
  const score = clamp01((scheduleScore * scheduleWeight) + (calendarComponent * (1 - scheduleWeight)));

  return {
    score,
    calendarScore: calendarComponent,
    scheduleScore,
    reason: fitReason(scheduleScore, calendarSignals)
  };
}

function calendarSignalsForDate(
  date: Date,
  event: TimelineRecord,
  calculation: TimelineCalculation | null | undefined,
  currentDate: Date | undefined,
  isCurrent: boolean
): FitSignal[] {
  const model = getCalendarModel(event, calculation);
  const likelihood = event.prediction?.calendarLikelihood;
  const day = date.getUTCDate();
  const weekdayName = weekdayNames[date.getUTCDay()]!;
  const signals: FitSignal[] = [];

  const monthDay = isCurrent && likelihood?.dayOfMonth === day
    ? { value: likelihood.dayOfMonthProbability, samples: undefined }
    : lookupCountLikelihood(model.monthDayLikelihoods, day);
  if (monthDay) {
    signals.push({
      label: `Day ${day}`,
      value: monthDay.value,
      weight: 0.28,
      samples: monthDay.samples
    });
  }

  const weekday = isCurrent && likelihood?.weekday.toLowerCase() === weekdayName
    ? { value: likelihood.weekdayProbability, samples: undefined }
    : lookupNamedLikelihood(model.weekdayLikelihoods, weekdayName);
  if (weekday) {
    signals.push({
      label: titleCase(weekdayName),
      value: weekday.value,
      weight: 0.26,
      samples: weekday.samples
    });
  }

  if (likelihood) {
    signals.push({
      label: 'Month shape',
      value: likelihood.monthCharacterBannerCountProbability,
      weight: 0.2
    });
  }

  signals.push(...estimatedGapSignals(date, currentDate, likelihood, model, isCurrent));

  return signals;
}

function estimatedGapSignals(
  date: Date,
  currentDate: Date | undefined,
  likelihood: TimelinePrediction['calendarLikelihood'] | undefined,
  model: TimelineCalendarModel,
  isCurrent: boolean
): FitSignal[] {
  if (!currentDate || !likelihood) {
    return [];
  }

  const dayShift = diffUtcDays(date, currentDate);
  const signals: FitSignal[] = [];

  addEstimatedGapSignal(
    signals,
    model,
    'Previous gap',
    likelihood.previousCharacterGapDays,
    likelihood.previousCharacterGapProbability,
    dayShift,
    isCurrent
  );
  addEstimatedGapSignal(
    signals,
    model,
    'Next gap',
    likelihood.nextCharacterGapDays,
    likelihood.nextCharacterGapProbability,
    -dayShift,
    isCurrent
  );

  return signals;
}

function addEstimatedGapSignal(
  signals: FitSignal[],
  model: TimelineCalendarModel,
  label: string,
  baseGapDays: number | undefined,
  currentProbability: number | undefined,
  dayShift: number,
  isCurrent: boolean
): void {
  if (typeof baseGapDays !== 'number') {
    return;
  }

  const estimatedGapDays = baseGapDays + dayShift;
  if (estimatedGapDays <= 0) {
    return;
  }

  const gapLikelihood = lookupCountLikelihood(model.gapLikelihoods, estimatedGapDays);
  const value = isCurrent && typeof currentProbability === 'number'
    ? currentProbability
    : gapLikelihood?.value;

  if (typeof value !== 'number') {
    return;
  }

  signals.push({
    label: `${label} ${estimatedGapDays}d`,
    value,
    weight: 0.13,
    samples: gapLikelihood?.samples
  });
}

function fitReason(scheduleScore: number, signals: FitSignal[]): string {
  const pieces = ['Schedule'];
  const signalPieces = [...signals]
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)
    .map(signal => signal.samples ? `${signal.label} (${signal.samples})` : signal.label);

  pieces.push(...signalPieces);

  if (scheduleScore < 0.35) {
    pieces[0] = 'Looser schedule';
  }

  return pieces.join(' + ');
}

function scoreSchedule(
  date: Date,
  event: TimelineRecord,
  calculation: TimelineCalculation | null | undefined,
  currentDate: Date | undefined,
  isCurrent: boolean
): number {
  if (!event.predicted || event.prediction?.kind === 'confirmed') {
    return 1;
  }

  const confidence = scheduleConfidence(event, calculation);
  if (isCurrent || !currentDate) {
    return confidence;
  }

  const distanceDays = Math.abs(diffUtcDays(date, currentDate));
  return clamp01(confidence * Math.exp(-distanceDays / 5.5));
}

function scheduleConfidence(event: TimelineRecord, calculation: TimelineCalculation | null | undefined): number {
  const prediction = event.prediction;
  if (!prediction) {
    return 0.5;
  }

  let confidence: number;
  switch (prediction.kind) {
    case 'confirmed':
      confidence = 1;
      break;
    case 'interpolated':
      confidence = 0.9;
      break;
    case 'extrapolated':
      confidence = 0.82;
      break;
    case 'fallback':
      confidence = 0.62;
      break;
  }

  if (prediction.anchorGlobalDate || prediction.anchorJpDate) {
    confidence += 0.04;
  }

  if (typeof calculation?.confirmedAnchorCount === 'number') {
    confidence += Math.min(0.06, calculation.confirmedAnchorCount / 1200);
  }

  return clamp01(confidence);
}

function getCalendarModel(event: TimelineRecord, calculation?: TimelineCalculation | null): TimelineCalendarModel {
  const typeModel = calculation?.eventTypeCalendarLikelihoods.find(model => model.type === event.eventType);

  return {
    monthDayLikelihoods: typeModel?.monthDayLikelihoods.length
      ? typeModel.monthDayLikelihoods
      : calculation?.characterBannerMonthDayLikelihoods || [],
    weekdayLikelihoods: typeModel?.weekdayLikelihoods.length
      ? typeModel.weekdayLikelihoods
      : calculation?.characterBannerWeekdayLikelihoods || [],
    gapLikelihoods: calculation?.characterBannerGapLikelihoods || [],
    typeModel
  };
}

function lookupCountLikelihood(likelihoods: TimelineCountLikelihood[], value: number): { value: number; samples?: number } | null {
  const match = likelihoods.find(likelihood => likelihood.value === value);
  return match ? { value: match.probability, samples: match.samples } : null;
}

function lookupNamedLikelihood(likelihoods: TimelineNamedLikelihood[], value: string): { value: number; samples?: number } | null {
  const match = likelihoods.find(likelihood => likelihood.value.toLowerCase() === value.toLowerCase());
  return match ? { value: match.probability, samples: match.samples } : null;
}

function weightedAverage(signals: FitSignal[]): number | null {
  const usable = signals.filter(signal => Number.isFinite(signal.value) && signal.value >= 0);
  const totalWeight = usable.reduce((sum, signal) => sum + signal.weight, 0);
  if (!usable.length || totalWeight <= 0) {
    return null;
  }

  return clamp01(usable.reduce((sum, signal) => sum + (signal.value * signal.weight), 0) / totalWeight);
}

function topLikelihoods<T extends TimelineCountLikelihood | TimelineNamedLikelihood>(likelihoods: T[], limit = 4): T[] {
  return [...likelihoods]
    .sort((a, b) => b.probability - a.probability || b.samples - a.samples)
    .slice(0, limit);
}

function nearestWeekdaysInMonth(baseDate: Date, weekday: number, limit: number): Date[] {
  const year = baseDate.getUTCFullYear();
  const month = baseDate.getUTCMonth();
  const day = baseDate.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const matches: { date: Date; distance: number }[] = [];

  for (let candidateDay = 1; candidateDay <= daysInMonth; candidateDay++) {
    const candidate = withUtcDay(baseDate, candidateDay);
    if (candidate.getUTCDay() !== weekday) {
      continue;
    }

    const distance = Math.abs(candidateDay - day);
    if (distance > 0) {
      matches.push({ date: candidate, distance });
    }
  }

  return matches
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(match => match.date);
}

function withUtcDay(baseDate: Date, day: number): Date {
  return new Date(Date.UTC(
    baseDate.getUTCFullYear(),
    baseDate.getUTCMonth(),
    day,
    baseDate.getUTCHours(),
    baseDate.getUTCMinutes(),
    baseDate.getUTCSeconds(),
    baseDate.getUTCMilliseconds()
  ));
}

function addUtcDays(baseDate: Date, days: number): Date {
  return new Date(Date.UTC(
    baseDate.getUTCFullYear(),
    baseDate.getUTCMonth(),
    baseDate.getUTCDate() + days,
    baseDate.getUTCHours(),
    baseDate.getUTCMinutes(),
    baseDate.getUTCSeconds(),
    baseDate.getUTCMilliseconds()
  ));
}

function subtitleForPrediction(prediction: TimelinePrediction): string {
  switch (prediction.kind) {
    case 'confirmed':
      return 'Date comes from the confirmed global schedule.';
    case 'interpolated':
      return 'Placed between confirmed JP/global anchors.';
    case 'extrapolated':
      return 'Projected from the current catch-up curve.';
    case 'fallback':
      return 'Projected with the fallback schedule model.';
  }
}

function kindLabel(kind: TimelinePrediction['kind']): string {
  switch (kind) {
    case 'confirmed':
      return 'Confirmed';
    case 'interpolated':
      return 'Interpolated';
    case 'extrapolated':
      return 'Extrapolated';
    case 'fallback':
      return 'Fallback';
  }
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function fitTone(score: number): 'strong' | 'medium' | 'weak' {
  if (score >= 0.65) {
    return 'strong';
  }
  if (score >= 0.42) {
    return 'medium';
  }
  return 'weak';
}

const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
function formatShortDate(date: Date): string { return shortDateFormatter.format(date); }

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function diffUtcDays(left: Date, right: Date): number {
  const leftDay = Date.UTC(left.getUTCFullYear(), left.getUTCMonth(), left.getUTCDate());
  const rightDay = Date.UTC(right.getUTCFullYear(), right.getUTCMonth(), right.getUTCDate());
  return Math.round((leftDay - rightDay) / 86400000);
}

function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
