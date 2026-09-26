<script module lang="ts">
  import * as echarts from 'echarts/core';
  import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
  import { AriaComponent, AxisPointerComponent, DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
  import { SVGRenderer } from 'echarts/renderers';
  echarts.use([LineChart, BarChart, PieChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, MarkLineComponent, MarkAreaComponent, AxisPointerComponent, AriaComponent, SVGRenderer]);
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import type { EChartsCoreOption, EChartsType } from 'echarts/core';
  import type { TooltipComponentOption } from 'echarts/components';

  interface Props { option: EChartsCoreOption; label: string; description?: string; height?: number; dismissTouchTooltip?: boolean; zoomable?: boolean; }
  let { option, label, description, height = 280, dismissTouchTooltip = false, zoomable = false }: Props = $props();
  let host: HTMLDivElement;
  let chart = $state.raw<EChartsType>();
  const surfaceId = $props.id();
  const tooltipClass = `chart-tooltip-${surfaceId}`;
  const tooltipElement = () => document.getElementsByClassName(tooltipClass)[0];
  const viewportPosition: TooltipComponentOption['position'] = (point, _params, _element, _rect, size) => {
    const bounds = host.getBoundingClientRect();
    return [
      Math.max(8 - bounds.left, Math.min(point[0] + 12, document.documentElement.clientWidth - bounds.left - size.contentSize[0] - 8)),
      Math.max(8 - bounds.top, Math.min(point[1] + 12, window.innerHeight - bounds.top - size.contentSize[1] - 8))
    ];
  };
  const chartOption = $derived.by(() => {
    const tooltip = option.tooltip as TooltipComponentOption | undefined;
    return tooltip ? { ...option, tooltip: { ...tooltip, className: [tooltipClass, tooltip.className].filter(Boolean).join(' '), appendToBody: true, confine: false, position: tooltip.position ?? viewportPosition } } : option;
  });

  onMount(() => {
    chart = echarts.init(host, undefined, { renderer: 'svg' });
    const observer = new ResizeObserver(() => chart?.resize());
    observer.observe(host);
    let dismissTimer: ReturnType<typeof setTimeout>;
    let touchTooltip = false;
    const hideTooltip = () => {
      touchTooltip = false;
      tooltipElement()?.dispatchEvent(new MouseEvent('mouseleave'));
      chart?.dispatchAction({ type: 'hideTip' }); chart?.dispatchAction({ type: 'downplay' });
    };
    const pointerDown = (event: PointerEvent) => {
      if (!dismissTouchTooltip) return;
      clearTimeout(dismissTimer);
      const insideTooltip = Boolean(tooltipElement()?.contains(event.target as Node));
      touchTooltip = event.pointerType === 'touch' && insideTooltip && Boolean((option.tooltip as TooltipComponentOption | undefined)?.enterable);
      if (!host.contains(event.target as Node) && !insideTooltip) hideTooltip();
    };
    // Touch scrolling can synthesize a mouseleave; keep an entered tooltip open until an outside tap.
    const leaveTooltip = (event: MouseEvent) => { if (touchTooltip && event.target === tooltipElement()) event.stopImmediatePropagation(); };
    const pointerUp = (event: PointerEvent) => {
      if (dismissTouchTooltip && event.pointerType === 'touch' && !(option.tooltip as TooltipComponentOption | undefined)?.enterable) {
        clearTimeout(dismissTimer); dismissTimer = setTimeout(hideTooltip, 2000);
      }
    };
    document.addEventListener('pointerdown', pointerDown, { passive: true });
    document.addEventListener('mouseleave', leaveTooltip, true);
    host.addEventListener('pointerup', pointerUp, { passive: true });
    host.addEventListener('pointercancel', pointerUp, { passive: true });
    return () => {
      clearTimeout(dismissTimer); document.removeEventListener('pointerdown', pointerDown);
      document.removeEventListener('mouseleave', leaveTooltip, true);
      host.removeEventListener('pointerup', pointerUp); host.removeEventListener('pointercancel', pointerUp);
      observer.disconnect(); chart?.dispose(); chart = undefined;
    };
  });

  $effect(() => { if (chart) chart.setOption(chartOption, { notMerge: true }); });

  function navigate(event: KeyboardEvent): void {
    if (!zoomable || !chart || !['+', '=', '-', 'ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
    event.preventDefault();
    const current = (chart.getOption().dataZoom as Array<{ start:number; end:number }> | undefined)?.[0];
    if (!current) return;
    const span = current.end - current.start, center = (current.start + current.end) / 2;
    let start = current.start, end = current.end;
    if (event.key === 'Home') { start = 0; end = 100; }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const shift = (event.key === 'ArrowLeft' ? -1 : 1) * span * .2;
      start = Math.max(0, Math.min(100 - span, start + shift)); end = start + span;
    } else {
      const nextSpan = Math.min(100, Math.max(5, span * (event.key === '-' ? 1.5 : 1 / 1.5)));
      start = Math.max(0, Math.min(100 - nextSpan, center - nextSpan / 2)); end = start + nextSpan;
    }
    chart.dispatchAction({ type:'dataZoom', start, end });
  }
</script>

<figure aria-label={label} style:--chart-height={`${height}px`}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Zoomable charts accept keyboard zoom and pan controls.) -->
  <div bind:this={host} class="chart-host" role={zoomable ? 'group' : undefined} tabindex={zoomable ? 0 : undefined} aria-hidden={zoomable ? undefined : true} aria-label={zoomable ? `${label}. Plus and minus zoom; arrow keys pan; Home resets.` : undefined} onkeydown={navigate}></div>
  {#if description}<figcaption>{description}</figcaption>{/if}
</figure>

<style>
  figure { min-width: 0; margin: 0; }
  .chart-host { width: 100%; height: var(--chart-height); min-height: 180px; }
  figcaption { margin-top: 5px; color: var(--color-text-muted); font-size: 10px; line-height: 1.4; }
</style>
