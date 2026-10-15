<script lang="ts">
  import Spinner from './Spinner.svelte';
  import Icon from '../Icon.svelte';

  let {
    loading = false,
    cached = false,
    error = ''
  }: { loading?: boolean; cached?: boolean; error?: string } = $props();
</script>

{#if loading}
  <div
    class="resource-status"
    role="status"
  >
    <Spinner size={14} />
    <span>{cached ? 'Using cached resources; refreshing...' : 'Still fetching resources...'}</span>
  </div>
{/if}
{#if error}
  <div
    class="resource-error"
    role="alert"
  >
    <Icon
      name="warning"
      size={16}
    />
    <div>
      <strong>{cached ? 'Resource refresh failed' : 'Resource fetch failed'}</strong>
      <code>{error}</code>
    </div>
  </div>
{/if}

<style>
  .resource-status {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    padding: 6px 8px;
    border-top: 1px solid rgb(100 181 246/0.12);
    background: linear-gradient(135deg, rgb(100 181 246/0.12), rgb(129 199 132/0.06));
    color: var(--text-secondary);
    font-size: 0.68rem;
    font-weight: 600;
  }
  .resource-error {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    gap: 6px;
    padding: 6px 8px;
    border-top: 1px solid rgb(239 83 80/0.16);
    background: rgb(239 83 80/0.08);
    color: var(--text-secondary);
    font-size: 0.66rem;
  }
  .resource-error > :global(svg) {
    color: #ef9a9a;
    margin-top: 1px;
  }
  .resource-error strong {
    display: block;
    margin-bottom: 3px;
  }
  code {
    display: block;
    padding: 5px 6px;
    border-radius: var(--radius-sm);
    background: var(--code-surface, #101418);
    color: rgb(255 255 255/0.7);
    font-size: 0.62rem;
    line-height: 1.35;
    white-space: normal;
    overflow-wrap: anywhere;
  }
</style>
