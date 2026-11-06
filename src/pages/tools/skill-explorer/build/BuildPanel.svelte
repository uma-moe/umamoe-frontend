<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import SkillChipList, { type RelatedSkill } from '../SkillChipList.svelte';

  interface Props {
    /** The reference build the values are measured in. */
    skills: RelatedSkill[];
    styleName: string;
  }

  let { skills, styleName }: Props = $props();

  const id = $props.id();

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
  description={`What our optimizer buys a ${styleName} runner here with the latest CM's average SP. Every value on the chart is a skill added to this.`}
  maxWidth="640px"
  maxHeight="88dvh"
  mobileMaxHeight="96dvh"
>
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
