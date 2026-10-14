<script lang="ts">
  let { value }: { value: number | null } = $props();
  const label = $derived(value === null ? 'Limit break not recorded' : `Limit break ${value} of 4`);
</script>

<span
  class="lb-diamonds"
  role="img"
  aria-label={label}
  title={label}
>
  {#if value === null}
    <span aria-hidden="true">-</span>
  {:else}
    {#each Array(4) as _, index}
      <svg
        class:filled={index < value}
        viewBox="0 -960 960 960"
        aria-hidden="true"
      >
        <path
          d={index < value
            ? 'M480-64 224-480l256-416 256 416L480-64Z'
            : 'M480-64 224-480l256-416 256 416L480-64Zm0-139 170-277-170-278-169 278 169 277Zm0-277Z'}
        />
      </svg>
    {/each}
  {/if}
</span>

<style>
  .lb-diamonds {
    display: inline-flex;
    align-items: center;
    gap: inherit;
    color: var(--text-secondary);
  }
  svg {
    width: 1em;
    height: 1em;
    flex: none;
    fill: var(--text-disabled);
  }
  svg.filled {
    fill: var(--accent-primary);
  }
</style>
