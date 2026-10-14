<script lang="ts">
  import Menu from '../navigation/Menu.svelte';

  export type CharacterSortValue = 'default' | 'name' | 'affinity';

  interface Props {
    value?: CharacterSortValue;
    hasAffinity?: boolean;
    onchange?: (value: CharacterSortValue) => void;
  }

  let { value = $bindable('default'), hasAffinity = false, onchange }: Props = $props();

  const options = $derived([
    { value: 'default' as const, label: 'Default', icon: 'calendar' as const, disabled: false },
    { value: 'name' as const, label: 'Name (A–Z)', icon: 'sort' as const, disabled: false },
    {
      value: 'affinity' as const,
      label: hasAffinity ? 'Affinity' : 'Affinity (n/a)',
      icon: 'heart' as const,
      disabled: !hasAffinity
    }
  ]);
  const selectedLabel = $derived(
    value === 'name' ? 'Name' : value === 'affinity' ? 'Affinity' : 'Default'
  );

  function select(next: CharacterSortValue): void {
    value = next;
    onchange?.(next);
  }
</script>

<div class="sort-menu">
  <Menu
    label={selectedLabel}
    ariaLabel={`Sort: ${selectedLabel}`}
    menuLabel="Character sort order"
    icon="sort"
    items={options.map((option) => ({
      id: option.value,
      label: option.label,
      icon: option.icon,
      disabled: option.disabled,
      checked: value === option.value
    }))}
    onselect={(id) => select(id as CharacterSortValue)}
  />
</div>

<style>
  .sort-menu {
    margin-left: auto;
  }
  .sort-menu :global(.trigger) {
    min-width: 104px;
    height: 32px;
    gap: 4px;
    padding: 4px 6px 4px 8px;
    border-color: var(--dialog-border);
    border-radius: 8px;
    background: var(--factor-field-bg);
    color: var(--text-secondary);
    font-size: 12px;
  }
  .sort-menu :global(.trigger:hover),
  .sort-menu :global(.trigger[aria-expanded='true']) {
    background: var(--factor-field-bg);
    border-color: var(--border-secondary);
    color: var(--text-primary);
  }
  .sort-menu :global(.trigger svg) {
    flex: none;
    color: var(--dialog-icon-muted);
  }
  @media (max-width: 600px) {
    .sort-menu :global(.trigger) {
      min-width: var(--touch-target);
      width: var(--touch-target);
      padding: 0;
      justify-content: center;
    }
    .sort-menu :global(.trigger > span),
    .sort-menu :global(.trigger > svg:last-child) {
      display: none;
    }
  }
</style>
