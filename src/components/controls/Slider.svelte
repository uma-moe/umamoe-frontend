<script lang="ts">
  type SliderTone = 'accent' | 'blue' | 'coral' | 'orange' | 'pink' | 'green' | 'teal' | 'white';
  type SelectionMode = 'before' | 'after' | 'between';

  interface Props {
    id: string;
    label: string;
    value?: number;
    endValue?: number;
    range?: boolean;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    tone?: SliderTone;
    selection?: SelectionMode;
    showTicks?: boolean;
    showTickLabels?: boolean;
    tickLabels?: string[];
    tickValues?: number[];
    showValueLabels?: boolean;
    showOutput?: boolean;
    hideLabel?: boolean;
    disabled?: boolean;
    onchange?: (value: number, endValue?: number) => void;
  }

  let {
    id,
    label,
    value = $bindable(0),
    endValue = $bindable<number | undefined>(undefined),
    range = false,
    min = 0,
    max = 100,
    step = 1,
    unit = '',
    tone = 'accent',
    selection,
    showTicks = false,
    showTickLabels = false,
    tickLabels = [],
    tickValues,
    showValueLabels = false,
    showOutput = true,
    hideLabel = false,
    disabled = false,
    onchange
  }: Props = $props();

  let activeThumb = $state<'start' | 'end'>('start');
  let dragging = $state(false);
  let trackDragThumb = $state<'start' | 'end' | null>(null);
  const isRange = $derived(range || endValue !== undefined);
  const actualEnd = $derived(isRange ? (endValue ?? max) : value);
  const mode = $derived(selection ?? (isRange ? 'between' : 'before'));
  const startPercent = $derived(toPercent(value));
  const endPercent = $derived(toPercent(actualEnd));
  const fillStart = $derived(mode === 'before' ? 0 : startPercent);
  const fillEnd = $derived(mode === 'after' ? 100 : endPercent);
  const fillScale = $derived(Math.max(0, (fillEnd - fillStart) / 100));
  const stepCount = $derived(Math.max(0, Math.round((max - min) / step)));
  const ticks = $derived(
    !showTicks
      ? []
      : (tickValues?.filter((tick) => tick >= min && tick <= max) ??
          (stepCount <= 24
            ? Array.from({ length: stepCount + 1 }, (_, index) => min + index * step)
            : []))
  );

  function toPercent(input: number) {
    return max === min ? 0 : Math.max(0, Math.min(100, ((input - min) / (max - min)) * 100));
  }
  function tickActive(tick: number) {
    if (isRange || mode === 'between') return tick >= value && tick <= actualEnd;
    return mode === 'after' ? tick >= value : tick <= value;
  }
  function formatted(input: number) {
    return `${input}${unit}`;
  }
  function clamp(input: number) {
    return Math.max(min, Math.min(max, input));
  }
  function snap(input: number) {
    const precision = Math.max(0, (String(step).split('.')[1] ?? '').length);
    return Number((min + Math.round((clamp(input) - min) / step) * step).toFixed(precision));
  }
  function updateThumb(thumb: 'start' | 'end', input: number) {
    const next = snap(input);
    if (thumb === 'start') value = isRange ? Math.min(next, actualEnd) : next;
    else endValue = Math.max(next, value);
    onchange?.(value, isRange ? actualEnd : undefined);
  }
  function changeStart(event: Event) {
    updateThumb('start', Number((event.currentTarget as HTMLInputElement).value));
  }
  function changeEnd(event: Event) {
    updateThumb('end', Number((event.currentTarget as HTMLInputElement).value));
  }
  function pointerValue(event: PointerEvent, element: HTMLElement) {
    const bounds = element.getBoundingClientRect();
    return snap(min + ((event.clientX - bounds.left) / bounds.width) * (max - min));
  }
  function beginTrackDrag(event: PointerEvent) {
    if (disabled || event.button !== 0) return;
    const target = event.currentTarget as HTMLButtonElement;
    const next = pointerValue(event, target);
    activeThumb =
      !isRange || Math.abs(next - value) <= Math.abs(next - actualEnd) ? 'start' : 'end';
    trackDragThumb = activeThumb;
    dragging = true;
    target.setPointerCapture(event.pointerId);
    updateThumb(activeThumb, next);
  }
  function moveTrackDrag(event: PointerEvent) {
    if (!trackDragThumb) return;
    updateThumb(trackDragThumb, pointerValue(event, event.currentTarget as HTMLButtonElement));
  }
  function endTrackDrag(event: PointerEvent) {
    const target = event.currentTarget as HTMLButtonElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    trackDragThumb = null;
    dragging = false;
  }
</script>

<div
  class="field field--{tone}"
  class:disabled
  class:with-value-labels={showValueLabels}
  role="group"
  aria-labelledby="{id}-label"
>
  <div
    class="header"
    class:sr-only={hideLabel && !showOutput}
  >
    <span id="{id}-label">{label}</span>
    {#if showOutput}
      <output for={isRange ? `${id}-start ${id}-end` : `${id}-start`}>
        {formatted(value)}{#if isRange}
          <span aria-hidden="true">–</span>
          {formatted(actualEnd)}
        {/if}
      </output>
    {/if}
  </div>
  <div
    class="slider-wrap"
    class:dragging
    style={`--fill-start:${fillStart}%;--fill-scale:${fillScale};`}
  >
    <div
      class="track"
      aria-hidden="true"
    >
      <span class="fill"></span>
      {#each ticks as tick}
        <i
          class:active={tickActive(tick)}
          style={`left:${toPercent(tick)}%`}
        ></i>
      {/each}
    </div>
    <button
      class="track-hit"
      type="button"
      tabindex="-1"
      aria-label={`Adjust ${label} on track`}
      {disabled}
      onpointerdown={beginTrackDrag}
      onpointermove={moveTrackDrag}
      onpointerup={endTrackDrag}
      onpointercancel={endTrackDrag}
    ></button>
    <span
      class="visual-thumb visual-thumb--start"
      style={`--thumb-position:${startPercent}%`}
      aria-hidden="true"
    >
      <span class="visual-knob"></span>
    </span>
    {#if isRange}
      <span
        class="visual-thumb visual-thumb--end"
        style={`--thumb-position:${endPercent}%`}
        aria-hidden="true"
      >
        <span class="visual-knob"></span>
      </span>
    {/if}
    <input
      id="{id}-start"
      class="thumb thumb--start"
      class:on-top={activeThumb === 'start'}
      type="range"
      {min}
      {max}
      {step}
      {disabled}
      {value}
      aria-label={isRange ? `${label} minimum` : label}
      aria-valuemax={isRange ? actualEnd : max}
      aria-valuetext={formatted(value)}
      onfocus={() => (activeThumb = 'start')}
      onpointerdown={() => {
        activeThumb = 'start';
        dragging = true;
      }}
      onpointerup={() => (dragging = false)}
      onpointercancel={() => (dragging = false)}
      oninput={changeStart}
    />
    {#if isRange}
      <input
        id="{id}-end"
        class="thumb thumb--end"
        class:on-top={activeThumb === 'end'}
        type="range"
        {min}
        {max}
        {step}
        {disabled}
        value={actualEnd}
        aria-label={`${label} maximum`}
        aria-valuemin={value}
        aria-valuetext={formatted(actualEnd)}
        onfocus={() => (activeThumb = 'end')}
        onpointerdown={() => {
          activeThumb = 'end';
          dragging = true;
        }}
        onpointerup={() => (dragging = false)}
        onpointercancel={() => (dragging = false)}
        oninput={changeEnd}
      />
    {/if}
  </div>
  {#if showValueLabels}
    <div
      class="value-labels"
      aria-hidden="true"
    >
      {#if isRange && endPercent - startPercent < 32}
        <span
          class="combined"
          style:left={(startPercent + endPercent) / 2 + '%'}
        >
          {formatted(value)}{#if value !== actualEnd}
            –{formatted(actualEnd)}
          {/if}
        </span>
      {:else}
        <span style:left={startPercent + '%'}>{formatted(value)}</span>
        {#if isRange}
          <span style:left={endPercent + '%'}>{formatted(actualEnd)}</span>
        {/if}
      {/if}
    </div>
  {/if}
  {#if showTickLabels && ticks.length}
    <div
      class="labels"
      aria-hidden="true"
    >
      {#each ticks as tick, index}
        <span class:active={tickActive(tick)}>
          {tickLabels[index] ?? formatted(tick)}
        </span>
      {/each}
    </div>
  {/if}
</div>

<style>
  @import './slider.css';
</style>
