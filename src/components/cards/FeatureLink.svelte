<script lang="ts">
  import Icon from '../Icon.svelte';
  import type { IconName } from '../icon-types';
  import { navigationBadges } from '@/routes/route-manifest';

  interface Props {
    title: string;
    description: string;
    icon: IconName;
    href?: string;
    accent?: string;
  }

  let { title, description, icon, href, accent = 'primary' }: Props = $props();

  const badge = $derived(href ? navigationBadges[href] : undefined);
</script>

<svelte:element
  this={href ? 'a' : 'div'}
  {href}
  class="quick-link"
  class:disabled={!href}
  class:updated-feature={badge === 'Updated'}
  class:new-feature={badge === 'New'}
  aria-disabled={href ? undefined : true}
  style:--feature-accent={`var(--${accent === 'pink' || accent === 'purple' ? 'color' : 'accent'}-${accent})`}
>
  <Icon
    name={icon}
    size={32}
  />
  <span class="link-content">
    <strong>
      {title}{#if badge}
        <small
          class="feature-badge"
          class:updated-badge={badge === 'Updated'}
          class:new-badge={badge === 'New'}
        >
          {badge}
        </small>
      {/if}
    </strong>
    <span>{description}</span>
  </span>
  {#if !href}
    <small class="coming-soon-badge">Coming soon</small>
  {/if}
</svelte:element>

<style>
  .quick-link {
    position: relative;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem;
    border: 1px solid var(--card-surface-border);
    border-radius: var(--radius-lg);
    background: var(--card-surface-bg);
    box-shadow: var(--card-surface-shadow);
    color: var(--text-primary);
    text-decoration: none;
    transition:
      transform 0.3s,
      box-shadow 0.3s;
  }
  .quick-link:not(.disabled):hover {
    transform: translateY(-2px);
    border-color: var(--border-secondary);
    box-shadow: var(--card-surface-hover-shadow);
  }
  .quick-link :global(svg) {
    flex: none;
    color: var(--feature-accent);
  }
  .link-content {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    text-align: left;
  }
  strong {
    margin-bottom: 0.25rem;
    font-size: 1.125rem;
    font-weight: 600;
  }
  /* Summaries stay on one line. Write them to fit the narrowest landing card (about 180px of
     text); the ellipsis only guards longer copy. */
  .link-content > span {
    overflow: hidden;
    color: var(--text-secondary);
    font-size: 0.875rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .disabled {
    cursor: not-allowed;
  }
  .disabled .link-content,
  .disabled > :global(svg) {
    opacity: 0.6;
  }
  small {
    display: inline-block;
    padding: 0.15rem 0.4rem;
    border-radius: var(--radius-sm);
    color: #fff;
    font-size: 0.6rem;
    font-weight: 700;
    line-height: 1.5;
    letter-spacing: 0.5px;
    white-space: nowrap;
    text-transform: uppercase;
  }
  .coming-soon-badge {
    position: absolute;
    top: 12px;
    right: 12px;
    background: linear-gradient(45deg, #ff9800, #ffb74d);
    box-shadow: 0 2px 8px rgb(255 152 0/0.4);
  }
  .feature-badge {
    margin-left: 0.5rem;
    background: linear-gradient(45deg, #2196f3, #81c784);
    box-shadow: 0 2px 8px rgb(33 150 243/0.4);
  }
  .new-badge {
    background: var(--accent-success);
    color: var(--bg-primary);
    box-shadow: 0 2px 8px rgb(var(--accent-success-rgb) / 0.25);
  }
  :global([data-theme='light']) .new-badge {
    color: #fff;
  }
  :global([data-theme='light']) .coming-soon-badge {
    background: var(--accent-warning);
  }
  :global([data-theme='light']) .updated-badge {
    background: var(--accent-primary);
  }
  @media (prefers-reduced-motion: no-preference) {
    .updated-badge {
      animation: updated-badge 2s ease-in-out infinite;
    }
  }
  @keyframes updated-badge {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
  }
  @media (max-width: 767px) {
    .quick-link {
      padding: 10px;
      gap: 10px;
    }
    .quick-link :global(svg) {
      width: 24px;
      height: 24px;
    }
    strong {
      font-size: 13px;
      margin-bottom: 2px;
    }
    .link-content > span {
      font-size: 12px;
    }
    .coming-soon-badge {
      position: static;
      margin-left: auto;
      font-size: 8px;
    }
    .feature-badge {
      font-size: 8px;
    }
  }
</style>
