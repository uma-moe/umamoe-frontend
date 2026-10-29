<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte';
  import type { Attachment } from 'svelte/attachments';
  import IconButton from '@/components/controls/IconButton.svelte';
  import Icon from '@/components/Icon.svelte';
  import Button from '@/components/controls/Button.svelte';
  import ToggleButton from '@/components/controls/ToggleButton.svelte';
  import SkillDialog from './SkillDialog.svelte';
  import { placeIcons } from './icon-layout';
  import { placeLabels } from './label-layout';
  import {
    linearPercent,
    linearValueAt,
    niceTicks,
    rootAt,
    valueAxis,
    valuePercent,
    valueTicks,
    type LinearAxis
  } from './scatter-scale';
  import {
    MAX_ZOOM,
    WHOLE_PLOT,
    inView,
    isZoomed,
    panBy,
    zoomAt,
    zoomOf,
    type PlotWindow,
    type ViewPoint
  } from './scatter-zoom';

  export interface PlottedSkill {
    skillId: number;
    name: string;
    image?: string;
    tier: 'white' | 'gold' | 'inherited';
    x: number;
    /** Lengths or win points, as `format` shows them. */
    y: number;
    xLabel: string;
    /** Dimmed when a search leaves it out. */
    matches: boolean;
    searchMatch: boolean;
  }

  export interface QuadrantLabels {
    topLeft: string;
    topRight: string;
    bottomLeft: string;
    bottomRight: string;
  }

  /** How horizontal values read: multiplied by `scale`, then followed by `suffix` (" m", "%", " SP"). */
  export interface AxisUnit {
    scale: number;
    suffix: string;
  }

  interface Props {
    /** Most valuable first: those keep their exact point and their name when space runs short. */
    points: PlottedSkill[];
    xAxis: LinearAxis;
    xUnit: AxisUnit;
    xTitle: string;
    /** Where the plot divides left from right, and strong from weaker. */
    xSplit: number;
    ySplit: number;
    yTitle: string;
    format: (value: number) => string;
    quadrants: QuadrantLabels;
    /** Changes when the axes come to mean something else; the zoom then returns to the whole plot. */
    viewKey: string;
    /** A skill's details, opened beside the selected icon. */
    details: Snippet<[number]>;
    comparedSkillIds: ReadonlySet<number>;
    oncompare: (skillId: number) => void;
    onclearcomparison: () => void;
  }

  let {
    points,
    xAxis,
    xUnit,
    xTitle,
    xSplit,
    ySplit,
    yTitle,
    format,
    quadrants,
    viewKey,
    details,
    comparedSkillIds,
    oncompare,
    onclearcomparison
  }: Props = $props();

  const detailsId = $props.id();
  const LABEL_HEIGHT = 18;
  /** A quadrant's name shows only while this much of it is in view. */
  const QUADRANT_LABEL_ROOM = { width: 170, height: 40 };
  /** Pointer travel, in pixels, past which a press is a drag rather than a click. */
  const DRAG_THRESHOLD = 4;
  const ZOOM_STEP = 1.6;
  /** Pixels a tick label keeps from the median's label on the value axis. */
  const MEDIAN_CLEARANCE = 22;

  let viewportWidth = $state(0);
  let viewportHeight = $state(0);
  let plotWindow = $state<PlotWindow>(WHOLE_PLOT);
  let pinnedId = $state<number>();
  let previewId = $state<number>();
  let selectedButton = $state<HTMLButtonElement>();
  let dragging = $state(false);
  let labelFont = $state('');

  let viewport: HTMLDivElement;
  let measureContext: CanvasRenderingContext2D | null = null;
  const labelWidths = new Map<string, number>();
  const pointers = new Map<number, ViewPoint>();
  let pressTravel = 0;
  let pressOnIcon = false;
  let previewCloseTimer: ReturnType<typeof setTimeout> | undefined;

  const iconSize = $derived(viewportWidth < 600 ? 22 : 30);
  const zoom = $derived(zoomOf(plotWindow));
  const zoomed = $derived(isZoomed(plotWindow));
  const yAxis = $derived(valueAxis(points.map((point) => point.y)));

  const onScreen = $derived(
    points.flatMap((point) => {
      const x = screenX(linearPercent(point.x, xAxis) / 100);
      const y = screenY(valuePercent(point.y, yAxis) / 100);
      const visible = x >= 0 && x <= viewportWidth && y >= 0 && y <= viewportHeight;
      return visible ? [{ point, x, y }] : [];
    })
  );
  const pointsById = $derived(new Map(points.map((point) => [point.skillId, point])));
  const placed = $derived(
    viewportWidth > 0 && viewportHeight > 0
      ? placeIcons(
          onScreen.map(({ point, x, y }) => ({ id: point.skillId, x, y })),
          { width: viewportWidth, height: viewportHeight, size: iconSize, gap: 3 }
        )
      : []
  );
  const labels = $derived(
    labelFont === ''
      ? []
      : placeLabels(
          placed
            .map((icon) => ({
              id: icon.id,
              x: icon.x,
              y: icon.y,
              labelWidth: labelWidth(labelText(pointsById.get(icon.id))),
              priority: highlighted(icon.id)
            }))
            .sort((left, right) => highlightRank(right.id) - highlightRank(left.id)),
          {
            width: viewportWidth,
            height: viewportHeight,
            iconSize,
            labelHeight: LABEL_HEIGHT,
            gap: 3
          }
        )
  );

  const yTicks = $derived(
    valueTicks(rootAt(plotWindow.bottom, yAxis), rootAt(plotWindow.top, yAxis)).map((value) => ({
      value,
      y: screenY(valuePercent(value, yAxis) / 100)
    }))
  );
  const xTicks = $derived.by(() => {
    const from = Math.max(linearValueAt(plotWindow.left, xAxis), xAxis.min);
    const to = Math.min(linearValueAt(plotWindow.right, xAxis), xAxis.max);
    const count = viewportWidth < 600 ? 4 : 6;
    return niceTicks({ min: from * xUnit.scale, max: to * xUnit.scale }, count).map((tick) => ({
      label: `${tick}${xUnit.suffix}`,
      x: screenX(linearPercent(tick / xUnit.scale, xAxis) / 100)
    }));
  });

  const splitX = $derived(clamp(screenX(linearPercent(xSplit, xAxis) / 100), 0, viewportWidth));
  const splitY = $derived(clamp(screenY(valuePercent(ySplit, yAxis) / 100), 0, viewportHeight));
  const medianVisible = $derived(splitY > 0 && splitY < viewportHeight);
  /** Tick values give way to the median's where they would touch it. */
  const yTickLabels = $derived(
    yTicks.filter((tick) => !medianVisible || Math.abs(tick.y - splitY) > MEDIAN_CLEARANCE)
  );
  const quadrantShown = $derived({
    topLeft: roomFor(splitX, splitY),
    topRight: roomFor(viewportWidth - splitX, splitY),
    bottomLeft: roomFor(splitX, viewportHeight - splitY),
    bottomRight: roomFor(viewportWidth - splitX, viewportHeight - splitY)
  });

  const activeId = $derived(pinnedId ?? previewId);
  const activeIcon = $derived(
    activeId === undefined ? undefined : placed.find((icon) => icon.id === activeId)
  );

  function highlightRank(skillId: number): number {
    if (pointsById.get(skillId)?.searchMatch) return 2;
    return comparedSkillIds.has(skillId) ? 1 : 0;
  }

  function highlighted(skillId: number): boolean {
    return highlightRank(skillId) > 0;
  }

  function isDimmed(point: PlottedSkill): boolean {
    return !point.matches && !highlighted(point.skillId);
  }

  // Keep the dialog anchored when comparison moves a marker into the foreground layer.
  function followActiveMarker(skillId: number): Attachment<HTMLButtonElement> {
    return (element) => {
      if (skillId === activeId) selectedButton = element;
    };
  }

  function labelText(point: PlottedSkill | undefined): string {
    if (!point) return '';
    const search = point.searchMatch ? ' · Search match' : '';
    const compared = comparedSkillIds.has(point.skillId) ? ' · Compare' : '';
    return point.name + search + compared;
  }

  function clamp(value: number, low: number, high: number): number {
    return Math.min(Math.max(value, low), high);
  }

  function screenX(share: number): number {
    return inView(share, plotWindow.left, plotWindow.right) * viewportWidth;
  }

  function screenY(share: number): number {
    return inView(share, plotWindow.top, plotWindow.bottom) * viewportHeight;
  }

  function roomFor(width: number, height: number): boolean {
    return width >= QUADRANT_LABEL_ROOM.width && height >= QUADRANT_LABEL_ROOM.height;
  }

  /** A name's label width in pixels: its text in the label font, plus the label's padding. */
  function labelWidth(name: string): number {
    const known = labelWidths.get(name);
    if (known !== undefined) return known;

    measureContext ??= document.createElement('canvas').getContext('2d');
    if (measureContext === null) return Infinity;

    measureContext.font = labelFont;
    const width = Math.ceil(measureContext.measureText(name).width) + 12;
    labelWidths.set(name, width);
    return width;
  }

  /** Where an event happened in the view, as shares of its width and height. */
  function viewPointOf(event: { clientX: number; clientY: number }): ViewPoint {
    const bounds = viewport.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / Math.max(1, bounds.width),
      y: (event.clientY - bounds.top) / Math.max(1, bounds.height)
    };
  }

  function zoomBy(factor: number, focus: ViewPoint = { x: 0.5, y: 0.5 }) {
    plotWindow = zoomAt(plotWindow, focus, factor);
  }

  function showWholePlot() {
    plotWindow = WHOLE_PLOT;
  }

  function togglePinned(skillId: number, event: MouseEvent) {
    event.preventDefault();
    // A press that moved the plot is a drag, not a tap on the icon under it; a key press (detail 0) always counts.
    if (event.detail > 0 && pressTravel > DRAG_THRESHOLD) return;

    keepPreview();
    previewId = undefined;
    selectedButton = event.currentTarget as HTMLButtonElement;
    pinnedId = pinnedId === skillId ? undefined : skillId;
  }

  function previewSkill(skillId: number, event: PointerEvent) {
    if (event.pointerType !== 'mouse' || pinnedId !== undefined || dragging) return;
    if (!matchMedia('(min-width: 768px) and (hover: hover)').matches) return;

    keepPreview();
    selectedButton = event.currentTarget as HTMLButtonElement;
    previewId = skillId;
  }

  function keepPreview() {
    clearTimeout(previewCloseTimer);
  }

  function leavePreview() {
    keepPreview();
    if (pinnedId !== undefined) return;

    // Leave time to cross the gap from the icon into its dialog.
    previewCloseTimer = setTimeout(() => (previewId = undefined), 180);
  }

  function closeDetails() {
    keepPreview();
    pinnedId = undefined;
    previewId = undefined;
  }

  function startPress(event: PointerEvent) {
    if (event.button !== 0) return;

    pointers.set(event.pointerId, viewPointOf(event));
    pressTravel = 0;
    pressOnIcon = event.target instanceof Element && event.target.closest('.skill-dot') !== null;
  }

  /** Keep the chart in the remaining page height as controls and viewport size change. */
  const fitAvailableHeight: Attachment<HTMLDivElement> = (element) => {
    let frame = 0;

    function fit() {
      const pageTop = element.getBoundingClientRect().top + window.scrollY;
      const minimum = matchMedia('(max-width: 767px)').matches ? 360 : 420;
      const height = Math.max(minimum, window.innerHeight - pageTop - 24);
      element.style.setProperty('--chart-height', height + 'px');
    }

    function scheduleFit() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    }

    const observer = new ResizeObserver(scheduleFit);
    const page = element.closest('figure')?.parentElement;
    if (page) observer.observe(page);

    window.addEventListener('resize', scheduleFit);
    fit();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', scheduleFit);
    };
  };

  /** One pointer drags the zoomed plot; two pinch it. */
  function movePress(event: PointerEvent) {
    const previous = pointers.get(event.pointerId);
    if (previous === undefined) return;

    const current = viewPointOf(event);
    if (pointers.size === 2) {
      const [other] = [...pointers].filter(([id]) => id !== event.pointerId);
      const otherPoint = other![1];
      const before = Math.hypot(previous.x - otherPoint.x, previous.y - otherPoint.y);
      const after = Math.hypot(current.x - otherPoint.x, current.y - otherPoint.y);
      const midpoint = { x: (current.x + otherPoint.x) / 2, y: (current.y + otherPoint.y) / 2 };
      if (before > 0) zoomBy(after / before, midpoint);
    } else if (zoomed) {
      plotWindow = panBy(plotWindow, { x: current.x - previous.x, y: current.y - previous.y });
    }

    pressTravel += Math.hypot(
      (current.x - previous.x) * viewportWidth,
      (current.y - previous.y) * viewportHeight
    );
    pointers.set(event.pointerId, current);
    // Captured only once it is a drag: capturing a tap would take its click away from the icon under it.
    if (!dragging && pressTravel > DRAG_THRESHOLD) {
      dragging = true;
      previewId = undefined;
      viewport.setPointerCapture(event.pointerId);
    }
  }

  /** A tap on the background lets go of the pinned skill; a tap on an icon is its own click. */
  function endPress(event: PointerEvent) {
    if (!pointers.delete(event.pointerId)) return;

    if (!pressOnIcon && pressTravel <= DRAG_THRESHOLD) closeDetails();
    if (pointers.size === 0) dragging = false;
  }

  function zoomIntoPoint(event: MouseEvent) {
    if (event.target instanceof Element && event.target.closest('.skill-dot')) return;

    zoomBy(2, viewPointOf(event));
  }

  function handleKeys(event: KeyboardEvent) {
    if (event.target instanceof Element && event.target.closest('[popover], dialog')) return;

    if (event.key === '+' || event.key === '=') zoomBy(ZOOM_STEP);
    else if (event.key === '-') zoomBy(1 / ZOOM_STEP);
    else if (event.key === '0') showWholePlot();
    else return;

    event.preventDefault();
  }

  /** The wheel and trackpad pinch zoom around the pointer while it is over the plot. */
  const wheelZoom: Attachment<HTMLDivElement> = (element) => {
    labelFont = `600 11px ${getComputedStyle(element).fontFamily}`;

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const perStep = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 0.05 : 0.0025;
      zoomBy(Math.exp(-event.deltaY * perStep), viewPointOf(event));
    }

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
    };
  };

  // New axes mean the old window shows something else: start again from the whole plot.
  $effect(() => {
    void viewKey;
    plotWindow = WHOLE_PLOT;
    closeDetails();
  });

  onDestroy(keepPreview);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<figure
  class="skill-scatter"
  style:--icon-size={`${iconSize}px`}
  onkeydown={handleKeys}
>
  <div class="toolbar">
    <p class="hint">
      <span class="with-hover">
        Hover a skill to preview; click to keep it open. Scroll or pinch to zoom.
      </span>
      <span class="with-touch">Tap a skill for its details. Pinch to zoom.</span>
      {#if zoomed}
        Drag to pan.
      {/if}
    </p>
    <div
      class="zoom"
      role="group"
      aria-label="Zoom"
    >
      <IconButton
        icon="minus"
        size="sm"
        label="Zoom out"
        disabled={!zoomed}
        onclick={() => zoomBy(1 / ZOOM_STEP)}
      />
      <output aria-live="polite">{zoom.toFixed(1)}×</output>
      <IconButton
        icon="add"
        size="sm"
        label="Zoom in"
        disabled={zoom >= MAX_ZOOM - 0.001}
        onclick={() => zoomBy(ZOOM_STEP)}
      />
      <IconButton
        icon="refresh"
        size="sm"
        label="Show the whole plot"
        disabled={!zoomed}
        onclick={showWholePlot}
      />
    </div>
  </div>

  <div
    class="plot-area"
    class:comparing={comparedSkillIds.size > 0}
    style:--split-left={`calc(${splitX}px + var(--plot-left))`}
    style:--split-top={`calc(${splitY}px + var(--plot-top))`}
    {@attach fitAvailableHeight}
  >
    <div
      class="quadrants"
      aria-hidden="true"
    >
      {#if quadrantShown.topLeft}
        <span class="quadrant top-left">{quadrants.topLeft}</span>
      {/if}
      {#if quadrantShown.topRight}
        <span class="quadrant top-right">{quadrants.topRight}</span>
      {/if}
      {#if quadrantShown.bottomLeft}
        <span class="quadrant bottom-left">{quadrants.bottomLeft}</span>
      {/if}
      {#if quadrantShown.bottomRight}
        <span class="quadrant bottom-right">{quadrants.bottomRight}</span>
      {/if}
    </div>

    {#if comparedSkillIds.size > 0}
      <div class="comparison-controls">
        <span>{comparedSkillIds.size} compared</span>
        <Button
          variant="secondary"
          size="sm"
          icon="close"
          ariaLabel="Clear comparison"
          onclick={onclearcomparison}
        >
          Clear
        </Button>
      </div>
    {/if}
    <div
      class="y-title"
      title={yTitle}
    >
      {yTitle}
    </div>
    <div
      class="y-axis"
      aria-hidden="true"
    >
      {#each yTickLabels as tick (tick.value)}
        <span style:top={`${tick.y}px`}>{format(tick.value)}</span>
      {/each}
      {#if medianVisible}
        <span
          class="median"
          style:top={`${splitY}px`}
        >
          {format(ySplit)}
          <small>median</small>
        </span>
      {/if}
    </div>

    <div
      class="viewport"
      class:zoomed
      class:dragging
      role="group"
      aria-label={`${points.length} skills by ${xTitle.toLowerCase()} and ${yTitle.toLowerCase()}`}
      bind:this={viewport}
      bind:clientWidth={viewportWidth}
      bind:clientHeight={viewportHeight}
      onpointerdown={startPress}
      onpointermove={movePress}
      onpointerup={endPress}
      onpointercancel={endPress}
      ondblclick={zoomIntoPoint}
      {@attach wheelZoom}
    >
      {#each yTicks as tick (tick.value)}
        <div
          class="grid-row"
          class:zero={tick.value === 0}
          style:top={`${tick.y}px`}
          aria-hidden="true"
        ></div>
      {/each}

      {#each xTicks as tick (tick.label)}
        <div
          class="grid-column"
          style:left={`${tick.x}px`}
          aria-hidden="true"
        ></div>
      {/each}

      {#if medianVisible}
        <div
          class="median-line"
          style:top={`${splitY}px`}
          aria-hidden="true"
        ></div>
      {/if}

      {#each [true, false] as dimmed (dimmed)}
        <div
          class="skill-layer"
          class:dimmed
        >
          {#each labels as label (label.id)}
            {@const point = pointsById.get(label.id)}
            {#if point && isDimmed(point) === dimmed}
              <span
                class="name"
                class:dimmed
                class:search-match={point.searchMatch}
                class:compared={comparedSkillIds.has(point.skillId)}
                class:active={label.id === activeId}
                style:left={`${label.x}px`}
                style:top={`${label.y}px`}
                aria-hidden="true"
              >
                <span class="label-name">{point.name}</span>
                {#if point.searchMatch}
                  <small class="search-tag">Search match</small>
                {/if}
                {#if comparedSkillIds.has(point.skillId)}
                  <small class="compare-tag">Compare</small>
                {/if}
              </span>
            {/if}
          {/each}

          {#each placed as icon (icon.id)}
            {@const point = pointsById.get(icon.id)}
            {#if point && isDimmed(point) === dimmed}
              <button
                type="button"
                class={`skill-dot tier-${point.tier}`}
                class:dimmed
                class:search-match={point.searchMatch}
                class:compared={comparedSkillIds.has(point.skillId)}
                class:active={icon.id === activeId}
                class:pinned={icon.id === pinnedId}
                style:left={`${icon.x}px`}
                style:top={`${icon.y}px`}
                aria-label={`${point.name}: ${format(point.y)}, ${point.xLabel}${point.searchMatch ? ', search match' : ''}${comparedSkillIds.has(point.skillId) ? ', compared' : ''}`}
                aria-haspopup="dialog"
                aria-expanded={icon.id === activeId}
                aria-controls={icon.id === activeId ? detailsId : undefined}
                popovertarget={icon.id === activeId ? detailsId : undefined}
                onpointerenter={(event) => previewSkill(icon.id, event)}
                onpointerleave={leavePreview}
                onclick={(event) => togglePinned(icon.id, event)}
                {@attach followActiveMarker(icon.id)}
              >
                {#if point.image}
                  <img
                    src={point.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable="false"
                  />
                {:else}
                  <span class="fallback">{point.name.slice(0, 1)}</span>
                {/if}
                {#if point.searchMatch}
                  <span
                    class="marker-mark search-mark"
                    aria-hidden="true"
                  >
                    <Icon
                      name="search"
                      size={10}
                    />
                  </span>
                {:else if comparedSkillIds.has(point.skillId)}
                  <span
                    class="marker-mark compare-mark"
                    aria-hidden="true"
                  >
                    <Icon
                      name="swap"
                      size={10}
                    />
                  </span>
                {/if}
              </button>
            {/if}
          {/each}
        </div>
      {/each}
    </div>

    {#if activeIcon && selectedButton}
      {@const selectedId = activeIcon.id}
      {#key selectedId}
        <SkillDialog
          id={detailsId}
          label={`${pointsById.get(activeIcon.id)?.name ?? 'Skill'} details`}
          anchor={selectedButton}
          anchorPosition={activeIcon}
          persistent={pinnedId === selectedId}
          onpointerenter={keepPreview}
          onpointerleave={leavePreview}
          onclose={() => {
            if (activeId === selectedId) closeDetails();
          }}
        >
          {#snippet headerActions()}
            <ToggleButton
              label="Compare"
              icon="swap"
              size="sm"
              pressed={comparedSkillIds.has(selectedId)}
              onclick={() => oncompare(selectedId)}
            />
          {/snippet}
          {@render details(activeIcon.id)}
        </SkillDialog>
      {/key}
    {/if}
    <div
      class="x-axis"
      aria-hidden="true"
    >
      {#each xTicks as tick (tick.label)}
        <span style:left={`${tick.x}px`}>{tick.label}</span>
      {/each}
    </div>
    <div class="x-title">{xTitle}</div>
  </div>
</figure>

<style>
  @import './skill-scatter.css';
</style>
