export interface StatisticsDataset {
  id: string;
  name?: string;
  date?: string;
  basePath: string;
  format?: string;
  format_version?: number;
  index: { format?: string; generated_at?: string; total_entries?: number; total_trainers?: number; total_characters?: number; distances?: string[]; character_ids?: string[]; format_version?: number };
}

export interface DistributionItem { id?: string; character_id?: string; name?: string; count?: number; total?: number; usage_count?: number; total_usage?: number; total_count?: number; percentage?: number; avg_level?: number; composition?: Record<string, number>; by_level?: Record<string, number>; }
export interface StatDistribution { count?: number; mean?: number; median?: number; min?: number; max?: number; std?: number; histogram?: Record<string, number>; percentiles?: Record<string, number>; }
export interface MetricGroup<T = DistributionItem> { overall?: Record<string, T>; by_scenario?: Record<string, Record<string, T>>; by_team_class?: Record<string, { overall?: Record<string, T>; by_scenario?: Record<string, Record<string, T>> }>; [key: string]: unknown; }
export interface StatisticsScope { count?: number; total?: number; common_support_cards?: Record<string, DistributionItem>; total_entries?: number; total_trained_umas?: number; uma_distribution?: Record<string, DistributionItem>; stat_averages?: Record<string, StatDistribution>; support_cards?: Record<string, DistributionItem>; support_card_combinations?: Record<string, DistributionItem>; support_card_type_distribution?: Record<string, DistributionItem | number>; skills?: Record<string, DistributionItem>; }
export interface DistanceStatistics { metadata?: Record<string, unknown>; by_team_class?: Record<string, StatisticsScope & { overall?: StatisticsScope; by_scenario?: Record<string, StatisticsScope> }>; }
export interface GlobalStatistics { metadata?: { generated_at?: string; total_entries?: number; total_trainers?: number; total_unique_umas?: number; total_characters?: number; total_trained_umas?: number }; scenario_distribution?: Record<string, DistributionItem | number | undefined>; team_class_distribution?: Record<string, DistributionItem | number | Record<string, DistributionItem> | undefined>; uma_distribution?: MetricGroup; stat_averages?: MetricGroup<StatDistribution>; support_cards?: MetricGroup; support_card_combinations?: MetricGroup; support_card_type_distribution?: MetricGroup<DistributionItem | number>; skills?: MetricGroup; by_distance?: Record<string, DistanceStatistics>; }
export interface CharacterStatistics { metadata?: { generated_at?: string; total_entries?: number; total_trained_umas?: number }; global?: { distance_distribution?: Record<string, DistributionItem | number | undefined>; running_style_distribution?: Record<string, DistributionItem | number | undefined>; scenario_distribution?: Record<string, DistributionItem | number | undefined>; team_class_distribution?: Record<string, DistributionItem | number | undefined> }; overall?: StatisticsScope; by_scenario?: Record<string, StatisticsScope>; by_distance?: Record<string, DistanceStatistics>; }
