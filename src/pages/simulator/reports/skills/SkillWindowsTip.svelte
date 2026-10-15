<script lang="ts">
  import { clock, pct, timing, type WindowSkill, type WindowTip } from './skill-windows';

  interface Props {
    tip?: WindowTip;
    shareAt: (skill: WindowSkill, moment: number) => number;
  }

  let { tip, shareAt }: Props = $props();

  // One tooltip in the top layer, so the replay's sideways-scrolling timeline cannot clip it.
  let card = $state<HTMLElement>();

  const tipLeft = (x: number) => (x + 292 > innerWidth ? Math.max(8, x - 282) : x + 12);
  const tipTop = (below: number, above: number) =>
    below + 4 + (card?.offsetHeight ?? 150) > innerHeight - 8
      ? Math.max(8, above - 4 - (card?.offsetHeight ?? 150))
      : below + 4;

  $effect(() => {
    if (!card) return;
    const open = card.matches(':popover-open');
    if (tip && !open) card.showPopover();
    else if (!tip && open) card.hidePopover();
  });
</script>

<div
  class="tip"
  popover="manual"
  bind:this={card}
  role="tooltip"
  style:left={tip ? tipLeft(tip.x) + 'px' : undefined}
  style:top={tip ? tipTop(tip.below, tip.above) + 'px' : undefined}
>
  {#if tip}
    <header>
      <strong>{tip.skill.name}</strong>
      <span>fires in {pct(tip.skill.rate)} of races</span>
    </header>
    {@const here = shareAt(tip.skill, tip.moment)}
    <p class="moment">
      <b>{clock(tip.moment)}</b>
      {here > 0
        ? 'starts within a second of this in ' + pct(here * 100) + ' of races'
        : 'never starts near this moment'}
    </p>
    {#if tip.skill.spots.length}
      <p>
        Core {tip.skill.spots.length === 1 ? 'spot' : 'spots'}: {tip.skill.spots
          .map((spot) => clock(spot.time) + ' (' + pct(spot.share * 100) + ')')
          .join(', ')}
      </p>
    {/if}
    <p>
      {timing(tip.skill)} · {tip.skill.duration
        ? 'lasts about ' + tip.skill.duration.toFixed(1) + ' s'
        : 'instant effect'}
    </p>
    <ul>
      {#each tip.skill.places.slice(0, 5) as place (place.place)}
        <li>
          <i style:width={'calc((100% - 40px) * ' + place.share + ')'}></i>
          <span>{place.place}</span>
          <b>{pct(place.share * 100)}</b>
        </li>
      {/each}
    </ul>
    {#if tip.skill.places.length > 5}
      <small>
        and {tip.skill.places.length - 5} more {tip.skill.places.length - 5 === 1
          ? 'section'
          : 'sections'} now and then
      </small>
    {/if}
    <small>Share of races it fires in each course section · click to watch that moment</small>
  {/if}
</div>

<style>
  .tip {
    position: fixed;
    inset: auto;
    margin: 0;
    width: 270px;
    padding: 8px 10px;
    border: 1px solid var(--border-primary, var(--border-subtle));
    border-radius: var(--radius-md);
    background: var(--surface-2, var(--surface-1));
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.35);
    color: var(--text-primary);
    font-size: 11px;
    pointer-events: none;
  }
  .tip header {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }
  .tip header span {
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .tip p {
    margin: 0 0 6px;
    color: var(--text-secondary);
    line-height: 1.4;
  }
  .tip p.moment {
    color: var(--text-primary);
  }
  .tip p.moment b {
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .tip ul {
    display: grid;
    gap: 3px;
    margin: 0 0 6px;
    padding: 0;
    list-style: none;
  }
  .tip li {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 34px;
    align-items: center;
    gap: 6px;
    padding: 1px 4px;
    font-variant-numeric: tabular-nums;
  }
  .tip li span {
    position: relative;
    white-space: nowrap;
  }
  .tip li i {
    position: absolute;
    inset-block: 0;
    left: 0;
    border-radius: 3px;
    background: color-mix(in srgb, var(--skill) 24%, transparent);
  }
  .tip li b {
    position: relative;
    font-weight: 650;
    text-align: right;
  }
  .tip small {
    display: block;
    font-size: 10px;
    color: var(--text-secondary);
  }
  @media (max-width: 700px) {
    .tip {
      width: 230px;
    }
  }
</style>
