export type EvidenceVerdict =
  | 'strong_automation_signal'
  | 'very_high_suspicion'
  | 'schedule_suspicion'
  | 'suspicious'
  | 'below_threshold';

export type EvidenceSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type EvidenceConfidence = 'strong' | 'medium' | 'contextual';

export type ShameSortBy =
  | 'score'
  | 'behavior_change'
  | 'short_fan_gain'
  | 'short_high_fan'
  | 'online_streak'
  | 'max_session'
  | 'careers_per_hour'
  | 'avg_career_length'
  | 'careers'
  | 'active_time'
  | 'fans_per_minute'
  | 'peak_fans_per_minute';

export interface EvidenceReason {
  key: string;
  label: string;
  severity: EvidenceSeverity | string;
  confidence: EvidenceConfidence | string;
  message: string;
  display_value: string;
  caveat: string | null;
}

export interface EvidenceSummary {
  verdict: EvidenceVerdict | string;
  summary: string;
  strongest_signal: string | null;
  reasons: EvidenceReason[];
  caveats: string[];
}

export interface HallEntry {
  viewer_id: number;
  trainer_name: string | null;
  circle_id: number | null;
  circle_name: string | null;
  circle_monthly_rank: number | null;
  first_seen: string;
  last_seen: string;
  days_observed: number;
  days_active: number;
  total_active_seconds: number;
  total_fan_gain: number;
  total_careers: number;
  careers_per_active_hour: number;
  avg_career_length_last20_seconds: number;
  career_length_buckets: number[];
  short_high_fan_careers: number;
  short_fan_gain_score: number;
  short_fan_gain_score_buckets: number[];
  short_career_avg_fan_gain: number;
  short_career_p50_fan_gain: number;
  short_career_p90_fan_gain: number;
  short_career_p95_fan_gain: number;
  short_career_max_fan_gain: number;
  recent_fan_gain_3d: number;
  baseline_fan_gain_14d: number;
  recent_fans_per_day: number;
  baseline_fans_per_day: number;
  fan_gain_spike_ratio: number;
  behavior_change_score: number;
  fans_per_active_minute: number;
  peak_fans_per_minute: number;
  max_daily_active_seconds: number;
  max_daily_careers: number;
  max_session_seconds: number;
  max_online_streak_seconds?: number;
  days_over_16h: number;
  days_over_20h: number;
  reset_recovery_windows?: number;
  reset_breaks?: number;
  max_reset_recovery_seconds?: number;
  reset_break_score?: number;
  probe_score?: number;
  probe_metrics?: ProbeMetrics | null;
  distinct_weekly_hour_buckets: number;
  flag_no_sleep: boolean;
  flag_extreme_session: boolean;
  flag_inhuman_career_rate: boolean;
  flag_247: boolean;
  flag_marathon: boolean;
  suspicion_score: number;
  is_suspicious: boolean;
  evidence: EvidenceSummary;
}

export interface HallResponse {
  entries: HallEntry[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  suspicion_score_threshold: number;
  last_refreshed_at: string | null;
}

export interface ShameHallParams {
  page?: number;
  limit?: number;
  sort_by?: ShameSortBy;
  min_score?: number;
  min_days?: number;
  query?: string;
}

export interface DailyPoint {
  day: string;
  active_seconds: number;
  careers: number;
  fan_gain: number;
  sessions: number;
  longest_session_sec: number;
  longest_online_sec?: number;
  distinct_hours: number;
}

export interface HeatmapCell {
  dow: number;
  hour: number;
  active_seconds: number;
  careers: number;
}

export interface ProbeMetrics {
  career_fan_gain_samples: number;
  career_fan_gain_mode_share: number;
  career_fan_gain_cv: number;
  career_fan_gain_score: number;
  career_rhythm_samples: number;
  career_rhythm_cv: number;
  career_length_cv: number;
  career_regularity_score: number;
  login_gap_samples: number;
  login_gap_cv: number;
  login_gap_mode_share: number;
  login_regularity_score: number;
  post_login_latency_samples: number;
  post_login_latency_median_seconds: number;
  post_login_latency_cv: number;
  post_login_latency_score: number;
  max_zero_idle_fan_gain_streak: number;
  max_zero_idle_active_seconds: number;
  zero_idle_score: number;
  weekday_weekend_similarity: number;
  hourly_entropy: number;
  night_active_ratio: number;
  night_active_seconds: number;
  schedule_shape_score: number;
  max_careers_30m: number;
  burst_career_windows: number;
  burst_career_score: number;
  service_gap_resume_events: number;
  service_gap_resume_score: number;
  distinct_circles_seen: number;
  circle_churn_score: number;
  coactivity_cluster_size: number;
  coactivity_cluster_score: number;
}

export interface SessionObservation {
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  active_seconds?: number;
  idle_seconds?: number;
  careers: number;
  fan_gain: number;
}

export interface TopSession {
  day?: string;
  started_at: string;
  ended_at: string;
  duration_seconds?: number;
  active_seconds?: number;
  idle_seconds?: number;
  playtime_seconds?: number;
  observed_seconds?: number;
  careers: number;
  fan_gain: number;
  session_count?: number;
  longest_session_sec?: number;
  distinct_hours?: number;
  sessions?: SessionObservation[];
}

export interface ParsedNumericValue {
  source: string;
  parsedValue: number;
}

export type ReportNumericValue = number | ParsedNumericValue;

export interface NeighborSnapshot {
  snapshot_id: number;
  circle_id: number | null;
  snapshot_time: string;
  fans: number;
  last_login: string | null;
  fan_delta: number;
  gap_seconds: number;
  login_changed: boolean;
  tight_gap: boolean;
  career_count: number;
  active_seconds: number;
}

export interface ShortCareerSnapshot {
  rank: number;
  total_count: number;
  snapshot_id: number;
  circle_id: number | null;
  snapshot_time: string;
  previous_snapshot_id: number | null;
  previous_snapshot_time: string | null;
  previous_snapshot_fans: number;
  current_fans: number;
  fan_gain: number;
  snapshot_gap_seconds: number;
  previous_career_snapshot_time: string | null;
  previous_career_gap_seconds: number | null;
  career_length_seconds: number;
  fans_per_minute: ReportNumericValue;
  short_training_score: ReportNumericValue;
  is_high_fan_short: boolean;
  prior_snapshots?: NeighborSnapshot[];
  next_snapshots?: NeighborSnapshot[];
}

export interface ViewerReport {
  score: HallEntry | null;
  daily: DailyPoint[];
  heatmap: HeatmapCell[];
  short_career_snapshots?: ShortCareerSnapshot[];
  short_career_snapshots_total?: number;
  top_online_streaks?: TopSession[];
  top_sessions?: TopSession[];
  last_refreshed_at?: string | null;
}

export interface ViewerReportParams {
  days?: number;
}