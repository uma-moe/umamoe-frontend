<script lang="ts">
  import SegmentedControl, { type Segment } from '@/components/controls/SegmentedControl.svelte';

  /**
   * A row of segments labelled like the dropdowns beside it and at their height, so a setup form mixes the two in one
   * grid. The segments share the field's width; `id` names the control for the form's layout and tests.
   */
  let {
    id,
    label,
    options,
    value = $bindable()
  }: { id: string; label: string; options: Segment[]; value: string } = $props();
</script>

<div class="toggle-field">
  <span class="toggle-label">{label}</span>
  <div {id}>
    <SegmentedControl
      {label}
      {options}
      bind:value
      compact
    />
  </div>
</div>

<style>
  .toggle-field {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .toggle-label {
    color: var(--color-text);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.2;
  }
  .toggle-field :global(.segments) {
    width: 100%;
  }
  .toggle-field :global(.segments button) {
    flex: 1 1 auto;
    padding-inline: 6px;
    font-size: 12px;
  }
  .toggle-field :global(.segments button.icon-only) {
    min-width: 30px;
    padding-inline: 0;
  }
  .toggle-field :global(.segments img) {
    width: 24px;
    height: 24px;
  }
</style>
