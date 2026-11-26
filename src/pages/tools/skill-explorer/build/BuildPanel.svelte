<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import type { StyleBaseline } from '../skill-explorer-data';
  import SkillChipList, { type RelatedSkill } from '../SkillChipList.svelte';

  interface Props {
    /** The headline reference build the values are measured around. */
    skills: RelatedSkill[];
    styleName: string;
    baseline?: StyleBaseline;
  }

  let { skills, styleName, baseline }: Props = $props();

  const id = $props.id();
  const STAT_LABELS = ['SPD', 'STA', 'PWR', 'GUT', 'WIT'] as const;

  let open = $state(false);
</script>

<!-- The build the values are measured in, on the scope's title row beside the target stats; it opens its skills. -->
<Button
  variant="secondary"
  size="sm"
  icon="eye"
  ariaLabel={`Show the reference build, ${skills.length} skills`}
  onclick={() => (open = true)}
>
  Reference build
  <span class="count">{skills.length} skills</span>
</Button>

<Dialog
  bind:open
  title="Reference build"
  description={`Headline Champions Meeting ace build for ${styleName} runners here. Explorer values average across an ensemble of real CM ace builds (standardized to a 20% win rate) for a broad overview. Use the Build Optimizer for exact full-build synergies.`}
  maxWidth="640px"
  maxHeight="88dvh"
  mobileMaxHeight="96dvh"
>
  {#if baseline && (baseline.stats || baseline.win !== undefined)}
    <div class="baseline">
      {#if baseline.stats}
        {#each STAT_LABELS as label, index (label)}
          <span>
            <strong>{label}</strong>
            {baseline.stats[index]}
          </span>
        {/each}
      {/if}
      {#if baseline.win !== undefined}
        <span>
          <strong>Ensemble WR</strong>
          {baseline.win.toFixed(1)}%
        </span>
      {/if}
    </div>
  {/if}

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
  /* The heading, count and chips of the simulator's skill editor (RunnerSkills). */
  .count {
    min-width: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--color-surface-3);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 650;
    line-height: 18px;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .baseline {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.75rem;
    margin-bottom: 10px;
    padding: 6px 10px;
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 0.76rem;
    font-variant-numeric: tabular-nums;
  }

  .baseline strong {
    color: var(--text-muted);
    font-size: 0.68rem;
    font-weight: 600;
    margin-right: 0.2rem;
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
