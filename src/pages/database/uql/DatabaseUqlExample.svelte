<script lang="ts">
  import { isUqlChipSegment } from '@/components/editor/query-editor-types';
  import type { UqlEditorLanguage } from '@/lib/inheritance/uql/uql-editor';

  let { language, text }: { language: UqlEditorLanguage; text: string } = $props();
</script>

<pre
  class="uql-doc-snippet"
  aria-hidden="true">{#each language.tokenizeForEditor(text) as segment}
    <span
      class="uql-token uql-token-{segment.kind} {segment.valueContext
        ? 'uql-context-' + segment.valueContext.replace('-factor', '')
        : ''} {segment.scopeContext ? 'uql-scope-' + segment.scopeContext : ''} {segment.kind ===
      'paren'
        ? 'uql-paren-depth-' + segment.depth
        : ''}"
      class:uql-token-chip={isUqlChipSegment(segment)}
      class:uql-token-chip-no-image={isUqlChipSegment(segment) && !segment.imageUrl}
      class:uql-token-atomic={segment.atomic}
      title={segment.title}>{#if segment.imageUrl}
        <img
          class="uql-token-image"
          src={segment.imageUrl}
          alt=""
        />
      {/if}<span>{segment.displayText || segment.text}</span></span>
  {/each}</pre>
