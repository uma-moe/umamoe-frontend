<svelte:options namespace="svg" />

<script lang="ts">
  import { OPEN_DOOR_RADIANS, type GateStall } from '../replay-gate';

  let {
    stalls,
    front,
    depth,
    open
  }: {
    /** Stall edges in stage pixels, top to bottom. */
    stalls: GateStall[];
    front: number;
    depth: number;
    open: boolean;
  } = $props();

  const BEAM = 6;
  const FRAME = 3;

  const back = $derived(front - depth);
  const top = $derived(stalls[0]?.from ?? 0);
  const bottom = $derived(stalls.at(-1)?.to ?? 0);

  // Each stall closes with two leaves hinged on its partitions, hidden under the front beam.
  function doors(stall: GateStall) {
    const length = (stall.to - stall.from) / 2 - 2;
    const reach = length * Math.sin(OPEN_DOOR_RADIANS),
      drop = length * Math.cos(OPEN_DOOR_RADIANS);

    const hinge = front + BEAM / 2;
    return (
      `M${hinge} ${stall.from + 2} L${hinge + reach} ${stall.from + 2 + drop} ` +
      `M${hinge} ${stall.to - 2} L${hinge + reach} ${stall.to - 2 - drop}`
    );
  }
</script>

<g class="start-gate">
  <title>Starting gate</title>
  <rect
    class="gate-chassis"
    x={back - FRAME}
    y={top - FRAME}
    width={depth + FRAME * 2}
    height={bottom - top + FRAME * 2}
    rx="4"
  />
  {#each stalls as stall}
    <rect
      class="gate-stall"
      x={back + BEAM / 2}
      y={stall.from + 1.5}
      width={depth - BEAM}
      height={Math.max(0, stall.to - stall.from - 3)}
      rx="2"
    />
  {/each}
  {#each stalls.slice(1) as stall}
    <line
      class="gate-partition"
      x1={back + BEAM / 2}
      x2={front - BEAM / 2}
      y1={stall.from}
      y2={stall.from}
    />
  {/each}
  {#if open}
    {#each stalls as stall}
      <path
        class="gate-door"
        d={doors(stall)}
      />
    {/each}
  {/if}
  {#each [back, front] as beam}
    <rect
      class="gate-beam"
      x={beam - BEAM / 2}
      y={top - FRAME - 2}
      width={BEAM}
      height={bottom - top + (FRAME + 2) * 2}
      rx={BEAM / 2}
    />
  {/each}
  {#each stalls as stall}
    <rect
      class="gate-plate"
      x={back - 6}
      y={stall.centre - 6}
      width="12"
      height="12"
      rx="2"
    />
    <text
      class="gate-number"
      x={back}
      y={stall.centre + 3}
    >
      {stall.gate}
    </text>
  {/each}
</g>

<style>
  .gate-chassis {
    fill: #262d33;
    fill-opacity: 0.92;
  }
  .gate-stall {
    fill: #3a434b;
  }
  .gate-partition {
    stroke: #aeb8c1;
    stroke-width: 1.5;
  }
  .gate-door {
    fill: none;
    stroke: #e4e9ed;
    stroke-width: 2.5;
    stroke-linecap: round;
  }
  .gate-beam {
    fill: #e4e9ed;
    stroke: #1d2329;
    stroke-width: 1;
  }
  .gate-plate {
    fill: #1d2329;
  }
  .gate-number {
    fill: #f2f4f6;
    font-size: 8.5px;
    font-weight: 700;
    text-anchor: middle;
  }
</style>
