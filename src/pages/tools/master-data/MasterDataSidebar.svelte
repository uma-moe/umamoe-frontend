<script lang="ts">
  import TextField from '@/components/controls/TextField.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { MasterTable } from './master-data-types';

  interface Props {
    tables: MasterTable[];
    active: string;
    loading: boolean;
    onbrowse: (table: string) => void;
  }

  let { tables, active, loading, onbrowse }: Props = $props();

  let search = $state('');
  let nav: HTMLElement;

  const rowCount = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

  // Empty tables stay queryable and in autocomplete; listing them would bury the useful ones.
  const populated = $derived(tables.filter((table) => table.rows > 0));
  const emptyCount = $derived(tables.length - populated.length);
  const shown = $derived(
    populated.filter((table) => table.name.toLowerCase().includes(search.trim().toLowerCase()))
  );

  /** Scrolls only the list, so a shared link to a table far down never moves the page. */
  function revealActiveTable() {
    const button = nav.querySelector<HTMLElement>('[aria-current="true"]');
    if (!button) return;

    const list = nav.getBoundingClientRect();
    const item = button.getBoundingClientRect();
    if (item.top < list.top || item.bottom > list.bottom)
      nav.scrollTop += item.top - list.top - (list.height - item.height) / 2;
    if (item.left < list.left || item.right > list.right)
      nav.scrollLeft += item.left - list.left - (list.width - item.width) / 2;
  }

  $effect(() => {
    if (active && shown.length) revealActiveTable();
  });
</script>

<aside class="table-sidebar">
  <header>
    <h2>Tables</h2>
    <small>{populated.length}</small>
  </header>
  <div class="table-search">
    <TextField
      id="master-table-search"
      label="Find a table"
      hideLabel
      type="search"
      prefixIcon="search"
      placeholder="Find a table…"
      bind:value={search}
    />
  </div>
  <nav
    aria-label="Database tables"
    bind:this={nav}
  >
    {#each shown as table (table.name)}
      <button
        class:active={active === table.name}
        aria-current={active === table.name ? 'true' : undefined}
        title="{table.name} · {table.rows.toLocaleString()} rows · {table.columns.length} columns"
        onclick={() => onbrowse(table.name)}
      >
        <span>{table.name}</span>
        <small>{rowCount.format(table.rows)}</small>
      </button>
    {:else}
      <p class="table-empty">
        {#if loading}
          <Spinner
            size={18}
            showLabel
            label="Loading tables…"
          />
        {:else if populated.length}
          No tables match “{search}”.
        {:else}
          No tables loaded.
        {/if}
      </p>
    {/each}
  </nav>
  <footer class="table-info">
    <Icon
      name="lock"
      size={14}
    />
    <p>
      Queries run in your browser.
      {#if emptyCount === 1}
        1 empty table is hidden but can still be queried.
      {:else if emptyCount > 1}
        {emptyCount} empty tables are hidden but can still be queried.
      {/if}
    </p>
  </footer>
</aside>

<style>
  @import './master-data-sidebar.css';
</style>
