<script lang="ts">
  import type { RaceEvent, RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import Artwork from '@/components/game/Artwork.svelte';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';

  let {
    events,
    runners,
    visibility,
    inspected,
    skillNames,
    onselect
  }: {
    events: RaceEvent[];
    runners: RaceRunner[];
    visibility: Record<number, number>;
    inspected?: number;
    skillNames: Map<number, string>;
    onselect: (index: number, time: number) => void;
  } = $props();
</script>

<div
  class="skill-feed"
  aria-label="Recent course skill triggers"
>
  <span
    class="timeline-label"
    title="Skills activated by the race field in the last 2 seconds"
    aria-hidden="true"
  >
    <span class="label-long">Race activations</span>
    <span class="label-short">Field</span>
  </span>
  <div
    class="skill-feed-scroll"
    role="group"
    aria-label="Recent skill activations (last 2 seconds)"
  >
    {#each events.filter((e) => visibility[e.params[0]!] !== 2) as event}
      {@const r = runners.find((r) => r.index === event.params[0])}
      {#if r}
        <button
          class="skill-trigger"
          class:inspected={r.index === inspected}
          title={r.name + ' at ' + event.frameTime.toFixed(2) + ' s'}
          aria-label={'Inspect ' +
            r.name +
            ' skill trigger at ' +
            event.frameTime.toFixed(2) +
            ' seconds'}
          onclick={() => onselect(r.index, event.frameTime)}
        >
          <span class="activation-runner">
            <Artwork
              src={portrait(r.cardId)}
              alt={r.name}
              size="xs"
            />
            <b title={'Gate ' + (r.index + 1)}>{r.index + 1}</b>
          </span>
          <RaceSkill
            id={event.params[1]!}
            name={skillNames.get(event.params[1]!)}
          />
        </button>
      {/if}
    {:else}
      <span class="no-triggers">No recent activation</span>
    {/each}
  </div>
</div>

<style>
  @import './replay-skill-feed.css';
</style>
