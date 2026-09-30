<script lang="ts">
  import Combobox from '@/components/Combobox.svelte';
  import Icon from '@/components/Icon.svelte';
  import IconButton from '@/components/IconButton.svelte';
  import NumberStepper from '@/components/NumberStepper.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import SegmentedControl from '@/components/SegmentedControl.svelte';
  import Slider from '@/components/Slider.svelte';
  import { factorImage, factorOptions, type FactorCategory } from '@/lib/catalog/factor-catalog';
  import type { FactorRequirement } from '@/lib/inheritance/inheritance-search';
  import WhiteFactorTypePicker from './WhiteFactorTypePicker.svelte';
  import { completeTourInteraction } from '@/components/tours/tour-state';

  interface Props {
    id: string;
    label: string;
    category: FactorCategory;
    tone?: 'blue' | 'pink' | 'green' | 'white';
    requirements?: FactorRequirement[];
    maxStars?: number;
    priorityMode?: boolean;
    addLabelOverride?: string;
  }

  let { id, label, category, tone = 'blue', requirements = $bindable([]), maxStars = 9, priorityMode = false, addLabelOverride }: Props = $props();
  const searchable = $derived(category === 'unique' || category === 'skills-races');
  const actualMaxStars = $derived(maxStars);
  const supportsOccurrences = $derived(maxStars > 3);
  const maxOccurrences = 3;
  const options = $derived([
    ...(category === 'skills-races' ? [] : [{ value: '0', label: 'Any' }]),
    ...factorOptions(category).map((factor) => ({ value: String(factor.id), label: factor.text, image: category === 'skills-races' ? factorImage(Number(factor.id)) : undefined }))
  ]);
  const addLabel = $derived(addLabelOverride ?? (category === 'stats' ? 'Add Blue Factor' : category === 'aptitude' ? 'Add Pink Factor' : category === 'unique' ? 'Add Green Factor' : priorityMode ? 'Add Optional White Factor' : 'Add White Factor'));
  const priorityDetail = $derived(label.toLocaleLowerCase().includes('lineage') ? 'priority group, then stack score' : 'priority group, then match count');

  function add(): void {
    requirements = [...requirements, { factorId: 0, minimumStars: 1, maximumStars: actualMaxStars, priority: priorityMode ? 0 : undefined, operator: 'and' }];
    if (id === 'blue-factors') completeTourInteraction('filter-add-factor');
  }
  function update(index: number, patch: Partial<FactorRequirement>): void {
    requirements = requirements.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry);
    if (id === 'blue-factors' && patch.minimumStars !== undefined) completeTourInteraction('filter-blue-factor-slider');
  }
  function remove(index: number): void { requirements = requirements.filter((_, entryIndex) => entryIndex !== index); }
  function setPriority(index: number, input: string | number): void {
    const parsed = Number(input);
    update(index, { priority: Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0 });
  }
  function addSelectedFactors(factorIds: number[], priority: number): void {
    const existing = new Set(requirements.map((requirement) => requirement.factorId));
    const additions = factorIds
      .filter((factorId) => factorId > 0 && !existing.has(factorId))
      .map((factorId) => ({ factorId, minimumStars: 1, maximumStars: actualMaxStars, priority, operator: 'and' as const }));
    if (additions.length) requirements = [...requirements, ...additions];
  }
</script>

<section {id} class="factor-editor tone-{tone}" class:priority-mode={priorityMode} aria-label={label}>
  <header class="editor-header">
    <span class="tone-mark" aria-hidden="true"></span>
    <span class="heading-copy"><strong>{label}</strong>{#if priorityMode}<small>{priorityDetail}</small>{:else}<small>{requirements.length ? `${requirements.length} requirement${requirements.length === 1 ? '' : 's'}` : 'No requirements'}</small>{/if}</span>
  </header>
  <div class="requirements">
    {#if priorityMode && category === 'skills-races'}
      <WhiteFactorTypePicker id={`${id}-browser`} browseLabel={label.toLocaleLowerCase().includes('lineage') ? 'Find lineage white factors' : id.includes('main') ? 'Find main-parent white factors' : 'Find white factors'} selectedFactorIds={requirements.map((requirement) => requirement.factorId)} onadd={addSelectedFactors}/>
    {/if}
    {#each requirements as requirement, index}
      <div class="requirement" class:with-priority={priorityMode} class:stars-only={!priorityMode && !supportsOccurrences}>
        {#if !priorityMode}
          <div class="relation" aria-label={index === 0 ? 'First requirement' : 'Combine with previous requirement'}>
            {#if index === 0}<span class="match-label">Match</span>
            {:else}<SegmentedControl label="Requirement operator" options={[{value:'and',label:'AND'},{value:'or',label:'OR'}]} value={requirement.operator ?? 'and'} onchange={(operator) => update(index, { operator: operator as 'and' | 'or' })}/>{/if}
          </div>
          {#if supportsOccurrences}<div class="relation factor-metric"><SegmentedControl label="Factor range metric" options={[{value:'stars',label:'Total stars',icon:'star'},{value:'occurrences',label:'Parent occurrences',icon:'close'}]} value={requirement.metric ?? 'stars'} onchange={(metric) => update(index, { metric: metric as 'stars' | 'occurrences' })}/></div>{/if}
        {/if}
        {#if searchable}
          <Combobox id={`${id}-factor-${index}`} label="Factor" hideLabel emptyValue={category === 'unique' ? '0' : undefined} placeholder={category === 'unique' ? 'Search Green Factor' : 'Search White Factor'} {options} value={String(requirement.factorId)} onchange={(value) => update(index, { factorId: Number(value) })}/>
        {:else}
          <SelectField id={`${id}-factor-${index}`} label="Factor" hideLabel {options} value={String(requirement.factorId)} onchange={(value) => update(index, { factorId: Number(value) })}/>
        {/if}
        {#if priorityMode}
          <div class="priority-control" title="Priority group: 0 sorts first, larger numbers are lower-priority tiebreakers">
            <span>P</span>
            <input type="number" inputmode="numeric" min="0" step="1" value={requirement.priority ?? 0} aria-label="Priority group" onchange={(event) => setPriority(index, event.currentTarget.value)}/>
            <NumberStepper increaseLabel="Increase priority group number" decreaseLabel="Decrease priority group number" decreaseDisabled={(requirement.priority ?? 0) === 0} onstep={(direction) => setPriority(index, (requirement.priority ?? 0) + direction)}/>
          </div>
        {/if}
        <IconButton icon="trash" label={`Remove ${options.find((option) => Number(option.value) === requirement.factorId)?.label ?? 'factor'}`} onclick={() => remove(index)}/>
        {#if !priorityMode}
          {@const occurrences = supportsOccurrences && requirement.metric === 'occurrences'}
          <div class="factor-range"><Slider id={id + (occurrences ? '-occurrences-' : '-stars-') + index} label={occurrences ? 'Occurrence range' : 'Star range'} hideLabel min={occurrences ? 0 : 1} max={occurrences ? maxOccurrences : actualMaxStars} step={1} range value={occurrences ? requirement.minimumOccurrences ?? 0 : requirement.minimumStars} endValue={occurrences ? requirement.maximumOccurrences ?? maxOccurrences : requirement.maximumStars ?? actualMaxStars} {tone} showOutput={false} showTicks showTickLabels tickLabels={Array.from({ length: occurrences ? maxOccurrences + 1 : actualMaxStars }, (_, value) => occurrences ? value + '×' : (value + 1) + '★')} onchange={(minimum, maximum) => update(index, occurrences ? { minimumOccurrences: minimum === 0 && maximum === maxOccurrences ? undefined : minimum, maximumOccurrences: minimum === 0 && maximum === maxOccurrences ? undefined : maximum } : { minimumStars: minimum, maximumStars: maximum })}/></div>
        {/if}
      </div>
    {/each}
    <button class="add-row" type="button" aria-label={addLabel} onclick={add}><span><Icon name="add" size={15}/></span><strong>{addLabel}</strong></button>
  </div>
</section>

<style>
  .factor-editor { --factor-accent:#42bcf7; min-width:0; display:grid; gap:0; margin-bottom:5px; }
  .factor-editor.tone-pink { --factor-accent:#ff4f91; }.factor-editor.tone-green { --factor-accent:#66c96f; }.factor-editor.tone-white { --factor-accent:#c7cbd0; }
  .factor-editor:last-child { margin-bottom:0; }
  .editor-header { min-height:32px; display:flex; align-items:center; gap:7px; padding:0 2px; }
  .tone-mark { width:2px; height:14px; flex:0 0 2px; border-radius:1px; background:var(--factor-accent); }
  .heading-copy { min-width:0; display:flex; align-items:baseline; gap:6px; }.heading-copy strong{color:var(--text-primary);font-size:11px;font-weight:650}.heading-copy small{color:var(--text-muted);font-size:9px}
  .requirements { min-width:0; display:grid; gap:6px; padding:0; }
  .add-row { width:100%; min-height:34px; display:flex; align-items:center; justify-content:center; gap:7px; padding:3px 10px; border:0; border-radius:6px; background:var(--factor-field-bg); color:var(--factor-field-text); cursor:pointer; font:inherit; transition:background-color var(--duration-fast),color var(--duration-fast); }.add-row span { width:22px; height:22px; display:grid; place-items:center; border-radius:50%; background:color-mix(in srgb,var(--factor-accent) 13%,transparent); color:var(--factor-accent); }.add-row strong { font-size:10px; font-weight:700; }.add-row:hover { background:color-mix(in srgb,var(--factor-accent) 7%,transparent); color:var(--text-primary); }.add-row:focus-visible { outline:0; box-shadow:var(--focus-ring); }
  .requirement { min-width:0; display:grid; grid-template-columns:62px 60px minmax(0,1fr) 28px; align-items:center; gap:4px 5px; padding:7px; border:1px solid var(--factor-row-border); border-radius:var(--radius-sm); background:var(--factor-row-bg); }
  .requirement.with-priority { grid-template-columns:minmax(0,1fr) 60px 28px; gap:4px; padding:0; border:0; background:transparent; }
  .requirement.stars-only { grid-template-columns:62px minmax(0,1fr) 28px; }
  .priority-mode .requirements { gap:4px; padding:0; }
  .priority-mode :global(.white-factor-browser) { margin:0; }
  .with-priority :global(input[role="combobox"]) { min-height:40px; font-size:14px; }
  .relation { width:100%; height:38px;display:flex;align-items:center;justify-content:center;align-self:end }.match-label{color:var(--text-muted);font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}.relation :global(.segments){width:100%;height:38px;display:grid;grid-template-columns:1fr 1fr;box-sizing:border-box;padding:3px;border:1px solid var(--border-primary);border-radius:6px;background:var(--factor-field-bg)}.relation :global(.segments button){min-width:0;min-height:0;padding:0 3px;border:0;border-radius:3px;background:transparent;color:var(--text-muted);cursor:pointer;font-family:inherit;font-size:9px;font-weight:800;line-height:1}.relation :global(.segments button.selected){background:color-mix(in srgb,var(--factor-accent) 17%,transparent);color:var(--factor-accent)}
  .factor-range { min-width:0; grid-column:1 / -1; padding-inline:2px; }
  .factor-metric :global(.segments button) { color:var(--factor-field-text); }
  .factor-metric :global(svg) { width:14px; height:14px; }
  .factor-metric :global(.segments button.selected) { background:color-mix(in srgb,var(--factor-accent) 24%,transparent); color:var(--factor-accent); box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--factor-accent) 35%,transparent); }
  .requirement :global(.select-control), .requirement :global(input[role="combobox"]) { height:38px; }
  .requirement > :global(.icon-button) { width:28px; min-width:28px; height:32px; min-height:32px; padding:0; border:0; border-radius:6px; background:rgb(255 60 60 / .1); color:var(--accent-error); }
  .requirement > :global(.icon-button:hover) { background:rgb(255 60 60 / .2); }
  .priority-control { align-self:stretch; display:inline-flex; align-items:center; justify-content:center; gap:1px; padding:0 3px; border:1px solid rgb(var(--on-surface-rgb) / .1); border-radius:8px; background:var(--factor-field-bg); box-sizing:border-box; transition:border-color var(--duration-fast),background var(--duration-fast); }
  .priority-control:hover,.priority-control:focus-within { border-color:var(--db-control-focus-border); background:var(--db-control-focus-bg); }
  .priority-control > span:first-child { color:rgb(100 181 246 / .86); font-size:12px; font-weight:800; line-height:1; }
  .priority-control input { width:24px; height:32px; padding:0; border:0; outline:0; appearance:textfield; background:transparent; color:rgb(var(--on-surface-rgb) / .96); font-family:inherit; font-size:14px; font-weight:800; line-height:32px; text-align:center; }
  .priority-control input::-webkit-inner-spin-button,.priority-control input::-webkit-outer-spin-button { margin:0; appearance:none; }
  @media (max-width:620px) {
    .heading-copy small{display:none}.add-row{min-height:var(--touch-target)}
    .requirement { grid-template-columns:64px 60px minmax(0,1fr) 28px; gap:4px; padding:6px; }
    .relation, .relation :global(.segments) { height:var(--touch-target); }
    .relation :global(.segments) { padding:0; }
    .requirement :global(.select-control), .requirement :global(input[role="combobox"]) { height:var(--touch-target); }
    .factor-range{grid-column:1/-1}
    .requirements { gap:4px;padding:4px; }
  }
</style>
