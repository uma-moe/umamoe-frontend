<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import Icon from '../Icon.svelte';
  import Dialog from '../overlays/Dialog.svelte';
  import Button from '../controls/Button.svelte';
  import Spinner from '../feedback/Spinner.svelte';
  import InspectPopover from '../overlays/InspectPopover.svelte';

  export interface ChartLegendItem {
    label: string;
    color: string;
  }

  interface Props {
    id: string;
    title: string;
    description?: string;
    legend?: ChartLegendItem[];
    state?: 'ready' | 'loading' | 'empty' | 'error';
    emptyTitle?: string;
    emptyDetail?: string;
    children?: Snippet;
    titleActions?: Snippet;
    actions?: Snippet;
    onexport?: () => void;
    expandable?: boolean;
    expanded?: boolean;
    plain?: boolean;
    surface?: boolean;
    compact?: boolean;
    maximize?: boolean;
    showHeader?: boolean;
    /** One-row header: the description opens from an info button beside the title instead of taking its own line. */
    slim?: boolean;
  }

  let {
    id,
    title,
    description,
    legend = [],
    state = 'ready',
    emptyTitle = 'No data to chart',
    emptyDetail = 'Adjust the filters or choose another comparison.',
    children,
    titleActions,
    actions,
    onexport,
    expandable = false,
    expanded = $bindable(false),
    plain = false,
    surface = false,
    compact = false,
    maximize = false,
    showHeader = true,
    slim = false
  }: Props = $props();

  async function restoreExpandFocus() {
    await tick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    // Native close can leave focus inside the closed dialog until its close event.
    if (
      document.activeElement !== document.body &&
      !document.activeElement?.closest('dialog:not([open])')
    )
      return;
    // The trigger may live in the chart header or in a shared toolbar.
    const buttons = document
      .getElementById(id + '-title')
      ?.closest('figure')
      ?.querySelectorAll('button');

    const trigger =
      Array.from(buttons ?? []).find(
        (button) => button.getAttribute('aria-label') === 'Expand ' + title
      ) ?? document.getElementById(id + '-expand')?.querySelector('button');

    trigger?.focus({ preventScroll: true });
  }
</script>

{#snippet chart()}
  <figure
    class="chart-frame"
    class:expanded
    class:plain
    class:surface
    class:compact
    class:headerless={!showHeader && !expanded}
    aria-labelledby={`${id}-title`}
  >
    {#if showHeader || expanded}
      <figcaption>
        <div class="chart-heading">
          <div class="title-row">
            <h3
              id={`${id}-title`}
              class:sr-only={expanded}
            >
              {title}
            </h3>
            {#if slim && description}
              <InspectPopover label={'About ' + title}>
                {#snippet trigger()}
                  <span class="about">
                    <Icon
                      name="info"
                      size={14}
                    />
                  </span>
                {/snippet}
                <p class="about-text">{description}</p>
              </InspectPopover>
            {/if}
            {@render titleActions?.()}
          </div>
          {#if description && !slim}
            <p>{description}</p>
          {/if}
        </div>
        <div class="chart-tools">
          {#if legend.length}
            <ul
              class="legend"
              aria-label="Chart legend"
            >
              {#each legend as item}
                <li>
                  <span style={`--series:${item.color}`}></span>
                  {item.label}
                </li>
              {/each}
            </ul>
          {/if}
          {#if actions}
            <div class="chart-actions">
              {@render actions()}
            </div>
          {/if}
          {#if onexport}
            <button
              type="button"
              onclick={onexport}
            >
              <Icon
                name="download"
                size={15}
              />Export
            </button>
          {/if}
          {#if expandable && !expanded}
            <Button
              variant="ghost"
              size="sm"
              ariaLabel={'Expand ' + title}
              onclick={() => (expanded = true)}
            >
              Expand
            </Button>
          {/if}
        </div>
      </figcaption>
    {:else}
      <h3
        id={`${id}-title`}
        class="sr-only"
      >
        {title}
      </h3>
    {/if}
    <div
      class="plot"
      aria-busy={state === 'loading'}
    >
      {#if state === 'ready' && children}
        {@render children()}
      {:else if state === 'loading'}
        <Spinner
          size={40}
          centered
          label="Loading chart data…"
        />
      {:else}
        <div class="state">
          <Icon
            name={state === 'error' ? 'warning' : 'chart'}
            size={28}
          />
          <strong>{state === 'error' ? 'Chart unavailable' : emptyTitle}</strong>
          <span>
            {state === 'error' ? 'The data could not be prepared. Try again.' : emptyDetail}
          </span>
        </div>
      {/if}
    </div>
  </figure>
{/snippet}

{#if expanded}
  <div
    class="expanded-placeholder"
    class:plain
  >
    <Button
      variant="ghost"
      onclick={() => (expanded = false)}
    >
      Return to {title}
    </Button>
  </div>
{:else}
  {@render chart()}
{/if}
{#if expandable}
  <div
    class="chart-dialog"
    class:maximize
  >
    <Dialog
      bind:open={expanded}
      {title}
      maxWidth={maximize ? 'calc(100vw - 24px)' : '1240px'}
      height={maximize ? '94dvh' : undefined}
      maxHeight="94dvh"
      contentPadding="0"
      mobileContentPadding="0"
      onclose={restoreExpandFocus}
    >
      {#if expanded}
        {@render chart()}
      {/if}
    </Dialog>
  </div>
{/if}

<style>
  .chart-frame {
    min-width: 0;
    margin: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--card-surface-border);
    border-radius: var(--radius-lg);
    background: var(--card-surface-bg);
    container: chart-frame / inline-size;
  }
  .expanded-placeholder {
    display: grid;
    place-items: center;
    min-height: 240px;
    border: 1px dashed var(--border-primary);
    border-radius: var(--radius-lg);
  }
  .chart-frame.expanded {
    border: 0;
    padding: 16px;
  }
  .maximize :global(dialog) {
    width: calc(100% - 24px);
  }
  .chart-dialog {
    display: contents;
  }
  .chart-dialog.maximize {
    --dialog-header-min-height: 48px;
    --dialog-header-padding: 8px 12px;
    --dialog-header-align: center;
    --dialog-heading-padding: 0;
  }
  .maximize .chart-frame.expanded {
    height: 100%;
    min-height: 0;
  }
  .plain {
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 0;
    gap: 18px;
  }
  .plain figcaption {
    gap: 16px;
    flex-wrap: wrap;
  }
  .plain .title-row {
    gap: 12px;
  }
  .plain h3 {
    font-size: 17px;
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  .plain p {
    font-size: 12px;
    line-height: 1.6;
    margin-top: 7px;
    max-width: 68ch;
  }
  .plain .legend {
    justify-content: flex-start;
  }
  .plain .legend li {
    font-size: 11px;
  }
  .plain .plot {
    min-height: 0;
  }
  .plain .state {
    border: 0;
    border-radius: 0;
  }
  .surface {
    border: 0;
    border-radius: var(--radius-lg);
    background: var(--surface-1);
    padding: 20px;
  }
  .surface figcaption {
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border-subtle);
  }
  @media (max-width: 600px) {
    .surface {
      padding: 14px;
    }
  }
  .compact {
    gap: 4px;
  }
  .headerless {
    grid-template-rows: minmax(0, 1fr);
    gap: 0;
  }
  .surface.compact {
    padding: 12px 16px;
  }
  .compact figcaption {
    align-items: center;
    gap: 8px;
    padding-bottom: 0;
    border-bottom: 0;
  }
  .compact h3 {
    font-size: 15px;
  }
  .compact p {
    font-size: 11px;
    margin-top: 3px;
  }
  .about {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    color: var(--color-text-muted);
  }
  .about-text {
    max-width: 44ch;
    margin: 0;
    color: var(--color-text);
    font-size: 12px;
    line-height: 1.5;
  }
  .chart-tools,
  .chart-actions {
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .chart-heading {
    min-width: 0;
  }
  .title-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  figcaption {
    min-width: 0;
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 8px;
  }
  h3,
  p {
    margin: 0;
  }
  h3 {
    font-size: var(--font-md);
  }
  p {
    margin-top: 2px;
    color: var(--color-text-muted);
    font-size: 10px;
  }
  figcaption button {
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    border: 1px solid var(--factor-field-border);
    border-radius: var(--radius-md);
    background: var(--factor-field-bg);
    color: var(--color-text-muted);
    cursor: pointer;
    font: inherit;
    font-size: 10px;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 5px 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--color-text-muted);
    font-size: 10px;
    white-space: nowrap;
  }
  .legend li > span {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--series);
  }
  .plot {
    min-width: 0;
    min-height: 180px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .state {
    min-height: 180px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 5px;
    padding: 12px;
    border: 1px dashed var(--border-primary);
    border-radius: var(--radius-sm);
    color: var(--color-text-subtle);
    text-align: center;
  }
  .state strong {
    color: var(--color-text);
    font-size: var(--font-sm);
  }
  .state span {
    max-width: 40ch;
    font-size: 10px;
  }
  @container chart-frame (max-width: 420px) {
    figcaption button {
      width: 36px;
      padding: 0;
      justify-content: center;
      font-size: 0;
    }
    .plot {
      min-height: 150px;
    }
  }
</style>
