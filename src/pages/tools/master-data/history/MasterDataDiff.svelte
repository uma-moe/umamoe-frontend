<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import Icon from '@/components/Icon.svelte';
  import { copyText } from '@/lib/clipboard';
  import type { MasterDiff } from '@/services/resources/master-history';
  import DiffCounts from './DiffCounts.svelte';
  import MasterDataTableDiff from './MasterDataTableDiff.svelte';
  import { masterHistorySearch } from './master-history-link';

  interface Props {
    diff: MasterDiff;
    /** Short hash of the release, which names its table links. */
    release: string;
    /** The table a link points at; it starts expanded and scrolled into view. */
    table: string;
  }

  let { diff, release, table = $bindable() }: Props = $props();

  let root = $state<HTMLElement>();
  let expanded = $state.raw(new Set<string>(untrack(() => (table ? [table] : []))));
  let copiedTable = $state('');
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  const tables = $derived(
    Object.entries(diff.tables).sort(([first], [second]) => first.localeCompare(second))
  );
  const allExpanded = $derived(tables.every(([name]) => expanded.has(name)));

  function toggle(name: string) {
    const next = new Set(expanded);
    if (next.has(name)) next.delete(name);
    else next.add(name);

    expanded = next;
  }

  function toggleAll() {
    expanded = allExpanded ? new Set() : new Set(tables.map(([name]) => name));
  }

  async function copyTableLink(name: string) {
    table = name;
    const url = location.origin + location.pathname + masterHistorySearch({ release, table: name });
    if (!(await copyText(url))) return;

    copiedTable = name;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copiedTable = ''), 2000);
  }

  onMount(() => {
    if (table) {
      const linked = root?.querySelector(`[data-table="${CSS.escape(table)}"]`);
      linked?.scrollIntoView({ block: 'start' });
    }

    return () => clearTimeout(copiedTimer);
  });
</script>

<div
  class="diff"
  bind:this={root}
>
  <div class="diff-toolbar">
    <p>
      {tables.length.toLocaleString()}
      {tables.length === 1 ? 'table' : 'tables'} changed since
      <code title={diff.fromHash}>{diff.fromHash.slice(0, 12)}</code>
    </p>
    {#if tables.length}
      <Button
        size="sm"
        variant="ghost"
        onclick={toggleAll}
      >
        {allExpanded ? 'Collapse all' : 'Expand all'}
      </Button>
    {/if}
  </div>
  {#each tables as [name, tableDiff] (name)}
    {@const open = expanded.has(name)}
    {@const copied = copiedTable === name}
    <section
      class="diff-table"
      class:linked={name === table}
      data-table={name}
      aria-label="{name} changes"
    >
      <header class="diff-table-heading">
        <h3>
          <button
            class="diff-toggle"
            aria-expanded={open}
            aria-controls={open ? `diff-${release}-${name}` : undefined}
            onclick={() => toggle(name)}
          >
            <Icon
              name="chevron"
              size={16}
            />
            <span class="table-name">{name}</span>
            <DiffCounts
              added={tableDiff.added.length}
              removed={tableDiff.removed.length}
              modified={tableDiff.modified.length}
              hideZero
            />
          </button>
        </h3>
        <IconButton
          icon={copied ? 'check' : 'share'}
          label={copied ? `Link to ${name} copied` : `Copy link to ${name}`}
          size="sm"
          onclick={() => copyTableLink(name)}
        />
      </header>
      {#if open}
        <div id="diff-{release}-{name}">
          <MasterDataTableDiff
            {name}
            table={tableDiff}
          />
        </div>
      {/if}
    </section>
  {/each}
</div>

<style>
  @import './master-data-diff.css';
</style>
