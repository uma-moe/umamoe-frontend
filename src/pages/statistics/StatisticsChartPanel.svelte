<script lang="ts">
  import type { EChartsCoreOption } from 'echarts/core';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';

  let {
    id,
    title,
    description,
    option,
    height = 300
  }: {
    id?: string;
    title: string;
    description: string;
    option: EChartsCoreOption;
    height?: number;
  } = $props();

  const series = $derived(
    (Array.isArray(option.series) ? option.series : [option.series]) as Array<
      { data?: unknown[] } | undefined
    >
  );
  const hasData = $derived(series.some((entry) => entry?.data?.length));
</script>

<div class="statistics-chart">
  <ChartFrame
    id={id ?? title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}
    {title}
    {description}
    state={hasData ? 'ready' : 'empty'}
    emptyTitle="No data available"
    emptyDetail="Try a broader selection or a different dataset."
  >
    <LazyEChartsSurface
      {option}
      label={title + ' chart'}
      {height}
    />
  </ChartFrame>
</div>

<style>
  .statistics-chart {
    min-width: 0;
  }
  .statistics-chart :global(.chart-frame) {
    padding: 12px;
    gap: 8px;
  }
  .statistics-chart :global(figcaption h3) {
    font-size: 14px;
  }
  .statistics-chart :global(figcaption p) {
    font-size: 11px;
    line-height: 1.5;
    margin-top: 4px;
  }
  @media (max-width: 600px) {
    .statistics-chart :global(.chart-frame) {
      padding: 10px;
    }
  }
</style>
