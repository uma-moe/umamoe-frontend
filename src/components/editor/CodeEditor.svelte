<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import IconButton from '../controls/IconButton.svelte';
  import { QueryEditorView } from './query-editor-view';
  import type {
    UqlCompletionResult,
    UqlHighlightSegment,
    UqlSuggestion,
    UqlValidationIssue,
    UqlValidationState
  } from './query-editor-types';
  import './query-editor.css';

  let {
    id,
    value = $bindable(''),
    validationState = 'empty',
    issue = null,
    tokenize,
    complete,
    onclear,
    oncomplete
  }: {
    id: string;
    value?: string;
    validationState?: UqlValidationState;
    issue?: UqlValidationIssue | null;
    tokenize: (text: string) => UqlHighlightSegment[];
    complete: (text: string, position: number) => UqlCompletionResult | null;
    onclear: () => void;
    oncomplete?: (suggestion: UqlSuggestion) => void;
  } = $props();

  let host: HTMLDivElement;

  let editor = $state.raw<QueryEditorView>();

  let previousTokenizer: typeof tokenize;

  function clear(): void {
    onclear();
    editor?.focus();
  }

  onMount(() => {
    const view = new QueryEditorView({
      host,
      value,
      tokenize: (text) => tokenize(text),
      complete: (text, position) => complete(text, position),
      onchange: (text) => (value = text),
      inputId: id,
      oncomplete: (suggestion) => oncomplete?.(suggestion)
    });

    editor = view;
    view.update(value, issue);
    return () => view.destroy();
  });

  $effect(() => {
    const current = value;
    const validation = issue;
    // Refresh decorations when a demand-loaded catalog updates the language.
    const languageChanged = previousTokenizer !== tokenize;
    previousTokenizer = tokenize;
    untrack(() => editor?.update(current, validation, languageChanged));
  });
</script>

<div class="uql-cm-frame {validationState}">
  <div class="uql-cm-toolbar">
    <span class="uql-cm-lang">uql</span>
    <span class="uql-cm-meta">Ctrl+Space · Tab completes · Esc closes</span>
    {#if value}
      <div class="clear">
        <IconButton
          icon="close"
          label="Clear UQL"
          onclick={clear}
        />
      </div>
    {/if}
  </div>
  <div class="uql-cm-shell">
    <div
      class="uql-cm-host"
      bind:this={host}
    ></div>
  </div>
</div>

<style>
  .uql-cm-frame {
    --code-surface: #11151a;
    --code-on-surface-rgb: 255 255 255;
    min-width: 0;
  }
  .clear {
    margin-left: auto;
    display: flex;
  }
  .uql-cm-toolbar {
    min-height: var(--uql-control-height, 44px);
  }
  .uql-cm-meta {
    min-width: 0;
  }
  @media (max-width: 767px) {
    :global(.cm-tooltip.cm-tooltip-autocomplete > ul > li) {
      min-height: max(44px, var(--touch-target));
      height: auto;
    }
  }
</style>
