<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import SkillChip from '@/components/game/SkillChip.svelte';
  import SparkRow from '@/components/sparks/SparkRow.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import RankBadge from '@/components/game/RankBadge.svelte';
  import AptitudeGrid from '@/components/game/AptitudeGrid.svelte';
  import LineageTree from '@/components/lineage/LineageTree.svelte';
  import RaceBadge from '@/components/game/RaceBadge.svelte';
  import RaceSchedule from '@/components/game/RaceSchedule.svelte';
  import TimelineEventCard from '@/components/cards/TimelineEventCard.svelte';
  import CircleCard from '@/components/cards/CircleCard.svelte';
  import SparkItem from '@/components/sparks/SparkItem.svelte';
  import RaceResultsDialog from '@/pages/database/results/RaceResultsDialog.svelte';
  import OptimalRacesDialog from '@/pages/database/results/OptimalRacesDialog.svelte';
  import DemoBlock from '../DemoBlock.svelte';
  import {
    veteranFixture,
    statFixtures,
    aptitudeFixtures,
    blueSparks,
    pinkSparks,
    greenSparks,
    whiteSparks,
    skillSpeedIcon,
    skillRecoveryIcon,
    lineageRoot,
    lineageBranches,
    raceYears,
    raceImageG1,
    timelineEvent,
    optimalRaces
  } from '../fixtures';

  interface Props {
    ids: string[];
    onnotify: (message?: string) => void;
  }

  let { ids, onnotify }: Props = $props();

  let historyOpen = $state(false),
    optimalOpen = $state(false);
  let lineage = $state('lineage-main'),
    selectedRace = $state(''),
    planned = $state(false);
</script>

{#if ids.includes('identity')}
  <DemoBlock id="identity">
    <div class="preview-stack">
      <div class="preview-row">
        <SkillChip
          icon={skillRecoveryIcon}
          name="Swinging Maestro"
          level="Lv.1"
          rarity="gold"
        /><SkillChip
          icon={skillSpeedIcon}
          name="Long-Distance Corner ○"
          level="Lv.3"
        /><SkillChip
          icon={skillSpeedIcon}
          name="Shooting Star"
          level="Lv.2"
          rarity="unique-main"
        /><RankBadge label="UE1" />
      </div>
      <StatStrip items={statFixtures} /><AptitudeGrid items={aptitudeFixtures} /><SparkRow
        tone="blue"
        items={blueSparks}
      /><SparkRow
        tone="pink"
        items={pinkSparks}
      /><SparkRow
        tone="green"
        items={greenSparks}
      /><SparkRow
        tone="white"
        items={whiteSparks}
      />
      <div
        class="preview-row"
        aria-label="Combined P2 sparks"
      >
        <SparkItem
          compact
          name="Speed"
          level={6}
          tone="blue"
          mainStars={3}
          p2Stars={3}
          chance="10%"
        /><SparkItem
          compact
          name="Swinging Maestro"
          level={4}
          mainStars={1}
          p2Stars={3}
          chance="15%"
        /><SparkItem
          compact
          name="Long-Distance Corner"
          level={3}
          p2Stars={3}
          source="p2"
        />
      </div>
    </div>
  </DemoBlock>
{/if}
{#if ids.includes('lineage')}
  <DemoBlock id="lineage">
    <LineageTree
      root={lineageRoot}
      branches={lineageBranches}
      selectedId={lineage}
      onselect={(node) => (lineage = node.id)}
    />
  </DemoBlock>
{/if}
{#if ids.includes('race-schedule')}
  <DemoBlock id="race-schedule">
    <div class="preview-stack">
      <div class="preview-row">
        <RaceBadge
          race={{
            id: 'g1-demo',
            name: 'Arima Kinen',
            grade: 'G1',
            image: raceImageG1,
            placement: 1
          }}
        /><RaceBadge
          compact
          race={{ id: 'g1-compact', name: 'Arima Kinen', grade: 'G1', image: raceImageG1 }}
        />
      </div>
      <RaceSchedule
        years={raceYears}
        onselect={(race) => (selectedRace = race.name)}
      />{#if selectedRace}
        <span>Selected race: {selectedRace}</span>
      {/if}
    </div>
  </DemoBlock>
{/if}
{#if ids.includes('timeline-card')}
  <DemoBlock id="timeline-card">
    <div class="preview-row timeline-previews">
      <div style="width:320px;max-width:100%">
        <p>Horizontal</p>
        <TimelineEventCard
          event={timelineEvent}
          bind:planned
          onopen={() => onnotify('Event details preview')}
        />
      </div>
      <div style="width:280px;max-width:100%">
        <p>Vertical</p>
        <TimelineEventCard
          event={timelineEvent}
          bind:planned
          onopen={() => onnotify('Event details preview')}
        />
      </div>
    </div>
  </DemoBlock>
{/if}
{#if ids.includes('circle-card')}
  <DemoBlock id="circle-card">
    <div class="preview-stack">
      <CircleCard
        circle={{
          circleId: 1,
          name: 'Team Sirius',
          rank: 12,
          members: 29,
          monthlyFans: 1200000000,
          liveFans: 1310000000,
          clubRank: 9,
          joinStyle: 2,
          leaderName: 'Trainer'
        }}
      /><CircleCard
        layout="summary"
        circle={{
          circleId: 1,
          name: 'Team Sirius',
          rank: 12,
          liveRank: 9,
          members: 29,
          monthlyFans: 1200000000,
          liveFans: 1310000000,
          clubRank: 9
        }}
      />
    </div>
  </DemoBlock>
{/if}
{#if ids.includes('race-dialogs')}
  <DemoBlock id="race-dialogs">
    <div class="preview-row">
      <Button
        variant="secondary"
        icon="calendar"
        onclick={() => (historyOpen = true)}
      >
        Open race history
      </Button><Button
        variant="secondary"
        icon="trophy"
        onclick={() => (optimalOpen = true)}
      >
        Open optimal races
      </Button>
    </div>
    <RaceResultsDialog
      bind:open={historyOpen}
      charId={101301}
      charName={veteranFixture.name}
      charImage={veteranFixture.image}
      winSaddleIds={[16, 20]}
      runRaceIds={[]}
    /><OptimalRacesDialog
      bind:open={optimalOpen}
      recommendations={optimalRaces}
    />
  </DemoBlock>
{/if}

<style>
  .timeline-previews {
    align-items: flex-start;
  }
  .timeline-previews p {
    font-size: 12px;
    color: var(--text-muted);
  }
</style>
