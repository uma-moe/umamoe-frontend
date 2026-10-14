<script lang="ts">
  import type { CharacterPickerSort } from '@/components/pickers/CharacterPicker.svelte';
  import CharacterSelectDialog from '@/components/pickers/CharacterSelectDialog.svelte';
  import IncludeExcludePicker from '@/components/pickers/IncludeExcludePicker.svelte';
  import type { CharacterPickerOption } from '@/components/pickers/picker-types';

  type Rule = 'allow-main' | 'hide-main' | 'allow-great' | 'hide-great';

  interface Props {
    options: CharacterPickerOption[];
    loading?: boolean;
    error?: string;
    onretry?: () => void;
    allowMain?: string[];
    hideMain?: string[];
    allowGreat?: string[];
    hideGreat?: string[];
    onchange?: (rule: Rule, values: string[]) => void;
  }

  let {
    options,
    loading = false,
    error = '',
    onretry,
    allowMain = [],
    hideMain = [],
    allowGreat = [],
    hideGreat = [],
    onchange
  }: Props = $props();

  let open = $state(false);
  let activeRule = $state<Rule>('allow-main');
  let draft = $state<string[]>([]);
  let pickerSort = $state<CharacterPickerSort>('default');

  const optionMap = $derived.by(() => {
    const map = new Map(options.map((option) => [option.id, option]));
    for (const option of options) {
      const baseId = String(Math.floor(Number(option.id) / 100));
      if (!map.has(baseId)) map.set(baseId, option);
    }
    return map;
  });
  const mode = $derived(activeRule.startsWith('allow') ? 'include' : 'exclude');

  function valuesFor(rule: Rule): string[] {
    if (rule === 'allow-main') return allowMain;
    if (rule === 'hide-main') return hideMain;
    if (rule === 'allow-great') return allowGreat;
    return hideGreat;
  }

  function edit(rule: Rule): void {
    activeRule = rule;
    draft = [];
    pickerSort = 'default';
    open = true;
  }

  function remove(rule: Rule, id: string): void {
    onchange?.(
      rule,
      valuesFor(rule).filter((value) => value !== id)
    );
  }

  function confirm(values: string[]): void {
    onchange?.(activeRule, [...new Set([...valuesFor(activeRule), ...values])]);
    open = false;
  }
</script>

<div class="legacy-tree">
  {#each [{ label: 'Main parent (P1/P2)', suffix: 'main', included: allowMain, excluded: hideMain }, { label: 'Great parent (GP1/GP2)', suffix: 'great', included: allowGreat, excluded: hideGreat }] as group}
    <IncludeExcludePicker
      label={group.label}
      tone={group.suffix === 'great' ? 'purple' : 'blue'}
      included={group.included.map((id) => ({
        id,
        label: optionMap.get(id)?.name ?? id,
        image: optionMap.get(id)?.image
      }))}
      excluded={group.excluded.map((id) => ({
        id,
        label: optionMap.get(id)?.name ?? id,
        image: optionMap.get(id)?.image
      }))}
      onadd={(mode) => edit(`${mode === 'include' ? 'allow' : 'hide'}-${group.suffix}` as Rule)}
      onremove={(mode, id) =>
        remove(`${mode === 'include' ? 'allow' : 'hide'}-${group.suffix}` as Rule, id)}
    />
  {/each}
</div>

<CharacterSelectDialog
  id="database-character-rules"
  bind:open
  {options}
  {loading}
  {error}
  {onretry}
  bind:selected={draft}
  existing={valuesFor(activeRule).map((id) => optionMap.get(id)?.id ?? id)}
  {mode}
  multiple
  bind:sort={pickerSort}
  onselect={confirm}
/>

<style>
  .legacy-tree {
    min-width: 0;
    flex: 1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: auto auto 1fr;
    column-gap: 32px;
    row-gap: 8px;
  }
  .legacy-tree > :global(.tree-box) {
    display: grid;
    grid-template-rows: subgrid;
    grid-row: span 3;
  }
  .legacy-tree > :global(.tree-box + .tree-box) {
    border-left: 1px solid var(--border-primary);
    margin-left: -17px;
    padding-left: 16px;
  }
  @media (max-width: 600px) {
    .legacy-tree {
      grid-template-columns: minmax(0, 1fr);
      row-gap: 16px;
    }
    .legacy-tree > :global(.tree-box) {
      grid-template-rows: auto auto auto;
      grid-row: auto;
    }
    .legacy-tree > :global(.tree-box + .tree-box) {
      border-left: 0;
      margin-left: 0;
      padding-left: 0;
      border-top: 1px solid var(--border-primary);
      padding-top: 16px;
    }
  }
</style>
