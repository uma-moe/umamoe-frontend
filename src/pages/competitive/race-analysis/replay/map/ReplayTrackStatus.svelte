<script lang="ts">
  import { slopeColor, type TrackStatus } from '../replay-course';
  import { slopeText } from '../replay-timeline';

  let {
    status,
    showCourse,
    showSlopes
  }: {
    status: TrackStatus;
    showCourse: boolean;
    showSlopes: boolean;
  } = $props();
</script>

<ul
  class="track-status"
  aria-label="Leader’s place on the course"
>
  {#if showCourse}
    <li style:--status-color={status.phase.color}>{status.phase.name}</li>
    {#if status.section}
      <li style:--status-color={status.section.color}>{status.section.label}</li>
    {/if}
  {/if}
  {#if showSlopes}
    <li
      class:level={status.slope === 0}
      style:--status-color={slopeColor(status.slope)}
    >
      {slopeText(status.slope)}
    </li>
  {/if}
</ul>

<style>
  .track-status {
    position: absolute;
    top: 8px;
    /* Beside the camera controls in the map's top-left corner. */
    left: 48px;
    z-index: 3;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-width: calc(100% - 56px);
    margin: 0;
    padding: 0;
    list-style: none;
    pointer-events: none;
  }
  li {
    padding: 0 7px;
    border-radius: 4px;
    background: var(--status-color);
    color: #10161d;
    font-size: 11px;
    font-weight: 700;
    line-height: 18px;
    white-space: nowrap;
  }
  li.level {
    background: color-mix(in srgb, var(--status-color) 55%, transparent);
  }
</style>
