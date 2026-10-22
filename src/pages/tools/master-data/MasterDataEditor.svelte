<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { SqlEditorView } from './sql-editor-view';
  import type { MasterTable } from './master-data-types';

  interface Props {
    id: string;
    value: string;
    tables: MasterTable[];
    onrun: () => void;
  }

  let { id, value = $bindable(), tables, onrun }: Props = $props();

  let host: HTMLDivElement;
  let editor = $state.raw<SqlEditorView>();

  onMount(() => {
    const view = new SqlEditorView({
      host,
      id,
      value,
      onchange: (text) => (value = text),
      onrun: () => onrun()
    });

    editor = view;
    return () => view.destroy();
  });

  $effect(() => {
    const current = value;
    untrack(() => editor?.setValue(current));
  });

  $effect(() => {
    const current = tables;
    untrack(() => editor?.setTables(current));
  });
</script>

<div class="sql-editor">
  <div class="sql-editor-bar">
    <span class="language">SQLite</span>
    <span class="hint">Ctrl / ⌘ + Enter runs · Ctrl + Space suggests tables and columns</span>
  </div>
  <div bind:this={host}></div>
</div>

<style>
  .sql-editor {
    min-width: 0;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-md);
    background: #11151a;
  }
  .sql-editor:focus-within {
    border-color: rgba(100, 181, 246, 0.55);
    box-shadow: 0 0 0 2px rgba(100, 181, 246, 0.08);
  }
  .sql-editor-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 30px;
    padding: 0 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.035);
    color: rgba(255, 255, 255, 0.62);
    font-size: 11px;
  }
  .language {
    color: #64b5f6;
    font-family: var(--font-mono);
    font-weight: 800;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .hint {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
