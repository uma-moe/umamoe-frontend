<script lang="ts">
  import Spinner from '@/components/feedback/Spinner.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Tabs from '@/components/navigation/Tabs.svelte';
  import Button from '@/components/controls/Button.svelte';
  import type { Summary, Requirement, Contexts } from '../../hakuraku-types';
  import { cmGet, snapshotPath, styleNames } from '../cm-data';
  import { compositionQuery } from '../../hakuraku-query';
  import CmFieldExplorer from './CmFieldExplorer.svelte';
  import CmComposition from '../CmComposition.svelte';
  import CmUmaRoster from './CmUmaRoster.svelte';
  import CmUmaBubble from './CmUmaBubble.svelte';

  let {
    data,
    colors,
    onteams,
    colorblind = false,
    view = $bindable('overview'),
    selected = $bindable('')
  }: {
    data: Summary;
    colors: Record<number, string>;
    colorblind?: boolean;
    view?: string;
    selected?: string;
    onteams: (slots: Requirement[]) => void;
  } = $props();

  let minPop = $state('3'),
    hidden = $state<number[]>([]);

  let search = $state('');
  let context = $state<Contexts>(),
    error = $state(''),
    attempt = $state(0);

  const matching = $derived(
    data.pairs.filter((p) =>
      (p.name + ' ' + p.outfit + ' ' + p.card).toLowerCase().includes(search.trim().toLowerCase())
    )
  );

  const pair = $derived(
    data.pairs.find((p) => p.key === selected) ?? [...data.pairs].sort((a, b) => b.pop - a.pop)[0]
  );

  const visible = $derived(
    matching.filter((p) => p.stylePop * 100 >= Number(minPop) && !hidden.includes(p.style))
  );

  const maxPop = $derived(Math.max(0.001, ...visible.map((p) => p.pop)));

  $effect(() => {
    const id = data.snapshotId,
      key = pair?.key;

    attempt;
    context = undefined;
    error = '';
    if (!key) return;
    const controller = new AbortController();
    cmGet<Contexts>(snapshotPath(id, 'characters/' + key.replace(':', '-')), controller.signal, id)
      .then((value) => {
        if (!controller.signal.aborted) context = value;
      })
      .catch((e) => {
        if (!controller.signal.aborted) error = e.message;
      });

    return () => controller.abort();
  });
</script>

<div class="uma-views">
  <Tabs
    compact
    label="Uma data display"
    items={[
      { id: 'overview', label: 'Overview' },
      { id: 'field', label: 'Running-style table' },
      { id: 'ranking', label: 'Performance ranges' }
    ]}
    bind:value={view}
    variant="pills"
  />
</div>
<div hidden={view !== 'overview'}>
  <div class="uma-grid">
    <CmUmaRoster
      {matching}
      {colors}
      {pair}
      {maxPop}
      bind:search
      onselect={(key) => (selected = key)}
    />
    <CmUmaBubble
      {visible}
      {colors}
      {pair}
      {maxPop}
      bind:minPop
      bind:hidden
      bind:search
      onselect={(key) => (selected = key)}
      {onteams}
    />
  </div>
  <ChartFrame
    plain
    surface
    compact
    id="cm-synergy"
    title="Teams with this Uma"
  >
    {#snippet actions()}
      <SelectField
        hideLabel
        id="cm-synergy-uma"
        label="Uma and style"
        value={pair?.key ?? ''}
        onchange={(value) => (selected = value)}
        options={[...data.pairs]
          .sort((a, b) => b.owners - a.owners)
          .map((p) => ({
            value: p.key,
            label: p.name + ' · ' + p.outfit + ' · ' + styleNames[p.style]
          }))}
      />
    {/snippet}
    {#if error}
      <p role="alert">
        {error}
        <Button
          size="sm"
          variant="secondary"
          onclick={() => attempt++}
        >
          Retry
        </Button>
      </p>
    {:else if context}
      <CmComposition
        rows={context.rows.filter((r) => r.owners >= 5)}
        {colors}
        onselect={(row) => onteams(compositionQuery(row.key, pair))}
      />
    {:else}
      <Spinner
        size={40}
        centered
        minHeight="clamp(280px, 50dvh, 540px)"
        label="Loading composition data…"
      />
    {/if}
  </ChartFrame>
</div>
{#if view !== 'overview'}
  <CmFieldExplorer
    {data}
    {colors}
    {colorblind}
    {view}
    bind:selected
    onfind={onteams}
  />
{/if}

<style>
  @import './uma-text.css';
  .uma-views {
    display: flex;
    min-width: 0;
    margin-bottom: 12px;
  }
  .uma-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
    gap: 14px;
    align-items: stretch;
    margin-bottom: 14px;
  }
  @media (max-width: 1300px) {
    .uma-grid {
      grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
      gap: 18px;
    }
  }
  @media (max-width: 900px) {
    .uma-grid {
      grid-template-columns: 1fr;
      gap: 18px;
    }
  }
</style>
