import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { combineLatest, Subject, takeUntil } from 'rxjs';
import { ShameService } from '../../services/shame.service';
import { AppVersionService } from '../../services/app-version.service';
import { CompactNumberPipe } from '../../pipes/compact-number.pipe';
import { LocaleNumberPipe } from '../../pipes/locale-number.pipe';
import { AdInContentComponent } from '../../components/ads/ad-in-content.component';
import {
  DailyPoint,
  EvidenceReason,
  CareerRateWindow,
  HallEntry,
  HeatmapCell,
  NeighborSnapshot,
  ProbeMetrics,
  ReportNumericValue,
  ShameSortBy,
  ShortCareerSnapshot,
  TopSession,
  ViewerReport
} from '../../models/shame.model';

Chart.register(...registerables);

interface CareerBucketView {
  label: string;
  description: string;
  count: number;
  signalScore: number;
  countPercent: number;
  signalPercent: number;
  isShortWindow: boolean;
}

interface HourlyActivityView {
  hour: number;
  activeSeconds: number;
  careers: number;
  logPercent: number;
  level: number;
}

interface DailyActivityRow {
  point: DailyPoint;
  fanPercent: number;
  activePercent: number;
  fansPerActiveMinute: number;
  isHighlighted: boolean;
  signalLevel: 'idle' | 'low' | 'medium' | 'high' | 'critical';
  signalLabel: string;
}

interface ChartAxisTick {
  value: number;
  percent: number;
}

interface MonthSegment {
  label: string;
  widthPercent: number;
  kind: 'current' | 'previous' | 'older';
}

interface TimeAxisConfig {
  max: number;
  step: number;
  ticks: ChartAxisTick[];
}

interface InsightMetric {
  label: string;
  value: string;
  hint?: string;
}

interface InsightGroup {
  title: string;
  description: string;
  metrics: InsightMetric[];
}

interface SessionDisplayRow {
  key: string;
  dayLabel: string;
  windowLabel: string;
  observedSeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  careers: number;
  fanGain: number;
  sessionCount: number;
}

interface EvidenceGroupView {
  key: string;
  label: string;
  description: string;
  reasons: EvidenceReason[];
}

@Component({
  selector: 'app-shame',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule,
    CompactNumberPipe,
    LocaleNumberPipe,
    AdInContentComponent
  ],
  templateUrl: './shame.component.html',
  styleUrl: './shame.component.scss'
})
export class ShameComponent implements OnInit, AfterViewInit, OnDestroy {
  protected readonly Math = Math;
  readonly shortCareerMaxMinutes = 15;
  readonly shortCareerSnapshotDisplayLimit = 25;
  readonly highFanRateThreshold = 90000;
  readonly shortFanScoreCap = 35;
  readonly shortFanGainBase = 900000;

  entries: HallEntry[] = [];
  totalEntries = 0;
  page = 0;
  pageSize = 50;
  searchTerm = '';
  sortBy: ShameSortBy = 'score';
  minScore: number | null = 0;
  minScoreSelectValue = '0';
  readonly defaultMinDays = 1;
  minDays = this.defaultMinDays;
  loading = false;
  detailLoading = false;
  errorMessage = '';
  selectedViewerId: number | null = null;
  viewerReport: ViewerReport | null = null;
  suspicionScoreThreshold: number | null = null;
  lastRefreshedAt: string | null = null;

  readonly sortOptions: { value: ShameSortBy, label: string }[] = [
    { value: 'score', label: 'Suspicion score' },
    { value: 'short_fan_gain', label: 'Short high-fan score' },
    { value: 'short_high_fan', label: 'Short high-fan careers' },
    { value: 'online_streak', label: 'Online streak' },
    { value: 'active_time', label: 'Active time' },
    { value: 'behavior_change', label: 'Behavior spike' },
    { value: 'careers_per_hour', label: 'Careers/hour' },
    { value: 'fans_per_minute', label: 'Fans/minute' },
    { value: 'peak_fans_per_minute', label: 'Peak fans/minute' },
    { value: 'avg_career_length', label: 'Shortest avg career' },
    { value: 'careers', label: 'Total careers' },
    { value: 'max_session', label: 'Longest session' }
  ];

  readonly scoreFilterOptions: { value: string, label: string }[] = [
    { value: '0', label: 'All scores' },
    { value: '40', label: '40+' },
    { value: '60', label: '60+' },
    { value: '80', label: '80+' }
  ];

  readonly minDaysOptions = [1, 3, 7, 14, 30];
  readonly heatmapDays = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' }
  ];
  readonly heatmapHours = Array.from({ length: 24 }, (_, index) => index);
  readonly heatmapLegendLevels = [0, 1, 2, 3, 4];

  dailyChartPoints: DailyPoint[] = [];
  dailyActivityRows: DailyActivityRow[] = [];
  dailyFanAxisTicks: ChartAxisTick[] = [];
  dailyActiveAxisTicks: ChartAxisTick[] = [];
  dailyMonthSegments: MonthSegment[] = [];
  hourlyActivityRows: HourlyActivityView[] = [];
  careerBucketRows: CareerBucketView[] = [];
  scoreInsightGroups: InsightGroup[] = [];
  probeMetricGroups: InsightGroup[] = [];
  dailyHighlightMetrics: InsightMetric[] = [];
  topSessionRows: SessionDisplayRow[] = [];
  viewerFlagLabels: string[] = [];
  evidenceGroups: EvidenceGroupView[] = [];
  expandedEvidenceGroupKeys = new Set<string>();
  expandedShortCareerSnapshotIds = new Set<number>();
  maxDailyFanGain = 0;
  maxDailyActiveSeconds = 0;
  roundedDailyFanGainMax = 0;
  roundedDailyActiveSecondsMax = 0;
  maxHourlyActiveSeconds = 0;
  heatmapMaxActiveSeconds = 0;
  heatmapTouchedBuckets = 0;
  reportDays = 0;

  private destroy$ = new Subject<void>();
  private searchTimer: number | null = null;
  private heatmapLookup = new Map<string, HeatmapCell>();
  private isFirstListLoad = true;
  private dailyChart: Chart | null = null;
  private dailyActiveStepSeconds = 3600;
  private readonly compactFormatter = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  private readonly integerFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
  private readonly decimalFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

  @ViewChild('dailyChartCanvas') dailyChartCanvas?: ElementRef<HTMLCanvasElement>;

  constructor(
    private shameService: ShameService,
    private route: ActivatedRoute,
    private router: Router,
    private ngZone: NgZone,
    private appVersionService: AppVersionService
  ) { }

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.route.queryParams]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(([paramMap, params]) => {
      const viewerIdParam = paramMap.get('viewerId');
      const viewerId = viewerIdParam ? Number(viewerIdParam) : null;
      this.selectedViewerId = Number.isFinite(viewerId) ? viewerId : null;
      this.page = params['page'] ? +params['page'] : 0;
      this.pageSize = params['pageSize'] ? +params['pageSize'] : 50;
      this.searchTerm = params['query'] || '';
      this.sortBy = this.isShameSortBy(params['sortBy']) ? params['sortBy'] : 'score';
      const parsedMinScore = this.parseOptionalNumber(params['minScore']);
      this.minScore = parsedMinScore === null ? 0 : parsedMinScore;
      this.minScoreSelectValue = String(this.minScore);
      this.minDays = params['minDays'] ? +params['minDays'] : this.defaultMinDays;

      if (this.selectedViewerId !== null) {
        this.loadViewerReport(this.selectedViewerId);
      } else {
        this.loadHall();
      }
    });
  }

  ngAfterViewInit(): void {
    this.renderDailyChart();
  }

  ngOnDestroy(): void {
    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
    if (this.selectedViewerId === null) {
      this.shameService.listScrollPosition = window.scrollY;
    }
    this.destroyDailyChart();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get hasResults(): boolean {
    return this.entries.length > 0;
  }

  loadHall(): void {
    this.loading = true;
    this.errorMessage = '';
    this.viewerReport = null;
    this.resetDetailDerivedState();
    this.destroyDailyChart();
    this.shameService.getHall({
      page: this.page,
      limit: this.pageSize,
      sort_by: this.sortBy,
      min_score: this.minScore ?? undefined,
      min_days: this.minDays !== this.defaultMinDays ? this.minDays : undefined,
      query: this.searchTerm || undefined
    }).subscribe({
      next: response => {
        this.entries = response.entries;
        this.totalEntries = response.total;
        this.suspicionScoreThreshold = response.suspicion_score_threshold;
        this.lastRefreshedAt = response.last_refreshed_at;
        this.loading = false;
        if (this.isFirstListLoad && this.shameService.listScrollPosition > 0) {
          setTimeout(() => window.scrollTo(0, this.shameService.listScrollPosition), 0);
        }
        this.isFirstListLoad = false;
      },
      error: () => {
        this.entries = [];
        this.totalEntries = 0;
        this.loading = false;
        this.errorMessage = this.withBuild('Could not load suspicion scores.');
      }
    });
  }

  loadViewerReport(viewerId: number): void {
    this.detailLoading = true;
    this.errorMessage = '';
    this.viewerReport = null;
    this.resetDetailDerivedState();
    this.shameService.getViewerReport(viewerId, { days: 60 }).subscribe({
      next: response => {
        this.viewerReport = response;
        this.lastRefreshedAt = response.last_refreshed_at ?? null;
        this.prepareDetailCharts(response);
        this.detailLoading = false;
        setTimeout(() => this.renderDailyChart());
      },
      error: () => {
        this.detailLoading = false;
        this.errorMessage = this.withBuild('Could not load this viewer report.');
        this.resetDetailDerivedState();
        this.destroyDailyChart();
      }
    });
  }

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
    this.ngZone.runOutsideAngular(() => {
      this.searchTimer = window.setTimeout(() => {
        this.ngZone.run(() => {
          this.updateQueryParams({ query: value?.trim() || null, page: 0 });
        });
      }, 300);
    });
  }

  onSortChange(): void {
    this.updateQueryParams({ sortBy: this.sortBy, page: 0 });
  }

  onMinScoreChange(): void {
    this.minScore = Number(this.minScoreSelectValue);
    this.updateQueryParams({ minScore: this.minScore === 0 ? null : this.minScore, page: 0 });
  }

  onMinDaysChange(): void {
    this.updateQueryParams({ minDays: this.minDays, page: 0 });
  }

  onPageChange(event: PageEvent): void {
    this.updateQueryParams({ page: event.pageIndex, pageSize: event.pageSize });
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.updateQueryParams({ query: null, page: 0 });
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.sortBy = 'score';
    this.minScore = 0;
    this.minScoreSelectValue = '0';
    this.minDays = this.defaultMinDays;
    this.updateQueryParams({ query: null, sortBy: null, minScore: null, minDays: null, page: 0 });
  }

  rowRank(index: number): number {
    return this.page * this.pageSize + index + 1;
  }

  trackByViewerId(_index: number, entry: HallEntry): number {
    return entry.viewer_id;
  }

  trackByReasonKey(_index: number, reason: EvidenceReason): string {
    return reason.key;
  }

  trackByGroupTitle(_index: number, group: InsightGroup): string {
    return group.title;
  }

  trackByMetricLabel(_index: number, metric: InsightMetric): string {
    return metric.label;
  }

  trackBySessionKey(_index: number, row: SessionDisplayRow): string {
    return row.key;
  }

  trackByEvidenceGroupKey(_index: number, group: EvidenceGroupView): string {
    return group.key;
  }

  getVerdictLabel(verdict: string | null | undefined): string {
    switch (verdict) {
      case 'strong_automation_signal': return 'Automation-like pattern';
      case 'very_high_suspicion': return 'Very high suspicion';
      case 'schedule_suspicion': return 'Schedule pattern';
      case 'suspicious': return 'Raised suspicion';
      case 'below_threshold': return 'Below threshold';
      default: return 'Suspicion score';
    }
  }

  getVerdictIcon(verdict: string | null | undefined): string {
    switch (verdict) {
      case 'strong_automation_signal': return 'precision_manufacturing';
      case 'very_high_suspicion': return 'priority_high';
      case 'schedule_suspicion': return 'schedule';
      case 'below_threshold': return 'info';
      default: return 'analytics';
    }
  }

  getScoreTierLabel(score: number | null | undefined): string {
    const value = score ?? 0;
    if (value >= 90) return 'Critical score';
    if (value >= 75) return 'High score';
    if (value >= 60) return 'Elevated score';
    if (value >= 40) return 'Watch score';
    return 'Low score';
  }

  getScoreBandLabel(score: number | null | undefined): string {
    const value = score ?? 0;
    if (value >= 90) return 'Critical';
    if (value >= 75) return 'High';
    if (value >= 60) return 'Elevated';
    if (value >= 40) return 'Watch';
    return 'Low';
  }

  getScoreTierClass(score: number | null | undefined): string {
    const value = score ?? 0;
    if (value >= 90) return 'score-critical';
    if (value >= 75) return 'score-high';
    if (value >= 60) return 'score-elevated';
    if (value >= 40) return 'score-watch';
    return 'score-low';
  }

  getScoreTierIcon(score: number | null | undefined): string {
    const value = score ?? 0;
    if (value >= 90) return 'priority_high';
    if (value >= 75) return 'warning';
    if (value >= 60) return 'analytics';
    if (value >= 40) return 'visibility';
    return 'info';
  }

  getVerdictSignalLabel(verdict: string | null | undefined): string {
    switch (verdict) {
      case 'strong_automation_signal': return 'Automation-like pattern';
      case 'very_high_suspicion': return 'Rate anomaly';
      case 'schedule_suspicion': return 'Schedule pattern';
      case 'below_threshold': return 'Below threshold';
      default: return 'Activity pattern';
    }
  }

  getConfidenceLabel(confidence: string): string {
    switch (confidence) {
      case 'strong': return 'Strong signal';
      case 'medium': return 'Medium confidence';
      case 'contextual': return 'Contextual';
      default: return confidence;
    }
  }

  getPrimarySessionMetricLabel(score: HallEntry): string {
    return score.max_online_streak_seconds ? 'Max online streak' : 'Longest session';
  }

  getPrimarySessionMetricDuration(score: HallEntry): number {
    return score.max_online_streak_seconds ?? score.max_session_seconds;
  }

  formatDuration(seconds: number | null | undefined): string {
    if (!seconds || seconds <= 0) return '0m';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${Math.max(minutes, 1)}m`;
  }

  formatDayLabel(day: string): string {
    const date = new Date(`${day}T00:00:00`);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  getTopReasons(entry: HallEntry): EvidenceReason[] {
    return entry.evidence?.reasons?.slice(0, 2) ?? [];
  }

  getEntrySummary(entry: HallEntry): string {
    if (entry.short_high_fan_careers > 0) {
      return `${entry.short_high_fan_careers} under-${this.shortCareerMaxMinutes}m high-fan careers. Short-career gains avg ${this.formatCompactNumber(entry.short_career_avg_fan_gain)}, p95 ${this.formatCompactNumber(entry.short_career_p95_fan_gain)}, max ${this.formatCompactNumber(entry.short_career_max_fan_gain)}.`;
    }
    return this.sanitizeEvidenceText(entry.evidence?.summary || 'Suspicion score metrics exceeded the current threshold.');
  }

  getEvidenceSummary(score: HallEntry): string {
    return this.sanitizeEvidenceText(score.evidence?.summary || 'Suspicion score metrics exceeded the current threshold.');
  }

  getEvidenceReasonLabel(reason: EvidenceReason): string {
    return this.sanitizeEvidenceText(reason.label);
  }

  getEvidenceSignalLabel(signal: string): string {
    return this.sanitizeEvidenceText(signal.replace(/_/g, ' '));
  }

  getDisplayCaveats(score: HallEntry): string[] {
    return (score.evidence?.caveats ?? []).map(caveat => this.sanitizeEvidenceText(caveat));
  }

  getEvidenceMessage(reason: EvidenceReason, score: HallEntry): string {
    switch (reason.key) {
      case 'short_high_fan_careers':
        return `${score.short_high_fan_careers} career finishes were estimated under ${this.shortCareerMaxMinutes} minutes while reaching at least ${this.formatCompactNumber(this.highFanRateThreshold)} fans per observed minute. Short-career fan gains: avg ${this.formatCompactNumber(score.short_career_avg_fan_gain)}, p50 ${this.formatCompactNumber(score.short_career_p50_fan_gain)}, p90 ${this.formatCompactNumber(score.short_career_p90_fan_gain)}, p95 ${this.formatCompactNumber(score.short_career_p95_fan_gain)}, max ${this.formatCompactNumber(score.short_career_max_fan_gain)}.`;
      case 'career_length_distribution': {
        const underFive = score.career_length_buckets?.[0] ?? 0;
        const fiveToTen = score.career_length_buckets?.[1] ?? 0;
        const tenToFifteen = score.career_length_buckets?.[2] ?? 0;
        return `${underFive + fiveToTen} careers landed under 10 minutes and ${tenToFifteen} more landed in the 10-15 minute window. The red weight below marks the short runs that also had extreme fan gain.`;
      }
      case 'fan_gain_rate':
        return `Peak observed pace reached ${this.formatCompactNumber(score.peak_fans_per_minute)} fans/min, with a sustained observed pace of ${this.formatCompactNumber(score.fans_per_active_minute)} fans/min across active snapshots.`;
      case 'heatmap_coverage':
        return `Activity touched ${score.distinct_weekly_hour_buckets} of 168 weekday/hour slots across the report window. This is schedule coverage context; the short-career fan gain is the stronger suspicion signal.`;
      default:
        return this.sanitizeEvidenceText(reason.message);
    }
  }

  getEvidenceCaveat(reason: EvidenceReason): string | null {
    if (reason.key === 'short_high_fan_careers') {
      return `Threshold: under ${this.shortCareerMaxMinutes} minutes and at least ${this.formatCompactNumber(this.highFanRateThreshold)} fans/min. The weighted short-fan score scales with both fan gain and how short the run was; ${this.shortFanScoreCap}+ fills this part of the suspicion score.`;
    }
    if (reason.key === 'heatmap_coverage') {
      return 'Heatmap cells aggregate the whole report window. They do not mean that a single Sunday hour lasted that long.';
    }
    return reason.caveat ? this.sanitizeEvidenceText(reason.caveat) : null;
  }

  getShortCareerWindowCount(score: HallEntry): number {
    return (score.career_length_buckets ?? []).slice(0, 3).reduce((total, count) => total + count, 0);
  }

  getShortFanScorePercent(score: HallEntry): number {
    return Math.min(100, Math.max(3, score.short_fan_gain_score / this.shortFanScoreCap * 100));
  }

  getHeatmapCoveragePercent(score: HallEntry): number {
    return Math.round(score.distinct_weekly_hour_buckets / 168 * 100);
  }

  getHeatmapCell(day: number, hour: number): HeatmapCell | null {
    return this.heatmapLookup.get(`${day}:${hour}`) ?? null;
  }

  getHeatmapLevel(cell: HeatmapCell | null): number {
    if (!cell || this.heatmapMaxActiveSeconds <= 0 || cell.active_seconds <= 0) return 0;

    const normalized = Math.sqrt(cell.active_seconds / this.heatmapMaxActiveSeconds);
    if (normalized >= 0.88) return 4;
    if (normalized >= 0.64) return 3;
    if (normalized >= 0.4) return 2;
    return 1;
  }

  getHourlyActivityTooltip(row: HourlyActivityView): string {
    const hourLabel = `${row.hour.toString().padStart(2, '0')}:00`;
    if (row.activeSeconds <= 0) return `${hourLabel}: no observed activity in this report window`;
    return `${hourLabel} across ${this.reportDays} reported days: ${this.formatDuration(row.activeSeconds)} total observed active time, ${row.careers} careers`;
  }

  getHeatmapTooltip(dayLabel: string, hour: number, cell: HeatmapCell | null): string {
    const hourLabel = `${hour.toString().padStart(2, '0')}:00`;
    if (!cell) return `${dayLabel} ${hourLabel}: no observed activity in this report window`;
    return `${dayLabel} ${hourLabel} across ${this.reportDays} reported days: ${this.formatDuration(cell.active_seconds)} total observed active time, ${cell.careers} careers`;
  }

  getCareerBuckets(score: HallEntry | null | undefined): CareerBucketView[] {
    if (!score?.career_length_buckets?.length) return [];
    const maxCount = this.getCareerBucketMax(score);
    return score.career_length_buckets.map((count, index) => ({
      label: this.getCareerBucketLabel(index, score.career_length_buckets.length),
      description: '',
      count,
      signalScore: score.short_fan_gain_score_buckets?.[index] ?? 0,
      countPercent: Math.max(3, count / maxCount * 100),
      signalPercent: Math.max(0, Math.min(100, (score.short_fan_gain_score_buckets?.[index] ?? 0) / Math.max(1, score.short_fan_gain_score) * 100)),
      isShortWindow: index < 3
    }));
  }

  getCareerBucketMax(score: HallEntry | null | undefined): number {
    return Math.max(1, ...(score?.career_length_buckets ?? [0]));
  }

  getDailyFanHeight(point: DailyPoint): number {
    if (this.maxDailyFanGain <= 0) return 0;
    return Math.max(4, Math.round(point.fan_gain / this.maxDailyFanGain * 100));
  }

  getDailyActiveHeight(point: DailyPoint): number {
    if (this.maxDailyActiveSeconds <= 0) return 0;
    return Math.max(4, Math.round(point.active_seconds / this.maxDailyActiveSeconds * 100));
  }

  formatCompactNumber(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '0';
    return this.compactFormatter.format(value);
  }

  formatWholeNumber(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '0';
    return this.integerFormatter.format(value);
  }

  formatDecimalNumber(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '0';
    return this.decimalFormatter.format(value);
  }

  formatPercent(value: number | null | undefined, maxFractionDigits = 0): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '0%';

    return new Intl.NumberFormat(undefined, {
      style: 'percent',
      minimumFractionDigits: maxFractionDigits,
      maximumFractionDigits: maxFractionDigits
    }).format(value);
  }

  getDailyPointTooltip(row: DailyActivityRow): string {
    return `${this.formatDayLabel(row.point.day)}: +${this.formatWholeNumber(row.point.fan_gain)} fans, ${row.point.careers} careers, ${this.formatDuration(row.point.active_seconds)} active, ${this.formatCompactNumber(row.fansPerActiveMinute)} fans/min`;
  }

  getShortCareerSnapshots(report: ViewerReport | null | undefined): ShortCareerSnapshot[] {
    return report?.short_career_snapshots?.slice(0, this.shortCareerSnapshotDisplayLimit) ?? [];
  }

  getShortSnapshotTotalCount(report: ViewerReport | null | undefined): number {
    const totalCount = report?.short_career_snapshots_total ?? report?.short_career_snapshots?.[0]?.total_count;
    return totalCount ?? this.getShortCareerSnapshots(report).length;
  }

  trackBySnapshotId(_index: number, snapshot: ShortCareerSnapshot): number {
    return snapshot.snapshot_id;
  }

  formatSnapshotTime(value: string | null | undefined): string {
    if (!value) return '-';
    return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  formatSnapshotRate(value: ReportNumericValue | null | undefined): string {
    return this.formatCompactNumber(this.getReportNumericValue(value));
  }

  formatSnapshotScore(value: ReportNumericValue | null | undefined): string {
    return this.formatDecimalNumber(this.getReportNumericValue(value));
  }

  toggleShortCareerSnapshot(snapshotId: number): void {
    if (this.expandedShortCareerSnapshotIds.has(snapshotId)) {
      this.expandedShortCareerSnapshotIds.delete(snapshotId);
      return;
    }

    this.expandedShortCareerSnapshotIds.add(snapshotId);
  }

  isShortCareerSnapshotExpanded(snapshotId: number): boolean {
    return this.expandedShortCareerSnapshotIds.has(snapshotId);
  }

  hasShortCareerContext(snapshot: ShortCareerSnapshot): boolean {
    return (snapshot.prior_snapshots?.length ?? 0) > 0 || (snapshot.next_snapshots?.length ?? 0) > 0;
  }

  getShortCareerIssueSummary(snapshot: ShortCareerSnapshot): string {
    const previousCareerGap = snapshot.previous_career_gap_seconds
      ? `The prior detected career end was ${this.formatDuration(snapshot.previous_career_gap_seconds)} earlier.`
      : 'No prior detected career end was included in this payload.';
    const thresholdSummary = snapshot.is_high_fan_short
      ? 'This lands inside the high-fan short-career window.'
      : 'This is still a short finish, but it stays below the high-fan cutoff.';

    return `This highlighted career end landed ${this.formatDuration(snapshot.snapshot_gap_seconds)} after the previous snapshot, gained +${this.formatWholeNumber(snapshot.fan_gain)} fans, and paced at ${this.formatSnapshotRate(snapshot.fans_per_minute)} fans/min. ${previousCareerGap} ${thresholdSummary}`;
  }

  getCareerEndLabel(count: number | null | undefined): string {
    if (!count || count <= 0) return 'No career end';
    if (count === 1) return 'Career end';
    return `${this.formatWholeNumber(count)} career ends`;
  }

  trackByNeighborSnapshotId(_index: number, snapshot: NeighborSnapshot): number {
    return snapshot.snapshot_id;
  }

  hasEvidenceReasons(score: HallEntry | null | undefined): boolean {
    return (score?.evidence?.reasons?.length ?? 0) > 0;
  }

  toggleEvidenceGroup(groupKey: string): void {
    if (this.expandedEvidenceGroupKeys.has(groupKey)) {
      this.expandedEvidenceGroupKeys.delete(groupKey);
      return;
    }

    this.expandedEvidenceGroupKeys.add(groupKey);
  }

  isEvidenceGroupExpanded(groupKey: string): boolean {
    return this.expandedEvidenceGroupKeys.has(groupKey);
  }

  private getReportNumericValue(value: ReportNumericValue | null | undefined): number {
    if (typeof value === 'number') return value;
    return value?.parsedValue ?? 0;
  }

  shouldShowDailyValue(row: DailyActivityRow, index: number): boolean {
    if (this.maxDailyFanGain <= 0 || row.point.fan_gain < this.maxDailyFanGain * 0.72) return false;
    if (row.point.fan_gain === this.maxDailyFanGain) return true;

    const previous = this.dailyActivityRows[index - 1]?.point.fan_gain ?? 0;
    const next = this.dailyActivityRows[index + 1]?.point.fan_gain ?? 0;
    return row.point.fan_gain >= previous * 1.08 && row.point.fan_gain >= next * 1.08;
  }

  getDailyTickLabel(row: DailyActivityRow, index: number, compact = false): string {
    const lastIndex = this.dailyActivityRows.length - 1;
    if (compact) {
      const tickStep = Math.max(1, Math.ceil(lastIndex / 3));
      if (index === 0 || index === lastIndex || index % tickStep === 0) {
        return this.formatDayLabel(row.point.day);
      }
      return '';
    }

    if (this.dailyActivityRows.length <= 14 || index === 0 || index === lastIndex || index % 7 === 0) {
      return this.formatDayLabel(row.point.day);
    }
    return '';
  }

  formatAxisTickValue(value: number, type: 'fan' | 'active'): string {
    if (type === 'fan') return this.formatCompactNumber(value);
    return this.formatDuration(value);
  }

  private prepareDetailCharts(report: ViewerReport): void {
    this.dailyChartPoints = [...report.daily].reverse().slice(-45);
    this.reportDays = report.daily.length;
    this.maxDailyFanGain = Math.max(0, ...this.dailyChartPoints.map(point => point.fan_gain));
    this.maxDailyActiveSeconds = Math.max(0, ...this.dailyChartPoints.map(point => point.active_seconds));
    this.roundedDailyFanGainMax = this.getNiceAxisMax(this.maxDailyFanGain);
    const timeAxis = this.getNiceTimeAxis(this.maxDailyActiveSeconds);
    this.roundedDailyActiveSecondsMax = timeAxis.max;
    this.dailyActiveStepSeconds = timeAxis.step;
    this.dailyFanAxisTicks = this.buildAxisTicks(this.roundedDailyFanGainMax);
    this.dailyActiveAxisTicks = timeAxis.ticks;
    this.dailyMonthSegments = this.buildMonthSegments(this.dailyChartPoints);
    const dailySignalCap = this.getDailySignalCap(report.score);
    this.dailyActivityRows = this.dailyChartPoints.map(point => {
      const fansPerActiveMinute = point.active_seconds > 0 ? point.fan_gain / (point.active_seconds / 60) : 0;
      const signalLevel = this.capDailySignalLevel(this.getDailySignalLevel(point, fansPerActiveMinute), dailySignalCap);
      const isHighlighted = signalLevel === 'high' || signalLevel === 'critical';

      return {
        point,
        fanPercent: this.roundedDailyFanGainMax > 0 ? Math.max(3, point.fan_gain / this.roundedDailyFanGainMax * 100) : 0,
        activePercent: this.roundedDailyActiveSecondsMax > 0 ? Math.max(3, point.active_seconds / this.roundedDailyActiveSecondsMax * 100) : 0,
        fansPerActiveMinute,
        isHighlighted,
        signalLevel,
        signalLabel: this.getDailySignalLabel(signalLevel)
      };
    });
    this.heatmapLookup = new Map(report.heatmap.map(cell => [`${cell.dow}:${cell.hour}`, cell]));
    this.heatmapMaxActiveSeconds = Math.max(0, ...report.heatmap.map(cell => cell.active_seconds));
    this.heatmapTouchedBuckets = report.heatmap.filter(cell => cell.active_seconds > 0 || cell.careers > 0).length;
    this.hourlyActivityRows = this.buildHourlyActivityRows(report.heatmap);
    this.careerBucketRows = this.buildCareerBucketRows(report.score);
    this.scoreInsightGroups = this.buildScoreInsightGroups(report.score);
    this.probeMetricGroups = this.buildProbeMetricGroups(report.score?.probe_metrics);
    this.dailyHighlightMetrics = this.buildDailyHighlightMetrics(report.daily);
    this.topSessionRows = this.buildTopSessionRows(report);
    this.viewerFlagLabels = this.buildViewerFlagLabels(report.score);
    this.evidenceGroups = this.buildEvidenceGroups(report.score?.evidence?.reasons ?? []);
    this.expandedEvidenceGroupKeys = new Set(this.evidenceGroups[0] ? [this.evidenceGroups[0].key] : []);
    this.expandedShortCareerSnapshotIds = new Set(report.short_career_snapshots?.[0] ? [report.short_career_snapshots[0].snapshot_id] : []);
  }

  private resetDetailDerivedState(): void {
    this.dailyChartPoints = [];
    this.dailyActivityRows = [];
    this.dailyFanAxisTicks = [];
    this.dailyActiveAxisTicks = [];
    this.dailyMonthSegments = [];
    this.hourlyActivityRows = [];
    this.careerBucketRows = [];
    this.scoreInsightGroups = [];
    this.probeMetricGroups = [];
    this.dailyHighlightMetrics = [];
    this.topSessionRows = [];
    this.viewerFlagLabels = [];
    this.evidenceGroups = [];
    this.expandedEvidenceGroupKeys = new Set<string>();
    this.expandedShortCareerSnapshotIds = new Set<number>();
    this.maxDailyFanGain = 0;
    this.maxDailyActiveSeconds = 0;
    this.roundedDailyFanGainMax = 0;
    this.roundedDailyActiveSecondsMax = 0;
    this.maxHourlyActiveSeconds = 0;
    this.heatmapMaxActiveSeconds = 0;
    this.heatmapTouchedBuckets = 0;
    this.reportDays = 0;
    this.heatmapLookup = new Map<string, HeatmapCell>();
  }

  private buildScoreInsightGroups(score: HallEntry | null): InsightGroup[] {
    if (!score) return [];

    return [
      {
        title: 'Activity totals',
        description: 'High-level account workload and output over the report window.',
        metrics: [
          {
            label: 'Observed vs active days',
            value: `${this.formatWholeNumber(score.days_active)} / ${this.formatWholeNumber(score.days_observed)}`,
            hint: 'Days with any observed play versus all observed days'
          },
          {
            label: 'Total active time',
            value: this.formatDuration(score.total_active_seconds),
            hint: `${this.formatWholeNumber(score.total_careers)} careers, ${this.formatDecimalNumber(this.getAverageCareersPerDay(score))}/day`
          },
          {
            label: 'Fans per active minute',
            value: this.formatCompactNumber(score.fans_per_active_minute),
            hint: `Peak observed ${this.formatCompactNumber(score.peak_fans_per_minute)} fans/min, ${this.formatWholeNumber(score.high_fan_rate_windows ?? 0)} high-rate windows`
          },
          {
            label: 'Peak daily load',
            value: this.formatDuration(score.max_daily_active_seconds),
            hint: `${this.formatWholeNumber(score.max_daily_careers)} careers on the busiest day`
          }
        ]
      },
      {
        title: 'Career rate samples',
        description: 'Estimated careers per hour from snapshot intervals. Values are rates; notes show sample coverage.',
        metrics: [
          {
            label: 'Last 20 rate',
            value: this.formatCareerRateValue(score, 'last_20'),
            hint: this.formatCareerRateHint(score, 'last_20')
          },
          {
            label: '3-day rate',
            value: this.formatCareerRateValue(score, 'last_3d'),
            hint: this.formatCareerRateHint(score, 'last_3d')
          },
          {
            label: '7-day rate',
            value: this.formatCareerRateValue(score, 'last_7d'),
            hint: this.formatCareerRateHint(score, 'last_7d')
          },
          {
            label: '30-day rate',
            value: this.formatCareerRateValue(score, 'last_30d'),
            hint: this.formatCareerRateHint(score, 'last_30d')
          }
        ]
      },
      {
        title: 'Recent trend',
        description: 'Recent output compared against the baseline fields in the score payload.',
        metrics: [
          {
            label: 'Recent 3-day gain',
            value: `+${this.formatWholeNumber(score.recent_fan_gain_3d)}`,
            hint: `Recent daily average +${this.formatCompactNumber(score.recent_fans_per_day)}`
          },
          {
            label: '14-day baseline gain',
            value: `+${this.formatWholeNumber(score.baseline_fan_gain_14d)}`,
            hint: `Baseline daily average +${this.formatCompactNumber(score.baseline_fans_per_day)}`
          },
          {
            label: 'Spike ratio',
            value: this.formatPercent(score.fan_gain_spike_ratio, 0),
            hint: `Behavior change score ${this.formatDecimalNumber(score.behavior_change_score)}`
          },
          {
            label: 'Avg last 20 career length',
            value: this.formatDuration(score.avg_career_length_last20_seconds),
            hint: `${this.formatWholeNumber(this.getShortCareerWindowCount(score))} careers under ${this.shortCareerMaxMinutes}m`
          }
        ]
      },
      {
        title: 'Recovery and resets',
        description: 'Long windows, reset-adjacent gaps, and probe weighting inputs.',
        metrics: [
          {
            label: 'Primary long session',
            value: this.formatDuration(this.getPrimarySessionMetricDuration(score)),
            hint: this.getPrimarySessionMetricLabel(score)
          },
          {
            label: 'Reset recovery windows',
            value: this.formatWholeNumber(score.reset_recovery_windows ?? 0),
            hint: `${this.formatWholeNumber(score.reset_breaks ?? 0)} reset breaks observed`
          },
          {
            label: 'Max reset recovery gap',
            value: this.formatDuration(score.max_reset_recovery_seconds ?? 0),
            hint: `Reset break score ${this.formatDecimalNumber(score.reset_break_score ?? 0)}`
          },
          {
            label: 'Probe score',
            value: this.formatDecimalNumber(score.probe_score ?? 0),
            hint: `${this.formatWholeNumber(score.days_over_16h)} days over 16h, ${this.formatWholeNumber(score.days_over_20h)} days over 20h`
          },
          {
            label: 'High-rate fan windows',
            value: this.formatWholeNumber(score.high_fan_rate_windows ?? 0),
            hint: `+${this.formatCompactNumber(score.high_fan_rate_total_fan_gain ?? 0)} over ${this.formatDuration(score.high_fan_rate_total_seconds ?? 0)}`
          }
        ]
      }
    ];
  }

  getAverageCareersPerDay(score: HallEntry): number {
    if (Number.isFinite(score.avg_careers_per_day)) return score.avg_careers_per_day ?? 0;
    return score.days_observed > 0 ? score.total_careers / score.days_observed : 0;
  }

  private getCareerRateWindow(score: HallEntry, key: keyof NonNullable<HallEntry['career_rate_breakdown']>): CareerRateWindow | null {
    return score.career_rate_breakdown?.[key] ?? null;
  }

  getCareerRatePerHour(
    score: HallEntry,
    key: keyof NonNullable<HallEntry['career_rate_breakdown']>,
    fallback?: number
  ): number {
    return this.getCareerRateWindow(score, key)?.careers_per_hour ?? fallback ?? 0;
  }

  private formatCareerRateValue(
    score: HallEntry,
    key: keyof NonNullable<HallEntry['career_rate_breakdown']>,
    fallback?: number
  ): string {
    return this.formatDecimalNumber(this.getCareerRatePerHour(score, key, fallback));
  }

  private formatCareerRateHint(
    score: HallEntry,
    key: keyof NonNullable<HallEntry['career_rate_breakdown']>,
    fallbackCount?: number,
    fallbackSeconds?: number
  ): string {
    const window = this.getCareerRateWindow(score, key);
    const sampleCount = window?.sample_count ?? fallbackCount ?? 0;
    const sampleSeconds = window?.sample_seconds ?? fallbackSeconds ?? 0;
    return `careers/hour - ${this.formatWholeNumber(sampleCount)} samples, ${this.formatDuration(sampleSeconds)} observed`;
  }

  private buildProbeMetricGroups(metrics: ProbeMetrics | null | undefined): InsightGroup[] {
    if (!metrics) return [];

    return [
      {
        title: 'Rhythm and login',
        description: 'Spread and regularity metrics derived from career timing and login cadence.',
        metrics: [
          {
            label: 'Career fan-gain samples',
            value: this.formatWholeNumber(metrics.career_fan_gain_samples),
            hint: `Mode share ${this.formatPercent(metrics.career_fan_gain_mode_share, 0)}, CV ${this.formatDecimalNumber(metrics.career_fan_gain_cv)}, score ${this.formatDecimalNumber(metrics.career_fan_gain_score)}`
          },
          {
            label: 'Career rhythm CV',
            value: this.formatDecimalNumber(metrics.career_rhythm_cv),
            hint: `${this.formatWholeNumber(metrics.career_rhythm_samples)} samples, regularity score ${this.formatDecimalNumber(metrics.career_regularity_score)}`
          },
          {
            label: 'Login gap CV',
            value: this.formatDecimalNumber(metrics.login_gap_cv),
            hint: `${this.formatWholeNumber(metrics.login_gap_samples)} samples, mode share ${this.formatPercent(metrics.login_gap_mode_share, 0)}`
          },
          {
            label: 'Post-login latency',
            value: this.formatDuration(metrics.post_login_latency_median_seconds),
            hint: `${this.formatWholeNumber(metrics.post_login_latency_samples)} samples, CV ${this.formatDecimalNumber(metrics.post_login_latency_cv)}, score ${this.formatDecimalNumber(metrics.post_login_latency_score)}`
          }
        ]
      },
      {
        title: 'Schedule shape',
        description: 'How activity spreads across the week, the clock, and night windows.',
        metrics: [
          {
            label: 'Weekday vs weekend similarity',
            value: this.formatPercent(metrics.weekday_weekend_similarity, 0),
            hint: `Hourly entropy ${this.formatPercent(metrics.hourly_entropy, 0)}`
          },
          {
            label: 'Night active ratio',
            value: this.formatPercent(metrics.night_active_ratio, 0),
            hint: `${this.formatDuration(metrics.night_active_seconds)} observed at night`
          },
          {
            label: 'Zero-idle streak',
            value: this.formatWholeNumber(metrics.max_zero_idle_fan_gain_streak),
            hint: `${this.formatDuration(metrics.max_zero_idle_active_seconds)} active, score ${this.formatDecimalNumber(metrics.zero_idle_score)}`
          },
          {
            label: 'Schedule shape score',
            value: this.formatDecimalNumber(metrics.schedule_shape_score),
            hint: `Career length CV ${this.formatDecimalNumber(metrics.career_length_cv)}`
          }
        ]
      },
      {
        title: 'Burst and context',
        description: 'Burst windows, service resumes, and cross-account context checks.',
        metrics: [
          {
            label: 'Burst windows',
            value: this.formatWholeNumber(metrics.burst_career_windows),
            hint: `Max ${this.formatWholeNumber(metrics.max_careers_30m)} careers/30m, score ${this.formatDecimalNumber(metrics.burst_career_score)}`
          },
          {
            label: 'Service-gap resumes',
            value: this.formatWholeNumber(metrics.service_gap_resume_events),
            hint: `Resume score ${this.formatDecimalNumber(metrics.service_gap_resume_score)}`
          },
          {
            label: 'Distinct circles seen',
            value: this.formatWholeNumber(metrics.distinct_circles_seen),
            hint: `Circle churn score ${this.formatDecimalNumber(metrics.circle_churn_score)}`
          },
          {
            label: 'Coactivity cluster size',
            value: this.formatWholeNumber(metrics.coactivity_cluster_size),
            hint: `Coactivity score ${this.formatDecimalNumber(metrics.coactivity_cluster_score)}`
          }
        ]
      }
    ];
  }

  private buildDailyHighlightMetrics(points: DailyPoint[]): InsightMetric[] {
    if (!points.length) return [];

    const peakFanDay = points.reduce((best, point) => point.fan_gain > best.fan_gain ? point : best, points[0]);
    const peakCareerDay = points.reduce((best, point) => point.careers > best.careers ? point : best, points[0]);
    const peakActiveDay = points.reduce((best, point) => point.active_seconds > best.active_seconds ? point : best, points[0]);
    const peakSessionsDay = points.reduce((best, point) => point.sessions > best.sessions ? point : best, points[0]);
    const widestSpreadDay = points.reduce((best, point) => point.distinct_hours > best.distinct_hours ? point : best, points[0]);

    return [
      {
        label: 'Peak fan day',
        value: `+${this.formatCompactNumber(peakFanDay.fan_gain)}`,
        hint: this.formatDayLabel(peakFanDay.day)
      },
      {
        label: 'Peak careers day',
        value: this.formatWholeNumber(peakCareerDay.careers),
        hint: `${this.formatDayLabel(peakCareerDay.day)} · +${this.formatCompactNumber(peakCareerDay.fan_gain)}`
      },
      {
        label: 'Peak active day',
        value: this.formatDuration(peakActiveDay.active_seconds),
        hint: `${this.formatDayLabel(peakActiveDay.day)} · longest ${this.formatDuration(peakActiveDay.longest_session_sec)}`
      },
      {
        label: 'Most sessions in a day',
        value: this.formatWholeNumber(peakSessionsDay.sessions),
        hint: `${this.formatDayLabel(peakSessionsDay.day)} · ${peakSessionsDay.careers} careers`
      },
      {
        label: 'Widest hour spread',
        value: `${this.formatWholeNumber(widestSpreadDay.distinct_hours)}h`,
        hint: `${this.formatDayLabel(widestSpreadDay.day)} · ${widestSpreadDay.sessions} sessions`
      }
    ];
  }

  private buildTopSessionRows(report: ViewerReport): SessionDisplayRow[] {
    const sessions = report.top_sessions?.length ? report.top_sessions : (report.top_online_streaks ?? []);

    return sessions.map(session => {
      const observedSeconds = this.getObservedSessionSeconds(session);
      const activeSeconds = this.getActiveSessionSeconds(session);
      const idleSeconds = this.getIdleSessionSeconds(session, observedSeconds, activeSeconds);
      const startedAt = new Date(session.started_at);

      return {
        key: `${session.day ?? ''}-${session.started_at}-${session.ended_at}`,
        dayLabel: session.day ? this.formatDayLabel(session.day) : startedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        windowLabel: this.formatSessionWindow(session.started_at, session.ended_at),
        observedSeconds,
        activeSeconds,
        idleSeconds,
        careers: session.careers,
        fanGain: session.fan_gain,
        sessionCount: session.session_count ?? session.sessions?.length ?? 1
      };
    });
  }

  private buildEvidenceGroups(reasons: EvidenceReason[]): EvidenceGroupView[] {
    const groups = new Map<string, EvidenceGroupView>();

    reasons.forEach(reason => {
      const groupMeta = this.getEvidenceGroupMeta(reason);
      const existing = groups.get(groupMeta.key);

      if (existing) {
        existing.reasons.push(reason);
        return;
      }

      groups.set(groupMeta.key, {
        ...groupMeta,
        reasons: [reason]
      });
    });

    return Array.from(groups.values());
  }

  private getEvidenceGroupMeta(reason: EvidenceReason): Omit<EvidenceGroupView, 'reasons'> {
    const key = reason.key ?? '';

    if (key === 'short_high_fan_careers' || key === 'career_length_distribution' || key.includes('short')) {
      return {
        key: 'automation',
        label: 'Run shape',
        description: 'Short-career and unusual run-shape signals.'
      };
    }

    if (key === 'fan_gain_rate' || key.includes('rate') || key.includes('burst') || key.includes('spike')) {
      return {
        key: 'rate',
        label: 'Rate',
        description: 'Output pace and burst-intensity signals.'
      };
    }

    if (key === 'heatmap_coverage' || key.includes('heatmap') || key.includes('schedule') || key.includes('session') || key.includes('sleep') || key.includes('247')) {
      return {
        key: 'schedule',
        label: 'Schedule',
        description: 'Coverage, timing, and session-shape context.'
      };
    }

    return {
      key: 'context',
      label: 'Context',
      description: 'Supporting or fallback evidence returned by the API.'
    };
  }

  private buildViewerFlagLabels(score: HallEntry | null): string[] {
    if (!score) return [];

    const flags: string[] = [];
    if (score.flag_no_sleep) flags.push('No-sleep signal');
    if (score.flag_extreme_session) flags.push('Extreme session signal');
    if (score.flag_inhuman_career_rate) flags.push('Career-rate signal');
    if (score.flag_247) flags.push('24/7 coverage signal');
    if (score.flag_marathon) flags.push('Marathon activity signal');

    return flags;
  }

  private getObservedSessionSeconds(session: TopSession): number {
    const nestedObserved = session.sessions?.reduce((total, item) => total + item.duration_seconds, 0) ?? 0;
    return session.observed_seconds ?? session.duration_seconds ?? session.longest_session_sec ?? nestedObserved;
  }

  private getActiveSessionSeconds(session: TopSession): number {
    const nestedActive = session.sessions?.reduce((total, item) => total + (item.active_seconds ?? item.duration_seconds), 0) ?? 0;
    return session.playtime_seconds ?? session.active_seconds ?? nestedActive;
  }

  private getIdleSessionSeconds(session: TopSession, observedSeconds: number, activeSeconds: number): number {
    return session.idle_seconds ?? Math.max(0, observedSeconds - activeSeconds);
  }

  private formatSessionWindow(startedAt: string, endedAt: string): string {
    if (!startedAt || !endedAt) return '-';

    const start = new Date(startedAt);
    const end = new Date(endedAt);
    const sameDay = start.toDateString() === end.toDateString();
    const startLabel = start.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const endLabel = sameDay
      ? end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : end.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    return `${startLabel} - ${endLabel}`;
  }

  private buildHourlyActivityRows(cells: HeatmapCell[]): HourlyActivityView[] {
    const hourlyTotals = this.heatmapHours.map(hour => ({
      hour,
      activeSeconds: 0,
      careers: 0
    }));

    cells.forEach(cell => {
      const target = hourlyTotals[cell.hour];
      if (!target) return;
      target.activeSeconds += cell.active_seconds;
      target.careers += cell.careers;
    });

    this.maxHourlyActiveSeconds = Math.max(0, ...hourlyTotals.map(row => row.activeSeconds));
    const activeHourTotals = hourlyTotals.map(row => row.activeSeconds).filter(value => value > 0);
    const minHourlyActiveSeconds = activeHourTotals.length ? Math.min(...activeHourTotals) : 0;
    const logMin = minHourlyActiveSeconds > 0 ? Math.log1p(minHourlyActiveSeconds) : 0;
    const logMax = Math.log1p(this.maxHourlyActiveSeconds);
    const logRange = logMax - logMin;

    return hourlyTotals.map(row => {
      const normalized = row.activeSeconds > 0 && logRange > 0
        ? (Math.log1p(row.activeSeconds) - logMin) / logRange
        : row.activeSeconds > 0 ? 1 : 0;
      const logPercent = row.activeSeconds > 0 ? 16 + normalized * 84 : 0;

      return {
        ...row,
        logPercent,
        level: this.getLogHeatmapLevel(logPercent)
      };
    });
  }

  private getLogHeatmapLevel(logPercent: number): number {
    if (logPercent <= 0) return 0;
    if (logPercent >= 88) return 4;
    if (logPercent >= 66) return 3;
    if (logPercent >= 42) return 2;
    return 1;
  }

  private buildCareerBucketRows(score: HallEntry | null): CareerBucketView[] {
    if (!score?.career_length_buckets?.length) return [];

    const groups = [
      { label: '0-5m', description: 'Extreme', start: 0, end: 1, isShortWindow: true },
      { label: '5-10m', description: 'Very short', start: 1, end: 2, isShortWindow: true },
      { label: '10-15m', description: 'Short high-fan window', start: 2, end: 3, isShortWindow: true },
      { label: '15-20m', description: 'Just outside signal', start: 3, end: 4, isShortWindow: false },
      { label: '20-30m', description: 'Fast normal range', start: 4, end: 6, isShortWindow: false },
      { label: '30-45m', description: 'Typical run band', start: 6, end: 9, isShortWindow: false },
      { label: '45-60m', description: 'Longer run band', start: 9, end: 12, isShortWindow: false },
      { label: '60-90m', description: 'Long run band', start: 12, end: 18, isShortWindow: false },
      { label: '90m+', description: 'Overflow', start: 18, end: score.career_length_buckets.length, isShortWindow: false }
    ];

    const rows = groups.map(group => {
      const counts = score.career_length_buckets.slice(group.start, group.end);
      const signalScores = (score.short_fan_gain_score_buckets ?? []).slice(group.start, group.end);
      return {
        label: group.label,
        description: group.description,
        count: counts.reduce((total, count) => total + count, 0),
        signalScore: signalScores.reduce((total, value) => total + value, 0),
        countPercent: 0,
        signalPercent: 0,
        isShortWindow: group.isShortWindow
      };
    }).filter(row => row.count > 0 || row.signalScore > 0 || row.isShortWindow);

    const maxCount = Math.max(1, ...rows.map(row => row.count));
    const maxSignal = Math.max(1, ...rows.map(row => row.signalScore));

    return rows.map(row => ({
      ...row,
      countPercent: row.count > 0 ? Math.max(3, row.count / maxCount * 100) : 0,
      signalPercent: row.signalScore > 0 ? Math.max(3, row.signalScore / maxSignal * 100) : 0
    }));
  }

  private sanitizeEvidenceText(text: string): string {
    return text
      .replace('A saturated heatmap can be legal account sharing or very heavy manual play; it is suspicious context, not proof by itself.', 'A saturated heatmap can come from account sharing or very heavy manual play. Treat it as schedule context, not direct proof by itself.')
      .replace(/suspicious activity metrics/gi, 'suspicion score metrics')
      .replace(/suspicious activity/gi, 'suspicious activity signals')
      .replace(/suspicious context/gi, 'schedule context')
      .replace(/schedule suspicion/gi, 'schedule pattern')
      .replace('legal account sharing or very heavy manual play', 'account sharing or very heavy manual play')
      .replace('account sharing or normal 24/7 play', 'account sharing or very heavy manual play')
      .replace('career finish(es)', 'career finishes');
  }

  private buildAxisTicks(maxValue: number, intervals = 4): ChartAxisTick[] {
    const ticks: ChartAxisTick[] = [];

    for (let index = intervals; index >= 0; index--) {
      const value = maxValue / intervals * index;
      ticks.push({
        value,
        percent: (index / intervals) * 100
      });
    }

    return ticks;
  }

  private getNiceAxisMax(rawMax: number, intervals = 4): number {
    if (rawMax <= 0) return intervals;

    const roughStep = rawMax / intervals;
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalized = roughStep / magnitude;
    let niceStep = magnitude;

    if (normalized <= 1) niceStep = magnitude;
    else if (normalized <= 2) niceStep = 2 * magnitude;
    else if (normalized <= 2.5) niceStep = 2.5 * magnitude;
    else if (normalized <= 5) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;

    return Math.ceil(rawMax / niceStep) * niceStep;
  }

  private getNiceTimeAxis(rawMaxSeconds: number): TimeAxisConfig {
    const preferredSteps = [
      900,
      1800,
      3600,
      7200,
      10800,
      14400,
      21600
    ];

    const targetTickCount = 5;
    const step = preferredSteps.find(value => value * targetTickCount >= rawMaxSeconds) ?? preferredSteps[preferredSteps.length - 1];
    const tickCount = Math.max(2, Math.ceil(rawMaxSeconds / step));
    const max = step * tickCount;

    const ticks: ChartAxisTick[] = [];
    for (let index = tickCount; index >= 0; index--) {
      ticks.push({
        value: step * index,
        percent: tickCount === 0 ? 0 : index / tickCount * 100
      });
    }

    return {
      max,
      step,
      ticks
    };
  }

  private getDailySignalLevel(point: DailyPoint, fansPerActiveMinute: number): 'idle' | 'low' | 'medium' | 'high' | 'critical' {
    if (point.fan_gain <= 10000 && point.careers === 0) return 'idle';

    const rateRatio = this.highFanRateThreshold > 0 ? fansPerActiveMinute / this.highFanRateThreshold : 0;
    const careerRatio = point.careers / 80;
    const fanRatio = this.maxDailyFanGain > 0 ? point.fan_gain / this.maxDailyFanGain : 0;
    const signal = Math.max(rateRatio * 1.15, careerRatio, fanRatio * 0.58);

    if (rateRatio >= 1.18 || point.careers >= 95 || signal >= 1.22) return 'critical';
    if (rateRatio >= 0.9 || point.careers >= 60 || signal >= 0.92) return 'high';
    if (rateRatio >= 0.62 || point.careers >= 28 || signal >= 0.62) return 'medium';
    return 'low';
  }

  private getDailySignalCap(score: HallEntry | null): DailyActivityRow['signalLevel'] {
    if (!score) return 'critical';

    const hasDirectShortFanSignal = score.short_high_fan_careers > 0 || score.short_fan_gain_score > 0;
    if (hasDirectShortFanSignal) return 'critical';

    const hasStrongRateSignal = score.fans_per_active_minute >= this.highFanRateThreshold || score.flag_inhuman_career_rate;
    if (hasStrongRateSignal) return 'high';

    return 'medium';
  }

  private capDailySignalLevel(level: DailyActivityRow['signalLevel'], cap: DailyActivityRow['signalLevel']): DailyActivityRow['signalLevel'] {
    const order: DailyActivityRow['signalLevel'][] = ['idle', 'low', 'medium', 'high', 'critical'];
    const levelIndex = order.indexOf(level);
    const capIndex = order.indexOf(cap);

    if (levelIndex < 0 || capIndex < 0) return level;
    return order[Math.min(levelIndex, capIndex)];
  }

  private getDailySignalLabel(level: DailyActivityRow['signalLevel']): string {
    switch (level) {
      case 'critical': return 'Extreme output day';
      case 'high': return 'High output day';
      case 'medium': return 'Raised output day';
      case 'low': return 'Typical output day';
      default: return 'Quiet day';
    }
  }

  private getDailySignalPalette(level: DailyActivityRow['signalLevel']): { fill: string; border: string } {
    switch (level) {
      case 'critical':
        return { fill: 'rgba(232, 137, 87, 0.82)', border: 'rgba(255, 190, 142, 0.95)' };
      case 'high':
        return { fill: 'rgba(225, 167, 82, 0.8)', border: 'rgba(255, 215, 148, 0.92)' };
      case 'medium':
        return { fill: 'rgba(190, 184, 91, 0.76)', border: 'rgba(232, 225, 150, 0.86)' };
      case 'low':
        return { fill: 'rgba(122, 184, 139, 0.7)', border: 'rgba(177, 220, 187, 0.82)' };
      default:
        return { fill: 'rgba(121, 135, 158, 0.48)', border: 'rgba(171, 183, 201, 0.72)' };
    }
  }

  private renderDailyChart(): void {
    if (!this.dailyChartCanvas || !this.dailyActivityRows.length) {
      this.destroyDailyChart();
      return;
    }

    const context = this.dailyChartCanvas.nativeElement.getContext('2d');
    if (!context) return;

    this.destroyDailyChart();

    const labels = this.dailyActivityRows.map(row => this.formatDayLabel(row.point.day));
    const isCompactChart = window.innerWidth <= 520;
    const fanColors = this.dailyActivityRows.map(row => this.getDailySignalPalette(row.signalLevel).border);
    const activeLineColor = 'rgba(148, 196, 248, 0.88)';
    const fanSeries = this.dailyActivityRows.map(row => row.fanPercent);
    const activitySeries = this.dailyActivityRows.map(row => -row.activePercent);
    const biasSeries = this.dailyActivityRows.map(row => (row.fanPercent - row.activePercent) * 0.34);

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Fan gain',
            data: fanSeries,
            yAxisID: 'mirror',
            backgroundColor: 'rgba(255, 196, 128, 0.14)',
            borderColor: 'rgba(255, 214, 153, 0.95)',
            pointBackgroundColor: fanColors,
            pointBorderColor: fanColors,
            pointHoverBackgroundColor: fanColors,
            pointHoverBorderColor: '#ffffff',
            pointRadius: isCompactChart ? 0 : 2.5,
            pointHoverRadius: 4,
            pointHitRadius: 14,
            borderWidth: 2,
            tension: 0.28,
            fill: 'origin',
          },
          {
            label: 'Bias',
            data: biasSeries,
            yAxisID: 'mirror',
            borderColor: 'rgba(255, 255, 255, 0.82)',
            backgroundColor: 'transparent',
            pointRadius: 0,
            pointHoverRadius: 3,
            pointHitRadius: 14,
            borderWidth: isCompactChart ? 1.6 : 1.8,
            tension: 0.32,
            fill: false,
          },
          {
            label: 'Active time',
            data: activitySeries,
            yAxisID: 'mirror',
            backgroundColor: 'rgba(106, 164, 221, 0.12)',
            borderColor: activeLineColor,
            pointBackgroundColor: activeLineColor,
            pointBorderColor: activeLineColor,
            pointRadius: isCompactChart ? 1.8 : 0,
            pointHoverRadius: isCompactChart ? 3.5 : 3,
            pointHitRadius: 14,
            borderWidth: isCompactChart ? 2.1 : 2,
            borderDash: isCompactChart ? [4, 4] : [6, 4],
            tension: 0.24,
            fill: 'origin',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        layout: {
          padding: {
            top: isCompactChart ? 10 : 18,
            right: isCompactChart ? 2 : 8,
            bottom: isCompactChart ? 2 : 8,
            left: isCompactChart ? 0 : 6
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(18, 18, 18, 0.94)',
            borderColor: 'rgba(255, 255, 255, 0.08)',
            borderWidth: 1,
            titleColor: '#ffffff',
            bodyColor: 'rgba(255, 255, 255, 0.88)',
            displayColors: true,
            callbacks: {
              title: items => items[0] ? this.formatDayLabel(this.dailyActivityRows[items[0].dataIndex].point.day) : '',
              label: contextItem => {
                const row = this.dailyActivityRows[contextItem.dataIndex];
                if (contextItem.dataset.label === 'Active time') {
                  return `Active time: ${this.formatDuration(row.point.active_seconds)}`;
                }

                if (contextItem.dataset.label === 'Bias') {
                  const delta = row.fanPercent - row.activePercent;
                  const direction = delta >= 0 ? 'fan-led' : 'activity-led';
                  return `Bias: ${direction} (${this.formatDecimalNumber(Math.abs(delta))} normalized pts)`;
                }

                return `Fan gain: +${this.formatWholeNumber(row.point.fan_gain)}`;
              },
              afterBody: items => {
                const row = this.dailyActivityRows[items[0].dataIndex];
                const lines = [
                  `Careers: ${row.point.careers}`,
                  `Fans/min: ${this.formatCompactNumber(row.fansPerActiveMinute)}`,
                  `Daily context: ${row.signalLabel}`
                ];

                return lines;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            border: {
              display: false
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.56)',
              font: {
                size: isCompactChart ? 9 : 11,
                weight: 700
              },
              autoSkip: true,
              maxTicksLimit: isCompactChart ? 4 : 7,
              maxRotation: 0,
              minRotation: 0,
              callback: (_value, index) => this.getDailyTickLabel(this.dailyActivityRows[index], index, isCompactChart)
            }
          },
          mirror: {
            type: 'linear',
            position: 'left',
            min: -100,
            max: 100,
            ticks: {
              stepSize: 50,
              color: 'rgba(255, 255, 255, 0.62)',
              font: {
                size: isCompactChart ? 9 : 11,
                weight: 700
              },
              callback: value => {
                const numericValue = Number(value);
                if (numericValue === 0) return 'balance';
                if (numericValue > 0) {
                  return this.formatCompactNumber(this.roundedDailyFanGainMax * (numericValue / 100));
                }

                return this.formatDuration(this.roundedDailyActiveSecondsMax * (Math.abs(numericValue) / 100));
              }
            },
            grid: {
              color: context => context.tick.value === 0 ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.08)'
            },
            border: {
              display: false
            }
          }
        }
      }
    };

    this.dailyChart = new Chart(context, config);
  }

  private destroyDailyChart(): void {
    if (this.dailyChart) {
      this.dailyChart.destroy();
      this.dailyChart = null;
    }
  }

  private buildMonthSegments(points: DailyPoint[]): MonthSegment[] {
    if (!points.length) return [];

    const latestDate = new Date(`${points[points.length - 1].day}T00:00:00`);
    const latestMonthKey = `${latestDate.getFullYear()}-${latestDate.getMonth()}`;
    const previousMonthDate = new Date(latestDate.getFullYear(), latestDate.getMonth() - 1, 1);
    const previousMonthKey = `${previousMonthDate.getFullYear()}-${previousMonthDate.getMonth()}`;
    const total = points.length;
    const segments: Array<{ key: string; count: number; date: Date }> = [];

    for (const point of points) {
      const date = new Date(`${point.day}T00:00:00`);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const current = segments[segments.length - 1];

      if (current?.key === key) {
        current.count += 1;
      } else {
        segments.push({ key, count: 1, date });
      }
    }

    return segments.map(segment => ({
      label: segment.date.toLocaleDateString(undefined, { month: 'short' }),
      widthPercent: segment.count / total * 100,
      kind: segment.key === latestMonthKey ? 'current' : segment.key === previousMonthKey ? 'previous' : 'older'
    }));
  }

  private getCareerBucketLabel(index: number, bucketCount: number): string {
    if (index === bucketCount - 1) return `${index * 5}m+`;
    return `${index * 5}-${(index + 1) * 5}m`;
  }

  private isShameSortBy(value: unknown): value is ShameSortBy {
    return typeof value === 'string' && this.sortOptions.some(option => option.value === value);
  }

  private parseOptionalNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  private updateQueryParams(params: Record<string, unknown>): void {
    const currentParams = this.route.snapshot.queryParams;
    const allParams = { ...currentParams, ...params };
    const finalParams: Record<string, unknown> = {};

    Object.keys(allParams).forEach(key => {
      if (allParams[key] !== null && allParams[key] !== undefined && allParams[key] !== '') {
        finalParams[key] = allParams[key];
      }
    });

    if (finalParams['page'] === 0) delete finalParams['page'];
    if (finalParams['pageSize'] === 50) delete finalParams['pageSize'];
    if (finalParams['sortBy'] === 'score') delete finalParams['sortBy'];
    if (finalParams['minDays'] === this.defaultMinDays) delete finalParams['minDays'];

    this.router.navigate(['/activity'], { queryParams: finalParams });
  }

  private withBuild(message: string): string {
    return this.appVersionService.appendBuildTag(message);
  }
}
