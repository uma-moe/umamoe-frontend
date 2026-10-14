import type { ActivityScore, CareerBucketView, DailyActivity, EvidenceGroup, EvidenceReason, InsightGroup, InsightMetric, ProbeMetrics, SessionDisplayRow, TopSession } from './activity-types';

const compactFormatter = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const wholeFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export const compactNumber = (value = 0): string => compactFormatter.format(value);
export const wholeNumber = (value = 0): string => wholeFormatter.format(value);
export const decimalNumber = (value = 0): string => decimalFormatter.format(value);
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '0m';
  const days = Math.floor(seconds / 86400); const hours = Math.floor(seconds % 86400 / 3600); const minutes = Math.floor(seconds % 3600 / 60);
  if (days) return `${days}d ${hours}h`; if (hours) return `${hours}h ${minutes}m`; return `${Math.max(minutes, 1)}m`;
}
export const formatPercent = (value = 0): string => `${decimalNumber(value * 100)}%`;
export const parsedNumber = (value: number | { parsedValue: number }): number => typeof value === 'number' ? value : value.parsedValue;
export function scoreBand(score = 0): string { if (score >= 90) return 'Critical'; if (score >= 75) return 'High'; if (score >= 60) return 'Elevated'; if (score >= 40) return 'Watch'; return 'Low'; }
export function scoreTone(score = 0): string { return scoreBand(score).toLowerCase(); }
export function verdictLabel(verdict?: string): string { return ({ strong_automation_signal: 'Automation-like pattern', very_high_suspicion: 'Rate anomaly', schedule_suspicion: 'Schedule pattern', below_threshold: 'Below threshold' } as Record<string, string>)[verdict ?? ''] ?? 'Activity pattern'; }
export function averageCareersPerDay(score: ActivityScore): number { return Number.isFinite(score.avg_careers_per_day) ? score.avg_careers_per_day ?? 0 : score.days_observed ? score.total_careers / score.days_observed : 0; }
export function primarySessionSeconds(score: ActivityScore): number { return score.max_online_streak_seconds ?? score.max_session_seconds; }

function rateMetric(score: ActivityScore, key: keyof NonNullable<ActivityScore['career_rate_breakdown']>, fallback = 0): InsightMetric {
  const value = score.career_rate_breakdown?.[key];
  return { label: ({ last_20: 'Last 20 rate', last_3d: '3-day rate', last_7d: '7-day rate', last_30d: '30-day rate', all: 'All-time rate' })[key], value: decimalNumber(value?.careers_per_hour ?? fallback), hint: `careers/hour · ${wholeNumber(value?.sample_count ?? 0)} samples, ${formatDuration(value?.sample_seconds ?? 0)} observed` };
}
export function buildScoreInsights(score: ActivityScore): InsightGroup[] {
  return [
    { title: 'Activity totals', description: 'High-level account workload and output over the report window.', metrics: [
      { label: 'Observed vs active days', value: `${wholeNumber(score.days_active)} / ${wholeNumber(score.days_observed)}`, hint: 'Days with play versus all observed days' },
      { label: 'Total active time', value: formatDuration(score.total_active_seconds), hint: `${wholeNumber(score.total_careers)} careers, ${decimalNumber(averageCareersPerDay(score))}/day` },
      { label: 'Fans per active minute', value: compactNumber(score.fans_per_active_minute), hint: `Peak ${compactNumber(score.peak_fans_per_minute)} fans/min` },
      { label: 'Peak daily load', value: formatDuration(score.max_daily_active_seconds), hint: `${wholeNumber(score.max_daily_careers)} careers` }
    ] },
    { title: 'Career rate samples', description: 'Estimated careers per hour from snapshot intervals.', metrics: [rateMetric(score, 'last_20', score.careers_per_active_hour), rateMetric(score, 'last_3d'), rateMetric(score, 'last_7d'), rateMetric(score, 'last_30d')] },
    { title: 'Recent trend', description: 'Recent output compared with the returned baseline.', metrics: [
      { label: 'Recent 3-day gain', value: `+${wholeNumber(score.recent_fan_gain_3d)}`, hint: `+${compactNumber(score.recent_fans_per_day)}/day` },
      { label: '14-day baseline gain', value: `+${wholeNumber(score.baseline_fan_gain_14d)}`, hint: `+${compactNumber(score.baseline_fans_per_day)}/day` },
      { label: 'Spike ratio', value: formatPercent(score.fan_gain_spike_ratio), hint: `Behavior score ${decimalNumber(score.behavior_change_score)}` },
      { label: 'Avg last 20 career length', value: formatDuration(score.avg_career_length_last20_seconds), hint: `${wholeNumber(shortCareerWindowCount(score))} careers under 15m` }
    ] },
    { title: 'Recovery and resets', description: 'Long windows, reset-adjacent gaps, and probe inputs.', metrics: [
      { label: score.max_online_streak_seconds ? 'Max online streak' : 'Longest session', value: formatDuration(primarySessionSeconds(score)) },
      { label: 'Reset recovery windows', value: wholeNumber(score.reset_recovery_windows), hint: `${wholeNumber(score.reset_breaks)} reset breaks` },
      { label: 'Max reset recovery gap', value: formatDuration(score.max_reset_recovery_seconds), hint: `Score ${decimalNumber(score.reset_break_score)}` },
      { label: 'Probe score', value: decimalNumber(score.probe_score), hint: `${wholeNumber(score.days_over_16h)} days over 16h` }
    ] }
  ];
}

export function buildProbeInsights(metrics?: ProbeMetrics | null): InsightGroup[] {
  if (!metrics) return [];
  return [
    { title: 'Rhythm and login', description: 'Regularity derived from career timing and login cadence.', metrics: [
      { label: 'Career fan-gain samples', value: wholeNumber(metrics.career_fan_gain_samples), hint: `Mode ${formatPercent(metrics.career_fan_gain_mode_share)}, CV ${decimalNumber(metrics.career_fan_gain_cv)}` },
      { label: 'Career rhythm CV', value: decimalNumber(metrics.career_rhythm_cv), hint: `${wholeNumber(metrics.career_rhythm_samples)} samples` },
      { label: 'Login gap CV', value: decimalNumber(metrics.login_gap_cv), hint: `${wholeNumber(metrics.login_gap_samples)} samples` },
      { label: 'Post-login latency', value: formatDuration(metrics.post_login_latency_median_seconds), hint: `Score ${decimalNumber(metrics.post_login_latency_score)}` }
    ] },
    { title: 'Schedule shape', description: 'How activity spreads across the week and clock.', metrics: [
      { label: 'Weekday/weekend similarity', value: formatPercent(metrics.weekday_weekend_similarity), hint: `Entropy ${formatPercent(metrics.hourly_entropy)}` },
      { label: 'Night active ratio', value: formatPercent(metrics.night_active_ratio), hint: formatDuration(metrics.night_active_seconds) },
      { label: 'Zero-idle streak', value: wholeNumber(metrics.max_zero_idle_fan_gain_streak), hint: `Score ${decimalNumber(metrics.zero_idle_score)}` },
      { label: 'Schedule shape score', value: decimalNumber(metrics.schedule_shape_score), hint: `Career CV ${decimalNumber(metrics.career_length_cv)}` }
    ] },
    { title: 'Burst and context', description: 'Burst windows, resumes, and cross-account context.', metrics: [
      { label: 'Burst windows', value: wholeNumber(metrics.burst_career_windows), hint: `Max ${wholeNumber(metrics.max_careers_30m)} careers/30m` },
      { label: 'Service-gap resumes', value: wholeNumber(metrics.service_gap_resume_events), hint: `Score ${decimalNumber(metrics.service_gap_resume_score)}` },
      { label: 'Distinct circles seen', value: wholeNumber(metrics.distinct_circles_seen), hint: `Churn ${decimalNumber(metrics.circle_churn_score)}` },
      { label: 'Coactivity cluster size', value: wholeNumber(metrics.coactivity_cluster_size), hint: `Score ${decimalNumber(metrics.coactivity_cluster_score)}` }
    ] }
  ];
}

export function shortCareerWindowCount(score: ActivityScore): number { return (score.career_length_buckets ?? []).slice(0, 3).reduce((sum, value) => sum + value, 0); }
export function buildCareerBuckets(score: ActivityScore): CareerBucketView[] {
  const definitions = [
    ['0-5m', 'Extreme', 0, 1, true], ['5-10m', 'Very short', 1, 2, true], ['10-15m', 'Short high-fan window', 2, 3, true],
    ['15-20m', 'Just outside signal', 3, 4, false], ['20-30m', 'Fast normal range', 4, 6, false], ['30-45m', 'Typical run band', 6, 9, false],
    ['45-60m', 'Longer run band', 9, 12, false], ['60-90m', 'Long run band', 12, 18, false], ['90m+', 'Overflow', 18, score.career_length_buckets.length, false]
  ] as const;
  const rows = definitions.map(([label, description, start, end, isShortWindow]) => ({ label, description, count: score.career_length_buckets.slice(start, end).reduce((sum, value) => sum + value, 0), signalScore: (score.short_fan_gain_score_buckets ?? []).slice(start, end).reduce((sum, value) => sum + value, 0), countPercent: 0, signalPercent: 0, isShortWindow })).filter((row) => row.count || row.signalScore || row.isShortWindow);
  const maxCount = Math.max(1, ...rows.map((row) => row.count)); const maxSignal = Math.max(1, ...rows.map((row) => row.signalScore));
  return rows.map((row) => ({ ...row, countPercent: row.count ? Math.max(3, row.count / maxCount * 100) : 0, signalPercent: row.signalScore ? Math.max(3, row.signalScore / maxSignal * 100) : 0 }));
}

export function buildEvidenceGroups(reasons: EvidenceReason[]): EvidenceGroup[] {
  const groups = new Map<string, EvidenceGroup>();
  for (const reason of reasons) {
    const key = reason.key.includes('short') || reason.key === 'career_length_distribution' ? 'automation' : /rate|burst|spike/.test(reason.key) ? 'rate' : /heatmap|schedule|session|sleep|247/.test(reason.key) ? 'schedule' : 'context';
    const meta = ({ automation: ['Run shape', 'Short-career and unusual run-shape signals.'], rate: ['Rate', 'Output pace and burst-intensity signals.'], schedule: ['Schedule', 'Coverage, timing, and session-shape context.'], context: ['Context', 'Supporting evidence returned by the API.'] } as const)[key]!;
    const group = groups.get(key) ?? { key, label: meta[0], description: meta[1], reasons: [] }; group.reasons.push(reason); groups.set(key, group);
  }
  return [...groups.values()];
}

export function viewerFlags(score: ActivityScore): string[] { return [score.flag_no_sleep && 'No-sleep signal', score.flag_extreme_session && 'Extreme session signal', score.flag_inhuman_career_rate && 'Career-rate signal', score.flag_247 && '24/7 signal', score.flag_marathon && 'Marathon signal'].filter((value): value is string => Boolean(value)); }
export function buildDailyHighlights(points: DailyActivity[]): InsightMetric[] {
  if (!points.length) return []; const max = (key: keyof DailyActivity) => points.reduce((best, point) => Number(point[key]) > Number(best[key]) ? point : best, points[0]!); const date = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const fans = max('fan_gain'), careers = max('careers'), active = max('active_seconds'), sessions = max('sessions'), spread = max('distinct_hours');
  return [{ label: 'Peak fan day', value: `+${compactNumber(fans.fan_gain)}`, hint: date(fans.day) }, { label: 'Peak careers day', value: wholeNumber(careers.careers), hint: date(careers.day) }, { label: 'Peak active day', value: formatDuration(active.active_seconds), hint: date(active.day) }, { label: 'Most sessions in a day', value: wholeNumber(sessions.sessions), hint: date(sessions.day) }, { label: 'Widest hour spread', value: `${wholeNumber(spread.distinct_hours)}h`, hint: date(spread.day) }];
}

function sessionObserved(session: TopSession): number { return session.observed_seconds ?? session.duration_seconds ?? session.longest_session_sec ?? session.sessions?.reduce((sum, item) => sum + item.duration_seconds, 0) ?? 0; }
function sessionActive(session: TopSession): number { return session.playtime_seconds ?? session.active_seconds ?? session.sessions?.reduce((sum, item) => sum + (item.active_seconds ?? item.duration_seconds), 0) ?? 0; }
export function buildSessionRows(sessions: TopSession[]): SessionDisplayRow[] { return sessions.map((session) => { const observedSeconds = sessionObserved(session); const activeSeconds = sessionActive(session); const start = new Date(session.started_at); const end = new Date(session.ended_at); return { key: `${session.day ?? ''}-${session.started_at}-${session.ended_at}`, dayLabel: session.day ? new Date(`${session.day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), windowLabel: `${start.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`, observedSeconds, activeSeconds, idleSeconds: session.idle_seconds ?? Math.max(0, observedSeconds - activeSeconds), careers: session.careers, fanGain: session.fan_gain, sessionCount: session.session_count ?? session.sessions?.length ?? 1 }; }); }
