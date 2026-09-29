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
  let notesTrigger: HTMLSpanElement;

  const gacha = $derived(findGacha(target, resources));
  const paidOnly = $derived(isPaidBanner(target, gacha));
  const cardKind = $derived(plannerCardKind(target, gacha));
  const maxPulls = $derived(paidOnly ? paidBannerSteps(gacha).reduce((sum, step) => sum + step.pulls, 0) : 5000);
  const stepUp = $derived(gacha?.step_up);
  const pickupOptions = $derived(plannerPickupOptions(target, gacha, events, catalog));
  const actualGoals = $derived(stepUp
    ? [{ key: 'chosen', name: 'Chosen card', image: '', desiredCopies: target.desiredCopies }]
    : plannerPickupGoals(target).map(goal => {
      const option = pickupOptions.find(option => option.pickupId === goal.pickupId);
      return { key: String(goal.pickupId), name: option?.name ?? `Pickup ${goal.pickupId}`, image: option?.image ?? '', desiredCopies: goal.desiredCopies };
    }));
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
    <div class="banner-media">
      {#if target.imagePath}<img src={target.imagePath} width="512" height="125" loading="lazy" alt=""/>{/if}
    </div>
    <div class="target-info">
      <div class="banner-identity"><strong class:paid={paidOnly}>{#if paidOnly}<span aria-label="Paid banner" title="Paid banner"><Icon name="paid" size={17}/></span>{/if}{target.title}</strong><small class="date"><Icon name="calendar" size={13}/>{dateLabel(target.bannerStart)} – {dateLabel(target.bannerEnd ?? target.bannerStart)}</small></div>
      <div class="banner-actions" role="group" aria-label={`Notes and results for ${target.title}`}>
        <InspectPopover label={`Edit notes for ${target.title}`} align="end" onopenchange={open => { if (open) document.getElementById(`notes-${target.id}`)?.focus({ preventScroll: true }); }}>
          {#snippet trigger()}<span bind:this={notesTrigger} class="action-trigger notes-trigger" class:recorded={Boolean(target.notes)} title={target.notes || 'Add notes'}><Icon name="edit" size={16}/><span>Notes</span>{#if target.notes}<i aria-label="Has notes"></i>{/if}</span>{/snippet}
          <div class="notes-editor">
            <label for={`notes-${target.id}`}>Banner notes</label>
            <textarea id={`notes-${target.id}`} aria-label={`Notes for ${target.title}`} rows="4" maxlength="2000" placeholder="e.g. LB3, +1 selector; usable at LB2" value={target.notes ?? ''} oninput={event => onupdate(value => value.notes = event.currentTarget.value || undefined)}></textarea>
            <footer><small>Saved automatically</small><Button variant="secondary" size="sm" icon="save" ariaLabel={`Save notes for ${target.title}`} onclick={() => { document.getElementById(`notes-${target.id}`)?.closest<HTMLElement>('[popover]')?.hidePopover(); notesTrigger.closest('button')?.focus(); }}>Save</Button></footer>
          </div>
        </InspectPopover>
        <InspectPopover label={`Actual results for ${target.title}`} align="end" onopenchange={open => { if (open) document.getElementById(`actual-pulls-${target.id}`)?.focus({ preventScroll: true }); }}>
          {#snippet trigger()}<span class="action-trigger results-trigger" class:recorded={target.actualPulls !== undefined || Boolean(target.actualCopies)}><Icon name={target.actualPulls !== undefined || target.actualCopies ? 'check' : 'clipboard'} size={16}/><span>Results</span></span>{/snippet}
          <div class="results-editor">
            <header><strong>Actual results</strong><small>Your original plan stays unchanged.</small></header>
            <div class="result-entry" class:step-up={Boolean(stepUp)}>
              <span class="result-label"><strong>Pulls done</strong><small>{target.plannedPulls} planned · include free pulls &amp; tickets</small></span>
              {#if stepUp}<SelectField id={`actual-pulls-${target.id}`} label="Actual step-up progress" hideLabel options={[{ value: '', label: 'Not recorded' }, ...stepOptions]} value={String(target.actualPulls ?? '')} onchange={setActualPulls}/>
              {:else}<TextField id={`actual-pulls-${target.id}`} label="Actual pulls done" hideLabel type="number" min={0} max={maxPulls} step={paidOnly ? 10 : 1} placeholder="—" value={String(target.actualPulls ?? '')} oninput={event => setActualPulls((event.currentTarget as HTMLInputElement).value)}/>{/if}
            </div>
            {#if actualGoals.length}<div class="result-copies"><strong>Copies received <small>Optional</small></strong>
              {#each actualGoals as goal (goal.key)}
                <div class="result-entry">
                  <span class="result-name"><span class="result-art">{#if goal.image}<img src={goal.image} width="30" height="30" loading="lazy" alt="" onerror={event => (event.currentTarget as HTMLImageElement).hidden = true}/>{/if}<Icon name={cardKind === 'support' ? 'grid' : 'user'} size={20}/></span><span><strong>{goal.name}</strong><small>{goal.desiredCopies} planned copies</small></span></span>
                  <TextField id={`actual-copies-${target.id}-${goal.key}`} label={`Actual copies of ${goal.name}`} hideLabel type="number" min={0} max={5000} step={1} placeholder="—" value={String(target.actualCopies?.[goal.key] ?? '')} oninput={event => setActualCopies(goal.key, (event.currentTarget as HTMLInputElement).value)}/>
                </div>
              {/each}
              <small>Include exchanges, exclude Uncap Crystals.</small>
            </div>{/if}
            <p>Saved automatically. Clear pulls to use your planned budget.</p>
          </div>
        </InspectPopover>
      </div>
      {#if projection}<div class="at-pull" aria-label={`At pull date: ${caratLabel}${paidOnly ? '' : '; ' + ticketLabel}`}><small>At pull</small><span class="carat-balance" title={caratLabel}><img src={itemIconPath(43)} width="18" height="18" alt="Carats"/><b>{caratsBefore.toLocaleString()}</b><em>→ {caratsAfter.toLocaleString()}</em></span>{#if !paidOnly}<span title={ticketLabel}><img src={itemIconPath(ticketKind === 'support' ? 111 : 41)} width="18" height="18" alt=""/><b>{ticketCount}</b>{#if projection.ticketPulls}<em>→ {ticketCount - projection.ticketPulls}</em>{/if}</span>{#if cardKind === 'support' && !stepUp}{#each ['rainbow', 'gold'] as kind}<span title={`${kind === 'rainbow' ? 'Rainbow' : 'Gold'} Uncap Crystals available at pull`}><img src={itemIconPath(kind === 'rainbow' ? 144 : 145)} width="18" height="18" alt=""/><b>{kind === 'rainbow' ? availableCrystals(projection.balanceBefore.rainbowFullCrystals, projection.balanceBefore.rainbowCrystals) : availableCrystals(projection.balanceBefore.goldFullCrystals, projection.balanceBefore.goldCrystals)}</b></span>{/each}{/if}{/if}</div>{/if}
      {#if target.notes}<span class="note-preview" title={target.notes}>{target.notes}</span>{/if}
    </div>
  </div>
  <div class="target-controls">
    <div class="pull-count" class:step-progress={Boolean(stepUp)}>
      <div class="pull-heading">
        <span>Planned pulls</span>
      </div>
      {#if stepUp}<SelectField id={`step-${target.id}`} label="Step-up progress" hideLabel options={stepOptions} value={String(target.plannedPulls)} onchange={value => setPulls(Number(value))}/>
      {:else}<div class="stepper" role="group" aria-label="Planned pulls"><Button variant="secondary" size="sm" ariaLabel="Add 100 pulls" disabled={target.plannedPulls >= maxPulls} onclick={() => setPulls(target.plannedPulls + 100)}>+100</Button><Button variant="secondary" size="sm" ariaLabel="Add 10 pulls" disabled={target.plannedPulls >= maxPulls} onclick={() => setPulls(target.plannedPulls + 10)}>+10</Button><TextField id={`pulls-${target.id}`} label="Planned pulls" hideLabel type="number" min={0} max={maxPulls} step={10} value={String(target.plannedPulls)} oninput={event => setPulls(Number((event.currentTarget as HTMLInputElement).value))}/><Button variant="secondary" size="sm" ariaLabel="Remove 10 pulls" disabled={target.plannedPulls <= 0} onclick={() => setPulls(target.plannedPulls - 10)}>−10</Button><Button variant="secondary" size="sm" ariaLabel="Remove 100 pulls" disabled={target.plannedPulls <= 0} onclick={() => setPulls(target.plannedPulls - 100)}>−100</Button></div>{/if}
    </div>
    {#if cardKind === 'support' && !stepUp}<div class="crystal-plan" role="group" aria-label="Uncap Crystals to use on this banner"><span title="Replace extra copies after the first"><strong>Uncap crystals</strong><small>Replace extra copies after the first</small></span><div class="crystal-controls">{#each ['rainbow', 'gold'] as kind}{@const name = kind === 'rainbow' ? 'Rainbow' : 'Gold'}{@const key = kind === 'rainbow' ? 'rainbowCrystalsPlanned' : 'goldCrystalsPlanned'}<div class="crystal-control"><span><img src={itemIconPath(kind === 'rainbow' ? 144 : 145)} width="24" height="24" alt=""/><span><strong>{name}</strong><small>{kind === 'rainbow' ? 'SSR' : 'SR'} cards</small></span></span><div class="crystal-stepper" role="group" aria-label={`${name} Uncap Crystals to use on this banner`}><Button variant="ghost" size="sm" icon="minus" ariaLabel={`Use one fewer ${name} Uncap Crystal`} disabled={!target[key]} onclick={() => onupdate(value => value[key] = Math.max(0, (value[key] ?? 0) - 1))}/><output aria-label={`${name} Uncap Crystals planned`}>{target[key] ?? 0}</output><Button variant="ghost" size="sm" icon="add" ariaLabel={`Use one more ${name} Uncap Crystal`} disabled={(target[key] ?? 0) >= 20} onclick={() => onupdate(value => value[key] = Math.min(20, (value[key] ?? 0) + 1))}/></div></div>{/each}</div></div>{/if}
    <div class="target-actions" role="group" aria-label={`Actions for ${target.title}`}>
      <InspectPopover label="Target options" align="end">{#snippet trigger()}<span class="options-trigger"><Icon name="tune" size={16}/></span>{/snippet}<div class="target-options"><strong>Target options</strong><small>{paidOnly ? 'This banner uses paid Carats only.' : 'The recommended defaults use tickets first and pull at banner end.'}</small><SelectField id={`timing-${target.id}`} label="Pull on" options={[{value:'start',label:'Banner start'},{value:'end',label:'Banner end'},{value:'custom',label:'Custom date'}]} value={target.pullTiming} onchange={(value)=>onupdate((item)=>item.pullTiming=value as PlannerTarget['pullTiming'])}/>{#if target.pullTiming === 'custom'}<TextField id={`pull-date-${target.id}`} label="Pull date" type="date" value={target.customPullDate ?? ''} oninput={event => onupdate(value => value.customPullDate = (event.currentTarget as HTMLInputElement).value)}/>{/if}{#if !paidOnly}<Checkbox id={`tickets-${target.id}`} label="Use tickets first" checked={target.useTickets} onchange={(checked)=>onupdate((value)=>value.useTickets=checked)}/><Checkbox id={`paid-${target.id}`} label="Allow paid Carats" checked={target.allowPaidJewels} onchange={(checked)=>onupdate((value)=>value.allowPaidJewels=checked)}/>{#if target.useTickets}<TextField id={`ticket-limit-${target.id}`} label="Ticket limit" type="number" min={0} placeholder="No limit" value={String(target.ticketLimit??'')} oninput={(event)=>onupdate((value)=>value.ticketLimit=(event.currentTarget as HTMLInputElement).value===''?undefined:Math.max(0,Number((event.currentTarget as HTMLInputElement).value)||0))}/>{/if}{/if}</div></InspectPopover>
      <Button variant="secondary" size="sm" icon="trash" ariaLabel={`Remove ${target.title}`} onclick={onremove}/>
    </div>
  </div>
  {#if past}<div class="past-note" role="note"><Icon name="timeline" size={16}/><span><strong>Before plan start</strong><small>Kept for editing, but excluded from this projection.</small></span></div>{/if}
  {#if paidOnly && !past && !maxPulls}<div class="past-note" role="status"><Icon name="warning" size={16}/><span>Paid banner costs are unavailable. Funding and odds will appear when its data loads.</span></div>
  {:else if !past && projection}<PlannerTargetGoals {target} {projection} {resources} {events} {catalog} {pickupCopyMemory} {onupdate}/>{/if}
</article>

<style>
  .target{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;border-bottom:1px solid var(--border-subtle);background:var(--surface-1);content-visibility:auto;contain-intrinsic-block-size:auto 150px}
  .target:has(:global([aria-expanded=true])){content-visibility:visible;position:relative;z-index:2}
  .step-progress{min-width:0;width:320px;max-width:100%}
  .target.past{color:var(--text-secondary)}
  .pull-heading>span{font-size:10px;color:var(--text-secondary)}
  .target-actions{grid-column:3;display:flex;align-items:center;justify-content:flex-end;gap:4px}
  .banner-media{min-width:0}
  .banner-actions{display:flex;align-self:start;justify-self:end;gap:4px;--inspect-popover-width:360px;--inspect-popover-padding:14px}
  .action-trigger{height:26px;padding:0 8px;display:flex;align-items:center;justify-content:center;gap:4px;border:1px solid var(--factor-field-border);border-radius:var(--radius-sm);background:var(--factor-field-bg);color:var(--text-primary);font-size:11px;font-weight:600}
  .action-trigger :global(svg){width:12px;height:12px}
  .notes-trigger{position:relative}.notes-trigger i{position:absolute;top:4px;right:4px;width:5px;height:5px;border-radius:50%;background:var(--accent-primary)}
  .results-trigger{border-color:color-mix(in srgb,var(--accent-primary) 55%,var(--factor-field-border));background:var(--color-accent-soft);color:var(--accent-primary)}
  .action-trigger:hover{border-color:var(--accent-primary)}.notes-trigger.recorded{color:var(--accent-primary)}
  .results-editor{display:grid;gap:10px;font-size:12px}.results-editor header{display:grid;gap:4px;padding-right:30px}.results-editor header>strong{font-size:14px}.results-editor small,.results-editor p{color:var(--text-secondary);font-size:11px;line-height:1.4}
  .result-entry{display:grid;grid-template-columns:minmax(0,1fr) 80px;align-items:center;gap:10px}.result-entry.step-up{grid-template-columns:minmax(0,1fr)}.result-label,.result-name>span:last-child{display:grid;gap:3px;min-width:0}.result-entry strong{font-size:12px;overflow-wrap:anywhere}
  .result-copies{display:grid;gap:10px;border-top:1px solid var(--border-subtle);padding-top:12px}.result-copies>strong{display:flex;justify-content:space-between}.result-copies>strong>small{font-weight:400}
  .result-entry .result-name{display:flex;align-items:center;gap:8px;min-width:0}
  .result-art{display:grid;place-items:center;flex:none;width:30px;height:30px;color:var(--text-secondary)}.result-art img,.result-art :global(svg){grid-area:1/1}.result-art img{object-fit:contain;z-index:1}.result-art img:not([hidden])~:global(svg){display:none}
  .results-editor p{margin:0;padding-top:10px;border-top:1px solid var(--border-subtle)}
  .target-title{min-width:0;min-height:66px;display:grid;grid-template-columns:148px minmax(0,1fr);align-items:center;gap:11px;padding:7px 10px}
  .banner-media>img{display:block;width:148px;height:48px;object-fit:contain;border:1px solid var(--border-subtle);border-radius:3px;background:var(--surface-2)}
  .target-info{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 11px}
  .note-preview{grid-column:1/-1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary);font-size:12px}
  .banner-identity{min-width:0;display:grid;gap:4px}.banner-identity>strong{font-size:.84rem;line-height:1.25;overflow-wrap:anywhere}
  .banner-identity>strong.paid{display:flex;align-items:center;gap:5px;color:var(--color-gold)}.paid>span{display:flex;flex:none}
  .notes-editor{display:grid;gap:10px}.notes-editor>label{font-size:14px;font-weight:600;padding-right:32px}.notes-editor>footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.notes-editor small{font-size:11px;color:var(--text-secondary)}
  .notes-editor>textarea{display:block;box-sizing:border-box;width:100%;min-height:100px;padding:8px 10px;resize:vertical;border:1px solid var(--factor-field-border);border-radius:var(--radius-sm);background:var(--factor-field-bg);color:var(--factor-field-text);font:inherit;font-size:14px}
  .notes-editor>textarea:focus{border-color:var(--factor-field-focus-border);outline:0;box-shadow:var(--focus-ring)}
  .date{display:flex;align-items:center;flex-wrap:wrap;gap:3px 5px;color:var(--text-secondary);font-size:10px}
  .date :global(svg){color:var(--accent-primary);flex:none}
  .at-pull{grid-column:1/-1;display:flex;align-items:center;flex-wrap:wrap;gap:5px;font-size:10px}
  .at-pull>small{text-transform:uppercase;color:var(--text-secondary);font-weight:700;font-size:9px}
  .at-pull>span{display:inline-flex;align-items:center;gap:3px;padding:1px 3px;border-radius:var(--radius-sm);background:var(--surface-2)}
  .at-pull img{object-fit:contain}.at-pull em{font-style:normal;color:var(--text-secondary)}
  .target-controls{display:grid;grid-template-columns:auto auto auto;align-items:end;gap:8px;padding:8px 10px;border-left:1px solid var(--border-subtle);background:color-mix(in srgb,var(--surface-2) 58%,transparent)}
  .pull-count{grid-column:1;grid-row:1;min-width:0;display:grid;gap:4px}
  .target-options>small{color:var(--text-secondary);font-size:10px}
  .stepper{display:grid;grid-template-columns:48px 42px minmax(80px,92px) 42px 48px;gap:3px;align-items:stretch}
  .stepper :global(.ui-button){min-width:0;min-height:var(--control-height);padding-inline:4px}

  .target-actions>:global(.ui-button){width:36px;padding:0}
  .options-trigger{width:36px;height:36px;display:grid;place-items:center;border:1px solid var(--factor-field-border);border-radius:var(--radius-sm);color:var(--text-secondary);background:var(--factor-field-bg)}
  .target-options{display:grid;gap:8px}
  .crystal-plan{grid-column:2;grid-row:1;display:grid;gap:5px}.crystal-plan>span{display:grid;font-size:10px}
  .crystal-plan small{color:var(--text-secondary);font-size:9px}
  .crystal-controls{display:flex;gap:8px}.crystal-control{display:flex;align-items:center;gap:6px}
  .crystal-control>span{display:flex;align-items:center;gap:4px}.crystal-control>span>span{display:grid;font-size:10px}
  .crystal-control img{object-fit:contain}
  .crystal-stepper{display:flex;align-items:center;border:1px solid var(--factor-field-border);border-radius:var(--radius-sm)}
  .crystal-stepper :global(.ui-button){width:28px;min-height:34px;padding:0}.crystal-stepper output{min-width:20px;text-align:center;font-weight:700}
  .past-note{grid-column:1/-1;display:flex;align-items:center;gap:8px;padding:8px 10px;border-top:1px solid var(--border-subtle);color:var(--text-secondary)}
  .past-note span{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.past-note small{font-size:10px}
  @container planner-targets (max-width:1150px){
    .target{grid-template-columns:minmax(0,1fr)}
    .target-title{grid-template-columns:128px minmax(0,1fr)}.banner-media>img{width:128px}
    .target-controls{border-left:0;border-top:1px solid var(--border-subtle)}
  }
  @container planner-targets (max-width:900px){.target-controls{grid-template-columns:minmax(0,1fr) auto}.target-actions{grid-column:2;grid-row:1}.crystal-plan{grid-column:1/-1;grid-row:2;justify-self:end}.pull-count{justify-self:start}}
  @media(max-width:767px){
    .results-editor :global(.field){--control-height:var(--touch-target)}.results-editor header{min-height:30px;padding-right:36px}
    .target{grid-template-columns:minmax(0,1fr);margin-bottom:8px;border:1px solid var(--border-primary);border-radius:var(--radius-md)}
    .target-title{grid-template-columns:104px minmax(0,1fr);min-height:0;padding:10px;gap:4px 8px}.banner-media{grid-column:1;grid-row:1/3}.banner-media>img{width:104px;height:32px;border:0;border-radius:5px}
    .target-info{display:contents}.banner-identity{grid-column:2;grid-row:1}.banner-actions{grid-column:2;grid-row:2}.at-pull{grid-column:1/-1;grid-row:3;margin-top:4px}
    .note-preview{grid-row:4}
    .target-controls{grid-template-columns:minmax(0,1fr) auto;border-left:0;padding:6px 10px;gap:6px}
    .pull-count{justify-self:stretch}.pull-count:not(.step-progress){grid-template-columns:auto 80px;justify-content:start;align-items:center;gap:8px}.pull-heading>span{font-size:11px}.stepper{display:block}.stepper :global(.ui-button){display:none}.stepper :global(.field){--control-height:var(--touch-target)}

    .step-progress{width:auto;grid-template-columns:minmax(0,1fr);gap:4px}.step-progress :global(.field){--control-height:var(--touch-target)}
    .action-trigger{height:var(--touch-target);font-size:11px}.action-trigger :global(svg){display:none}
    .banner-actions :global(.popover:popover-open){left:8px!important;top:auto!important;bottom:max(8px,env(safe-area-inset-bottom));width:calc(100vw - 16px);max-height:calc(100dvh - 16px);border-radius:var(--radius-lg);box-shadow:0 -8px 32px #0005}
    .banner-actions :global(.popover::backdrop){background:#0006}
    .target-controls :global(input),.banner-actions :global(input),.notes-editor>textarea{font-size:16px}.notes-editor>footer :global(.ui-button){min-height:var(--touch-target)}
    .target-actions{grid-column:2;grid-row:1}
    .options-trigger,.target-actions>:global(.ui-button){width:var(--touch-target);height:var(--touch-target)}
    .crystal-stepper :global(.ui-button){width:24px;min-height:var(--touch-target)}.crystal-stepper output{min-width:18px}
    .crystal-plan{grid-column:1/-1;grid-row:2;display:grid;gap:5px;justify-self:stretch}.crystal-plan>span{width:auto}.crystal-controls{display:flex;flex-wrap:wrap;gap:6px 14px}.crystal-control{gap:4px}.crystal-control>span{gap:3px}.crystal-control img{width:18px;height:18px}.crystal-control>span>span{font-size:9px}.crystal-control small,.crystal-plan>span>small{display:none}
    .past-note{padding:8px 6px}.past-note span{display:grid;gap:3px}
  }
</style>
