<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';

  interface Props {
    schema: Record<string, string[]>;
    table: string;
    crossReference: string;
    onbrowse: () => void;
  }

  let { schema, table = $bindable(), crossReference = $bindable(), onbrowse }: Props = $props();
</script>

<div class="schema-header">
  <div>
    <span class="eyebrow">TABLE SCHEMA</span>
    <h2>{table}</h2>
    <p>
      {schema[table]?.length ?? 0} columns · Select a field to find matching references.
    </p>
  </div>
  <Button
    variant="secondary"
    size="sm"
    onclick={onbrowse}
  >
    Browse rows →
  </Button>
</div>
<div class="schema-workspace">
  <section>
    <h3>Columns</h3>
    <div class="schema-columns">
      {#each schema[table] ?? [] as column, i}
        <button
          class:active={crossReference === column}
          onclick={() => (crossReference = column)}
        >
          <span>{String(i + 1).padStart(2, '0')}</span>
          <code>{column}</code>
          <Icon
            name="connect"
            size={14}
          />
        </button>
      {/each}
    </div>
  </section>
  <section class="references">
    <Icon
      name="connect"
      size={24}
    />
    <h3>{crossReference ? 'References to ' + crossReference : 'Follow a field'}</h3>
    <p>
      Find tables with a matching column name. These are potential relationships, not declared
      foreign keys.
    </p>
    {#if crossReference}
      {#each Object.keys(schema).filter((name) => schema[name]?.includes(crossReference)) as name}
        <button
          onclick={() => {
            table = name;
            crossReference = '';
          }}
        >
          <Icon
            name="grid"
            size={14}
          />
          <span>{name}</span>
          <Icon
            name="arrow-right"
            size={14}
          />
        </button>
      {/each}
    {/if}
  </section>
</div>

<style>
  @import './master-data-panel.css';
  @import './master-data-schema.css';
</style>
