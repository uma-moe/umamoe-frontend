<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import Button from '../Button.svelte';
  import Dialog from '../Dialog.svelte';
  import SparkBrowser from '../SparkBrowser.svelte';
  import { factorMetadata, loadFactorArtwork } from '@/lib/catalog/factor-catalog';
  import type { CharacterCatalogEntry } from '@/lib/catalog/character-catalog';
  import SegmentedControl from '../SegmentedControl.svelte';
  import Slider from '../Slider.svelte';
  import SparkItem from '../SparkItem.svelte';
  import ResourceStatus from '../ResourceStatus.svelte';
  import type { ParentFactorFilter } from '@/lib/veterans/parent-picker';

  interface Props {
    filter: ParentFactorFilter;
    characters: Map<number,CharacterCatalogEntry>;
    loading?: boolean; cached?: boolean; error?: string;
    onapply: (filter: ParentFactorFilter) => void;
    onclose: () => void;
  }
  let { filter, characters, loading = false, cached = false, error = '', onapply, onclose }: Props = $props();
  const id = $props.id();
  const editing = untrack(() => Boolean(filter.factorId));
  let draft = $state(untrack(() => ({ ...filter, maxLevel:filter.maxLevel ?? (filter.scope === 'combined' ? 9 : 3) })));
  let step = $state(editing ? 2 : 1);
  let root: HTMLDivElement;
  let category = $state(untrack(() => {
    const type = factorMetadata(filter.factorId)?.type ?? 0;
    return [0,1,5].includes(type) ? String(type) : 'white';
  }));
  const categories = [{value:'0',label:'Blue stats',tone:'blue'},{value:'1',label:'Aptitude',tone:'pink'},{value:'5',label:'Unique',tone:'green'},{value:'white',label:'Skill / race',tone:'white'}];
  const selected = $derived(factorMetadata(draft.factorId));
  const maximum = $derived(draft.scope === 'combined' ? 9 : 3);
  const tone = (type?: number) => type === 0 ? 'blue' : type === 1 ? 'pink' : type === 5 ? 'green' : 'white';
  async function focusStep() {
    await tick();
    root?.querySelector<HTMLElement>(step === 1 ? '.spark-categories [aria-pressed="true"]' : 'input[type="range"]')?.focus({ preventScroll: true });
  }
  function choose(value: number) { draft.factorId = value; step = 2; void focusStep(); }
  function back() { step = 1; void focusStep(); }
  function changeSource(value: string) {
    const previousCap = maximum;
    draft.scope = value as ParentFactorFilter['scope'];
    const cap = draft.scope === 'combined' ? 9 : 3;
    draft.minLevel = Math.min(draft.minLevel,cap);
    draft.maxLevel = draft.maxLevel === previousCap ? cap : Math.min(draft.maxLevel,cap);
  }
  onMount(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onclose(); }
    };
    root.addEventListener('keydown', escape, true);
    void loadFactorArtwork().catch(() => {});
    void focusStep();
    return () => root.removeEventListener('keydown', escape, true);
  });
</script>

<div class="spark-filter-dialog" bind:this={root}>
  <Dialog mobileFill open title={editing ? 'Edit spark filter' : 'Add spark filter'} icon="filter" maxWidth="480px" maxHeight="min(560px,90dvh)" mobileInset="24px" contentPadding="16px" mobileContentPadding="12px" {onclose}>
    <div class="filter-steps">
      <p class="step-label">{step} / 2 · {step === 1 ? 'Choose a spark' : 'Set requirement'}</p>
      {#if step === 1}
        <div class="spark-categories" role="group" aria-label="Spark categories">
          {#each categories as item}<Button variant="secondary" ariaLabel={item.label} ariaPressed={category === item.value} onclick={() => category = item.value}><span class="category-copy"><span class="category-star tone-{item.tone}" aria-hidden="true">★</span>{item.label}</span></Button>{/each}
        </div>
        <ResourceStatus {loading} {cached} {error}/>
        <SparkBrowser {category} {characters} onchoose={choose}/>
      {:else}
        <div class="chosen-spark"><SparkItem name={selected?.text ?? 'Spark'} level={draft.minLevel} tone={tone(selected?.type)} compact/><Button variant="ghost" size="sm" onclick={back}>Change spark</Button></div>
        <div class="source-field">
          <strong>Source</strong>
          <SegmentedControl label="Spark source" options={[{value:'combined',label:'Combined'},{value:'any',label:'Any slot'},{value:'own',label:'Own'},{value:'p1',label:'P1'},{value:'p2',label:'P2'}]} value={draft.scope} onchange={changeSource}/>
          <p>{draft.scope === 'combined' ? 'Sum stars across Own + P1 + P2.' : draft.scope === 'any' ? 'Match the range in any one of Own, P1 or P2.' : 'Match the range in the selected slot only.'}</p>
        </div>
        <Slider id={id+'-stars'} label="Stars" range min={1} max={maximum} step={1} unit="★" tone={tone(selected?.type)} showTicks showTickLabels tickLabels={Array.from({length:maximum},(_,index)=>(index+1)+'★')} value={draft.minLevel} endValue={draft.maxLevel} onchange={(min,max) => { draft.minLevel = min; draft.maxLevel = max ?? maximum; }}/>
      {/if}
    </div>
    {#snippet actions()}
      {#if step === 2}<Button variant="ghost" onclick={back}>Back</Button>{/if}
      <Button variant="secondary" onclick={onclose}>Cancel</Button>
      {#if step === 2}<Button onclick={() => onapply({...draft})}>{editing ? 'Save filter' : 'Add filter'}</Button>{/if}
    {/snippet}
  </Dialog>
</div>

<style>
  .spark-filter-dialog { --control-height:36px; }
  .filter-steps { display:grid; gap:16px; min-width:0; }
  .step-label { margin:0; color:var(--text-muted); font-size:11px; }
  .spark-categories { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
  .spark-categories :global(.ui-button) { min-height:40px; justify-content:flex-start; padding:8px 10px; font-size:11px; font-weight:500; }
  .spark-categories :global(.ui-button[aria-pressed='true']) { background:var(--factor-option-selected-bg); border-color:var(--accent-primary); }
  .category-copy { display:flex; align-items:center; gap:8px; }.category-star { font-size:15px; }
  .tone-blue { color:var(--accent-primary); }.tone-pink { color:var(--color-pink); }.tone-green { color:var(--accent-secondary); }
  .tone-white { color:var(--spark-white-text); }
  .spark-filter-dialog :global(.factor-result-groups) { max-height:none; overflow:visible; }
  .chosen-spark { display:flex; align-items:center; justify-content:space-between; gap:8px; min-width:0; }
  .chosen-spark :global(.ui-button) { flex:none; }
  .source-field { display:grid; gap:8px; font-size:12px; }
  .source-field p { margin:0; color:var(--text-muted); font-size:11px; }
  .source-field :global(.segments) { width:100%; }
  .source-field :global(.segments button) { flex:1; min-width:0; padding-inline:6px; font-size:12px; }
  @media(max-width:480px) { .source-field :global(.segments button) { padding-inline:4px; font-size:11px; } }
</style>
