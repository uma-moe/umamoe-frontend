<script module lang="ts">
  const dateFormatter = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
</script>

<script lang="ts">
  import { isPaidBanner, paidBannerSteps, plannerCardKind } from '@/lib/timeline/planner-paid-banners';
  import { itemIconPath } from '@/lib/catalog/item-icons';
  import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
  import { availableCrystals, findGacha, plannerPickupGoals, recordedPlannerCount, type PlannerDataBundle, type PlannerTarget, type TargetProjection } from '@/lib/timeline/carat-planner';
  import { plannerPickupOptions } from '@/lib/timeline/planner-presentation';
  import type { TimelinePickupCatalog } from '@/lib/timeline/timeline-pickups';
  import PlannerTargetGoals from './PlannerTargetGoals.svelte';
  import Button from '@/components/Button.svelte';
  import Checkbox from '@/components/Checkbox.svelte';
  import Icon from '@/components/Icon.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import TextField from '@/components/TextField.svelte';
  import InspectPopover from '@/components/InspectPopover.svelte';

  interface Props {
    target: PlannerTarget;
    past?: boolean;
    projection?: TargetProjection;
    resources: PlannerDataBundle;
    events: TimelineRecord[];
    catalog: TimelinePickupCatalog;
    pickupCopyMemory: Map<string, number>;
    onupdate: (mutator: (target: PlannerTarget) => void) => void;
    onremove: () => void;
  }
  let { target, past = false, projection, resources, events, catalog, pickupCopyMemory, onupdate, onremove }: Props = $props();
  let notesDetails: HTMLDetailsElement;

  const gacha = $derived(findGacha(target, resources));
  const paidOnly = $derived(isPaidBanner(target, gacha));
  const cardKind = $derived(plannerCardKind(target, gacha));
  const maxPulls = $derived(paidOnly ? paidBannerSteps(gacha).reduce((sum, step) => sum + step.pulls, 0) : 5000);
  const stepUp = $derived(gacha?.step_up);
  const pickupOptions = $derived(plannerPickupOptions(target, gacha, events, catalog));
  const actualGoals = $derived(stepUp
    ? [{ key: 'chosen', name: 'Chosen card', desiredCopies: target.desiredCopies }]
    : plannerPickupGoals(target).map(goal => ({ key: String(goal.pickupId), name: pickupOptions.find(option => option.pickupId === goal.pickupId)?.name ?? `Pickup ${goal.pickupId}`, desiredCopies: goal.desiredCopies })));
  const savedPulls = $derived(target.plannedPulls - (target.actualPulls ?? target.plannedPulls));
  const stepOptions = $derived.by(() => {
    let pulls = 0, cost = 0;
    const options = [{ value: '0', label: 'No pulls' }];
    if (stepUp) for (let round = 1; round <= stepUp.rounds; round++) {
      for (const [index, step] of stepUp.steps.entries()) {
        pulls += step.pulls; cost += step.cost;
        options.push({ value: String(pulls), label: `${stepUp.rounds > 1 ? 'Round ' + round + ', ' : ''}Step ${index + 1} · ${pulls} pulls · ${cost.toLocaleString()} paid Carats` });
      }
    }
    return options;
  });
  const ticketKind = $derived((findGacha(target, resources)?.ticket_currency ?? (cardKind === 'support' && !stepUp ? 'support_ticket' : 'uma_ticket')) === 'support_ticket' ? 'support' : 'uma');
  const ticketCount = $derived(projection?.balanceBefore[ticketKind === 'support' ? 'supportTickets' : 'umaTickets'] ?? 0);
  const ticketLabel = $derived(`${ticketCount} ${ticketKind === 'support' ? 'support' : 'Trainee'} tickets available at pull; ${projection?.ticketPulls ? `${projection.ticketPulls} used and ${ticketCount - projection.ticketPulls} remaining` : 'none used'}`);
  const caratsBefore = $derived((projection?.balanceBefore.freeJewels ?? 0) + (projection?.balanceBefore.paidJewels ?? 0));
  const caratsAfter = $derived((projection?.freeJewelsAfter ?? 0) + (projection?.paidJewelsAfter ?? 0));
  const caratLabel = $derived(projection ? `${caratsBefore.toLocaleString()} Carats at pull (${projection.balanceBefore.freeJewels.toLocaleString()} free, ${projection.balanceBefore.paidJewels.toLocaleString()} paid); ${(caratsBefore - caratsAfter).toLocaleString()} spent; ${caratsAfter.toLocaleString()} remaining${!paidOnly && !target.allowPaidJewels && projection.balanceBefore.paidJewels > 0 ? '; paid Carats are reserved and will not be spent' : ''}` : '');
  function dateLabel(value?: string): string { const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : 'Unknown'; }
  function setPulls(pulls: number): void { onupdate(value => value.plannedPulls = Math.max(0, Math.min(maxPulls, paidOnly ? Math.floor(pulls / 10) * 10 || 0 : Math.trunc(pulls) || 0))); }
  function setActualPulls(raw: string): void {
    const count = recordedPlannerCount(raw);
    onupdate(value => value.actualPulls = count === undefined ? undefined : Math.min(maxPulls, paidOnly ? Math.floor(count / 10) * 10 : count));
  }
  function setActualCopies(key: string, raw: string): void {
    const count = recordedPlannerCount(raw);
    onupdate(value => {
      const copies = { ...value.actualCopies };
      if (count === undefined) delete copies[key]; else copies[key] = count;
      value.actualCopies = Object.keys(copies).length ? copies : undefined;
    });
  }

</script>

<article class="target" class:past data-target-id={target.id}>
  <div class="target-title" class:has-image={Boolean(target.imagePath)}>
    {#if target.imagePath}<img src={target.imagePath} width="512" height="125" loading="lazy" alt=""/>{/if}
    <div><strong class:paid={paidOnly}>{#if paidOnly}<span aria-label="Paid banner" title="Paid banner"><Icon name="paid" size={17}/></span>{/if}{target.title}</strong><small class="date"><Icon name="calendar" size={13}/>{dateLabel(target.bannerStart)} – {dateLabel(target.bannerEnd ?? target.bannerStart)}</small>
      {#if projection}<div class="at-pull" aria-label={`At pull date: ${caratLabel}${paidOnly ? '' : '; ' + ticketLabel}`}><small>At pull</small><span class="carat-balance" title={caratLabel}><img src={itemIconPath(43)} width="18" height="18" alt="Carats"/><b>{caratsBefore.toLocaleString()}</b><em>→ {caratsAfter.toLocaleString()}</em></span>{#if !paidOnly}<span title={ticketLabel}><img src={itemIconPath(ticketKind === 'support' ? 111 : 41)} width="18" height="18" alt=""/><b>{ticketCount}</b>{#if projection.ticketPulls}<em>→ {ticketCount - projection.ticketPulls}</em>{/if}</span>{#if cardKind === 'support' && !stepUp}{#each ['rainbow', 'gold'] as kind}<span title={`${kind === 'rainbow' ? 'Rainbow' : 'Gold'} Uncap Crystals available at pull`}><img src={itemIconPath(kind === 'rainbow' ? 144 : 145)} width="18" height="18" alt=""/><b>{kind === 'rainbow' ? availableCrystals(projection.balanceBefore.rainbowFullCrystals, projection.balanceBefore.rainbowCrystals) : availableCrystals(projection.balanceBefore.goldFullCrystals, projection.balanceBefore.goldCrystals)}</b></span>{/each}{/if}{/if}</div>{/if}
      <details class="target-notes" bind:this={notesDetails}>
        <summary aria-label={`Edit notes for ${target.title}`}><Icon name="chevron" size={14}/><span title={target.notes ?? ''}>{target.notes || 'Add notes'}</span></summary>
        <div class="notes-heading">
          <label for={`notes-${target.id}`}>Notes</label>
          <Button variant="secondary" size="sm" icon="close" ariaLabel={`Close notes for ${target.title}`} onclick={() => { notesDetails.open = false; notesDetails.querySelector('summary')?.focus(); }}>Close</Button>
        </div>
        <textarea id={`notes-${target.id}`} aria-label={`Notes for ${target.title}`} rows="2" maxlength="2000"
          placeholder="e.g. LB3, +1 selector; usable at LB2" value={target.notes ?? ''}
          oninput={event => onupdate(value => value.notes = event.currentTarget.value || undefined)}></textarea>
      </details>
    </div>
  </div>
  <div class="target-controls">
    {#if stepUp}<div class="step-progress"><SelectField id={`step-${target.id}`} label="Step-up progress" options={stepOptions} value={String(target.plannedPulls)} onchange={value => setPulls(Number(value))}/></div>{:else}<div class="pull-count"><span>Planned pulls</span><div class="stepper" role="group" aria-label="Planned pulls"><Button variant="secondary" size="sm" ariaLabel="Add 100 pulls" disabled={target.plannedPulls >= maxPulls} onclick={() => setPulls(target.plannedPulls + 100)}>+100</Button><Button variant="secondary" size="sm" ariaLabel="Add 10 pulls" disabled={target.plannedPulls >= maxPulls} onclick={() => setPulls(target.plannedPulls + 10)}>+10</Button><TextField id={`pulls-${target.id}`} label="Planned pulls" hideLabel type="number" min={0} max={maxPulls} step={10} value={String(target.plannedPulls)} oninput={event => setPulls(Number((event.currentTarget as HTMLInputElement).value))}/><Button variant="secondary" size="sm" ariaLabel="Remove 10 pulls" disabled={target.plannedPulls <= 0} onclick={() => setPulls(target.plannedPulls - 10)}>−10</Button><Button variant="secondary" size="sm" ariaLabel="Remove 100 pulls" disabled={target.plannedPulls <= 0} onclick={() => setPulls(target.plannedPulls - 100)}>−100</Button></div></div>{/if}
    {#if cardKind === 'support' && !stepUp}<div class="crystal-plan" role="group" aria-label="Uncap Crystals to use on this banner"><span><strong>Uncap crystals</strong><small>Replace extra copies after the first</small></span><div class="crystal-controls">{#each ['rainbow', 'gold'] as kind}{@const name = kind === 'rainbow' ? 'Rainbow' : 'Gold'}{@const key = kind === 'rainbow' ? 'rainbowCrystalsPlanned' : 'goldCrystalsPlanned'}<div class="crystal-control"><span><img src={itemIconPath(kind === 'rainbow' ? 144 : 145)} width="24" height="24" alt=""/><span><strong>{name}</strong><small>{kind === 'rainbow' ? 'SSR' : 'SR'} cards</small></span></span><div class="crystal-stepper" role="group" aria-label={`${name} Uncap Crystals to use on this banner`}><Button variant="ghost" size="sm" icon="minus" ariaLabel={`Use one fewer ${name} Uncap Crystal`} disabled={!target[key]} onclick={() => onupdate(value => value[key] = Math.max(0, (value[key] ?? 0) - 1))}/><output aria-label={`${name} Uncap Crystals planned`}>{target[key] ?? 0}</output><Button variant="ghost" size="sm" icon="add" ariaLabel={`Use one more ${name} Uncap Crystal`} disabled={(target[key] ?? 0) >= 20} onclick={() => onupdate(value => value[key] = Math.min(20, (value[key] ?? 0) + 1))}/></div></div>{/each}</div></div>{/if}
    <InspectPopover label="Target options" align="end">{#snippet trigger()}<span class="options-trigger"><Icon name="tune" size={16}/></span>{/snippet}<div class="target-options"><strong>Target options</strong><small>{paidOnly ? 'This banner uses paid Carats only.' : 'The recommended defaults use tickets first and pull at banner end.'}</small><SelectField id={`timing-${target.id}`} label="Pull on" options={[{value:'start',label:'Banner start'},{value:'end',label:'Banner end'},{value:'custom',label:'Custom date'}]} value={target.pullTiming} onchange={(value)=>onupdate((item)=>item.pullTiming=value as PlannerTarget['pullTiming'])}/>{#if target.pullTiming === 'custom'}<TextField id={`pull-date-${target.id}`} label="Pull date" type="date" value={target.customPullDate ?? ''} oninput={event => onupdate(value => value.customPullDate = (event.currentTarget as HTMLInputElement).value)}/>{/if}{#if !paidOnly}<Checkbox id={`tickets-${target.id}`} label="Use tickets first" checked={target.useTickets} onchange={(checked)=>onupdate((value)=>value.useTickets=checked)}/><Checkbox id={`paid-${target.id}`} label="Allow paid Carats" checked={target.allowPaidJewels} onchange={(checked)=>onupdate((value)=>value.allowPaidJewels=checked)}/>{#if target.useTickets}<TextField id={`ticket-limit-${target.id}`} label="Ticket limit" type="number" min={0} placeholder="No limit" value={String(target.ticketLimit??'')} oninput={(event)=>onupdate((value)=>value.ticketLimit=(event.currentTarget as HTMLInputElement).value===''?undefined:Math.max(0,Number((event.currentTarget as HTMLInputElement).value)||0))}/>{/if}{/if}</div></InspectPopover>
    <Button variant="secondary" size="sm" icon="trash" ariaLabel={`Remove ${target.title}`} onclick={onremove}/>
  </div>
  <details class="actual-results">
    <summary><strong>Actual results <small>(optional)</small></strong>{#if target.actualPulls !== undefined}<span role="status">{target.actualPulls} actual / {target.plannedPulls} planned · {savedPulls > 0 ? `${savedPulls} pulls saved` : savedPulls < 0 ? `${-savedPulls} pulls over plan` : 'As planned'}</span>{/if}</summary>
    <p>Finished pulling? Enter your final total, including free pulls and tickets. Future balances use this instead of the plan. Leave blank to keep the planned budget.</p>
    <div class="actual-fields">
      {#if stepUp}<SelectField id={`actual-pulls-${target.id}`} label="Actual step-up progress" options={[{ value: '', label: 'Not recorded' }, ...stepOptions]} value={String(target.actualPulls ?? '')} onchange={setActualPulls}/>
      {:else}<TextField id={`actual-pulls-${target.id}`} label="Actual pulls done" type="number" min={0} max={maxPulls} step={paidOnly ? 10 : 1} placeholder="Not recorded" value={String(target.actualPulls ?? '')} oninput={event => setActualPulls((event.currentTarget as HTMLInputElement).value)}/>{/if}
      {#each actualGoals as goal (goal.key)}
        <TextField id={`actual-copies-${target.id}-${goal.key}`} label={`Actual copies of ${goal.name}`} help={`${goal.desiredCopies} planned copies`} type="number" min={0} max={5000} step={1} placeholder="Not recorded" value={String(target.actualCopies?.[goal.key] ?? '')} oninput={event => setActualCopies(goal.key, (event.currentTarget as HTMLInputElement).value)}/>
      {/each}
    </div>
    <p>Copy results are optional; include exchanges, exclude Uncap Crystals. Spending uses this banner’s ticket and paid Carat settings.</p>
  </details>
  {#if past}<div class="past-note" role="note"><Icon name="timeline" size={16}/><span><strong>Before plan start</strong><small>Kept for editing, but excluded from this projection.</small></span></div>{/if}
  {#if paidOnly && !past && !maxPulls}<div class="past-note" role="status"><Icon name="warning" size={16}/><span>Paid banner costs are unavailable. Funding and odds will appear when its data loads.</span></div>
  {:else if !past && projection}<PlannerTargetGoals {target} {projection} {resources} {events} {catalog} {pickupCopyMemory} {onupdate}/>{/if}
</article>

<style>
  .target{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;border-bottom:1px solid var(--border-subtle);background:var(--surface-1);content-visibility:auto;contain-intrinsic-block-size:auto 150px}
  .target:has(:global([aria-expanded=true])){content-visibility:visible;position:relative;z-index:2}
  .step-progress{min-width:0;width:320px;max-width:100%}.step-progress :global(.field>label){font-size:10px}
  .target.past{color:var(--text-secondary)}
  .actual-results{grid-column:1/-1;min-width:0;padding:8px 10px;border-top:1px solid var(--border-subtle);font-size:12px}
  .actual-results summary{cursor:pointer}.actual-results summary>span{display:inline-block;margin-left:12px;color:var(--accent-primary)}
  .actual-results summary:focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}
  .actual-results small,.actual-results p{color:var(--text-secondary)}.actual-results p{margin:8px 0}
  .actual-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:12px;align-items:start}
  .target-title{min-width:0;min-height:66px;display:grid;align-items:center;gap:11px;padding:7px 10px}
  .target-title.has-image{grid-template-columns:148px minmax(0,1fr)}
  .target-title>img{display:block;width:148px;height:48px;object-fit:contain;border:1px solid var(--border-subtle);border-radius:3px;background:var(--surface-2)}
  .target-title>div{min-width:0;display:grid;gap:4px}
  .target-title strong{font-size:.84rem;line-height:1.25;overflow-wrap:anywhere}
  .target-title strong.paid{display:flex;align-items:center;gap:5px;color:var(--color-gold)}.paid>span{display:flex;flex:none}
  .target-notes{min-width:0}
  .target-notes>summary{display:flex;align-items:center;gap:4px;min-height:28px;list-style:none;cursor:pointer;color:var(--text-secondary);font-size:12px}
  .target-notes>summary::-webkit-details-marker{display:none}
  .target-notes>summary:hover{color:var(--accent-primary)}
  .target-notes>summary:focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}
  .target-notes>summary :global(svg){flex:none}
  .target-notes[open]>summary :global(svg){transform:rotate(180deg)}
  .target-notes>summary>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .notes-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-block:4px}
  .notes-heading>label{font-size:12px;color:var(--text-secondary)}
  .target-notes>textarea{display:block;box-sizing:border-box;width:100%;min-height:64px;padding:8px 10px;resize:vertical;border:1px solid var(--factor-field-border);border-radius:var(--radius-sm);background:var(--factor-field-bg);color:var(--factor-field-text);font:inherit;font-size:14px}
  .target-notes>textarea:focus{border-color:var(--factor-field-focus-border);outline:0;box-shadow:var(--focus-ring)}
  .date{display:flex;align-items:center;flex-wrap:wrap;gap:3px 5px;color:var(--text-secondary);font-size:10px}
  .date :global(svg){color:var(--accent-primary);flex:none}
  .at-pull{display:flex;align-items:center;flex-wrap:wrap;gap:5px;font-size:10px}
  .at-pull>small{text-transform:uppercase;color:var(--text-secondary);font-weight:700;font-size:9px}
  .at-pull>span{display:inline-flex;align-items:center;gap:3px;padding:1px 3px;border-radius:var(--radius-sm);background:var(--surface-2)}
  .at-pull img{object-fit:contain}.at-pull em{font-style:normal;color:var(--text-secondary)}
  .target-controls{display:flex;align-items:end;gap:8px;padding:8px 10px;border-left:1px solid var(--border-subtle);background:color-mix(in srgb,var(--surface-2) 58%,transparent)}
  .pull-count{min-width:0;display:grid;gap:4px}
  .pull-count>span,.target-options>small{color:var(--text-secondary);font-size:10px}
  .stepper{display:grid;grid-template-columns:48px 42px minmax(80px,92px) 42px 48px;gap:3px;align-items:stretch}
  .stepper :global(.ui-button){min-width:0;min-height:var(--control-height);padding-inline:4px}

  .target-controls>:global(.ui-button){width:36px;padding:0}
  .options-trigger{width:36px;height:36px;display:grid;place-items:center;border:1px solid var(--factor-field-border);border-radius:var(--radius-sm);color:var(--text-secondary);background:var(--factor-field-bg)}
  .target-options{display:grid;gap:8px}
  .crystal-plan{display:grid;gap:5px}.crystal-plan>span{display:grid;font-size:10px}
  .crystal-plan small{color:var(--text-secondary);font-size:9px}
  .crystal-controls{display:flex;gap:8px}.crystal-control{display:flex;align-items:center;gap:6px}
  .crystal-control>span{display:flex;align-items:center;gap:4px}.crystal-control>span>span{display:grid;font-size:10px}
  .crystal-control img{object-fit:contain}
  .crystal-stepper{display:flex;align-items:center;border:1px solid var(--factor-field-border);border-radius:var(--radius-sm)}
  .crystal-stepper :global(.ui-button){width:28px;min-height:34px;padding:0}.crystal-stepper output{min-width:20px;text-align:center;font-weight:700}
  .past-note{grid-column:1/-1;display:flex;align-items:center;gap:8px;padding:8px 10px;border-top:1px solid var(--border-subtle);color:var(--text-secondary)}
  .past-note span{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.past-note small{font-size:10px}
  @media(max-width:1250px){.target-controls:has(.crystal-plan){flex-wrap:wrap;max-width:400px}.crystal-plan{order:1;width:100%}.crystal-controls{justify-content:space-between}}
  @container planner-targets (max-width:1050px){
    .target{grid-template-columns:minmax(0,1fr)}
    .target-title.has-image{grid-template-columns:128px minmax(0,1fr)}.target-title>img{width:128px}
    .target-controls,.target-controls:has(.crystal-plan){max-width:none;justify-content:flex-end;flex-wrap:wrap;border-left:0;border-top:1px solid var(--border-subtle)}
  }
  @media(max-width:767px){
    .target{grid-template-columns:minmax(0,1fr);margin-bottom:8px;border:1px solid var(--border-primary);border-radius:var(--radius-md)}
    .target-title{padding:7px 6px;gap:8px}.target-title.has-image{grid-template-columns:142px minmax(0,1fr)}.target-title>img{width:142px;height:55px;border:0;border-radius:5px}
    .target-controls,.target-controls:has(.crystal-plan){max-width:none;border-left:0;padding:6px;gap:6px}
    .pull-count{flex:1}.stepper{display:block}.stepper :global(.ui-button){display:none}.stepper :global(.field){--control-height:var(--touch-target)}

    .step-progress{flex:1}.step-progress :global(.field){--control-height:var(--touch-target)}
    .options-trigger,.target-controls>:global(.ui-button){width:var(--touch-target);height:var(--touch-target)}
    .crystal-stepper :global(.ui-button){min-width:var(--touch-target);min-height:var(--touch-target)}
    .crystal-controls{flex-wrap:wrap}.crystal-control{flex:1;justify-content:space-between}
    .past-note{padding:8px 6px}.past-note span{display:grid;gap:3px}
  }
  @media(max-width:420px){.target-title.has-image{grid-template-columns:126px minmax(0,1fr)}.target-title>img{width:126px;height:49px}}
</style>
