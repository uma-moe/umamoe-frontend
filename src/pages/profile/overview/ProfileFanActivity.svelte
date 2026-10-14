<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { EChartsCoreOption } from 'echarts/core';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Button from '@/components/controls/Button.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import { theme } from '@/stores/theme';
  import { communityRepository } from '@/pages/clubs/community-repository';
  import {
    buildProfileDailyFans,
    formatProfileNumber as format,
    type ProfileFanPoint
  } from '@/lib/profile/profile-display';
  import type { MonthlyFans } from '../profile-repository';

  let {
    accountId,
    monthly,
    actions: visibilityActions
  }: { accountId: string; monthly: MonthlyFans[]; actions?: Snippet } = $props();

  let selectedYear = $state('');
  let points = $state<ProfileFanPoint[]>([]);
  let loading = $state(false);
  let error = $state('');
  let retry = $state(0);
  let reset = $state(0);
  let plotHeight = $state(250);

  const years = $derived([...new Set(monthly.map((month) => month.year))].sort((a, b) => b - a));
  const yearOptions = $derived(years.map((year) => ({ value: String(year), label: String(year) })));
  const year = $derived(years.find((year) => String(year) === selectedYear) ?? years[0]);
  const hasPoints = $derived(points.some((point) => point.total !== null));

  $effect(() => {
    const chosenYear = year,
      trainer = accountId;
    retry;
    const periods = [
      ...new Map(
        monthly
          .filter((month) => month.year === chosenYear && month.circle_id)
          .map((month) => [`${month.month}:${month.circle_id}`, month])
      ).values()
    ];
    let active = true;
    points = [];
    error = '';
    loading = periods.length > 0;
    if (chosenYear !== undefined && periods.length) {
      Promise.allSettled(
        periods.map((period) =>
          communityRepository.clubDetails(period.circle_id, chosenYear, period.month)
        )
      ).then((results) => {
        if (!active) return;
        const members = results.flatMap((result, index) =>
          result.status === 'fulfilled'
            ? result.value.members.filter(
                (member) =>
                  String(member.viewer_id) === trainer &&
                  member.year === chosenYear &&
                  member.month === periods[index]!.month
              )
            : []
        );
        points = buildProfileDailyFans(members, chosenYear);
        if (results.some((result) => result.status === 'rejected'))
          error = 'Some daily history could not be loaded.';
        loading = false;
      });
    }
    return () => {
      active = false;
    };
  });

  function tooltip(params: unknown): HTMLElement {
    const item = (Array.isArray(params) ? params[0] : params) as { dataIndex?: number } | undefined;
    const point = points[item?.dataIndex ?? 0],
      body = document.createElement('div');
    if (!point) return body;
    const title = document.createElement('strong');
    title.textContent = point.label;
    body.append(title);
    if (point.total === null) {
      const row = document.createElement('div');
      row.textContent = 'No recorded snapshot';
      body.append(row);
    }
    const rows: Array<[string, number | null | undefined, boolean?]> = [
      ['Total fans', point.total],
      ['Change since prior snapshot', point.gain, true]
    ];
    for (const [label, value, signed] of rows) {
      if (value == null || !Number.isFinite(value)) continue;
      const row = document.createElement('div');
      row.textContent = `${label}: ${signed && value > 0 ? '+' : ''}${value.toLocaleString()}`;
      body.append(row);
    }
    return body;
  }

  const option = $derived.by((): EChartsCoreOption => {
    $theme;
    reset;
    const tokens = getComputedStyle(document.documentElement);
    const color = (name: string) => tokens.getPropertyValue(name).trim();
    const text = color('--text-secondary'),
      accent = color('--accent-primary'),
      border = color('--border-primary');
    return {
      animation: false,
      grid: { left: 8, right: 8, top: 24, bottom: 52, containLabel: true },
      xAxis: {
        type: 'category',
        name: 'Day',
        nameLocation: 'middle',
        nameGap: 26,
        boundaryGap: false,
        data: points.map((point) => point.label),
        nameTextStyle: { color: text, fontSize: 11 },
        axisLabel: {
          color: text,
          fontSize: 11,
          showMinLabel: true,
          showMaxLabel: true,
          alignMaxLabel: 'right'
        },
        axisLine: { lineStyle: { color: border } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        name: 'Fans',
        nameTextStyle: { color: text, align: 'left', fontSize: 11 },
        scale: true,
        splitNumber: 4,
        axisLabel: { color: text, fontSize: 11, formatter: format },
        splitLine: { lineStyle: { color: border, type: 'dashed' } }
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: color('--bg-secondary'),
        borderColor: border,
        textStyle: { color: text, fontSize: 12 },
        formatter: tooltip
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          start: 0,
          end: 100,
          zoomOnMouseWheel: 'ctrl',
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
          preventDefaultMouseMove: false,
          minValueSpan: 1,
          filterMode: 'none'
        },
        {
          type: 'slider',
          xAxisIndex: 0,
          bottom: 4,
          left: 8,
          right: 8,
          height: 20,
          showDetail: false,
          brushSelect: false,
          moveHandleSize: 0,
          handleIcon: 'path://M-5,-10 L5,-10 L5,10 L-5,10 Z',
          handleSize: '110%',
          borderColor: border,
          backgroundColor: color('--bg-secondary'),
          fillerColor: color('--color-accent-soft'),
          dataBackground: {
            lineStyle: { color: accent },
            areaStyle: { color: accent, opacity: 0.07 }
          },
          selectedDataBackground: {
            lineStyle: { color: accent },
            areaStyle: { color: accent, opacity: 0.15 }
          },
          handleStyle: { color: accent, borderColor: accent }
        }
      ],
      series: [
        {
          name: 'Total fans',
          type: 'line',
          data: points.map((point) => point.total),
          connectNulls: false,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { color: accent, width: 2 },
          itemStyle: { color: accent },
          areaStyle: { color: accent, opacity: 0.07 }
        }
      ]
    };
  });
</script>

<div class="fan-activity">
  <ChartFrame
    id="profile-fan-activity"
    title="Fan activity"
    description="Daily totals · Drag handles to zoom"
    legend={[{ label: 'Total fans', color: 'var(--accent-primary)' }]}
  >
    {#snippet actions()}
      {@render visibilityActions?.()}
      {#if year !== undefined}
        <div class="year-picker">
          <SelectField
            id="fan-activity-year"
            label="Fan activity year"
            hideLabel
            options={yearOptions}
            value={String(year)}
            onchange={(value) => (selectedYear = value)}
          />
        </div>
      {/if}
      <IconButton
        icon="refresh"
        label="Reset zoom"
        title="Reset zoom"
        size="sm"
        disabled={!hasPoints || loading}
        onclick={() => reset++}
      />
    {/snippet}
    <div class="fan-content">
      {#if loading}
        <p
          class="chart-state"
          role="status"
        >
          Loading daily snapshots…
        </p>
      {:else if error && !hasPoints}
        <div
          class="chart-state"
          role="alert"
        >
          <p>{error}</p>
          <Button
            variant="secondary"
            size="sm"
            onclick={() => retry++}
          >
            Retry
          </Button>
        </div>
      {:else if !hasPoints}
        <p class="chart-state">No daily snapshots for this year. Choose another year.</p>
      {:else}
        {#if error}
          <div
            class="partial-error"
            role="alert"
          >
            <span>{error}</span>
            <Button
              variant="ghost"
              size="sm"
              onclick={() => retry++}
            >
              Retry
            </Button>
          </div>
        {/if}
        <div
          class="fan-plot"
          bind:clientHeight={plotHeight}
        >
          <div class="fan-surface">
            <LazyEChartsSurface
              {option}
              height={plotHeight}
              label="Daily total fan progression"
              dismissTouchTooltip
              zoomable
            />
          </div>
        </div>
      {/if}
    </div>
  </ChartFrame>
</div>

<style>
  .fan-activity {
    min-width: 0;
    display: grid;
  }
  .fan-activity :global(.chart-frame > figcaption) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px 8px;
  }
  .fan-activity :global(.chart-heading),
  .fan-activity :global(.chart-tools) {
    display: contents;
  }
  .fan-activity :global(.title-row) {
    grid-column: 1;
    grid-row: 1;
  }
  .fan-activity :global(.chart-heading > p) {
    grid-column: 1;
    grid-row: 2;
    margin: 0;
  }
  .fan-activity :global(.chart-actions) {
    grid-column: 2;
    grid-row: 1;
  }
  .fan-activity :global(.legend) {
    grid-column: 2;
    grid-row: 2;
  }
  .fan-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .year-picker {
    width: 82px;
    --control-height: 32px;
  }
  .partial-error {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--font-xs);
  }
  .fan-plot {
    position: relative;
    flex: 1;
    min-height: 250px;
  }
  .fan-surface {
    position: absolute;
    inset: 0;
  }
  .chart-state {
    flex: 1;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: var(--space-2);
    min-height: 250px;
    margin: 0;
    padding: var(--space-3);
    color: var(--color-text-muted);
    font-size: var(--font-sm);
    text-align: center;
  }
  .chart-state p {
    margin: 0;
  }
</style>
