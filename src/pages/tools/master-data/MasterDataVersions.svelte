<script lang="ts">
  import DataTable from '@/components/data/DataTable.svelte';
</script>

<div class="schema-header">
  <div>
    <span class="eyebrow">VERSION COMPARISON · DEMO</span>
    <h2>Changes between releases</h2>
    <p>Illustrative changes. Published master database versions are not connected.</p>
  </div>
</div>
<div class="diff-summary">
  <div>
    <span>Tables changed</span>
    <strong>4</strong>
  </div>
  <div class="added">
    <span>Rows added</span>
    <strong>+70</strong>
  </div>
  <div class="modified">
    <span>Rows modified</span>
    <strong>16</strong>
  </div>
  <div>
    <span>Rows removed</span>
    <strong>0</strong>
  </div>
</div>
<div class="diff-table">
  <DataTable
    plain
    caption="Example master data changes"
    columns={[
      { key: 'table', label: 'Table' },
      { key: 'added', label: 'Added', numeric: true },
      { key: 'removed', label: 'Removed', numeric: true },
      { key: 'modified', label: 'Modified', numeric: true }
    ]}
    rows={[
      { table: 'card_data', added: 2, removed: 0, modified: 1 },
      { table: 'skill_data', added: 14, removed: 0, modified: 3 },
      { table: 'text_data', added: 48, removed: 0, modified: 12 },
      { table: 'race_instance', added: 6, removed: 0, modified: 0 }
    ]}
  >
    {#snippet cell(row, column)}
      <span
        class:added={column.key === 'added'}
        class:modified={column.key === 'modified'}
      >
        {column.key === 'added' ? '+' : ''}{row[column.key]}
      </span>
    {/snippet}
  </DataTable>
</div>

<style>
  @import './master-data-panel.css';
  .diff-summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    margin: 0 24px 24px;
  }
  .diff-summary > div {
    display: grid;
    gap: 10px;
    padding: 16px;
  }
  .diff-summary span {
    font-size: 10px;
    color: var(--text-secondary);
  }
  .diff-summary strong {
    font-size: 25px;
  }
  .added {
    color: var(--accent-secondary);
  }
  .modified {
    color: var(--accent-warning);
  }
  .diff-table {
    padding: 0 24px;
  }
  @media (max-width: 600px) {
    .diff-summary {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
