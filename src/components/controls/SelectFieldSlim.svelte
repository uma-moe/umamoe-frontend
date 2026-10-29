<script lang="ts">
  import type { ComponentProps } from 'svelte';
  import SelectField from './SelectField.svelte';

  let { value = $bindable(''), ...props }: ComponentProps<typeof SelectField> = $props();
</script>

<div class="select-field-slim">
  <SelectField
    {...props}
    bind:value
  />
</div>

<style>
  .select-field-slim {
    min-width: 0;
  }
  .select-field-slim :global(.select-panel button),
  .select-field-slim :global(.empty) {
    min-height: 28px;
    padding: 2px 8px;
  }
  .select-field-slim :global(.select-panel button:has(.rich-copy)) {
    min-height: 34px;
    padding-block: 3px;
  }
  @media (max-width: 767px) {
    .select-field-slim :global(.select-panel button),
    .select-field-slim :global(.empty) {
      min-height: 36px;
    }
    .select-field-slim :global(.select-panel button:has(.rich-copy)) {
      min-height: 40px;
    }
  }
</style>
