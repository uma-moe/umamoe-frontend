<script lang="ts">
  import Icon from '../Icon.svelte';

  interface Item {
    id: string;
    label: string;
    image?: string;
  }

  interface Props {
    label: string;
    tone?: 'blue' | 'purple';
    compact?: boolean;
    included?: Item[];
    excluded?: Item[];
    onadd: (mode: 'include' | 'exclude') => void;
    onremove: (mode: 'include' | 'exclude', id: string) => void;
  }

  let {
    label,
    tone = 'blue',
    compact = false,
    included = [],
    excluded = [],
    onadd,
    onremove
  }: Props = $props();
</script>

<section
  class="tree-box"
  class:compact
  class:purple={tone === 'purple'}
  aria-label={label}
>
  <h4>{label}</h4>
  {#each ['include', 'exclude'] as mode}
    {@const including = mode === 'include'}
    {@const items = including ? included : excluded}
    <div
      class="rule"
      class:exclude={!including}
    >
      {#if !compact}
        <div class="rule-heading">
          <span>
            {including ? 'Include' : 'Exclude'}{#if items.length}
              <small>{items.length}</small>
            {/if}
          </span>
        </div>
      {/if}
      <div class="chips">
        {#each items as item (item.id)}
          <span class="chip">
            {#if item.image}
              <img
                src={item.image}
                alt=""
              />
            {/if}
            <b>{item.label}</b>
            <button
              type="button"
              aria-label={`Remove ${item.label} from ${label} ${mode}`}
              onclick={() => onremove(including ? 'include' : 'exclude', item.id)}
            >
              <Icon
                name="close"
                size={13}
              />
            </button>
          </span>
        {/each}
        <button
          class="filter-row"
          class:icon-only={items.length > 0 && !compact}
          class:filter-row--allow={including}
          type="button"
          title="Add character"
          aria-label={`Add ${including ? 'included' : 'excluded'} characters to ${label}`}
          onclick={() => onadd(including ? 'include' : 'exclude')}
        >
          <Icon
            name={compact && !including ? 'minus' : 'add'}
            size={16}
          />{#if compact}
            {including ? 'Include' : 'Exclude'}{#if items.length}
              <small>
                {items.length}
              </small>
            {/if}
          {:else if !items.length}
            Add character
          {/if}
        </button>
      </div>
    </div>
  {/each}
</section>

<style>
  .tree-box {
    --parent-color: var(--accent-primary);
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .purple {
    --parent-color: var(--accent-purple);
  }
  h4 {
    margin: 0 0 2px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.8px;
    line-height: 1;
    text-transform: uppercase;
    color: var(--parent-color);
  }
  .rule {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 6px;
  }
  .rule-heading {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: var(--font-sm);
    line-height: 1.2;
    color: var(--accent-success);
  }
  .exclude .rule-heading {
    color: var(--accent-error);
  }
  .rule-heading > span {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }
  small {
    color: var(--text-muted);
    font-weight: 400;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .filter-row {
    display: flex;
    flex: 1 0 120px;
    align-items: center;
    gap: 5px;
    padding: 0 10px;
    min-height: var(--control-height);
    border: 1px solid var(--factor-field-border);
    border-radius: 8px;
    background: var(--factor-field-bg);
    color: var(--factor-field-text);
    font-size: 11px;
  }
  .filter-row :global(svg) {
    color: var(--parent-color);
  }
  .filter-row.icon-only {
    flex: 0 0 34px;
    width: 34px;
    min-height: 34px;
    justify-content: center;
    padding: 0;
  }
  .filter-row:hover {
    background: var(--factor-field-bg);
    border-color: var(--border-secondary);
  }
  .filter-row:focus-visible {
    border-color: var(--factor-field-focus-border);
    outline: 0;
    box-shadow: var(--focus-ring);
  }
  .chips {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
  }
  .chip {
    max-width: 100%;
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 2px 3px;
    border: 1px solid rgb(var(--accent-success-rgb) / 0.25);
    border-radius: 6px;
    background: rgb(var(--accent-success-rgb) / 0.1);
    color: var(--accent-success);
    font-size: 11px;
  }
  .exclude .chip {
    border-color: rgb(var(--accent-error-rgb) / 0.25);
    background: rgb(var(--accent-error-rgb) / 0.1);
    color: var(--accent-error);
  }
  .chip img {
    width: 28px;
    height: 28px;
    object-fit: cover;
    object-position: top;
    border-radius: 4px;
  }
  .chip b {
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: 500;
    line-height: 1.3;
  }
  .chip button {
    display: grid;
    place-items: center;
    align-self: stretch;
    min-width: 26px;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: inherit;
  }
  button:hover {
    background: rgb(var(--on-surface-rgb) / 0.06);
  }
  button:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }
  .tree-box.compact {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .compact h4 {
    grid-column: 1/-1;
  }
  .compact .rule,
  .compact .chips {
    display: contents;
  }
  .compact .filter-row {
    grid-row: 2;
    grid-column: 1;
    min-width: 0;
    min-height: 32px;
    color: var(--accent-success);
  }
  .compact .exclude .filter-row {
    grid-column: 2;
    color: var(--accent-error);
  }
  .compact .filter-row :global(svg) {
    color: inherit;
  }
  .compact .filter-row small {
    margin-left: auto;
  }
  .compact .chip {
    grid-column: 1/-1;
    justify-self: start;
  }
</style>
