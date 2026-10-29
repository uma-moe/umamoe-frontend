<script lang="ts">
  import Icon from '../Icon.svelte';

  interface Stat {
    label: string;
    value: string;
    mobileValue?: string;
    mobileHidden?: boolean;
    emphasized?: boolean;
    positive?: boolean;
  }

  interface Props {
    rank: number;
    name: string;
    group?: string;
    groupHref?: string;
    meta?: string;
    trend?: number;
    stats: Stat[];
    href?: string;
    onclick?: () => void;
  }

  let { rank, name, group, groupHref, meta, trend = 0, stats, href, onclick }: Props = $props();
</script>

<div class="leader-container">
  <article
    class="leader-row"
    class:top-first={rank === 1}
    class:top-third={rank === 3}
  >
    <div class="rank">
      <strong>#{rank}</strong>
      {#if trend !== 0}
        <span
          class:positive={trend > 0}
          class:negative={trend < 0}
        >
          <Icon
            name="chevron"
            size={12}
          />{Math.abs(trend)}
        </span>
      {/if}
    </div>
    <div class="identity">
      {#if href}
        <a {href}>{name}</a>
      {:else}
        <strong>{name}</strong>
      {/if}
      {#if group}
        <span>
          {#if groupHref}
            <a
              class="group-link"
              href={groupHref}
            >
              <Icon
                name="community"
                size={12}
              />{group}
            </a>
          {:else}
            <Icon
              name="community"
              size={12}
            />{group}
          {/if}
        </span>
      {/if}
      {#if meta}
        <small>{meta}</small>
      {/if}
    </div>
    <dl>
      {#each stats as stat}
        <div
          class:mobile-hidden={stat.mobileHidden}
          class:emphasized={stat.emphasized}
          class:positive={stat.positive}
        >
          <dt>{stat.label}</dt>
          <dd class:muted={stat.value === '-'}>
            <span class="full-value">{stat.value}</span>
            {#if stat.mobileValue !== undefined}
              <span class="mobile-value">
                {stat.mobileValue}
              </span>
            {/if}
          </dd>
        </div>
      {/each}
    </dl>
    {#if onclick}
      <button
        type="button"
        aria-label={`Open ${name}`}
        {onclick}
      >
        <Icon
          name="chevron"
          size={17}
        />
      </button>
    {/if}
  </article>
</div>

<style>
  .leader-container {
    min-width: 0;
    container: leader-row / inline-size;
  }
  .group-link {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: inherit;
    text-decoration: none;
  }
  .group-link:hover {
    text-decoration: underline;
  }
  .mobile-value {
    display: none;
  }
  @media (max-width: 768px) {
    dd:has(.mobile-value) .full-value {
      display: none;
    }
    .mobile-value {
      display: inline;
    }
  }
  .leader-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    background: var(--surface-1);
    transition:
      background 0.2s,
      border-color 0.2s,
      transform 0.2s;
  }
  .leader-row:hover {
    border-color: var(--border-primary);
    background: var(--surface-2);
    transform: translateY(-1px);
  }
  .leader-row.top-first {
    background: linear-gradient(135deg, rgb(255 215 0/0.08), rgb(255 215 0/0.02));
    border-color: rgb(255 215 0/0.3);
  }
  .leader-row.top-first:hover {
    border-color: rgb(255 215 0/0.5);
  }
  .leader-row.top-third {
    background: linear-gradient(135deg, rgb(205 127 50/0.07), rgb(205 127 50/0.02));
    border-color: rgb(205 127 50/0.25);
  }
  .leader-row.top-third:hover {
    border-color: rgb(205 127 50/0.45);
  }
  .rank {
    width: 72px;
    flex-shrink: 0;
    text-align: center;
  }
  .rank > strong {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .top-first .rank > strong {
    color: #ffd700;
    font-size: 1.5rem;
  }
  .top-third .rank > strong {
    color: #cd7f32;
    font-size: 1.25rem;
  }
  .rank span {
    display: inline-flex;
    align-items: center;
    color: var(--color-text-subtle);
    font-size: 9px;
  }
  .rank span.positive {
    color: var(--accent-secondary);
  }
  .rank span.positive :global(svg) {
    transform: rotate(-90deg);
  }
  .rank span.negative {
    color: var(--accent-error);
  }
  .rank span.negative :global(svg) {
    transform: rotate(90deg);
  }
  .identity {
    min-width: 0;
    width: 200px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .identity > strong,
  .identity > a {
    overflow: hidden;
    color: var(--text-primary);
    font-size: 0.9375rem;
    font-weight: 600;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .identity span {
    display: flex;
    align-items: center;
    gap: 3px;
    color: rgb(100 181 246/0.7);
    font-size: 0.6875rem;
  }
  .identity small {
    overflow: hidden;
    color: var(--color-text-subtle);
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  dl {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0;
  }
  dl div {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
  }
  dt {
    color: var(--text-disabled);
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }
  dd {
    max-width: 100%;
    margin: 0;
    overflow: hidden;
    font-size: 0.9375rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  dd.muted {
    color: var(--text-disabled);
  }
  .emphasized dt {
    color: rgb(255 183 77/0.6);
  }
  .emphasized dd {
    color: var(--accent-warning);
  }
  .positive dd {
    color: #66bb6a;
  }
  article > button {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-subtle);
    cursor: pointer;
  }
  @media (max-width: 768px) {
    .leader-row {
      flex-wrap: wrap;
      gap: 0.5rem;
      padding: 0.75rem;
    }
    .rank {
      width: auto;
      min-width: 32px;
    }
    .rank > strong {
      font-size: 0.875rem;
    }
    .identity {
      width: auto;
      flex: 1;
    }
    .identity > strong,
    .identity > a {
      font-size: 0.875rem;
    }
    .identity span:has(.group-link),
    .identity small {
      display: none;
    }
    dl {
      width: 100%;
      justify-content: space-between;
      gap: 0.25rem;
    }
    dl .mobile-hidden {
      display: none;
    }
    dt {
      font-size: 0.5rem;
      letter-spacing: 0;
    }
    dd {
      font-size: 0.6875rem;
    }
    article > button {
      min-width: var(--touch-target);
      min-height: var(--touch-target);
    }
  }
</style>
