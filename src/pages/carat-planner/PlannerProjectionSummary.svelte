<script lang="ts">
  import { itemIconPath } from '@/lib/game-assets/item-icons';
  import { availableCrystals, type PlanProjection } from '@/lib/carat-planner/carat-planner';
  import Icon from '@/components/Icon.svelte';

  let { projection }: { projection: PlanProjection } = $props();
</script>

<div
  class="overview"
  role="group"
  aria-label="Projection summary"
>
  <div class:short={projection.totalShortfallJewels > 0}>
    <Icon name={projection.totalShortfallJewels ? 'warning' : 'check'} />
    <span>
      <strong>
        {projection.requiredPaidJewels
          ? projection.requiredPaidJewels.toLocaleString()
          : projection.totalShortfallJewels
            ? projection.totalShortfallJewels.toLocaleString()
            : 'Funded'}
      </strong>
      <small>
        {projection.requiredPaidJewels
          ? 'Requires paid Carats'
          : projection.totalShortfallJewels
            ? 'Carats short'
            : 'Plan status'}
      </small>
      {#if projection.requiredPaidJewels && projection.totalShortfallJewels > projection.requiredPaidJewels}
        <small>
          Plus {(projection.totalShortfallJewels - projection.requiredPaidJewels).toLocaleString()} Carats
          short
        </small>
      {/if}
    </span>
  </div>
  <div>
    <Icon
      name="diamond"
      size={18}
    />
    <span>
      <strong>{projection.balances.freeJewels.toLocaleString()}</strong>
      <small>Carats left</small>
    </span>
  </div>
  <div>
    <Icon
      name="ticket"
      size={18}
    />
    <span>
      <strong>
        {(projection.balances.umaTickets + projection.balances.supportTickets).toLocaleString()}
      </strong>
      <small>Tickets left</small>
    </span>
  </div>
  <div
    class="crystals"
    aria-label="Uncap crystals"
    title="Completed Uncap Crystals plus progress toward the next one. Every 20/20 shards crafts one more crystal."
  >
    <span
      class="crystal-art"
      aria-hidden="true"
    >
      <img
        src={itemIconPath(144)}
        alt=""
      />
      <img
        src={itemIconPath(145)}
        alt=""
      />
    </span>
    <strong class="crystal-values">
      <span>
        <b>SSR</b>
        {availableCrystals(
          projection.balances.rainbowFullCrystals,
          projection.balances.rainbowCrystals
        )}
        <small>
          ({Math.trunc(Math.max(0, projection.balances.rainbowCrystals)) % 20}/20)
        </small>
      </span>
      <span>
        <b>SR</b>
        {availableCrystals(projection.balances.goldFullCrystals, projection.balances.goldCrystals)}
        <small>({Math.trunc(Math.max(0, projection.balances.goldCrystals)) % 20}/20)</small>
      </span>
    </strong>
  </div>
  <div>
    <Icon
      name="timeline"
      size={18}
    />
    <span>
      <strong>{projection.plannedPulls.toLocaleString()}</strong>
      <small>Planned pulls</small>
    </span>
  </div>
</div>

<style>
  @import './planner-projection-summary.css';
</style>
