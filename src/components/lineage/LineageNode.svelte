<script lang="ts">
  import Artwork from '../game/Artwork.svelte';
  import Icon from '../Icon.svelte';
  import RankBadge from '../game/RankBadge.svelte';
  import SparkItem from '../sparks/SparkItem.svelte';
  import type { LineageNodeData } from '../lineage-types';

  interface Props {
    node: LineageNodeData;
    selected?: boolean;
    compact?: boolean;
    onclick?: () => void;
  }

  let { node, selected = false, compact = false, onclick }: Props = $props();

  const artworkSize = $derived(
    node.role === 'main'
      ? ('sm' as const)
      : node.role === 'parent'
        ? ('sm' as const)
        : ('xs' as const)
  );
  const roleLabel = $derived(
    node.role === 'grandparent' ? node.roleLabel.replace(/^.*legacy\s*/i, 'L') : node.roleLabel
  );
</script>

<button
  type="button"
  class="lineage-node lineage-node--{node.role}"
  class:selected
  class:compact
  aria-pressed={selected}
  aria-label={`${node.roleLabel}: ${node.name}`}
  title={`${node.roleLabel}: ${node.name}`}
  {onclick}
>
  <span class="node-head">
    <Artwork
      src={node.image}
      alt={node.name}
      size={artworkSize}
      shape="square"
    />
    <span class="node-meta">
      <span class="name-row">
        <strong>{node.name}</strong>
        <span class="role role--{node.role}">
          {compact && node.role === 'grandparent'
            ? node.roleLabel.replace(/^.*legacy\s*/i, 'Grandparent ')
            : roleLabel}
        </span>
      </span>
      {#if !compact && node.rank}
        <span class="rank-row">
          <RankBadge
            label={node.rank}
            size="sm"
          />
        </span>
      {/if}
    </span>
  </span>

  {#if !compact && node.role !== 'grandparent' && (node.affinity !== undefined || node.raceAffinity !== undefined)}
    <span class="node-toolbar">
      {#if node.affinity !== undefined}
        <span
          class="node-stat node-stat--affinity"
          title="Base affinity"
        >
          <Icon
            name="heart"
            size={13}
          />
          <b>{node.affinity}</b>
          <small>Affinity</small>
        </span>
      {/if}
      {#if node.raceAffinity !== undefined}
        <span
          class="node-stat node-stat--race"
          title="Race affinity from shared wins"
        >
          <Icon
            name="trophy"
            size={13}
          />
          <b>{node.raceAffinity}</b>
          <small>Race affinity</small>
        </span>
      {/if}
    </span>
  {/if}

  {#if !compact && node.role !== 'grandparent' && node.sparks?.length}
    <span class="node-sparks">
      {#each node.sparks as group}
        {#each group.items.slice(0, 3) as item (item.id)}
          <SparkItem
            {...item}
            tone={group.tone}
            compact
          />
        {/each}
      {/each}
    </span>
  {/if}
</button>

<style>
  @import './lineage-node.css';
</style>
