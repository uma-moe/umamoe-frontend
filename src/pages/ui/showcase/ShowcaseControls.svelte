<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import ToggleButton from '@/components/controls/ToggleButton.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';
  import Combobox from '@/components/controls/Combobox.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import RadioGroup from '@/components/controls/RadioGroup.svelte';
  import Slider from '@/components/controls/Slider.svelte';
  import FileDrop from '@/components/controls/FileDrop.svelte';
  import DemoBlock from '../DemoBlock.svelte';
  import { characterPickerOptions } from '../fixtures';

  interface Props {
    ids: string[];
    onnotify: (message?: string) => void;
  }

  let { ids, onnotify }: Props = $props();

  let textValue = $state('Mejiro McQueen'),
    searchValue = $state(''),
    numberValue = $state('');
  let region = $state('global'),
    character = $state(''),
    storage = $state('local'),
    segment = $state('cards');
  let checked = $state(true),
    compact = $state(true),
    minimum = $state(2),
    maximum = $state(7);
  let eventTypes = $state([
    {
      id: 'characters',
      label: 'Characters',
      icon: 'user' as const,
      color: 'var(--accent-primary)',
      checked: true
    },
    {
      id: 'supports',
      label: 'Support cards',
      icon: 'cards' as const,
      color: 'var(--accent-purple)',
      checked: true
    },
    { id: 'campaigns', label: 'Campaigns', icon: 'gift' as const, color: '#4db6ac', checked: true },
    {
      id: 'champions',
      label: 'Champions Meeting',
      icon: 'trophy' as const,
      color: 'var(--accent-purple)',
      checked: true
    }
  ]);
</script>

{#if ids.includes('button')}
  <DemoBlock id="button">
    <div class="preview-stack">
      <div class="preview-row">
        <Button onclick={() => onnotify()}>Save</Button><Button
          variant="secondary"
          icon="download"
          onclick={() => onnotify('Export preview')}
        >
          Export
        </Button><Button variant="ghost">Cancel</Button><Button
          variant="danger"
          icon="trash"
        >
          Delete
        </Button><Button loading>Saving</Button><Button disabled>Unavailable</Button><IconButton
          icon="filter"
          label="Filters"
          selected
        />
      </div>
      <div class="preview-row">
        <ToggleButton
          label="Compact gaps"
          icon="refresh"
          pressed={compact}
          onclick={() => (compact = !compact)}
        /><SegmentedControl
          label="Display"
          options={[
            { value: 'cards', label: 'Cards' },
            { value: 'table', label: 'Table' }
          ]}
          bind:value={segment}
        />
      </div>
    </div>
  </DemoBlock>
{/if}
{#if ids.includes('text-field')}
  <DemoBlock id="text-field">
    <div class="preview-grid">
      <div class="preview-stack">
        <TextField
          id="name"
          label="Veteran name"
          bind:value={textValue}
        /><TextField
          id="search"
          type="search"
          label="Search database"
          bind:value={searchValue}
          placeholder="Character, skill, factor…"
        /><TextField
          id="invalid"
          label="Share code"
          value="ABC"
          error="The share code must contain 12 characters."
        />
      </div>
      <div class="preview-stack">
        <TextField
          id="number-field"
          label="Number"
          type="number"
          min={0}
          max={2}
          step={0.25}
          bind:value={numberValue}
          help="Steps of 0.25, between 0 and 2."
        /><TextField
          id="readonly-number"
          label="Read only number"
          type="number"
          value="1"
          readonly
        /><TextField
          id="disabled-number"
          label="Disabled number"
          type="number"
          value="1"
          disabled
        />
      </div>
    </div>
  </DemoBlock>
{/if}
{#if ids.includes('select')}
  <DemoBlock id="select">
    <div class="preview-grid">
      <SelectField
        id="region"
        label="Data region"
        options={[
          { value: 'global', label: 'Global' },
          { value: 'jp', label: 'Japan' }
        ]}
        bind:value={region}
      /><SelectFieldSlim
        id="region-slim"
        label="Data region (slim)"
        options={[
          { value: 'global', label: 'Global' },
          { value: 'jp', label: 'Japan' }
        ]}
        bind:value={region}
      /><Combobox
        id="character"
        label="Character"
        bind:value={character}
        placeholder="Start typing a name"
        options={characterPickerOptions.map((item) => ({
          value: item.name,
          label: item.name,
          image: item.image
        }))}
      />
    </div>
  </DemoBlock>
{/if}
{#if ids.includes('choice')}
  <DemoBlock id="choice">
    <div class="preview-grid">
      <div class="preview-stack">
        <Checkbox
          id="include-inheritance"
          label="Include inheritance factors"
          bind:checked
        /><Checkbox
          id="partial-choice"
          label="Select visible results"
          indeterminate
        /><Checkbox
          id="disabled-choice"
          label="Unavailable option"
          disabled
        /><RadioGroup
          id="storage"
          legend="Default storage"
          bind:value={storage}
          options={[
            { value: 'local', label: 'Local device' },
            { value: 'account', label: 'Linked account' }
          ]}
        />
      </div>
      <div class="preview-stack">
        <div class="event-types">
          {#each eventTypes as type}
            <div style:--color-accent={type.color}>
              <Checkbox
                id={'preview-' + type.id}
                label={type.label}
                icon={type.icon}
                bind:checked={type.checked}
              />
            </div>
          {/each}
        </div>
        <Slider
          id="factor-range"
          label="Blue factor stars"
          range
          min={1}
          max={9}
          step={1}
          tone="blue"
          showTicks
          showTickLabels
          tickLabels={['1★', '2★', '3★', '4★', '5★', '6★', '7★', '8★', '9★']}
          bind:value={minimum}
          bind:endValue={maximum}
        />
      </div>
    </div>
  </DemoBlock>
{/if}
{#if ids.includes('file')}
  <DemoBlock id="file">
    <div class="preview-narrow">
      <FileDrop
        id="veteran-import"
        accept=".json,application/json"
        onfiles={(files) => onnotify(`${files.length} file(s) selected - preview only`)}
      />
    </div>
  </DemoBlock>
{/if}

<style>
  .event-types {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2px 12px;
  }
  .event-types :global(.checkbox) {
    min-height: 32px;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 7px;
  }
  .event-types :global(.box) {
    width: 18px;
    height: 18px;
  }
  .event-types :global(strong) {
    font-size: 11px;
  }
</style>
