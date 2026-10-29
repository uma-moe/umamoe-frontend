<script lang="ts">
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import type { UqlValidation } from '@/lib/inheritance/uql/uql';
  import type { UqlQueryData } from '@/lib/inheritance/uql/uql-compiler';
  import type { SelectableParent } from '@/lib/veterans/parents/parent-picker';
  import type { GameDataEntry } from '@/lib/game-data/display-records';

  interface Props {
    value: string | undefined;
    validation: UqlValidation;
    characters: GameDataEntry[];
    supports: GameDataEntry[];
    queryData: UqlQueryData | null;
    loading: boolean;
    legacyParents: SelectableParent[];
    onpicklegacy: () => void;
    onclear: () => void;
    onreload: () => void;
  }

  let {
    value = $bindable(),
    validation,
    characters,
    supports,
    queryData,
    loading,
    legacyParents,
    onpicklegacy,
    onclear,
    onreload
  }: Props = $props();
</script>

{#await import('./DatabaseUqlEditor.svelte')}
  <Spinner
    centered
    minHeight="180px"
    label="Loading UQL editor…"
  />
{:then editor}
  <editor.default
    bind:value={() => value ?? '', (next) => (value = next)}
    {validation}
    {characters}
    {supports}
    {queryData}
    {loading}
    {legacyParents}
    {onpicklegacy}
    {onclear}
  />
{:catch}
  <Banner
    tone="warning"
    title="UQL suggestions unavailable"
  >
    You can still edit and run your query below. <Button
      size="sm"
      variant="secondary"
      onclick={onreload}
    >
      Retry editor
    </Button>
  </Banner>
  <div class="uql-fallback">
    <label for="uql-plain-query">UQL query</label>
    <textarea
      id="uql-plain-query"
      bind:value
      rows="4"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      aria-describedby="uql-plain-status"
      aria-invalid={validation.state === 'invalid' ? 'true' : undefined}></textarea>
    <span
      id="uql-plain-status"
      role="status"
    >
      {validation.message}
    </span>
  </div>
{/await}

<style>
  .uql-fallback {
    display: grid;
    gap: 8px;
    padding-block: 12px;
  }
  .uql-fallback textarea {
    box-sizing: border-box;
    width: 100%;
    min-height: 100px;
    padding: 12px;
    resize: vertical;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--surface-1);
    color: var(--text-primary);
    font: 16px/1.5 monospace;
  }
  .uql-fallback span {
    font-size: 12px;
    color: var(--text-secondary);
  }
</style>
