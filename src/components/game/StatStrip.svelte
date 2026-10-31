<script lang="ts">
  export type StatTone = 'speed' | 'stamina' | 'power' | 'guts' | 'wit' | 'neutral';
  export interface StatStripItem {
    id: string;
    label: string;
    value: string | number;
    tone?: StatTone;
    unit?: string;
    icon?: string;
  }

  interface Props {
    items: StatStripItem[];
    label?: string;
    compact?: boolean;
    framed?: boolean;
    /** `fields` mirrors the simulator's stat inputs: a label above a boxed icon and value. */
    presentation?: 'labels' | 'icons' | 'inline' | 'values' | 'fields';
  }

  let {
    items,
    label = 'Stats',
    compact = false,
    framed = false,
    presentation = 'labels'
  }: Props = $props();
</script>

<div class="stats-container">
  <dl
    class="stats"
    class:compact
    class:framed
    class:icon-stats={presentation === 'icons'}
    class:inline-stats={presentation === 'inline'}
    class:values={presentation === 'values'}
    class:field-stats={presentation === 'fields'}
    aria-label={label}
    style={`--stat-count:${Math.max(1, items.length)}`}
  >
    {#each items as item (item.id)}
      <div
        data-stat={item.id}
        data-tone={item.tone ?? 'neutral'}
        title={item.label + ': ' + item.value + (item.unit ?? '')}
      >
        {#if presentation === 'fields'}
          <dt>{item.label}</dt>
          <dd>
            {#if item.icon}
              <img
                src={item.icon}
                alt=""
                decoding="async"
              />
            {/if}
            {item.value}{#if item.unit}
              <small>{item.unit}</small>
            {/if}
          </dd>
        {:else}
          {#if item.icon}
            <img
              src={item.icon}
              alt=""
              decoding="async"
            />
          {/if}
          <dd>
            {item.value}{#if item.unit}
              <small>{item.unit}</small>
            {/if}
          </dd>
          <dt
            class:sr-only={(presentation === 'icons' || presentation === 'values') &&
              Boolean(item.icon)}
          >
            {item.label}
          </dt>
        {/if}
      </div>
    {/each}
  </dl>
</div>

<style>
  @import './stat-strip.css';
</style>
