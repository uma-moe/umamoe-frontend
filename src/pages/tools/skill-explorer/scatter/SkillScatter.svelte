<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Attachment } from 'svelte/attachments';
  import IconButton from '@/components/controls/IconButton.svelte';
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
    /** A skill's details, shown beside it while it is hovered, focused or tapped. */
    details: Snippet<[number]>;
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
    details
  }: Props = $props();

  const detailsId = $props.id();
  /** The card's widest, and the room kept between it and the icon it describes. */
  const CARD_WIDTH = 300;
  const CARD_GAP = 12;
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
  let hoveredId = $state<number>();
  let focusedId = $state<number>();
  let pinnedId = $state<number>();
  let dragging = $state(false);
  let wheelHint = $state(false);
  let cardHeight = $state(0);
  let labelFont = $state('');

  let viewport: HTMLDivElement;
  let measureContext: CanvasRenderingContext2D | null = null;
  const labelWidths = new Map<string, number>();
  const pointers = new Map<number, ViewPoint>();
  let pressTravel = 0;
  let pressOnIcon = false;
  let wheelHintTimer: ReturnType<typeof setTimeout> | undefined;

  const iconSize = $derived(viewportWidth < 600 ? 22 : 30);
  const cardWidth = $derived(Math.min(CARD_WIDTH, viewportWidth));
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
          placed.map((icon) => ({
            id: icon.id,
            x: icon.x,
            y: icon.y,
            labelWidth: labelWidth(pointsById.get(icon.id)?.name ?? '')
          })),
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

  const activeId = $derived(hoveredId ?? focusedId ?? pinnedId);
  const activeIcon = $derived(
    activeId === undefined ? undefined : placed.find((icon) => icon.id === activeId)
  );
  const card = $derived.by(() => {
    if (activeIcon === undefined || dragging) return undefined;

    const roomRight = viewportWidth - activeIcon.x - iconSize / 2 - CARD_GAP;
    const onRight = roomRight >= cardWidth || activeIcon.x < viewportWidth / 2;
    const left = onRight
      ? activeIcon.x + iconSize / 2 + CARD_GAP
      : activeIcon.x - iconSize / 2 - CARD_GAP - cardWidth;
    const top = clamp(activeIcon.y - cardHeight / 2, 0, Math.max(0, viewportHeight - cardHeight));
    return { id: activeIcon.id, left: clamp(left, 0, Math.max(0, viewportWidth - cardWidth)), top };
  });

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
    // A press that moved the plot is a drag, not a tap on the icon under it; a key press (detail 0) always counts.
    if (event.detail > 0 && pressTravel > DRAG_THRESHOLD) return;

    pinnedId = pinnedId === skillId ? undefined : skillId;
  }

  function startPress(event: PointerEvent) {
    if (event.button !== 0) return;

    pointers.set(event.pointerId, viewPointOf(event));
    pressTravel = 0;
    pressOnIcon = event.target instanceof Element && event.target.closest('.skill-dot') !== null;
  }

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
      viewport.setPointerCapture(event.pointerId);
    }
  }

  /** A tap on the background lets go of the pinned skill; a tap on an icon is its own click. */
  function endPress(event: PointerEvent) {
    if (!pointers.delete(event.pointerId)) return;

    if (!pressOnIcon && pressTravel <= DRAG_THRESHOLD) pinnedId = undefined;
    if (pointers.size === 0) dragging = false;
  }

  function zoomIntoPoint(event: MouseEvent) {
    if (event.target instanceof Element && event.target.closest('.skill-dot')) return;

    zoomBy(2, viewPointOf(event));
  }

  function handleKeys(event: KeyboardEvent) {
    if (event.key === '+' || event.key === '=') zoomBy(ZOOM_STEP);
    else if (event.key === '-') zoomBy(1 / ZOOM_STEP);
    else if (event.key === '0') showWholePlot();
    else if (event.key === 'Escape') pinnedId = undefined;
    else return;

    event.preventDefault();
  }

  /** Ctrl or ⌘ with the wheel zooms, as a trackpad pinch does; the wheel alone keeps scrolling the page. */
  const wheelZoom: Attachment<HTMLDivElement> = (element) => {
    labelFont = `600 11px ${getComputedStyle(element).fontFamily}`;

    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) {
        wheelHint = true;
        clearTimeout(wheelHintTimer);
        wheelHintTimer = setTimeout(() => (wheelHint = false), 1400);
        return;
      }

      event.preventDefault();
      const perStep = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 0.05 : 0.0025;
      zoomBy(Math.exp(-event.deltaY * perStep), viewPointOf(event));
    }

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
      clearTimeout(wheelHintTimer);
    };
  };

  // New axes mean the old window shows something else: start again from the whole plot.
  $effect(() => {
    void viewKey;
    plotWindow = WHOLE_PLOT;
    pinnedId = undefined;
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<figure
  class="skill-scatter"
  style:--icon-size={`${iconSize}px`}
  style:--card-width={`${cardWidth}px`}
  onkeydown={handleKeys}
>
  <div class="toolbar">
    <p class="hint">
      <span class="with-hover">Hover a skill for its details. Ctrl + scroll or pinch to zoom.</span>
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

  <div class="y-title">{yTitle}</div>
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

  <div class="plot-area">
    <div
      class="viewport"
      class:zoomed
      class:dragging
      role="group"
      aria-label={`${points.length} skills by ${xTitle.toLowerCase()} and ${yTitle.toLowerCase()}`}
      style:--split-left={`${splitX}px`}
      style:--split-top={`${splitY}px`}
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

      {#each labels as label (label.id)}
        {@const point = pointsById.get(label.id)}
        {#if point}
          <span
            class="name"
            class:dimmed={!point.matches}
            class:active={label.id === activeId}
            style:left={`${label.x}px`}
            style:top={`${label.y}px`}
            aria-hidden="true"
          >
            {point.name}
          </span>
        {/if}
      {/each}

      {#each placed as icon (icon.id)}
        {@const point = pointsById.get(icon.id)}
        {#if point}
          <button
            type="button"
            class={`skill-dot tier-${point.tier}`}
            class:dimmed={!point.matches}
            class:active={icon.id === activeId}
            class:pinned={icon.id === pinnedId}
            style:left={`${icon.x}px`}
            style:top={`${icon.y}px`}
            aria-label={`${point.name}: ${format(point.y)}, ${point.xLabel}`}
            aria-pressed={icon.id === pinnedId}
            aria-describedby={card?.id === icon.id ? detailsId : undefined}
            onpointerenter={(event) => {
              if (event.pointerType === 'mouse') hoveredId = icon.id;
            }}
            onpointerleave={() => {
              if (hoveredId === icon.id) hoveredId = undefined;
            }}
            onfocus={() => (focusedId = icon.id)}
            onblur={() => (focusedId = undefined)}
            onclick={(event) => togglePinned(icon.id, event)}
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
          </button>
        {/if}
      {/each}

      {#if wheelHint && !zoomed}
        <p
          class="wheel-hint"
          aria-hidden="true"
        >
          Hold Ctrl (⌘ on a Mac) and scroll to zoom
        </p>
      {/if}
    </div>

    {#if card}
      <div
        class="details"
        id={detailsId}
        role="tooltip"
        style:left={`${card.left}px`}
        style:top={`${card.top}px`}
        bind:offsetHeight={cardHeight}
      >
        {@render details(card.id)}
      </div>
    {/if}
  </div>

  <div
    class="x-axis"
    aria-hidden="true"
  >
    {#each xTicks as tick (tick.label)}
      <span style:left={`${tick.x}px`}>{tick.label}</span>
    {/each}
  </div>
  <figcaption class="x-title">{xTitle}</figcaption>
</figure>

<style>
  @import './skill-scatter.css';
</style>
