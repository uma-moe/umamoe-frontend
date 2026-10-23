<script lang="ts">
  import Badge from '@/components/Badge.svelte';

  interface Props {
    added: number;
    removed: number;
    modified: number;
    /** Leave out kinds of change that did not happen, as each table's header does. */
    hideZero?: boolean;
  }

  let { added, removed, modified, hideZero = false }: Props = $props();

  const changes = $derived([
    { tone: 'success', symbol: '+', count: added, label: 'added' },
    { tone: 'danger', symbol: '−', count: removed, label: 'removed' },
    { tone: 'warning', symbol: '~', count: modified, label: 'modified' }
  ] as const);
  const shown = $derived(hideZero ? changes.filter((change) => change.count > 0) : changes);
</script>

<span class="counts">
  {#each shown as change (change.label)}
    <Badge tone={change.tone}>
      <span aria-hidden="true">{change.symbol}</span>
      {change.count.toLocaleString()}
      <span class="sr-only">rows {change.label}</span>
    </Badge>
  {/each}
</span>

<style>
  .counts {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
    font-variant-numeric: tabular-nums;
  }
</style>
