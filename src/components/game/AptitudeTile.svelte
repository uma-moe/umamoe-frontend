<script lang="ts">
  import AptitudeGrade, { type AptitudeGradeValue } from './AptitudeGrade.svelte';

  interface Props {
    label: string;
    /** Missing when a capture did not record this grade. */
    grade?: AptitudeGradeValue;
    /** A smaller line above the label, such as the category a race grade was read for. */
    caption?: string;
    /** A taller tile with a bolder label, for the few grades a race applies. */
    prominent?: boolean;
    title?: string;
  }

  let { label, grade, caption, prominent = false, title }: Props = $props();
</script>

<!-- The tint follows the grade, so strong and weak aptitudes read at a glance. -->
<span
  class="aptitude-tile"
  class:prominent
  style:--aptitude-color={grade ? `var(--aptitude-${grade.toLowerCase()})` : 'var(--text-muted)'}
  {title}
>
  <span class="label">
    {#if caption}
      <small>{caption}</small>
    {/if}
    {label}
  </span>
  {#if grade}
    <AptitudeGrade
      {grade}
      {label}
      size="sm"
    />
  {:else}
    <span
      class="unknown-grade"
      aria-label={label + ': not recorded'}
      title="Aptitude not recorded"
    >
      —
    </span>
  {/if}
</span>

<style>
  .aptitude-tile {
    min-width: 0;
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    padding: 4px 8px;
    border: 1px solid color-mix(in srgb, var(--aptitude-color) 18%, var(--border-subtle));
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--aptitude-color) 6%, var(--surface-2));
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1.3;
  }
  .label {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .prominent {
    min-height: 38px;
  }
  .prominent .label {
    display: grid;
    gap: 1px;
    color: var(--text-primary);
    font-weight: 600;
  }
  small {
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 400;
  }
  .unknown-grade {
    width: 22px;
    display: inline-grid;
    place-items: center;
    color: var(--text-muted);
    font-size: 12px;
  }
</style>
