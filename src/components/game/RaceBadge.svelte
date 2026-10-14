<script lang="ts">
  import Icon from '../Icon.svelte';
  import PlacementBadge from './PlacementBadge.svelte';
  import type { RaceBadgeData } from './race-types';

  interface Props {
    race: RaceBadgeData;
    compact?: boolean;
    presentation?: 'card' | 'inline';
    removable?: boolean;
    onremove?: () => void;
  }

  let {
    race,
    compact = false,
    presentation = 'card',
    removable = false,
    onremove
  }: Props = $props();
</script>

<span
  class="race race--{race.grade.toLowerCase().replace('-', '')}"
  class:compact
  class:inline={presentation === 'inline'}
  class:selected={race.selected}
  title={`${race.name} (${race.grade})`}
  aria-label={`${race.name}, ${race.grade}${race.placement ? `, ${race.placement} place` : ''}${race.affinityGain ? `, plus ${race.affinityGain} affinity` : ''}`}
>
  {#if presentation === 'card'}
    {#if race.image}
      <img
        src={race.image}
        alt=""
        loading="lazy"
        decoding="async"
      />
    {:else}
      <span class="image-fallback">{race.shortName ?? race.name}</span>
    {/if}
  {/if}
  <span class="race-name">
    <small>{race.grade}</small>
    <strong>{race.shortName ?? race.name}</strong>
  </span>
  {#if race.placement !== undefined}
    <PlacementBadge
      placement={race.placement}
      compact
    />
  {/if}
  {#if race.affinityGain !== undefined}
    <b class="gain">+{race.affinityGain}</b>
  {/if}
  {#if removable}
    <button
      type="button"
      aria-label={`Remove ${race.name}`}
      onclick={onremove}
    >
      <Icon
        name="close"
        size={12}
      />
    </button>
  {/if}
</span>

<style>
  .race {
    --race-color: var(--border-secondary);
    position: relative;
    width: 156px;
    max-width: 100%;
    height: auto;
    aspect-ratio: 2 / 1;
    display: block;
    flex: 0 0 156px;
    overflow: hidden;
    border: 2px solid var(--race-color);
    border-radius: 5px;
    background: var(--surface-2);
    color: var(--color-text);
  }
  .race--g1 {
    --race-color: var(--race-g1);
  }
  .race--g2 {
    --race-color: var(--race-g2);
  }
  .race--g3 {
    --race-color: var(--race-g3);
  }
  .selected {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--race-color) 28%, transparent);
  }
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }
  .image-fallback {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 8px;
    color: var(--color-text-muted);
    font-size: 10px;
    font-weight: 700;
    text-align: center;
  }
  .race-name {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 5px 3px;
    background: linear-gradient(transparent, rgb(0 0 0 / 0.88));
  }
  .race-name small {
    flex: 0 0 auto;
    color: var(--race-color);
    font-size: 8px;
    font-weight: 900;
  }
  .race-name strong {
    min-width: 0;
    overflow: hidden;
    color: white;
    font-size: 9px;
    text-overflow: ellipsis;
    text-shadow: 0 1px 2px black;
    white-space: nowrap;
  }
  .gain {
    position: absolute;
    top: 3px;
    right: 3px;
    padding: 2px 4px;
    border-radius: 4px;
    background: rgb(12 16 20 / 0.88);
    color: var(--accent-secondary);
    font-family: var(--font-mono);
    font-size: 9px;
    line-height: 1;
  }
  .race > :global(.placement) {
    position: absolute;
    top: 3px;
    left: 3px;
  }
  button {
    position: absolute;
    z-index: 2;
    top: 3px;
    right: 3px;
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgb(12 16 20 / 0.84);
    color: white;
    cursor: pointer;
  }
  .compact {
    width: 100%;
    min-width: 0;
    flex-basis: auto;
  }
  .compact .race-name {
    padding: 7px 4px 2px;
  }
  .compact .race-name strong {
    font-size: 8px;
  }
  .inline {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 28px;
    aspect-ratio: auto;
    border-width: 1px;
    border-radius: var(--radius-sm);
    border-color: color-mix(in srgb, var(--race-color) 40%, var(--border-primary));
    background: var(--card-surface-bg);
    padding: 2px 4px;
  }
  .inline .race-name {
    position: static;
    flex: 1;
    padding: 0;
    background: none;
  }
  .inline .race-name strong {
    font-size: 10px;
    text-shadow: none;
    color: var(--color-text);
  }
  .inline .race-name small {
    font-size: 9px;
  }
  .inline button {
    position: static;
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
  }
  .inline button:hover {
    background: var(--color-accent-soft);
    color: var(--color-text);
  }
</style>
