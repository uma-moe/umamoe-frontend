<script lang="ts">
  import { itemIconPath } from '@/lib/game-assets/item-icons';
  import {
    availableCrystals,
    type PlannerGachaEntry,
    type PlannerTarget,
    type TargetProjection
  } from '@/lib/carat-planner/carat-planner';

  interface Props {
    target: PlannerTarget;
    projection: TargetProjection;
    gacha?: PlannerGachaEntry;
    paidOnly: boolean;
    cardKind: 'support' | 'character';
  }

  let { target, projection, gacha, paidOnly, cardKind }: Props = $props();

  const stepUp = $derived(gacha?.step_up);
  const ticketKind = $derived(
    (gacha?.ticket_currency ??
      (cardKind === 'support' && !stepUp ? 'support_ticket' : 'uma_ticket')) === 'support_ticket'
      ? 'support'
      : 'uma'
  );

  const ticketCount = $derived(
    projection.balanceBefore[ticketKind === 'support' ? 'supportTickets' : 'umaTickets'] ?? 0
  );

  const ticketLabel = $derived(
    `${ticketCount} ${ticketKind === 'support' ? 'support' : 'Trainee'} tickets available at pull; ${projection.ticketPulls ? `${projection.ticketPulls} used and ${ticketCount - projection.ticketPulls} remaining` : 'none used'}`
  );

  const caratsBefore = $derived(
    (projection.balanceBefore.freeJewels ?? 0) + (projection.balanceBefore.paidJewels ?? 0)
  );

  const caratsAfter = $derived(
    (projection.freeJewelsAfter ?? 0) + (projection.paidJewelsAfter ?? 0)
  );

  const caratLabel = $derived(
    `${caratsBefore.toLocaleString()} Carats at pull (${projection.balanceBefore.freeJewels.toLocaleString()} free, ${projection.balanceBefore.paidJewels.toLocaleString()} paid); ${(caratsBefore - caratsAfter).toLocaleString()} spent; ${caratsAfter.toLocaleString()} remaining${!paidOnly && !target.allowPaidJewels && projection.balanceBefore.paidJewels > 0 ? '; paid Carats are reserved and will not be spent' : ''}`
  );
</script>

<div
  class="at-pull"
  aria-label={`At pull date: ${caratLabel}${paidOnly ? '' : '; ' + ticketLabel}`}
>
  <small>At pull</small>
  <span
    class="carat-balance"
    title={caratLabel}
  >
    <img
      src={itemIconPath(43)}
      width="18"
      height="18"
      alt="Carats"
    />
    <b>{caratsBefore.toLocaleString()}</b>
    <em>→ {caratsAfter.toLocaleString()}</em>
  </span>
  {#if !paidOnly}
    <span title={ticketLabel}>
      <img
        src={itemIconPath(ticketKind === 'support' ? 111 : 41)}
        width="18"
        height="18"
        alt=""
      />
      <b>{ticketCount}</b>
      {#if projection.ticketPulls}
        <em>→ {ticketCount - projection.ticketPulls}</em>
      {/if}
    </span>
    {#if cardKind === 'support' && !stepUp}
      {#each ['rainbow', 'gold'] as kind}
        <span title={`${kind === 'rainbow' ? 'Rainbow' : 'Gold'} Uncap Crystals available at pull`}>
          <img
            src={itemIconPath(kind === 'rainbow' ? 144 : 145)}
            width="18"
            height="18"
            alt=""
          />
          <b>
            {kind === 'rainbow'
              ? availableCrystals(
                  projection.balanceBefore.rainbowFullCrystals,
                  projection.balanceBefore.rainbowCrystals
                )
              : availableCrystals(
                  projection.balanceBefore.goldFullCrystals,
                  projection.balanceBefore.goldCrystals
                )}
          </b>
        </span>
      {/each}
    {/if}
  {/if}
</div>

<style>
  .at-pull {
    grid-column: 1/-1;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    font-size: 10px;
  }
  .at-pull > small {
    text-transform: uppercase;
    color: var(--text-secondary);
    font-weight: 700;
    font-size: 9px;
  }
  .at-pull > span {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 3px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .at-pull img {
    object-fit: contain;
  }
  .at-pull em {
    font-style: normal;
    color: var(--text-secondary);
  }
  @media (max-width: 767px) {
    .at-pull {
      grid-column: 1/-1;
      grid-row: 2;
      margin-top: 2px;
    }
  }
</style>
