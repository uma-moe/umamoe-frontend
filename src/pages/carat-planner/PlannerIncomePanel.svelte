<script lang="ts">
  import type { CaratPlan, PlannerCompetitiveRewardVariant, PlannerCurrency, PlannerIncomeCadence, PlannerIncomeRule, PlannerRewardEntry } from '@/lib/timeline/carat-planner';
  import { applyIncomePreset, applyScenarioSelection, PLANNER_INCOME_PRESETS, scenarioSelectionToEnable } from '@/lib/timeline/planner-income-presets';
  import { isLegacyTrainingPassIncomeRule } from '@/lib/timeline/planner-income-assumptions';
  import { buildPlannerIncomeSections, incomeRuleScheduleLabel, type PlannerIncomeGroup, type PlannerIncomeSection, type summarizePlannerIncome } from './planner-income-view';
  import { itemIconPath } from '@/lib/catalog/item-icons';
  import type { IconName } from '@/components/icon-types';
  import Button from '@/components/Button.svelte';
  import Checkbox from '@/components/Checkbox.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/InspectPopover.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import TextField from '@/components/TextField.svelte';

  interface Props {
    plan: CaratPlan; groups: PlannerIncomeGroup[]; rules: PlannerIncomeRule[]; rewards: PlannerRewardEntry[];
    competitiveVariants: PlannerCompetitiveRewardVariant[];
    income: ReturnType<typeof summarizePlannerIncome> & { through: string; preview: boolean }; loading: boolean;
    expandedSections: Set<string>; selectionMemory: Map<string, Record<string, string>>;
    oncommit: (mutator: (plan: CaratPlan) => void) => void;
  }
  let { plan, income, loading, groups, rules, rewards, competitiveVariants, expandedSections = $bindable(), selectionMemory, oncommit }: Props = $props();
  const sections = $derived(buildPlannerIncomeSections(groups));
  const recurringRules = $derived(rules.filter(rule => !rule.scenario_group && !isLegacyTrainingPassIncomeRule(rule)));
  const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const period = $derived(`${dateFormatter.format(new Date(plan.projectionStartDate + 'T00:00:00Z'))} – ${dateFormatter.format(new Date(income.through + 'T00:00:00Z'))}`);
  const presetIcons: Record<string, IconName> = { conservative: 'shield', casual: 'user', active: 'activity', completionist: 'star' };
  function markEdited(value: CaratPlan): void { if (value.incomePresetId) value.incomePresetEdited = true; }
  function selectedOption(group: PlannerIncomeGroup) { return group.options.find(option => option.value === plan.scenarioSelections[group.id]); }
  function applyPreset(id: typeof PLANNER_INCOME_PRESETS[number]['id']): void {
    oncommit(value => applyIncomePreset(value, rules, id, Object.fromEntries(groups.map(group => [group.id, group.options.map(option => option.value)])), rewards, competitiveVariants));
  }
  function selectScenario(group: string, selected: string): void {
    oncommit(value => { applyScenarioSelection(value, group, selected, competitiveVariants); markEdited(value); });
  }
  function toggleExpanded(id: string): void {
    const next = new Set(expandedSections); if (!next.delete(id)) next.add(id); expandedSections = next;
  }
  function toggleSection(section: PlannerIncomeSection): void {
    const clear = section.groups.every(group => selectedOption(group));
    const remembered = selectionMemory.get(section.id) ?? {};
    if (clear) selectionMemory.set(section.id, Object.fromEntries(section.groups.map(group => [group.id, selectedOption(group)!.value])));
    oncommit(value => {
      markEdited(value);
      for (const group of section.groups) {
        if (clear) applyScenarioSelection(value, group.id, '', competitiveVariants);
        else if (!selectedOption(group)) applyScenarioSelection(value, group.id, scenarioSelectionToEnable(group.id, group.options.map(option => option.value), remembered[group.id]), competitiveVariants);
      }
    });
  }
  function toggleRule(rule: PlannerIncomeRule): void {
    oncommit(value => {
      value.enabledIncomeRuleIds = value.enabledIncomeRuleIds.includes(rule.id) ? value.enabledIncomeRuleIds.filter(id => id !== rule.id) : [...value.enabledIncomeRuleIds, rule.id];
      markEdited(value);
    });
  }
  function addCustom(): void { oncommit(value => value.customIncome.push({ id: 'income-' + crypto.randomUUID(), label: 'Custom income', currency: 'free_jewels', amount: 0, cadence: 'once', startDate: value.projectionStartDate, every: 1 })); }
  const currencyOptions = [{value:'free_jewels',label:'Carats'},{value:'uma_ticket',label:'Uma ticket'},{value:'support_ticket',label:'Support ticket'},{value:'rainbow_crystal',label:'Rainbow Crystal Shard'},{value:'gold_crystal',label:'Gold Crystal Shard'},{value:'rainbow_full_crystal',label:'Rainbow Uncap Crystal'},{value:'gold_full_crystal',label:'Gold Uncap Crystal'}];
  const cadenceOptions = [{value:'once',label:'Once'},{value:'daily',label:'Daily'},{value:'weekly',label:'Weekly'},{value:'monthly',label:'Monthly'}];
</script>

<div class="income-panel">
  <section class="income-overview" aria-label="Projected income" aria-busy={loading}>
    <header class="panel-heading"><div><strong>Projected income</strong><span>{period} · {income.preview ? '30-day preview' : 'Through your last planned pull'}</span></div></header>
    <p>Includes selected income, estimates, custom entries and dated rewards in this period. Excludes your starting balance and pull spending.</p>
    {#if loading}<p>Loading income…</p>
    {:else}
      {#if income.resources.length}<dl class="income-resources">{#each income.resources as item (item.currency)}
        <div data-currency={item.currency}><img src={itemIconPath(item.itemId)} width="24" height="24" alt=""/><dt>{item.label}</dt><dd class:deduction={item.amount < 0}>{item.formatted}</dd></div>
      {/each}</dl>{:else}<p class="income-empty">No income is scheduled in this period. Selected sources count when their payouts fall within these dates.</p>{/if}
      {#if income.sources.length}<details class="income-breakdown">
        <summary><span>Included sources <small>{income.sources.length}</small></span><Icon name="chevron" size={16}/></summary>
        <ul>{#each income.sources as source}<li><strong>{source.label}</strong><span>{source.amountLabel}</span></li>{/each}</ul>
      </details>{/if}
    {/if}
  </section>
  <section aria-labelledby="income-assumptions-heading">
    <header class="panel-heading"><div><strong id="income-assumptions-heading">Income assumptions</strong><span>Choose expected results and optional estimated income.</span></div></header>
    <div class="presets" role="radiogroup" aria-label="Income assumption presets">
      <div class="preset-heading"><Icon name="tune" size={17}/><span><strong>Quick presets</strong><small>Apply a starting point, then adjust anything below</small></span></div>
      {#each PLANNER_INCOME_PRESETS as preset}
        <label class="preset" class:active={plan.incomePresetId === preset.id}>
          <input type="radio" name="planner-income-preset" value={preset.id} checked={plan.incomePresetId === preset.id} aria-label={preset.label + ': ' + preset.description} onchange={() => applyPreset(preset.id)}/>
          <Icon name={presetIcons[preset.id]!} size={15}/><span><strong>{preset.label}</strong><small>{preset.description}{plan.incomePresetId === preset.id && plan.incomePresetEdited ? ' (edited)' : ''}</small></span>
        </label>
      {/each}
    </div>
    <div class="scenario-sections">
      {#each sections as section (section.id)}
        {@const enabledCount = section.groups.filter(group => selectedOption(group)).length}
        {@const all = enabledCount === section.groups.length}
        <section class="income-section" aria-labelledby={'income-section-' + section.id}>
          <header>
            <button type="button" class="disclosure" aria-expanded={expandedSections.has(section.id)} aria-controls={'income-options-' + section.id} onclick={() => toggleExpanded(section.id)}>
              <Icon name={section.icon} size={18}/><span><strong id={'income-section-' + section.id}>{section.label}</strong><small>{section.description}</small></span>
              <em>{enabledCount}/{section.groups.length} on</em><span class:expanded={expandedSections.has(section.id)} class="chevron"><Icon name="chevron" size={16}/></span>
            </button>
            <div class="section-toggle" class:active={enabledCount > 0}>
              <Checkbox id={'income-toggle-' + section.id} label={all ? 'Clear all' : 'Select all'} ariaLabel={(all ? 'Clear all' : 'Select all') + ' for ' + section.label} checked={all} indeterminate={enabledCount > 0 && !all} onchange={() => toggleSection(section)}/>
            </div>
          </header>
          {#if expandedSections.has(section.id)}
            <div class="scenario-list" id={'income-options-' + section.id}>
              {#each section.groups as group (group.id)}
                {@const selected = selectedOption(group)}
                <article class="scenario">
                  <div class="scenario-copy"><Icon name={group.icon} size={17}/><div>
                    <div class="scenario-heading"><strong>{group.label}</strong>
                      {#if group.helpText}<InspectPopover label={'How ' + group.label + ' is calculated'}>
                        {#snippet trigger()}<span class="help">?</span>{/snippet}
                        <strong>{group.label}</strong><p class="help-copy">{group.helpText}</p>
                      </InspectPopover>{/if}
                    </div>
                    <small class="schedule"><span>{group.scheduleLabel}</span>{#if group.sourceUrl}<a href={group.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={'Open source for ' + group.label + ' in a new tab'}>Source<Icon name="external" size={10}/></a>{/if}</small>
                  </div></div>
                  {#if group.options.length === 1}
                    <div class="binary" class:active={Boolean(selected)}><Checkbox id={'income-' + group.id} label={group.options[0]!.label} ariaLabel={(selected ? 'Exclude' : 'Include') + ' ' + group.label} description={selected ? selected.amountLabel : 'Select to include'} checked={Boolean(selected)} onchange={checked => selectScenario(group.id, checked ? group.options[0]!.value : '')}/></div>
                  {:else}
                    <div class="scenario-select" class:active={Boolean(selected)}><SelectField id={'income-' + group.id} label={group.label} hideLabel options={[{value:'',label:'Not included',description:'No projected income'},...group.options.map(option => ({...option,description:option.amountLabel}))]} value={selected?.value ?? ''} onchange={value => selectScenario(group.id, value)}/></div>
                  {/if}
                </article>
              {/each}
            </div>
          {/if}
        </section>
      {/each}
    </div>
  </section>
  {#if recurringRules.length}
    <section aria-labelledby="income-rules-heading">
      <header class="panel-heading"><div><strong id="income-rules-heading">Recurring income</strong><span>Choose the sources that apply to you.</span></div></header>
      <div class="rule-list">{#each recurringRules as rule (rule.id)}<button type="button" class:active={plan.enabledIncomeRuleIds.includes(rule.id)} aria-pressed={plan.enabledIncomeRuleIds.includes(rule.id)} onclick={() => toggleRule(rule)}><Icon name="refresh" size={18}/><span><strong>{rule.label}</strong><small>{incomeRuleScheduleLabel(rule)}</small></span><b>+{rule.amount.toLocaleString('en-US')}</b><Icon name={plan.enabledIncomeRuleIds.includes(rule.id) ? 'check' : 'add'} size={17}/></button>{/each}</div>
    </section>
  {/if}
  <section aria-labelledby="custom-income-heading">
    <header class="panel-heading"><div><strong id="custom-income-heading">Custom income</strong><span>{plan.customIncome.length || 'No'} custom sources</span></div><Button size="sm" variant="secondary" icon="add" onclick={addCustom}>Add income</Button></header>
    {#if plan.customIncome.length}<div class="custom-list">{#each plan.customIncome as item (item.id)}<div class="custom">
      <TextField id={`income-name-${item.id}`} label="Income name" maxlength={100} value={item.label} oninput={event => oncommit(value => value.customIncome.find(entry => entry.id === item.id)!.label = (event.currentTarget as HTMLInputElement).value.slice(0,100))}/>
      <TextField id={`income-amount-${item.id}`} label="Amount" type="number" min={0} value={String(item.amount)} oninput={event => oncommit(value => value.customIncome.find(entry => entry.id === item.id)!.amount = Number((event.currentTarget as HTMLInputElement).value)||0)}/>
      <SelectField id={'income-currency-' + item.id} label="Resource" options={currencyOptions} value={item.currency} onchange={selected => oncommit(value => value.customIncome.find(entry => entry.id === item.id)!.currency = selected as PlannerCurrency)}/>
      <SelectField id={'income-cadence-' + item.id} label="Frequency" options={cadenceOptions} value={item.cadence} onchange={selected => oncommit(value => value.customIncome.find(entry => entry.id === item.id)!.cadence = selected as PlannerIncomeCadence)}/>
      <TextField id={`income-start-${item.id}`} label="Starts" type="date" value={item.startDate} oninput={event => oncommit(value => value.customIncome.find(entry => entry.id === item.id)!.startDate = (event.currentTarget as HTMLInputElement).value)}/>
      <Button size="sm" variant="danger" icon="close" ariaLabel={'Remove custom income ' + item.label} onclick={() => oncommit(value => value.customIncome = value.customIncome.filter(entry => entry.id !== item.id))}/>
    </div>{/each}</div>{/if}
  </section>
</div>

<style>
  .income-panel{grid-column:1/-1;display:grid;gap:12px;min-width:0;--control-height:36px;--select-label-size:11px;--select-description-size:9px}
  .panel-heading{min-height:36px;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}.panel-heading>div{display:flex;align-items:baseline;gap:8px}.panel-heading strong{font-size:12px}.panel-heading span{color:var(--text-secondary);font-size:10px}
  .income-overview{min-width:0;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);background:var(--surface-1);padding:10px 12px}.income-overview .panel-heading{min-height:0;margin-bottom:5px}.income-overview .panel-heading>div{flex-wrap:wrap}.income-overview p{margin:0;color:var(--text-secondary);font-size:11px;line-height:1.5}.income-overview .income-empty{margin-top:10px}
  .income-resources{display:flex;flex-wrap:wrap;gap:10px 24px;margin:12px 0}.income-resources>div{display:grid;grid-template-columns:24px auto;align-items:center;gap:2px 7px}.income-resources img{grid-row:1/3;object-fit:contain}.income-resources dt{font-size:10px;color:var(--text-secondary)}.income-resources dd{margin:0;font-size:14px;font-weight:700;color:var(--accent-secondary);font-variant-numeric:tabular-nums}.income-resources dd.deduction{color:var(--accent-warning)}
  .income-breakdown{border-top:1px solid var(--border-subtle)}.income-breakdown summary{min-height:32px;display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;font-size:11px;list-style:none}.income-breakdown summary::-webkit-details-marker{display:none}.income-breakdown summary small{margin-left:5px;color:var(--text-secondary)}.income-breakdown[open] summary :global(svg){transform:rotate(180deg)}.income-breakdown summary:focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}.income-breakdown ul{list-style:none;margin:0;padding:0;max-height:260px;overflow-y:auto}.income-breakdown li{display:flex;justify-content:space-between;gap:6px 16px;padding:6px 0;border-top:1px solid var(--border-subtle);font-size:11px}.income-breakdown li strong{font-weight:500}.income-breakdown li span{color:var(--text-secondary);text-align:right}
  .income-breakdown li strong,.income-breakdown li span{min-width:0;overflow-wrap:anywhere}
  @media(max-width:600px){.income-resources{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.income-breakdown li{display:grid;gap:3px}.income-breakdown li span{text-align:left}}
  .presets{display:grid;grid-template-columns:minmax(150px,.72fr) repeat(4,minmax(120px,1fr));gap:5px;padding:5px;margin-bottom:8px;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);background:var(--surface-1)}
  .preset-heading{display:grid;grid-template-columns:17px minmax(0,1fr);gap:7px;align-items:center;padding:0 5px}.preset-heading strong{font-size:11px}.preset-heading small{font-size:9px}.preset{min-height:38px;display:grid;grid-template-columns:14px 15px minmax(0,1fr);align-items:center;gap:6px;padding:5px 7px;border:1px solid var(--border-primary);background:var(--surface-2);border-radius:var(--radius-sm);cursor:pointer}.preset input{width:14px;height:14px;margin:0;accent-color:var(--accent-primary)}.preset.active{border-color:var(--accent-primary);background:var(--color-accent-soft)}.preset strong{font-size:10px}.preset small{font-size:9px}.preset span,.preset-heading span{min-width:0;display:grid;gap:2px}.preset small,.preset-heading small{color:var(--text-secondary);line-height:1.2}.preset:hover{background:var(--surface-2)}.preset:focus-within{outline:2px solid var(--accent-primary);outline-offset:1px}
  .scenario-sections{display:grid;gap:6px}.income-section{border:1px solid var(--border-subtle);border-radius:var(--radius-sm);background:var(--surface-1)}.income-section>header{display:grid;grid-template-columns:minmax(0,1fr) auto;min-height:44px;align-items:stretch}
  .disclosure{display:grid;grid-template-columns:20px minmax(0,1fr) auto 18px;align-items:center;gap:8px;padding:6px 10px;min-width:0;border:0;background:transparent;color:var(--text-primary);text-align:left;cursor:pointer}.disclosure>span:not(.chevron){display:grid;gap:2px;min-width:0}.disclosure strong{font-size:12px}.disclosure small{color:var(--text-secondary);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.disclosure em{font-size:10px;font-style:normal;color:var(--text-secondary)}.chevron{display:flex;transition:transform var(--duration-fast)}.chevron.expanded{transform:rotate(180deg)}.disclosure:hover{background:var(--surface-2)}.disclosure:focus-visible{outline:2px solid var(--accent-primary);outline-offset:-2px}
  .section-toggle{min-width:102px;border-left:1px solid var(--border-subtle);padding-inline:11px;display:grid}.section-toggle.active{color:var(--accent-secondary)}.section-toggle,.binary{--color-accent:var(--accent-secondary)}.section-toggle :global(.checkbox){grid-template-columns:18px minmax(0,1fr);gap:7px;min-height:44px}.section-toggle :global(.box),.binary :global(.box){width:18px;height:18px}.section-toggle :global(strong){font-size:10px;white-space:nowrap}
  .scenario-list{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:6px 18px;padding:7px 9px;border-top:1px solid var(--border-subtle)}.scenario{min-width:0;display:grid;grid-template-columns:minmax(120px,.8fr) minmax(190px,1.2fr);align-items:center;gap:9px}.scenario-copy{display:grid;grid-template-columns:17px minmax(0,1fr);gap:7px;align-items:center;min-width:0}.scenario-copy>div{min-width:0}.scenario-heading{display:flex;align-items:center;gap:4px}.scenario-heading strong{font-size:11px;line-height:1.2}.schedule{display:flex;flex-wrap:wrap;align-items:center;gap:0 5px;font-size:9px;line-height:1.2;color:var(--text-secondary)}.schedule a{display:inline-flex;gap:3px;align-items:center;min-height:20px;color:var(--accent-secondary)}.help{display:grid;place-items:center;width:18px;height:18px;border:1px solid var(--border-primary);border-radius:50%;font-size:11px;color:var(--text-secondary)}.help-copy{white-space:pre-line;font-size:11px;line-height:1.5;margin:8px 0 0}
  .scenario-select{min-width:0}.scenario-select:not(.active){--select-description-color:var(--text-muted)}.scenario-select:not(.active) :global(.selected-copy){color:var(--text-muted)}.scenario-copy> :global(svg){color:var(--text-muted)}.disclosure> :global(svg){color:var(--accent-secondary)}.scenario-select.active :global(.select-control),.binary.active{border-color:color-mix(in srgb,var(--color-success) 50%,var(--border-primary));background:rgb(var(--accent-primary-rgb) / .07)}.binary{min-width:0;border:1px solid var(--factor-field-border);border-radius:8px;background:var(--factor-field-bg);padding-inline:10px}.binary :global(.checkbox){min-height:34px;grid-template-columns:18px minmax(0,1fr);gap:8px}.binary :global(strong){font-size:11px;line-height:1.2}.binary :global(small){font-size:9px;line-height:1.2}.binary.active :global(small){color:var(--accent-secondary)}
  .rule-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:6px}.rule-list button{min-height:40px;display:grid;grid-template-columns:20px minmax(0,1fr) auto 18px;align-items:center;gap:7px;padding:5px 8px;border:1px solid var(--border-primary);border-radius:var(--radius-sm);background:var(--surface-1);color:var(--text-primary);text-align:left;cursor:pointer}.rule-list button.active{border-color:var(--accent-primary);background:var(--color-accent-soft)}.rule-list strong{font-size:11px}.rule-list small{display:block;color:var(--text-secondary);font-size:9px}.rule-list b{color:var(--accent-secondary);font-size:11px;font-family:var(--font-mono)}
  .custom-list{display:grid;gap:6px}.custom{display:grid;grid-template-columns:minmax(150px,1.5fr) minmax(80px,.7fr) minmax(130px,1fr) minmax(100px,1fr) minmax(120px,1fr) 36px;align-items:end;gap:6px}.custom :global(.ui-button){min-width:36px;padding-inline:0}
  @media(max-width:980px){.presets{grid-template-columns:repeat(2,minmax(0,1fr))}.preset-heading{grid-column:1/-1;padding-block:3px}.custom{grid-template-columns:2fr 1fr 1fr}}
  @media(max-width:768px){.income-panel{--control-height:var(--touch-target)}.scenario-list{grid-template-columns:1fr}.preset,.rule-list button{min-height:var(--touch-target)}.binary :global(.checkbox){min-height:var(--touch-target)}.panel-heading :global(.ui-button){min-height:var(--touch-target)}.section-toggle{min-width:92px}.scenario-heading :global(.trigger){min-width:var(--touch-target);min-height:var(--touch-target);display:grid;place-items:center}.schedule a{min-width:var(--touch-target);min-height:var(--touch-target)}.scenario-heading{min-height:24px}}
  @media(max-width:600px){.custom{grid-template-columns:repeat(2,minmax(0,1fr))}.custom>:global(.field:first-child){grid-column:1/-1}.custom :global(.ui-button){grid-column:2;min-width:var(--touch-target)}.panel-heading{flex-wrap:wrap}.panel-heading>div{flex-direction:column;align-items:flex-start;gap:2px}}
  @media(max-width:420px){.scenario{grid-template-columns:minmax(0,1fr);gap:6px;padding-block:5px}.section-toggle{min-width:48px;padding:0}.section-toggle :global(.copy){display:none}.section-toggle :global(.checkbox){grid-template-columns:18px;justify-content:center;min-width:46px;gap:0}.disclosure{padding-inline:7px;gap:6px}.disclosure strong{font-size:11px}.scenario-heading{min-height:20px}.scenario-list{gap:8px;padding-inline:7px}.rule-list{grid-template-columns:1fr}}
</style>
