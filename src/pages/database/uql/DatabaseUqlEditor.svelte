<script lang="ts">
  import CodeEditor from '@/components/editor/CodeEditor.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { UqlValidationIssue } from '@/components/editor/query-editor-types';
  import type { UqlValidation } from '@/lib/inheritance/uql/uql';
  import type { UqlQueryCatalog } from '@/lib/inheritance/uql/uql-compiler';
  import type { SelectableParent } from '@/lib/veterans/parent-picker';
  import type { CatalogEntry } from '../catalog-repository';
  import { createDatabaseUqlLanguage } from './database-uql-language';
  import DatabaseUqlGuide from './DatabaseUqlGuide.svelte';

  let {
    value = $bindable(''),
    validation,
    characters,
    supports,
    catalog,
    loading,
    legacyParents = [],
    onclear,
    onpicklegacy
  }: {
    value?: string;
    validation: UqlValidation;
    characters: CatalogEntry[];
    supports: CatalogEntry[];
    catalog: UqlQueryCatalog | null;
    loading: boolean;
    legacyParents?: SelectableParent[];
    onclear: () => void;
    onpicklegacy: () => void;
  } = $props();

  const language = $derived(
    createDatabaseUqlLanguage(
      characters,
      supports,
      catalog?.races ?? [],
      catalog?.characters ?? [],
      legacyParents
    )
  );
  const statusLabel = $derived(
    loading
      ? 'Loading'
      : !catalog
        ? 'Unavailable'
        : { empty: 'UQL', valid: 'Valid', incomplete: 'Incomplete', invalid: 'Invalid' }[
            validation.state
          ]
  );
  const issue = $derived.by<UqlValidationIssue | null>(() => {
    if (!catalog) return null;
    if (validation.state !== 'invalid' && validation.state !== 'incomplete') return null;
    const unknown = validation.message.match(/^Unknown field or function: (.+)$/)?.[1];
    const index = unknown ? value.toLowerCase().indexOf(unknown.toLowerCase()) : -1;
    return {
      from: index < 0 ? 0 : index,
      to: index < 0 ? value.length : index + unknown!.length,
      message: validation.message,
      state: validation.state
    };
  });

  function insert(text: string): void {
    const predicate = value
      .replace(/^\s*where\b\s*/i, '')
      .trim()
      .replace(/;\s*$/, '')
      .replace(/\s+and\s*$/i, '');
    value = predicate ? `${predicate} and ${text}` : text;
  }
</script>

<section
  class="uql-mode-panel"
  aria-label="UQL filters"
>
  <div class="uql-editor-card">
    <header class="uql-editor-header">
      <div class="uql-title-group">
        <h4>UQL</h4>
        <span>SQL for your umas</span>
      </div>
      <div
        class="uql-status {validation.state}"
        role="status"
      >
        <Icon
          name={validation.state === 'valid'
            ? 'check'
            : validation.state === 'invalid'
              ? 'warning'
              : 'status'}
          size={16}
        />{statusLabel}
      </div>
    </header>
    <DatabaseUqlGuide
      {language}
      oninsert={insert}
    />
    <CodeEditor
      id="database-uql"
      bind:value
      validationState={validation.state}
      {issue}
      tokenize={language.tokenizeForEditor}
      complete={language.completeForEditor}
      {onclear}
      oncomplete={(suggestion) => {
        if (suggestion.valueContext === 'legacy' && suggestion.insertText.includes('[]'))
          onpicklegacy();
      }}
    />
    <div
      class="uql-message"
      class:invalid={validation.state === 'invalid'}
    >
      <span
        id="database-uql-hint"
        role={issue ? 'alert' : undefined}
      >
        {loading
          ? 'Loading query names…'
          : validation.message || 'Type a field, pick an operator, then keep chaining with and/or.'}
      </span>
      <span class="uql-key-hint">Ctrl+Space suggestions</span>
    </div>
  </div>
</section>

<style>
  .uql-mode-panel {
    padding: 0 1px 8px;
    min-width: 0;
  }
  .uql-editor-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    min-width: 0;
  }
  .uql-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }
  .uql-title-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--color-accent);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .uql-title-group > span {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .uql-status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 9px;
    border-radius: 14px;
    background: rgb(158 158 158 / 0.12);
    border: 1px solid rgb(158 158 158 / 0.25);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .uql-status.valid {
    background: rgb(76 175 80 / 0.14);
    border-color: rgb(76 175 80 / 0.35);
    color: var(--accent-secondary);
  }
  .uql-status.incomplete {
    background: rgb(255 183 77 / 0.12);
    border-color: rgb(255 183 77 / 0.35);
    color: var(--accent-warning);
  }
  .uql-status.invalid {
    background: rgb(229 115 115 / 0.12);
    border-color: rgb(229 115 115 / 0.35);
    color: var(--accent-error);
  }
  .uql-message {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    min-height: 16px;
    color: var(--text-secondary);
    font-size: 12px;
  }
  .uql-message.invalid {
    color: var(--accent-error);
  }
  .uql-key-hint {
    color: var(--text-muted);
    white-space: nowrap;
  }
  @media (max-width: 600px) {
    .uql-editor-header {
      align-items: flex-start;
      flex-direction: column;
    }
    .uql-key-hint {
      display: none;
    }
  }
  /* Angular scales the database at this breakpoint. Compensate touch targets,
     and keep the approved page frame and navigation outside that scale. */
  @media (max-width: 430px) {
    .uql-mode-panel {
      zoom: 0.85;
      --touch-target: 52px;
      --uql-control-height: 52px;
    }
  }
</style>
