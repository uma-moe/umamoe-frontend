<script
  module
  lang="ts"
>
  /** Plain text, or an emphasised value; a style value leads with its running style's colour. */
  export type FindingPart = string | { text: string; style?: number };
</script>

<script lang="ts">
  import { styleColors } from '../analysis-view';

  /**
   * Renders a sentence from its parts with no whitespace between them, so punctuation sits
   * directly against emphasised values however the markup is formatted.
   */
  let { parts }: { parts: FindingPart[] } = $props();
</script>

{#each parts as part, index (index)}
  {#if typeof part === 'string'}
    {part}
  {:else}
    <strong
      class:styled={part.style !== undefined}
      style:--style-color={part.style === undefined ? undefined : styleColors[part.style]}
    >
      {part.text}
    </strong>
  {/if}
{/each}

<style>
  strong {
    color: var(--text-primary);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .styled::before {
    content: '';
    display: inline-block;
    width: 0.5em;
    height: 0.5em;
    margin: 0 0.35em 0 0.05em;
    border-radius: 50%;
    background: var(--style-color);
    vertical-align: 0.06em;
  }
</style>
