<script lang="ts">
  import Icon from '@/components/Icon.svelte';

  let { marker = false }: { marker?: boolean } = $props();
</script>

<span
  class="pacemaker-badge"
  class:marker
  role="img"
  aria-label="Pacemaker"
  title="Current race pacemaker: the simulation's race-wide pacing reference"
>
  <Icon
    name="flag"
    size={12}
  />
  {#if !marker}Pacemaker{/if}
</span>

<style>
  .pacemaker-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    flex: none;
    padding: 1px 3px;
    border-radius: 3px;
    background: var(--surface-1);
    color: var(--accent-primary);
    font-size: 9px;
    line-height: 1.3;
  }
  .marker {
    position: absolute;
    top: -7px;
    left: -7px;
    z-index: 1;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid currentColor;
    border-radius: 50%;
  }
</style>
