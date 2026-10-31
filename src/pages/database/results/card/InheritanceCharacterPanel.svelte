<script lang="ts">
  import Artwork from '@/components/game/Artwork.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import LimitBreak from '@/components/game/LimitBreak.svelte';
  import type {
    FactorOwner,
    inheritanceAffinity
  } from '@/lib/inheritance/sparks/inheritance-factors';
  import type { InheritanceRecord } from '@/lib/inheritance/search/inheritance-search';
  import { supportCardImagePath } from '@/lib/game-data/support-cards/support-cards';
  import type { GameDataEntry } from '@/lib/game-data/display-records';

  interface Props {
    record: InheritanceRecord;
    main?: GameDataEntry;
    left?: GameDataEntry;
    right?: GameDataEntry;
    support?: GameDataEntry;
    activeFocus?: FactorOwner;
    affinity: ReturnType<typeof inheritanceAffinity>;
    targetId?: number;
    onselect: (parent: FactorOwner) => void;
  }

  let { record, main, left, right, support, activeFocus, affinity, targetId, onselect }: Props =
    $props();
</script>

<div class="character-panel">
  <div
    class="lineage-frame"
    aria-label="Veteran lineage"
  >
    <div
      class="lineage-person lineage-main"
      data-owner="main"
    >
      <button
        class="lineage-node"
        class:selected={activeFocus === 'main'}
        type="button"
        aria-pressed={activeFocus === 'main'}
        onclick={() => onselect('main')}
        title="Focus primary parent sparks. Click again to clear."
      >
        <Artwork
          src={main?.image}
          alt={main?.title ?? `Character ${record.mainParentId}`}
          shape="circle"
          size="lg"
        />
      </button>
      {@render affinityBadge('main', 'Main parent')}
      <span class="lineage-role">Main</span>
    </div>
    <svg
      class="lineage-bracket"
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M50 0 L50 9 M15 9 L85 9 M15 9 L15 24 M85 9 L85 24"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <div class="grandparents">
      <div
        class="lineage-person lineage-grandparent"
        data-owner="left"
      >
        <button
          class="lineage-node"
          class:selected={activeFocus === 'left'}
          type="button"
          aria-pressed={activeFocus === 'left'}
          onclick={() => onselect('left')}
          title="Focus Legacy 1 sparks. Click again to clear."
        >
          <Artwork
            src={left?.image}
            alt={left?.title ?? `Character ${record.leftParentId}`}
            shape="circle"
            size="md"
          />
        </button>
        {@render affinityBadge('left', 'Legacy 1')}
        <span class="lineage-role">Legacy 1</span>
      </div>
      <div
        class="lineage-person lineage-grandparent"
        data-owner="right"
      >
        <button
          class="lineage-node"
          class:selected={activeFocus === 'right'}
          type="button"
          aria-pressed={activeFocus === 'right'}
          onclick={() => onselect('right')}
          title="Focus Legacy 2 sparks. Click again to clear."
        >
          <Artwork
            src={right?.image}
            alt={right?.title ?? `Character ${record.rightParentId}`}
            shape="circle"
            size="md"
          />
        </button>
        {@render affinityBadge('right', 'Legacy 2')}
        <span class="lineage-role">Legacy 2</span>
      </div>
    </div>
  </div>
  {#if record.supportCardId}
    <div class="support-card-section">
      <Artwork
        src={supportCardImagePath(String(record.supportCardId))}
        fallbackSrc={support?.image}
        alt={support?.title ?? `Support card ${record.supportCardId}`}
        kind="card"
        size="md"
      />
      {#if record.supportLimitBreak !== undefined}
        <span class="limit-break">
          <LimitBreak value={record.supportLimitBreak} />
        </span>
      {/if}
      <span class="support-role">Support</span>
    </div>
  {/if}
</div>

{#snippet affinityBadge(owner: 'main' | 'left' | 'right', label: string)}
  {@const detail = affinity.detail(owner)}
  {#if detail}
    <InspectPopover label="{label} affinity breakdown">
      {#snippet trigger()}
        <span
          class="source-affinity"
          class:breeding={!targetId}
          data-owner={owner}
        >
          <Icon
            name="heart"
            size={12}
          />{detail.total}
        </span>
      {/snippet}
      <div class="affinity-breakdown">
        <strong>{label}: {detail.total}</strong>
        <span>
          Base: {detail.base}{detail.cross ? ` + P1–P2: ${detail.cross}` : ''} + Race: {detail.race}
        </span>
      </div>
    </InspectPopover>
  {/if}
{/snippet}

<style>
  @import './spark-source-colors.css';
  @import './affinity-breakdown.css';
  @import './inheritance-character-panel.css';
</style>
