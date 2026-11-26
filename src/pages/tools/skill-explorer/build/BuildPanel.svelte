<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import SkillChipList, { type RelatedSkill } from '../SkillChipList.svelte';
  import { STAT_NAMES, type Stats } from '../statlines/statline-model';

  export interface ReferenceBuildView {
    card: number;
    name: string;
    portrait?: string;
    stats: Stats;
    baselineWin: number;
    source?: string;
    skills: RelatedSkill[];
  }

  interface Props {
    /** Legacy single reference build skills (used when `references` is empty). */
    skills: RelatedSkill[];
    /** Real competitive CM builds in this course style's ensemble (E12+). */
    references?: ReferenceBuildView[];
    styleName: string;
  }

  let { skills, references = [], styleName }: Props = $props();

  const id = $props.id();

  const STAT_ICONS = ['speed', 'stamina', 'power', 'guts', 'wit'] as const;

  let open = $state(false);

  const hasEnsemble = $derived(references.length > 0);
  const avgWin = $derived(
    hasEnsemble
      ? Math.round(
          (references.reduce((sum, ref) => sum + ref.baselineWin, 0) / references.length) * 10
        ) / 10
      : undefined
  );

  function sourceLabel(source: string | undefined): string | undefined {
    if (!source) return undefined;
    const match = /^cm(\d+)/i.exec(source);
    return match ? `CM${match[1]}` : source;
  }
</script>

<!-- The build(s) the values are measured in, on the scope's title row beside the target stats. -->
<Button
  variant="secondary"
  size="sm"
  icon="eye"
  ariaLabel={hasEnsemble
    ? `Show ${references.length} reference builds`
    : `Show the reference build, ${skills.length} skills`}
  onclick={() => (open = true)}
>
  {hasEnsemble ? 'Reference builds' : 'Reference build'}
  <span class="count">
    {#if hasEnsemble}
      {references.length} aces{#if avgWin !== undefined} · {avgWin.toFixed(1)}% WR{/if}
    {:else}
      {skills.length} skills
    {/if}
  </span>
</Button>

<Dialog
  bind:open
  title={hasEnsemble ? 'Reference builds' : 'Reference build'}
  description={hasEnsemble
    ? `Real competitive ${styleName} builds drawn from recent CM snapshots and adapted to this course. Every value on the chart is averaged across these ${references.length} builds.`
    : `What our optimizer buys a ${styleName} runner here with the latest CM's average SP. Every value on the chart is a skill added to this.`}
  maxWidth="720px"
  maxHeight="88dvh"
  mobileMaxHeight="96dvh"
>
  {#if hasEnsemble}
    <div class="ensemble">
      {#each references as ref, index (`${ref.card}-${index}`)}
        <section
          class="ace-card"
          aria-labelledby="{id}-ace-{index}"
        >
          <header class="ace-head">
            {#if ref.portrait}
              <img
                class="portrait"
                src={ref.portrait}
                alt={ref.name}
                decoding="async"
              />
            {/if}
            <div class="ace-meta">
              <div class="ace-title-row">
                <h3 id="{id}-ace-{index}">{ref.name}</h3>
                <span class="win-badge">{ref.baselineWin.toFixed(1)}% WR</span>
                {#if sourceLabel(ref.source)}
                  <span class="source-badge">{sourceLabel(ref.source)}</span>
                {/if}
              </div>
              <div class="stat-row">
                {#each STAT_ICONS as icon, statIdx (icon)}
                  <span
                    class="stat-item"
                    title={STAT_NAMES[statIdx]}
                  >
                    <img
                      src="/assets/images/icon/stats/{icon}.webp"
                      alt={STAT_NAMES[statIdx]}
                      decoding="async"
                    />
                    <span>{ref.stats[statIdx]}</span>
                  </span>
                {/each}
              </div>
            </div>
            <span class="count">{ref.skills.length}</span>
          </header>

          <SkillChipList
            skills={ref.skills}
            compact={false}
          />
        </section>
      {/each}
    </div>
  {:else}
    <section
      class="skills"
      aria-labelledby="{id}-skills"
    >
      <div class="head">
        <h3 id="{id}-skills">Skills</h3>
        <span class="count">{skills.length}</span>
      </div>

      <SkillChipList
        {skills}
        compact={false}
      />
    </section>
  {/if}

  {#snippet actions()}
    <Button
      variant="secondary"
      onclick={() => (open = false)}
    >
      Close
    </Button>
  {/snippet}
</Dialog>

<style>
  .count {
    min-width: 18px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--color-surface-3);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 650;
    line-height: 18px;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .ensemble {
    display: grid;
    gap: 14px;
    min-width: 0;
  }

  .ace-card {
    display: grid;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--border-subtle, rgb(255 255 255 / 0.08));
    border-radius: 10px;
    background: var(--bg-secondary, var(--color-surface-2));
    min-width: 0;
  }

  .ace-head {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .portrait {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    object-fit: cover;
    flex: none;
  }

  .ace-meta {
    display: grid;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .ace-title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .win-badge,
  .source-badge {
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  .win-badge {
    background: color-mix(in srgb, var(--accent-primary) 18%, transparent);
    color: var(--accent-primary);
  }

  .source-badge {
    background: var(--color-surface-3);
    color: var(--text-secondary);
  }

  .stat-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
  }

  .stat-item {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .stat-item img {
    width: 14px;
    height: 14px;
  }

  .skills {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .head {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 650;
  }
</style>
