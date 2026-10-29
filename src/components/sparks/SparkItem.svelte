<script lang="ts">
  import Icon from '../Icon.svelte';
  import IconButton from '../controls/IconButton.svelte';

  export type SparkTone = 'blue' | 'pink' | 'green' | 'white';

  export type SparkSource = 'main' | 'parent' | 'p2';

  interface Props {
    matched?: boolean;
    highlightMain?: boolean;
    portrait?: { image: string; title: string };
    name: string;
    level: number;
    tone?: SparkTone;
    chance?: string;
    source?: SparkSource;
    compact?: boolean;
    countMode?: 'stars' | 'occurrences';
    mainStars?: number;
    p2Stars?: number;
    title?: string;
    removeLabel?: string;
    onremove?: () => void;
  }

  let {
    matched = false,
    highlightMain = false,
    portrait,
    name,
    level,
    tone = 'white',
    chance,
    source,
    compact = false,
    countMode = 'stars',
    mainStars = 0,
    p2Stars = 0,
    title,
    removeLabel,
    onremove
  }: Props = $props();

  const sourceLabels: Record<SparkSource, string> = {
    main: 'Main parent',
    parent: 'Parent',
    p2: 'P2 legacy'
  };

  const sourceLabel = $derived(source === undefined ? undefined : sourceLabels[source]);
</script>

<span
  class="spark spark--{tone}"
  class:compact
  class:highlightMain
  class:matched
  class:removable={Boolean(onremove)}
  title={title ?? (sourceLabel ? `${name} · ${sourceLabel}` : name)}
  data-source={source}
  aria-label={`${level} ${countMode === 'stars' ? 'star' : 'occurrences of'} ${name}${chance ? `, ${chance}` : ''}${sourceLabel ? `, ${sourceLabel}` : ''}${mainStars ? `, main parent contribution ${mainStars} stars` : ''}${p2Stars ? `, P2 contribution ${p2Stars} stars` : ''}`}
>
  {#if portrait}
    <img
      class="source-portrait"
      src={portrait.image}
      alt={portrait.title}
      title={portrait.title}
      loading="lazy"
    />
  {/if}
  <span class="level">{level}</span>
  <span
    class="star"
    aria-hidden="true"
  >
    {countMode === 'stars' ? '★' : '×'}
  </span>
  <span class="name">{name}</span>
  {#if chance}
    <span class="chance">{chance}</span>
  {/if}
  {#if mainStars}
    <span
      class="contribution main"
      title="Main parent contribution"
    >
      <Icon
        name="user"
        size={12}
      />
      <span>({mainStars}★)</span>
    </span>
  {/if}
  {#if p2Stars}
    <span
      class="contribution p2"
      title="P2 legacy contribution"
    >
      <Icon
        name="user"
        size={12}
      />
      <span>({p2Stars}★)</span>
    </span>
  {:else if source === 'p2'}
    <span
      class="p2-marker"
      aria-hidden="true"
    >
      <Icon
        name="user"
        size={16}
      />
    </span>
  {/if}
  {#if onremove}
    <IconButton
      icon="close"
      size="sm"
      label={removeLabel ?? `Remove ${name}`}
      onclick={onremove}
    />
  {/if}
</span>

<style>
  .spark {
    --spark-rgb: 158 158 158;
    --spark-color: var(--spark-white-text);
    max-width: 100%;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--spark-border-color, rgb(var(--spark-rgb) / 0.5));
    border-radius: var(--radius-md);
    background: rgb(var(--spark-rgb) / 0.15);
    color: var(--spark-color);
    font-size: 0.875rem;
    font-weight: 500;
    line-height: var(--line-height-none);
    white-space: nowrap;
  }
  .spark--blue {
    --spark-rgb: 33 150 243;
    --spark-color: var(--accent-primary);
  }
  .spark--pink {
    --spark-rgb: 233 30 99;
    --spark-color: var(--color-pink);
  }
  .spark--green {
    --spark-rgb: 76 175 80;
    --spark-color: var(--accent-secondary);
  }
  .spark.matched {
    --spark-border-color: var(--color-gold);
    box-shadow: 0 0 8px rgb(255 215 0 / 0.3);
    background: linear-gradient(45deg, rgb(255 215 0 / 0.1), rgb(255 215 0 / 0.05));
  }
  .level {
    flex: 0 0 auto;
    color: var(--spark-color);
    font-size: inherit;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: var(--line-height-none);
  }
  .star {
    flex: 0 0 auto;
    color: var(--spark-color);
    font-size: 14px;
    line-height: var(--line-height-none);
  }
  .name {
    min-width: 0;
    overflow: hidden;
    color: inherit;
    font-size: inherit;
    line-height: var(--line-height-none);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .contribution {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 0.85em;
    font-weight: 600;
  }
  .contribution.main {
    color: var(--spark-main-color, var(--spark-source-main));
  }
  .contribution.p2 {
    color: var(--accent-purple);
  }
  .chance {
    flex: 0 0 auto;
    margin-left: auto;
    padding: 2px 5px;
    border: 1px solid rgb(255 255 255 / 0.12);
    border-radius: 4px;
    background: rgb(255 255 255 / 0.08);
    color: var(--color-text-muted);
    font-size: 0.85em;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: var(--line-height-none);
  }
  .spark.highlightMain[data-source='main'] .level,
  .spark.highlightMain[data-source='main'] .star {
    color: var(--spark-main-color, var(--spark-source-main));
  }
  .p2-marker {
    width: 16px;
    height: 16px;
    display: inline-grid;
    flex: 0 0 auto;
    place-items: center;
    color: var(--accent-purple);
    line-height: var(--line-height-none);
  }
  .source-portrait {
    width: 20px;
    height: 20px;
    flex: none;
    object-fit: contain;
    object-position: center;
    margin: -2px 2px -2px -3px;
  }
  .compact {
    min-width: 0;
    gap: 3px;
    padding: 2px 4px;
    border-radius: var(--radius-xs);
    font-size: 11px;
  }
  .compact .star {
    font-size: 11px;
  }
  .compact .p2-marker {
    width: 12px;
    height: 12px;
  }
  .compact .p2-marker :global(svg) {
    width: 12px;
    height: 12px;
  }
  .spark.removable {
    padding: 2px 2px 2px 6px;
    min-width: 0;
  }
  .spark > :global(.icon-button) {
    width: 24px;
    height: 24px;
    min-width: 24px;
    min-height: 24px;
    padding: 0;
    border: 0;
    border-left: 1px solid rgb(var(--spark-rgb) / 0.3);
    border-radius: 0 2px 2px 0;
    color: inherit;
    background: transparent;
    opacity: 0.7;
  }
  .spark > :global(.icon-button:hover),
  .spark > :global(.icon-button:focus-visible) {
    opacity: 1;
    background: rgb(var(--spark-rgb) / 0.15);
  }
  .spark > :global(.icon-button svg) {
    width: 12px;
    height: 12px;
  }
  .spark.compact.removable {
    padding: 0 0 0 4px;
  }
  .compact .chance {
    padding: 1px 3px;
  }
  .compact.removable > :global(.icon-button) {
    width: 24px;
    height: 24px;
    min-width: 24px;
    min-height: 24px;
  }
  :global([data-theme='light']) .chance {
    border-color: rgb(17 24 39 / 0.14);
    background: rgb(17 24 39 / 0.06);
  }

  @media (max-width: 767px) {
    .spark:not(.compact) {
      gap: 3px;
      padding: 2px 4px;
      border-radius: 4px;
      font-size: 11px;
    }
    .spark:not(.compact) .star {
      font-size: 11px;
    }
    .spark:not(.compact) .chance {
      padding: 1px 3px;
    }
    .spark:not(.compact) .p2-marker {
      width: 11px;
      height: 11px;
    }
    .spark:not(.compact) .p2-marker :global(svg) {
      width: 11px;
      height: 11px;
    }
  }
  @media (max-width: 767px) {
    .source-portrait {
      width: 16px;
      height: 16px;
    }
  }
</style>
