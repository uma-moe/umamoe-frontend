<script lang="ts">
  import TextField from '@/components/controls/TextField.svelte';
  import Icon from '@/components/Icon.svelte';

  interface Props {
    schema: Record<string, string[]>;
    table: string;
    busy: boolean;
    onselect: (name: string) => void;
  }

  let { schema, table, busy, onselect }: Props = $props();

  let search = $state('');

  const tables = $derived(
    Object.keys(schema).filter((name) => name.toLowerCase().includes(search.toLowerCase()))
  );
</script>

<aside class="table-sidebar">
  <header>
    <span>TABLES</span>
    <small>{Object.keys(schema).length}</small>
  </header>
  <div class="table-search">
    <TextField
      id="master-table-search"
      label="Find a table"
      type="search"
      placeholder="Filter tables…"
      bind:value={search}
    />
  </div>
  <nav aria-label="Database tables">
    {#each tables as name}
      <button
        class:active={table === name}
        disabled={busy}
        onclick={() => onselect(name)}
      >
        <Icon
          name="grid"
          size={14}
        />
        <span>{name}</span>
        <small>{schema[name]?.length}</small>
      </button>
    {/each}
  </nav>
  <div class="table-info">
    <Icon
      name="lock"
      size={14}
    />
    <p>Queries and imported files stay in your browser.</p>
  </div>
</aside>

<style>
  @import './master-data-sidebar.css';
</style>
