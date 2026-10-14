<script lang="ts">
  import { tick } from 'svelte';
  import AffinityPicker from '@/components/pickers/AffinityPicker.svelte';
  import CharacterSelectDialog from '@/components/pickers/CharacterSelectDialog.svelte';
  import type { CharacterPickerSort } from '@/components/pickers/CharacterPicker.svelte';
  import type { CharacterPickerOption } from '@/components/pickers/picker-types';
  import type { VeteranUiRecord } from '@/components/game/veteran-ui-types';
  import ParentPickerDialog from '@/components/parent-picker/ParentPickerDialog.svelte';
  import type { SelectableParent } from '@/lib/veterans/parent-picker';

  interface Props {
    characters: CharacterPickerOption[];
    loading?: boolean;
    error?: string;
    onretry?: () => void;
    targetId?: string;
    veteran?: VeteranUiRecord;
    sharedLegacyLabel?: string;
    selectedAccountId?: string;
    ontargetchange?: (value: string) => void;
    onveteranchange: (value: SelectableParent | undefined) => void;
  }

  let {
    characters,
    loading = false,
    error = '',
    onretry,
    targetId = '',
    veteran,
    sharedLegacyLabel,
    selectedAccountId,
    ontargetchange,
    onveteranchange
  }: Props = $props();

  let picker = $state<{ focusLegacy: () => void }>();
  let targetDialogOpen = $state(false),
    veteranDialogOpen = $state(false);
  let targetSort = $state<CharacterPickerSort>('default');

  const target = $derived(
    characters.find(
      (character) =>
        character.id === targetId ||
        (Number(targetId) < 10000 && Math.floor(Number(character.id) / 100) === Number(targetId))
    )
  );

  function openTarget(): void {
    targetSort = characters.some((character) => character.affinity !== undefined)
      ? 'affinity'
      : 'default';
    targetDialogOpen = true;
  }

  function selectTarget(values: string[]): void {
    ontargetchange?.(values[0] ?? '');
    targetDialogOpen = false;
  }

  async function selectLegacy(value: SelectableParent | undefined): Promise<void> {
    onveteranchange(value);
    await tick();
    picker?.focusLegacy();
  }
</script>

<AffinityPicker
  bind:this={picker}
  {target}
  {veteran}
  {sharedLegacyLabel}
  ontargetpick={openTarget}
  ontargetclear={() => ontargetchange?.('')}
  onlegacypick={() => (veteranDialogOpen = true)}
  onlegacyclear={() => selectLegacy(undefined)}
/>
<CharacterSelectDialog
  bind:open={targetDialogOpen}
  label="Target character"
  options={characters}
  {loading}
  {error}
  {onretry}
  selected={target ? [target.id] : []}
  bind:sort={targetSort}
  onselect={selectTarget}
/>
{#if veteranDialogOpen}
  <ParentPickerDialog
    bind:open={veteranDialogOpen}
    targetId={Number(targetId) || undefined}
    {selectedAccountId}
    onselect={selectLegacy}
  />
{/if}
