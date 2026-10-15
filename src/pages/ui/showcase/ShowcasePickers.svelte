<script lang="ts">
  import AffinityPicker from '@/components/pickers/AffinityPicker.svelte';
  import CharacterSelectDialog from '@/components/pickers/CharacterSelectDialog.svelte';
  import IncludeExcludePicker from '@/components/pickers/IncludeExcludePicker.svelte';
  import SupportCardPicker from '@/components/pickers/SupportCardPicker.svelte';
  import DemoBlock from '../DemoBlock.svelte';
  import { characterPickerOptions, supportCardOptions, veteranFixture } from '../fixtures';

  let { ids }: { ids: string[] } = $props();

  let target = $state('mcqueen'),
    targetOpen = $state(false),
    legacy = $state(true);
  let include = $state(['oguri']),
    exclude = $state<string[]>([]),
    pickerOpen = $state(false),
    pickerMode = $state<'include' | 'exclude'>('include');
  let support = $state('support-speed');

  const items = (values: string[]) =>
    characterPickerOptions
      .filter((item) => values.includes(item.id))
      .map((item) => ({ id: item.id, label: item.name, image: item.image }));
</script>

{#if ids.includes('affinity-picker')}
  <DemoBlock id="affinity-picker">
    <div class="preview-narrow">
      <AffinityPicker
        target={characterPickerOptions.find((item) => item.id === target)}
        veteran={legacy ? veteranFixture : undefined}
        ontargetpick={() => (targetOpen = true)}
        ontargetclear={() => (target = '')}
        onlegacypick={() => (legacy = true)}
        onlegacyclear={() => (legacy = false)}
      />
    </div>
    <CharacterSelectDialog
      bind:open={targetOpen}
      options={characterPickerOptions}
      selected={target ? [target] : []}
      onselect={(values) => {
        target = values[0] ?? '';
        targetOpen = false;
      }}
    />
  </DemoBlock>
{/if}
{#if ids.includes('character-picker')}
  <DemoBlock id="character-picker">
    <div class="preview-narrow">
      <IncludeExcludePicker
        label="This veteran"
        compact
        included={items(include)}
        excluded={items(exclude)}
        onadd={(mode) => {
          pickerMode = mode;
          pickerOpen = true;
        }}
        onremove={(mode, id) => {
          if (mode === 'include') include = include.filter((value) => value !== id);
          else exclude = exclude.filter((value) => value !== id);
        }}
      />
    </div>
    <CharacterSelectDialog
      bind:open={pickerOpen}
      options={characterPickerOptions}
      mode={pickerMode}
      multiple
      selected={pickerMode === 'include' ? include : exclude}
      onselect={(values) => {
        if (pickerMode === 'include') include = values;
        else exclude = values;
      }}
    />
  </DemoBlock>
{/if}
{#if ids.includes('support-picker')}
  <DemoBlock id="support-picker">
    <div class="preview-narrow">
      <SupportCardPicker
        options={supportCardOptions}
        bind:value={support}
      />
    </div>
  </DemoBlock>
{/if}
