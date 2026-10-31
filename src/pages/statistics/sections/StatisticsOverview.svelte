<script lang="ts">
  import { statisticsDistanceId } from '@/lib/statistics/statistics';
  import { theme } from '@/stores/theme';
  import Button from '@/components/controls/Button.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import MetricBar from '@/components/data/MetricBar.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import Icon from '@/components/Icon.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import StatisticsChartPanel from '../StatisticsChartPanel.svelte';
  import StatisticsDeckMatrix from '../StatisticsDeckMatrix.svelte';
  import StatisticsRanking from '../StatisticsRanking.svelte';
  import StatisticsSectionHeading from './StatisticsSectionHeading.svelte';
  import { groupedChart, pieChart, statisticsChartStyle } from '../statistics-charts';
  import { classColors, distanceColors } from '../statistics-display';
  import { characterName, statColors, statIds, statName, statStrip } from '../statistics-format';
  import { distanceBreakdown } from '../statistics-selection';
  import type { StatisticsView } from '../statistics-view.svelte';

  interface Props {
    view: StatisticsView;
    onexplore: (characterId: string) => void;
    onexploredistance: (distanceId: string, characterId: string) => void;
    onshow: (section: string) => void;
  }

  let { view, onexplore, onexploredistance, onshow }: Props = $props();

  const chartStyle = $derived(statisticsChartStyle($theme));
  const distances = $derived(
    distanceBreakdown(
      view.stats!,
      view.filters,
      view.selectedSamples,
      view.characters,
      (id, item) => characterName(view.characters, id, item)
    )
  );

  const distanceAverages = $derived(distances.filter((item) => Object.keys(item.means).length));
</script>

<section id="statistics-overview">
  <StatisticsSectionHeading
    title="The field at a glance"
    context="{view.supportData.length} support cards, {view.skillData.length} skills and {view
      .deckData.length} deck builds"
  />
  <div class="overview-grid">
    <StatisticsRanking
      id="popular-umas"
      title="Most Popular Uma Musume"
      description="Share of recorded Uma uses. Select a Uma to explore its build."
      items={view.umaData}
      limit={8}
      onselect={onexplore}
      onmore={() => onshow('characters')}
      moreLabel="All Umas"
    />
    <div class="training-profile">
      <div class="profile-heading">
        <h3>Training profile</h3>
        <Button
          variant="secondary"
          size="sm"
          onclick={() => onshow('stats')}
        >
          <span class="panel-action">
            Stat distributions<Icon
              name="arrow-right"
              size={13}
            />
          </span>
        </Button>
      </div>
      <StatStrip
        items={statStrip(view.averageStats)}
        label="Average training stats"
        compact
      />
      <StatisticsChartPanel
        id="distance-averages"
        title="Average stats by distance"
        description="Average of selected class and scenario means. Select a stat in the legend to isolate it."
        option={groupedChart(
          chartStyle,
          distanceAverages.map((item) => item.name),
          statIds.map((stat) => ({
            name: statName(stat),
            values: distanceAverages.map((item) => item.means[stat] ?? 0),
            color: statColors[stat]
          }))
        )}
        height={260}
      />
    </div>
    <div class="distance-breakdown">
      <ChartFrame
        id="distance-breakdown"
        title="Distance breakdown"
        description="Sample share and most used Uma in each distance."
      >
        <div class="distance-rows">
          {#each distances as item}
            <div
              class="distance-row"
              style:--distance-color={distanceColors[statisticsDistanceId(item.id)]}
            >
              <div class="distance-metric">
                <strong>
                  <i></i>
                  {item.name}
                </strong>
                <span>{item.value.toLocaleString()}</span>
                <MetricBar
                  value={Number(item.percentage.toFixed(1))}
                  compact
                />
              </div>
              {#if item.leader}
                <button
                  class="distance-leader"
                  aria-label={'Analyze ' + item.leader.name + ' for ' + item.name}
                  onclick={() => onexploredistance(item.id, item.leader!.id)}
                >
                  {#if item.image}
                    <img
                      src={item.image}
                      alt=""
                      width="24"
                      height="24"
                      loading="lazy"
                    />
                  {/if}
                  <span>{item.leader.name}</span>
                  <strong>{(item.leader.percentage ?? 0).toFixed(1)}%</strong>
                  <Icon
                    name="arrow-right"
                    size={12}
                  />
                </button>
              {/if}
            </div>
          {:else}
            <p class="fine-print">No samples selected</p>
          {/each}
        </div>
      </ChartFrame>
    </div>
    <StatisticsDeckMatrix
      id="overview-decks"
      items={view.deckData}
      onmore={() => onshow('supports')}
    />
    <StatisticsRanking
      id="overview-supports"
      title="Popular support cards"
      description="Share of all recorded support card uses. A deck contributes multiple cards."
      items={view.supportData}
      limit={8}
      onmore={() => onshow('supports')}
      moreLabel="All supports"
    />
    <StatisticsRanking
      id="overview-skills"
      title="Common skills"
      description="Share of all recorded skill acquisitions. A Uma can contribute multiple skills."
      items={view.skillData}
      limit={8}
      onmore={() => onshow('skills')}
      moreLabel="All skills"
    />
  </div>
  <div class="class-mix">
    <div class="mix-heading">
      <strong>Team class mix</strong>
      <span>Share of selected samples</span>
    </div>
    <div
      class="mix-track"
      aria-hidden="true"
    >
      {#each view.classData.filter((item) => item.value > 0) as item}
        <span
          style:width={(item.percentage ?? 0) + '%'}
          style:background={classColors[item.id]}
        ></span>
      {/each}
    </div>
    <div class="mix-legend">
      {#each view.classData.filter((item) => item.value > 0) as item}
        <span>
          <i style:background={classColors[item.id]}></i>
          {item.name}
          <strong>{(item.percentage ?? 0).toFixed(1)}%</strong>
        </span>
      {/each}{#if !view.selectedSamples}
        <span>No samples selected</span>
      {/if}
    </div>
  </div>
  <Disclosure
    id="class-breakdown"
    title="Team class breakdown"
    description="Sample distribution and average stats"
    icon="chart"
  >
    <div class="two-columns">
      <StatisticsChartPanel
        title="Team Class Distribution"
        description="Share of selected training samples in each class."
        option={pieChart(chartStyle, view.classData, classColors)}
        height={280}
      /><StatisticsChartPanel
        title="Average Stats by Team Stadium Class"
        description="Compare the five core stats across your selected classes."
        option={groupedChart(chartStyle, view.classAverages.categories, view.classAverages.series)}
        height={280}
      />
    </div>
  </Disclosure>
</section>

<style>
  @import './statistics-columns.css';
  @import './statistics-overview.css';
</style>
