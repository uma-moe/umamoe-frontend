<script lang="ts">
  import AptitudeGrade, { type AptitudeGradeValue } from './AptitudeGrade.svelte';

  export interface AptitudeItem {
    id: string;
    label: string;
    grade: AptitudeGradeValue;
    group?: string;
  }

  interface Props {
    items: AptitudeItem[];
    label?: string;
    compact?: boolean;
    stretch?: boolean;
    /** `fields` boxes each grade like the simulator's aptitude selects, one group per row. */
    layout?: 'rows' | 'columns' | 'fields';
    gradeFirst?: boolean;
  }

  let {
    items,
    label = 'Aptitudes',
    compact = false,
    stretch = false,
    layout = 'rows',
    gradeFirst = false
  }: Props = $props();

  const groups = $derived.by(() => {
    const grouped = new Map<string, AptitudeItem[]>();
    for (const item of items) {
      const key = item.group ?? 'General';
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }

    return [...grouped.entries()].map(([groupLabel, groupItems]) => ({
      label: groupLabel,
      items: groupItems
    }));
  });
</script>

<div class="aptitude-container">
  <div
    class="aptitude-grid"
    class:compact
    class:stretch
    class:columns={layout === 'columns'}
    class:fields={layout === 'fields'}
    class:grade-first={gradeFirst}
    aria-label={label}
  >
    {#each groups as group (group.label)}
      <section
        class="aptitude-group"
        data-group={group.label.toLowerCase()}
        aria-label={group.label}
      >
        <h4>{compact && layout === 'rows' && group.label === 'Distance' ? 'Dist' : group.label}</h4>
        <div
          class="aptitude-items"
          role="list"
        >
          {#each group.items as item (item.id)}
            <div
              class="aptitude-item"
              role="listitem"
            >
              <span>{item.label}</span>
              <AptitudeGrade
                grade={item.grade}
                label={item.label}
                size={compact && layout === 'columns' ? 'xs' : 'sm'}
              />
            </div>
          {/each}
        </div>
      </section>
    {/each}
  </div>
</div>

<style>
  .aptitude-container {
    min-width: 0;
    container-type: inline-size;
    overflow-x: auto;
  }
  .aptitude-grid {
    width: fit-content;
    max-width: 100%;
    min-width: 0;
    display: grid;
    gap: 4px;
    padding: 7px 10px;
    border-radius: var(--radius-md);
    background: var(--card-surface-bg);
  }
  .aptitude-group {
    min-width: 0;
    display: grid;
    grid-template-columns: 62px minmax(0, 1fr);
    align-items: center;
    gap: 6px;
  }
  h4 {
    margin: 0;
    color: var(--color-text-subtle);
    font-size: 8px;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .aptitude-items {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
  }
  .aptitude-item {
    min-width: 60px;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
  }
  .aptitude-item > span {
    order: -1;
    overflow: hidden;
    color: var(--color-text-subtle);
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .compact {
    padding: 5px 7px;
    gap: 3px;
  }
  .compact .aptitude-group {
    grid-template-columns: 46px minmax(0, 1fr);
    gap: 4px;
  }
  .compact .aptitude-items {
    gap: 3px 7px;
  }
  .compact .aptitude-item {
    min-width: 52px;
  }
  .stretch {
    width: 100%;
  }
  .stretch .aptitude-items {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(78px, 1fr));
  }
  .stretch .aptitude-item {
    min-width: 0;
    justify-content: space-between;
  }
  .columns {
    width: 100%;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--border-subtle);
    background: var(--card-surface-bg);
  }
  .columns .aptitude-group {
    display: grid;
    grid-template-columns: 1fr;
    align-content: start;
    gap: 7px;
    padding: 9px 10px;
  }
  .columns .aptitude-group + .aptitude-group {
    border-left: 1px solid var(--border-subtle);
  }
  .columns h4 {
    color: var(--color-accent);
    font-size: 9px;
  }
  .columns .aptitude-items {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px 9px;
  }
  .columns .aptitude-item {
    min-width: 0;
    justify-content: space-between;
  }
  @container (max-width: 430px) {
    .aptitude-grid {
      width: 100%;
      padding: 5px 4px;
    }
    .aptitude-group {
      grid-template-columns: 48px minmax(0, 1fr);
      gap: 2px;
    }
    .aptitude-items {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 3px 5px;
    }
    .aptitude-item {
      min-width: 0;
      justify-content: space-between;
    }
    .aptitude-item > span {
      font-size: 8px;
    }
    .columns {
      grid-template-columns: 1fr;
    }
    .columns .aptitude-group + .aptitude-group {
      border-top: 1px solid var(--border-subtle);
      border-left: 0;
    }
  }
  .compact:not(.columns) {
    grid-template-columns: max-content repeat(4, max-content);
    justify-content: start;
    align-items: center;
    gap: 4px 6px;
    padding: 6px 10px;
    border: 1px solid var(--border-subtle);
    background: var(--card-surface-bg);
  }
  .compact:not(.columns) .aptitude-group,
  .compact:not(.columns) .aptitude-items {
    display: contents;
  }
  .compact:not(.columns) h4 {
    grid-column: 1;
    padding-right: 4px;
    font-size: 9px;
    font-weight: 600;
    color: var(--text-secondary);
  }
  .compact:not(.columns) .aptitude-item {
    min-width: 58px;
    justify-content: flex-end;
    gap: 3px;
  }
  .compact:not(.columns) .aptitude-item > span {
    color: var(--text-primary);
    font-size: 10px;
    line-height: 1.2;
  }
  @container (max-width:360px) {
    .compact:not(.columns) {
      grid-template-columns: max-content repeat(4, minmax(0, 1fr));
      gap: 4px 2px;
      padding: 5px 4px;
    }
    .compact:not(.columns) h4 {
      padding-right: 0;
    }
    .compact:not(.columns) .aptitude-item {
      min-width: 0;
      gap: 2px;
    }
    .compact:not(.columns) .aptitude-item > span {
      font-size: 9px;
    }
    .compact:not(.columns) :global(.aptitude) {
      width: 20px;
      height: 20px;
    }
  }
  .compact.grade-first:not(.columns) {
    grid-template-columns: 40px repeat(4, minmax(0, 1fr));
    gap: 4px;
    padding: 8px;
  }
  .compact.grade-first:not(.columns) h4 {
    padding: 0;
    text-transform: none;
    letter-spacing: 0;
  }
  .compact.grade-first:not(.columns) .aptitude-item {
    min-width: 0;
    justify-content: flex-start;
    gap: 3px;
  }
  .compact.grade-first:not(.columns) .aptitude-item > span:first-child {
    order: 1;
  }
  .compact.grade-first:not(.columns) :global(.aptitude) {
    width: 18px;
    height: 18px;
  }
  .fields {
    width: 100%;
    gap: 4px;
    padding: 0;
    background: transparent;
  }
  .fields .aptitude-group {
    grid-template-columns: 46px repeat(4, minmax(0, 1fr));
    gap: 4px;
  }
  .fields .aptitude-items {
    display: contents;
  }
  .fields h4 {
    color: var(--text-primary);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
  }
  .fields .aptitude-item {
    min-width: 0;
    min-height: 26px;
    justify-content: flex-start;
    gap: 5px;
    padding: 0 6px 0 3px;
    border: 1px solid var(--factor-field-border);
    border-radius: 6px;
    background: var(--factor-field-bg);
  }
  .fields .aptitude-item > span {
    order: 1;
    color: var(--factor-field-text);
    font-size: 10px;
  }
  .fields :global(.aptitude) {
    width: 18px;
    height: 18px;
  }
  @container (max-width: 380px) {
    .fields .aptitude-group {
      grid-template-columns: 40px repeat(4, minmax(0, 1fr));
      gap: 3px;
    }
    .fields h4,
    .fields .aptitude-item > span {
      font-size: 9px;
    }
    .fields .aptitude-item {
      gap: 2px;
      padding: 0 2px;
    }
    .fields :global(.aptitude) {
      width: 16px;
      height: 16px;
    }
  }
  @container (max-width:330px) {
    .compact.grade-first:not(.columns) {
      grid-template-columns: 28px repeat(4, minmax(0, 1fr));
      gap: 3px;
      padding: 6px 4px;
    }
    .compact.grade-first:not(.columns) .aptitude-item {
      gap: 2px;
    }
  }
</style>
