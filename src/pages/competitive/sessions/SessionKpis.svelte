<script lang="ts">
  import Artwork from '@/components/game/Artwork.svelte';
  import Button from '@/components/controls/Button.svelte';
  import { portrait, styleColors } from '../analysis-view';
  import { kpiText, type KpiTone, type SessionKpi } from './session-kpis';

  /** A view's answer in one row: each tile is a value, what it belongs to and the baseline it beats or misses. */
  let { label, kpis }: { label: string; kpis: SessionKpi[] } = $props();

  const toneMark: Record<KpiTone, string> = { over: '▲', under: '▼', even: '≈' };
</script>

{#snippet tile(kpi: SessionKpi)}
  <span class="kpi-label">
    {kpi.label}
    {#if kpi.action}
      <span class="kpi-action">
        <Button
          size="sm"
          variant="secondary"
          icon={kpi.action.icon}
          ariaLabel={kpi.action.label + ': ' + kpiText(kpi)}
          onclick={kpi.action.onselect}
        >
          {kpi.action.label}
        </Button>
      </span>
    {/if}
  </span>
  <span class="kpi-headline">
    {#if kpi.subjects?.length}
      <span class="subjects">
        {#each kpi.subjects as subject, index (index)}
          <span
            class="subject"
            style:color={subject.style === undefined ? undefined : styleColors[subject.style]}
          >
            {#if subject.cardId !== undefined}
              <Artwork
                src={portrait(subject.cardId)}
                alt=""
                size="xs"
              />
            {:else if subject.style !== undefined}
              <i style:background={styleColors[subject.style]}></i>
            {/if}
            <span class="subject-name">{subject.text}</span>
          </span>
        {/each}
      </span>
    {/if}
    <strong class={kpi.few ? 'few' : kpi.tone}>{kpi.value}</strong>
  </span>
  <span class="kpi-note">
    {#if kpi.comparison}
      <span class="comparison {kpi.comparison.tone}">
        <b aria-hidden="true">{toneMark[kpi.comparison.tone]}</b>
        {kpi.comparison.text}
      </span>
    {/if}
    {#if kpi.detail}
      <span class="detail">{kpi.detail}</span>
    {/if}
  </span>
{/snippet}

{#if kpis.length}
  <section
    class="kpis"
    aria-label={label}
  >
    {#each kpis as kpi (kpi.id)}
      <div class="kpi">
        {@render tile(kpi)}
      </div>
    {/each}
  </section>
{/if}

<style>
  @import './session-kpis.css';
</style>
