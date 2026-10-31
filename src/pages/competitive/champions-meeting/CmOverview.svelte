<script lang="ts">
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import type { Summary, Requirement } from '../hakuraku-types';
  import { pct, number, styleNames, styleOrder } from './cm-data';
  import { fieldRows } from './cm-exploration';
  import { compositionQuery } from '../hakuraku-query';
  import { portrait } from '../analysis-view';

  let {
    data,
    colors,
    onstyle,
    onuma,
    onteams,
    onview
  }: {
    data: Summary;
    colors: Record<number, string>;
    onstyle: (style: string) => void;
    onuma: (key: string) => void;
    onteams: (slots: Requirement[]) => void;
    onview: (tab: string) => void;
  } = $props();

  const umas = $derived(fieldRows(data.pairs, 0, '').slice(0, 6));
  const compositions = $derived(
    [...data.archetypes].sort((a, b) => b.teamPop - a.teamPop).slice(0, 6)
  );

  const represented = $derived(new Set(data.pairs.map((p) => p.card)).size);
</script>

<div class="overview-heading">
  <h2>The meeting at a glance</h2>
  <span>{represented} Uma outfits in {data.archetypes.length} style compositions</span>
</div>
<div class="meeting-overview">
  <ChartFrame
    plain
    surface
    id="cm-overview-styles"
    title="Running styles"
    description="A style’s win share exceeding its simulated field share means its win rate is above average."
  >
    {#snippet actions()}
      <Button
        variant="secondary"
        size="sm"
        icon="arrow-right"
        onclick={() => onview('strategy')}
      >
        Full analysis
      </Button>
    {/snippet}
    <div class="column-head styles">
      <span>Style</span>
      <span>Field</span>
      <span>Wins</span>
    </div>
    {#each styleOrder as id}
      {@const row = data.styles.find((s) => s.style === id)}{#if row}
        <button
          class="overview-row styles"
          onclick={() => onstyle(String(id))}
          aria-label={'Explore ' + styleNames[id]}
        >
          <span class="style-name">
            <i style:background={colors[id]}></i>
            {styleNames[id]}
          </span>
          <span>{pct(row.pop)}</span>
          <strong>{pct(row.winShare)}</strong>
          <span class="share-track">
            <i
              style:width={row.pop * 100 + '%'}
              style:background={colors[id]}
            ></i>
          </span>
        </button>
      {/if}
    {/each}
  </ChartFrame>
  <ChartFrame
    plain
    surface
    id="cm-overview-umas"
    title="Most represented Umas"
  >
    {#snippet actions()}
      <Button
        variant="secondary"
        size="sm"
        icon="arrow-right"
        onclick={() => onview('character')}
      >
        All Umas
      </Button>
    {/snippet}
    <div class="column-head">
      <span>Uma</span>
      <span>Field share</span>
    </div>
    {#each umas as uma}
      {@const primary = [...uma.cells.values()].sort((a, b) => b.pop - a.pop)[0]!}
      <button
        class="overview-row uma"
        onclick={() => onuma(primary.key)}
        aria-label={'Explore ' + uma.name + ' ' + uma.outfit}
      >
        <Artwork
          src={portrait(uma.card)}
          alt=""
          size="sm"
        />
        <span class="uma-name">
          <strong>{uma.name}</strong>
          <small>{uma.outfit}</small>
        </span>
        <strong>{pct(uma.share)}</strong>
        <span class="share-track">
          {#each [...uma.cells.values()].sort((a, b) => b.pop - a.pop) as pair}
            <i
              style:width={(pair.pop / uma.share) * 100 + '%'}
              style:background={colors[pair.style]}
              title={styleNames[pair.style] + ', ' + pct(pair.pop) + ' field share'}
            ></i>
          {/each}
        </span>
      </button>
    {/each}
  </ChartFrame>
  <ChartFrame
    plain
    surface
    id="cm-overview-teams"
    title="Common team compositions"
  >
    {#snippet actions()}
      <Button
        variant="secondary"
        size="sm"
        icon="arrow-right"
        onclick={() => onview('archetypes')}
      >
        Captured teams
      </Button>
    {/snippet}
    <div class="column-head">
      <span>Composition</span>
      <span>Team win%</span>
    </div>
    {#each compositions as team}
      <button
        class="overview-row team"
        onclick={() => onteams(compositionQuery(team.key))}
        aria-label={'Explore ' +
          team.key
            .split('-')
            .map((id) => styleNames[Number(id)])
            .join(' / ')}
      >
        <span class="team-styles">
          {#each team.key.split('-').map(Number) as id}
            <span>
              <i style:background={colors[id]}></i>
              {styleNames[id]}
            </span>
          {/each}
          <small>{pct(team.teamPop)} team share, {number(team.owners)} players</small>
        </span>
        <span class="team-result">
          <strong>{pct(team.team)}</strong>
          <small>{pct(team.teamCI[0])}–{pct(team.teamCI[1])}</small>
        </span>
      </button>
    {/each}
  </ChartFrame>
</div>

<style>
  .overview-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin: 6px 0 12px;
  }
  .overview-heading h2 {
    font-size: 18px;
    margin: 0;
  }
  .overview-heading > span {
    font-size: 11px;
    color: var(--text-secondary);
  }
  .meeting-overview {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    min-width: 0;
  }
  .meeting-overview > :global(.chart-frame) {
    height: 100%;
  }
  .meeting-overview :global(.plot) {
    gap: 0;
  }
  .column-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    padding-bottom: 8px;
    color: var(--text-secondary);
    font-size: 10px;
  }
  .column-head > span:not(:first-child) {
    text-align: right;
  }
  .styles {
    grid-template-columns: minmax(0, 1fr) 50px 50px;
  }
  .overview-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 5px 12px;
    align-items: center;
    width: 100%;
    min-height: 54px;
    padding: 10px 0;
    border: 0;
    border-bottom: 1px solid var(--border-subtle);
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }
  .overview-row:hover,
  .overview-row:focus-visible {
    background: var(--color-accent-soft);
  }
  .overview-row strong {
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .overview-row small {
    display: block;
    color: var(--text-secondary);
    font-size: 10px;
    line-height: 1.5;
  }
  .overview-row.styles {
    grid-template-columns: minmax(0, 1fr) 50px 50px;
  }
  .styles > span:not(:first-child),
  .styles > strong {
    text-align: right;
  }
  .style-name,
  .team-styles > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .style-name i,
  .team-styles i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex: none;
  }
  .share-track {
    display: flex;
    grid-column: 1/-1;
    height: 3px;
    background: var(--surface-2);
    border-radius: 2px;
    overflow: hidden;
  }
  .share-track > i {
    display: block;
    height: 100%;
  }
  .overview-row.uma {
    grid-template-columns: 32px minmax(0, 1fr) auto;
    gap: 4px 10px;
  }
  .uma :global(.art) {
    width: 30px;
    height: 36px;
    border: 0;
    background: transparent;
    grid-row: 1/3;
  }
  .uma .share-track {
    grid-column: 2/4;
  }
  .uma-name {
    min-width: 0;
  }
  .uma-name strong,
  .uma-name small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .team-styles {
    display: flex;
    flex-wrap: wrap;
    gap: 3px 8px;
    min-width: 0;
  }
  .team-styles > span {
    font-size: 11px;
  }
  .team-styles > small {
    width: 100%;
  }
  .team-result {
    text-align: right;
  }
  .team-result > small {
    margin-top: 4px;
    font-size: 9px;
    white-space: nowrap;
  }
  @media (max-width: 1200px) {
    .meeting-overview {
      grid-template-columns: 1fr 1fr;
    }
    .meeting-overview > :global(.chart-frame:last-child) {
      grid-column: 1/-1;
    }
  }
  @media (max-width: 700px) {
    .meeting-overview {
      grid-template-columns: 1fr;
    }
    .overview-heading > span {
      font-size: 10px;
    }
    .meeting-overview > :global(.chart-frame:last-child) {
      grid-column: auto;
    }
  }
</style>
