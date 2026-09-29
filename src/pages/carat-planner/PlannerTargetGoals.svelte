<script lang="ts">
  import { isPaidBanner, paidBannerSteps, plannerCardKind } from '@/lib/timeline/planner-paid-banners';
  import { findGacha, plannerPickupGoals, type PlannerDataBundle, type PlannerGoalProjection, type PlannerTarget, type TargetProjection } from '@/lib/timeline/carat-planner';
  import { plannerPickupOptions } from '@/lib/timeline/planner-presentation';
  import { calculatePullDistribution, pullOutcomeSegments } from '@/lib/timeline/planner-pull-probability';
  import type { TimelinePickupCatalog } from '@/lib/timeline/timeline-pickups';
  import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
  import Button from '@/components/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/InspectPopover.svelte';

  interface Props {
    target: PlannerTarget;
    projection: TargetProjection;
    resources: PlannerDataBundle;
    events: TimelineRecord[];
    catalog: TimelinePickupCatalog;
    pickupCopyMemory: Map<string, number>;
    onupdate: (mutator: (target: PlannerTarget) => void) => void;
  }
  let { target, projection, resources, events, catalog, pickupCopyMemory, onupdate }: Props = $props();
  let expanded = $state(false);
  let pickupSearch = $state('');
  let viewportWidth = $state<number>();
  const gacha = $derived(findGacha(target, resources));
  const paidOnly = $derived(isPaidBanner(target, gacha));
  const cardKind = $derived(plannerCardKind(target, gacha));
  const stepUp = $derived(gacha?.step_up);
  const chosenCopies = $derived(paidBannerSteps(gacha).slice(0, (projection.actualPulls ?? projection.plannedPulls) / 10).filter(step => step.selectable).length);
  const options = $derived(stepUp ? [{ id: 'step-up-choice', pickupId: 0, kind: cardKind, image: '', name: 'Chosen card', subLabel: stepUp.selection_pool_size ? `From your pool of ${stepUp.selection_pool_size}` : 'From your selected pool', rate: stepUp.selection_pickup_rate, exchangeable: false }] : plannerPickupOptions(target, gacha, events, catalog));
  const filteredOptions = $derived(options.filter(option => `${option.name} ${option.subLabel}`.toLocaleLowerCase().includes(pickupSearch.trim().toLocaleLowerCase())));
  const goals = $derived((stepUp ? [{ pickupId: 0, desiredCopies: target.desiredCopies }] : plannerPickupGoals(target)).map(goal => ({ ...goal, option: options.find(option => option.pickupId === goal.pickupId)!, odds: projection.pickupGoals.find(odds => odds.pickupId === goal.pickupId) })));
  const ratesAvailable = $derived(goals.length > 0 && goals.every(goal => goal.odds?.pickupRate !== undefined));
  const inferred = $derived(gacha?.rates_confidence === 'inferred_standard');
  const source = $derived(gacha?.pickups ?? gacha?.featured_pickups ?? []);
  const distribution = $derived(calculatePullDistribution({
    pulls: projection.fundedPulls, rateUpRates: goals.map(goal => goal.odds?.pickupRate ?? Number.NaN),
    allRateUpRates: source.map(pickup => pickup.rate), topRarityRate: gacha?.rarity_rates?.find(rate => rate.rarity === 3)?.rate,
    sparkPulls: gacha?.spark_pulls ?? resources.core.default_spark_pulls ?? 200,
    sparkExchangeable: goals.some(goal => goal.option.exchangeable)
  }));
  const segments = $derived(pullOutcomeSegments(distribution));
  const totalLabel = $derived(!goals.length ? 'Choose pickups' : !ratesAvailable ? 'Rates unavailable' : percent(projection.pickupProbability));
  const allGoalsStatus = $derived(!projection.jointProbabilityExact ? 'Goal combination is too large to calculate exactly' : [
    projection.sparkCopies ? `${projection.sparkCopies} shared exchange ${projection.sparkCopies === 1 ? 'copy' : 'copies'}` : '',
    projection.rainbowCrystalsUsed + projection.goldCrystalsUsed ? `${projection.rainbowCrystalsUsed + projection.goldCrystalsUsed} Uncap Crystal${projection.rainbowCrystalsUsed + projection.goldCrystalsUsed === 1 ? '' : 's'}` : ''
  ].filter(Boolean).map((part, index, parts) => index === parts.length - 1 ? `${part} included` : part).join(' + ') || 'Exact joint chance');
  const fundingLabel = $derived(paidOnly ? `Paid Carats only · ${projection.shortfallJewels ? `Requires ${projection.shortfallJewels.toLocaleString()} paid Carats` : 'Paid cost covered'}` : [projection.shortfallJewels ? `${projection.shortfallJewels.toLocaleString()} Carats short` : '', `${projection.ticketPulls + projection.freeJewelPulls + projection.paidJewelPulls} from resources`, projection.freePullsUsed ? `${projection.freePullsUsed} free` : ''].filter(Boolean).join(' · '));
  const topRarity = $derived(cardKind === 'support' ? 'SSR' : '3★');

  function percent(value?: number, digits = 1): string { return value === undefined || !Number.isFinite(value) ? 'Unavailable' : `${(value * 100).toFixed(value > 0 && value < .001 ? 2 : digits)}%`; }
  function copies(value: number): string { return value.toFixed(value >= 10 ? 1 : 2).replace(/\.?0+$/, ''); }
  function requirement(goal: typeof goals[number]): string {
    const count = goal.odds?.copiesNeededFromPulls ?? goal.desiredCopies;
    return `${count} ${count === 1 ? 'copy' : 'copies'} required${goal.odds?.crystalCopiesApplied ? ` + ${goal.odds.crystalCopiesApplied} ${goal.odds.crystalKind === 'gold' ? 'Gold' : 'Rainbow'} Uncap` : ''}`;
  }
  function oddsLabel(name: string, odds?: PlannerGoalProjection): string {
    if (odds?.probability === undefined) return `Odds unavailable for ${name}`;
    return `${percent(odds.probability)} chance of at least ${odds.copiesNeededFromPulls} ${odds.copiesNeededFromPulls === 1 ? 'copy' : 'copies'} of ${name}${odds.crystalCopiesApplied ? `; ${odds.crystalCopiesApplied} ${odds.crystalKind === 'gold' ? 'Gold' : 'Rainbow'} Uncap Crystals supply the remaining limit breaks toward ${odds.desiredCopies} copies` : ''}`;
  }
  function editGoal(pickupId: number, change?: number): void {
    onupdate(value => {
      if (stepUp) { value.desiredCopies = Math.max(1, Math.min(cardKind === 'support' ? 5 : 20, value.desiredCopies + (change ?? 0))); return; }
      const selected = plannerPickupGoals(value);
      const index = selected.findIndex(goal => goal.pickupId === pickupId);
      const key = `${value.id}:${pickupId}`;
      if (change !== undefined && index >= 0) {
        selected[index]!.desiredCopies = Math.max(1, Math.min(cardKind === 'support' ? 5 : 20, selected[index]!.desiredCopies + change));
        pickupCopyMemory.set(key, selected[index]!.desiredCopies);
      } else if (index >= 0) {
        pickupCopyMemory.set(key, selected[index]!.desiredCopies);
        selected.splice(index, 1);
      } else selected.push({ pickupId, desiredCopies: pickupCopyMemory.get(key) ?? 1 });
      value.pickupGoals = selected;
      value.pickupId = selected[0]?.pickupId;
      value.desiredCopies = selected[0]?.desiredCopies ?? 1;
    });
  }
  function imageError(event: Event): void {
    const image = event.currentTarget as HTMLImageElement;
    if (!image.dataset.fallback && target.imagePath && image.getAttribute('src') !== target.imagePath) {
      image.dataset.fallback = 'true'; image.src = target.imagePath;
    } else image.hidden = true;
  }
</script>

<svelte:window bind:innerWidth={viewportWidth}/>

{#snippet art(option: typeof options[number], size: number)}
  <span class="pickup-art" class:support={option.kind === 'support'} style:width={`${size}px`} style:height={`${size}px`}>
    {#if option.image}<img src={option.image} width={size} height={size} alt="" loading="lazy" onerror={imageError}/>{/if}
    <Icon name={option.kind === 'support' ? 'grid' : 'user'} size={Math.min(size, 22)}/>
  </span>
{/snippet}

<details class="pickup-details" bind:open={expanded}>
  <summary class="pickup-summary" aria-label={`Pickup goals for ${target.title}`}>
    <span class="funding" class:short={projection.shortfallJewels > 0}>
      <Icon name={projection.shortfallJewels > 0 ? 'warning' : 'check'} size={16}/>
      <span><strong>{#if paidOnly}{projection.actualPulls ?? projection.plannedPulls} {projection.actualPulls === undefined ? 'planned' : 'actual'} pulls{:else}{projection.fundedPulls}{#if projection.shortfallJewels} / {projection.actualPulls ?? projection.plannedPulls}{/if} funded{/if}</strong><small>{fundingLabel}{#if !paidOnly && projection.rewardCaratsGained > 0}<span class="reward-contribution"> · +{projection.rewardCaratsGained.toLocaleString()} from rewards</span>{/if}</small></span>
    </span>
    <small class="goals-label">Goals</small>
    <span class="goal-previews">
      {#each goals.slice(0, 3) as goal (goal.pickupId)}
        {@const actualCopies = target.actualCopies?.[stepUp ? 'chosen' : String(goal.pickupId)]}
        <span class="goal-preview">{@render art(goal.option, 30)}<span><span>{goal.option.name}</span><small>{#if actualCopies !== undefined}{goal.desiredCopies} planned · <strong class="actual-copies">{actualCopies} actual</strong>{:else}{requirement(goal)}{/if}</small></span><b aria-label={oddsLabel(goal.option.name, goal.odds)}>{percent(goal.odds?.probability)}</b></span>
      {/each}
      {#if !goals.length}<small>Choose featured pickups</small>{/if}
      {#if goals.length > 3}<small class="more-desktop">+{goals.length - 3} more</small>{/if}
      {#if goals.length > 1}<small class="more-mobile">+{goals.length - 1} more</small>{/if}
    </span>
    <span class="goal-chance" class:strong={(projection.pickupProbability ?? 0) >= .5}>{#if goals.length}<small>All goals{#if inferred} · estimated{:else if projection.sparkCopies} · {projection.sparkCopies} shared spark{projection.sparkCopies === 1 ? '' : 's'}{/if}</small>{/if}<strong>{totalLabel}</strong></span>
    <Icon name="chevron" size={16}/>
  </summary>
  {#if expanded}
    <div class="goal-workspace">
      <section class="goal-editor" aria-label={`${stepUp ? 'Step-Up' : 'Rate-up'} goals for ${target.title}`}>
        <header><span><strong>{stepUp ? 'Step-Up goal' : 'Rate-up goals'}</strong><small>{stepUp ? 'Set how many copies of one chosen card you want.' : 'Choose who you want and how many copies.'}</small></span>
          {#if !stepUp && options.length}<InspectPopover label="Choose rate-ups" align="end" onopenchange={open => { if (!open) pickupSearch = ''; }}>
            {#snippet trigger()}<span class="picker-trigger"><Icon name="add" size={16}/><span>Choose rate-ups</span><small>{goals.length} selected</small></span>{/snippet}
            <div class="pickup-picker"><header><strong>Featured on this banner</strong><small>Select one or more pickups.</small></header>
              {#if options.length > 6}<input class="pickup-search" type="search" aria-label="Search featured pickups" placeholder="Search name or variant…" bind:value={pickupSearch}/>{/if}
              <div class="pickup-options">
              {#each filteredOptions as option (option.pickupId)}{@const selected = goals.some(goal => goal.pickupId === option.pickupId)}
                <button type="button" class:selected aria-pressed={selected} aria-label={`${selected ? 'Remove' : 'Select'} ${option.name}`} onclick={() => editGoal(option.pickupId)}>
                  {@render art(option, 40)}<span><strong>{option.name}</strong><small>{option.subLabel} · {percent(option.rate, 2)} {inferred ? 'estimated ' : ''}per pull</small></span><Icon name={selected ? 'check' : 'add'} size={16}/>
                </button>
              {:else}<p>No pickups match your search.</p>{/each}
              </div>
              <small class="picker-count" role="status">{goals.length} selected · {options.length} available</small>
            </div>
          </InspectPopover>{/if}
        </header>
        <div class="selected-goals">
          {#each goals as goal (goal.pickupId)}
            <article class="selected-goal" aria-label={goal.option.name} data-pickup-id={goal.pickupId}>
              {@render art(goal.option, 40)}
              <span class="goal-name"><strong title={goal.option.name}>{goal.option.name}</strong><small>{goal.option.subLabel} · {percent(goal.odds?.pickupRate, 2)} {stepUp ? 'per random pull' : inferred ? 'estimated per pull' : 'per pull'}</small></span>
              <div class="goal-copies"><small>Copies</small><div class="copy-stepper" role="group" aria-label={`Copies of ${goal.option.name}`}>
                <Button variant="ghost" size="sm" icon="minus" ariaLabel={`Decrease desired copies of ${goal.option.name}`} disabled={goal.desiredCopies <= 1} onclick={() => editGoal(goal.pickupId, -1)}/>
                <output aria-label={`${goal.desiredCopies} desired copies`}>{goal.desiredCopies}</output>
                <Button variant="ghost" size="sm" icon="add" ariaLabel={`Increase desired copies of ${goal.option.name}`} disabled={goal.desiredCopies >= (cardKind === 'support' ? 5 : 20)} onclick={() => editGoal(goal.pickupId, 1)}/>
              </div></div>
              <strong class="individual-chance" aria-label={oddsLabel(goal.option.name, goal.odds)}>{percent(goal.odds?.probability)}</strong>
              {#if !stepUp}<Button variant="ghost" size="sm" icon="close" ariaLabel={`Remove ${goal.option.name} from rate-up goals`} onclick={() => editGoal(goal.pickupId)}/>{/if}
            </article>
          {:else}<p>No rate-up selected yet. Use <strong>Choose rate-ups</strong> to add one or more.</p>{/each}
        </div>
        {#if !options.length}<p>Featured pickup data is not available for this banner yet.</p>{/if}
      </section>
      {#if goals.length}
        <details class="advanced-odds" open={(viewportWidth ?? 1024) > 768}>
          <summary><span><strong>Detailed odds</strong><small>{paidOnly ? 'Includes guaranteed draws' : 'Pool rates, outcome ranges, and averages'}</small></span><strong>{percent(projection.pickupProbability)}</strong><Icon name="chevron" size={16}/></summary>
          <div class="goal-rollup">
            {#if paidOnly && ratesAvailable}<p>Odds use all {projection.plannedPulls} planned pulls, including guaranteed draws.{#if projection.shortfallJewels}{' '}Assumes you add the required paid Carats before pulling.{/if}</p>{:else if ratesAvailable}
              <header><span><h4>Selected pickup outcomes at {distribution.pulls.toLocaleString()} pulls</h4><p>{#if inferred}Estimated from standard banner rates · {/if}Only selected featured cards count here{#if distribution.guaranteedHits} · totals include {distribution.guaranteedHits} shared exchange {distribution.guaranteedHits === 1 ? 'copy' : 'copies'}{/if}</p></span>
                <span class="all-goals" class:strong={(projection.pickupProbability ?? 0) >= .5} role="status"><span>All goals</span><strong>{totalLabel}</strong><small>{allGoalsStatus}</small></span>
              </header>
              {#if distribution.pool}{@const pool = distribution.pool}
                <section class="pool-summary" aria-label={`Full ${topRarity} pool odds`}>
                  <header><span><small>{inferred ? 'Estimated' : 'Full'} {topRarity} pool</small><strong>{percent(pool.topRarityRate, 2)} <small>per pull</small></strong></span><dl><div><dt>At least one</dt><dd>{percent(pool.probabilityAtLeastOneTopRarity)}</dd></div><div><dt>Average in {distribution.pulls.toLocaleString()}</dt><dd>{copies(pool.expectedTopRarityHits)}</dd></div></dl></header>
                  <div class="pool-stack" role="img" aria-label={`${topRarity} pool: selected ${percent(pool.selectedRateUpRate, 2)}, other featured ${percent(pool.unselectedFeaturedRate, 2)}, off-banner ${percent(pool.offBannerTopRarityRate, 2)}`}>
                    <span data-pool="selected" style:width={`${pool.topRarityRate ? pool.selectedRateUpRate / pool.topRarityRate * 100 : 0}%`}></span><span data-pool="featured" style:width={`${pool.topRarityRate ? pool.unselectedFeaturedRate / pool.topRarityRate * 100 : 0}%`}></span><span data-pool="off-banner" style:width={`${pool.topRarityRate ? pool.offBannerTopRarityRate / pool.topRarityRate * 100 : 0}%`}></span>
                  </div>
                  <ul class="pool-legend"><li><i data-pool="selected"></i><span>Selected featured</span><b>{percent(pool.selectedRateUpRate, 2)}</b><small>{copies(pool.expectedSelectedRateUpHits)} avg</small></li>{#if pool.unselectedFeaturedRate > 0}<li><i data-pool="featured"></i><span>Other featured</span><b>{percent(pool.unselectedFeaturedRate, 2)}</b><small>{copies(pool.expectedUnselectedFeaturedHits)} avg</small></li>{/if}{#if pool.offBannerTopRarityRate > 0}<li><i data-pool="off-banner"></i><span>Off-banner</span><b>{percent(pool.offBannerTopRarityRate, 2)}</b><small>{copies(pool.expectedOffBannerTopRarityHits)} avg</small></li>{/if}</ul>
                </section>
              {/if}
              <div class="outcome-stack" role="img" aria-label={`Selected pickup outcomes at ${distribution.pulls} pulls: ${segments.map(segment => `${segment.semanticLabel}, ${segment.rangeLabel}: ${percent(segment.probability)}`).join('; ')}`}>
                {#each segments as segment}<span data-outcome={segment.tone} style:width={`${segment.width}%`} title={`${segment.semanticLabel} · ${segment.rangeLabel}: ${percent(segment.probability)}`}></span>{/each}
              </div>
              <ul class="outcome-legend" aria-label="Selected rate-up outcome probabilities">{#each segments as segment}<li><i data-outcome={segment.tone}></i><span><strong>{segment.semanticLabel}</strong><small>{segment.rangeLabel}</small></span><b>{percent(segment.probability)}</b></li>{/each}</ul>
              <div class="outcome-summary"><span><small>Avg selected copies</small><strong>{copies(distribution.expectedHits)}</strong></span><span><small>Median copies</small><strong>{distribution.medianHits}</strong></span><span><small>Median first rate-up</small><strong>{distribution.medianFirstHitPull === undefined ? '-' : `Pull ${distribution.medianFirstHitPull}`}</strong></span></div>
            {:else}<p>Published pickup rates are unavailable for the selected goals.</p>{/if}
            {#if stepUp}
              <p>{#if chosenCopies}Choose that card at each reached selection step: {chosenCopies} {chosenCopies === 1 ? 'copy is' : 'copies are'} guaranteed.{:else}Your selected steps do not reach a guaranteed card choice.{/if}</p>
              <details class="step-costs"><summary><span>Step costs and guarantees · {stepUp.rounds} {stepUp.rounds === 1 ? 'round' : 'rounds'} available</span><Icon name="chevron" size={16}/></summary><ol>{#each stepUp.steps as step, index}<li><b>Step {index + 1}</b> · {step.cost.toLocaleString()} paid Carats · {step.pulls} pulls{#if step.selectable} · Choose the guaranteed {topRarity}{:else if step.guaranteed_rarity === 3} · Guaranteed {topRarity}{/if}</li>{/each}</ol></details>
            {/if}
          </div>
        </details>
      {/if}
    </div>
  {/if}
</details>

<style>
  .pickup-details{grid-column:1/-1;min-width:0;border-top:1px solid var(--border-subtle)}
  summary{list-style:none;cursor:pointer}summary::-webkit-details-marker{display:none}summary:focus-visible{outline:2px solid var(--accent-primary);outline-offset:-2px}
  small,p{color:var(--text-secondary);font-size:10px}p{margin:0;line-height:1.5}
  .pickup-summary{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto 16px;align-items:center;gap:10px;min-height:46px;padding:6px 10px}
  .pickup-details[open]>.pickup-summary>:global(svg:last-child),.advanced-odds[open]>summary>:global(svg:last-child){transform:rotate(180deg)}
  .funding{display:flex;align-items:center;gap:6px}.funding>span{display:grid}.funding :global(svg){padding:2px;border-radius:50%;background:var(--color-success);color:var(--color-canvas);flex:none}.funding.short{color:var(--accent-error)}.funding.short :global(svg){background:none;color:var(--accent-error);padding:0}
  .goal-previews{min-width:0;display:flex;align-items:center;gap:8px}.goal-preview{min-width:0;display:flex;align-items:center;gap:5px}.goal-preview>span:nth-child(2){min-width:0;display:grid}.goal-preview>span:nth-child(2)>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.goal-preview small{font-size:9px}.goal-preview>b{color:var(--accent-primary);font-size:11px}.more-mobile{display:none}.more-desktop{white-space:nowrap}
  .pickup-art{flex:none;display:grid;place-items:center;overflow:hidden;border-radius:var(--radius-sm);background:var(--surface-2)}.pickup-art img,.pickup-art :global(svg){grid-area:1/1}.pickup-art img{object-fit:contain;z-index:1;width:100%;height:100%;min-width:0;min-height:0}.pickup-art img:not([hidden])~:global(svg){display:none}
  .goal-chance{display:grid;text-align:right;white-space:nowrap;color:var(--accent-primary)}.reward-contribution{color:var(--accent-secondary)}
  .actual-copies{color:var(--text-primary)}
  .goal-workspace{min-width:0;display:grid;grid-template-columns:minmax(270px,.58fr) minmax(0,1.42fr);border-top:1px solid var(--border-subtle)}
  .goal-editor{min-width:0;padding:10px;--inspect-popover-width:370px;--inspect-popover-padding:10px}.goal-editor>header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.goal-editor>header>span,.pickup-picker header{min-width:0;display:grid;gap:3px}.goal-editor :global(.inspect){flex:none}
  .picker-trigger{display:flex;align-items:center;gap:5px;min-height:32px;padding:3px 7px;border:1px solid var(--factor-field-border);border-radius:var(--radius-sm);background:var(--factor-field-bg);font-size:10px}.picker-trigger :global(svg){color:var(--accent-primary)}
  .pickup-picker{display:flex;flex-direction:column;gap:8px;max-height:min(520px,calc(100dvh - 48px))}.pickup-picker header{padding-right:34px}.pickup-search{flex:none;width:100%;min-height:40px;padding:8px;border:1px solid var(--factor-field-border);border-radius:var(--radius-sm);background:var(--factor-field-bg);color:var(--text-primary);font:inherit;font-size:12px}.pickup-options{min-height:0;overflow-y:auto;overscroll-behavior:contain;display:grid;gap:4px;padding:2px;scrollbar-gutter:stable}.picker-count{flex:none;border-top:1px solid var(--border-subtle);padding-top:8px}.pickup-picker button{display:grid;grid-template-columns:40px minmax(0,1fr) 16px;align-items:center;gap:7px;min-height:52px;padding:5px;border:1px solid transparent;border-radius:var(--radius-sm);background:transparent;color:var(--text-primary);text-align:left;cursor:pointer}.pickup-picker button>span:nth-child(2){min-width:0;display:grid;gap:3px}.pickup-picker button strong{font-size:12px}.pickup-picker button.selected{background:var(--color-accent-soft);border-color:var(--accent-primary)}.pickup-picker button:hover{background:var(--factor-option-hover)}.pickup-picker button:focus-visible,.pickup-search:focus-visible{outline:2px solid var(--accent-primary)}
  .selected-goals{display:grid;gap:5px}.selected-goal{min-width:0;min-height:60px;display:grid;grid-template-columns:40px minmax(0,1fr) auto auto 28px;align-items:center;gap:5px;border-top:1px solid var(--border-subtle)}.goal-name{min-width:0;display:grid;gap:3px}.goal-name strong{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.goal-name small{font-size:9px}.goal-copies{display:grid;justify-items:center;gap:3px}.copy-stepper{display:flex;align-items:center;overflow:hidden;border:1px solid var(--factor-field-border);border-radius:var(--radius-sm)}.copy-stepper :global(.ui-button){width:28px;min-height:28px;padding:0;border-radius:0}.copy-stepper output{min-width:22px;text-align:center;font-weight:700}.individual-chance{font-size:11px;color:var(--accent-primary)}.selected-goal>:global(.ui-button){width:28px;min-height:30px;padding:0}.selected-goal>.pickup-art{width:40px!important;height:40px!important}
  .advanced-odds{min-width:0;border-left:1px solid var(--border-subtle)}.advanced-odds>summary{display:none}
  .step-costs{font-size:10px}.step-costs>summary{display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:32px}.step-costs[open]>summary>:global(svg){transform:rotate(180deg)}.step-costs ol{margin:8px 0 0;padding-left:20px;display:grid;gap:4px}
  .goal-rollup{display:grid;gap:10px;padding:10px 12px;background:color-mix(in srgb,var(--surface-1) 84%,var(--surface-2))}.goal-rollup>header{display:flex;justify-content:space-between;align-items:start;gap:12px}.goal-rollup h4{font-size:12px;margin:0 0 4px}.all-goals{display:grid;grid-template-columns:auto auto;align-items:baseline;justify-content:end;gap:2px 7px;text-align:right;flex:none;max-width:180px;padding-left:12px;border-left:1px solid var(--border-primary)}.all-goals>span{color:var(--text-secondary);font-size:10px}.all-goals>small{grid-column:1/-1}.all-goals>strong{font-size:14px;color:var(--accent-primary)}.all-goals.strong>strong,.goal-chance.strong>strong{color:var(--accent-secondary)}
  .pool-summary{display:grid;gap:5px;padding-bottom:8px;border-bottom:1px solid var(--border-subtle)}.pool-summary>header{display:flex;justify-content:space-between;align-items:center;gap:10px}.pool-summary>header>span{display:flex;align-items:baseline;gap:7px}.pool-summary dl{display:flex;gap:14px;margin:0;text-align:right}.pool-summary dl>div{display:flex;align-items:baseline;gap:5px}.pool-summary dt{font-size:10px;color:var(--text-secondary)}.pool-summary dd{margin:0;font-weight:700;font-size:11px}
  .pool-stack,.outcome-stack{display:flex;height:9px;overflow:hidden;border-radius:3px;background:var(--surface-3)}.outcome-stack{height:12px}.pool-stack>span,.outcome-stack>span{height:100%}
  .pool-legend,.outcome-legend{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px 12px}.pool-legend li,.outcome-legend li{display:flex;align-items:center;gap:4px;font-size:10px}.pool-legend i,.outcome-legend i{width:7px;height:7px;flex:none;border-radius:2px}.pool-legend small{font-size:9px}.outcome-legend{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}.outcome-legend li{align-items:start}.outcome-legend span{display:grid;min-width:0;gap:3px}.outcome-legend b{margin-left:auto}.outcome-legend small{font-size:9px}.outcome-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;border-top:1px solid var(--border-subtle);padding-top:8px}.outcome-summary span{display:grid;gap:3px}.outcome-summary strong{font-size:14px}
  [data-pool=selected]{background:var(--accent-primary)}[data-pool=featured]{background:var(--accent-secondary)}[data-pool=off-banner],[data-outcome=neutral]{background:color-mix(in srgb,var(--text-muted) 60%,var(--surface-3))}[data-outcome=miss]{background:color-mix(in srgb,var(--accent-error) 82%,var(--surface-2))}[data-outcome=below]{background:color-mix(in srgb,var(--accent-warning) 84%,var(--surface-2))}[data-outcome=expected]{background:color-mix(in srgb,var(--accent-primary) 80%,var(--surface-2))}[data-outcome=lucky]{background:color-mix(in srgb,var(--color-success) 84%,var(--surface-2))}
  @media(max-width:1100px){.goal-workspace{grid-template-columns:minmax(250px,.65fr) minmax(0,1.35fr)}.outcome-legend{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:768px){
    .pickup-summary{grid-template-columns:minmax(0,1fr) auto 16px;gap:6px;padding:6px}.goals-label,.more-desktop{display:none}.goal-previews{grid-column:1/-1;grid-row:2}.goal-preview:not(:first-child),.goal-preview>b{display:none}.more-mobile{display:block;white-space:nowrap}.goal-preview small{font-size:9px}.goal-chance small{font-size:9px}
    .goal-workspace{display:block}.goal-editor{padding:8px 6px}.goal-editor>header>span>small,.picker-trigger>small,.goal-chance>small{display:none}.picker-trigger{min-height:var(--touch-target)}.selected-goal{grid-template-columns:36px minmax(0,1fr) auto auto 44px;gap:4px}.selected-goal>.pickup-art{width:36px!important;height:36px!important}.individual-chance{font-size:10px}.selected-goal>:global(.ui-button){width:var(--touch-target);min-height:var(--touch-target)}.copy-stepper :global(.ui-button){width:var(--touch-target);min-height:var(--touch-target)}.copy-stepper output{min-width:20px}.goal-name small{font-size:8px}.goal-name strong{font-size:10px;white-space:normal}.goal-copies>small{font-size:9px}
    .advanced-odds{border-left:0;border-top:1px solid var(--border-subtle)}.advanced-odds>summary{display:grid;grid-template-columns:minmax(0,1fr) auto 16px;gap:6px;align-items:center;min-height:var(--touch-target);padding:7px 6px;font-size:11px}.advanced-odds>summary>span{display:grid;gap:3px}.advanced-odds>summary>strong{color:var(--accent-primary)}.advanced-odds>summary small{font-size:9px}
    .goal-rollup{padding:8px 6px}.goal-rollup>header{gap:6px}.all-goals{max-width:110px}.all-goals small{font-size:9px}.pool-summary dl{gap:8px}.pool-summary dl>div{flex-direction:column;align-items:end;gap:0}.pool-summary small,.pool-summary dt{font-size:9px}.outcome-summary small{font-size:9px}
  }
  @media(max-width:360px){.selected-goal{grid-template-columns:36px minmax(0,1fr) auto 44px}.individual-chance{display:none}.pool-summary>header>span{gap:3px}}
</style>
