<script lang="ts">
  import type { plannerSkillSparks } from '@/lib/lineage/planner';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import LineageSkillCreation from '../LineageSkillCreation.svelte';

  interface Props {
    skills: ReturnType<typeof plannerSkillSparks>;
    skillIcons: Map<string, string>;
    open: boolean;
  }

  let { skills, skillIcons, open = $bindable() }: Props = $props();
</script>

<div class="inheritance">
  <InspectPopover
    label="Potential Inheritance"
    onopenchange={(next) => (open = next)}
  >
    {#snippet trigger()}
      <span class="inheritance-trigger">
        <Icon
          name="star"
          size={14}
        />Potential Inheritance ({skills.length})
      </span>
    {/snippet}
    <header class="inheritance-header">
      <Icon
        name="star"
        size={14}
      />
      <strong>Potential Inheritance</strong>
      <small>When skill is learned during training</small>
    </header>
    <LineageSkillCreation
      {skills}
      {skillIcons}
      compact
    />
  </InspectPopover>
</div>

<style>
  /* Kept before the base rules so the base padding shorthand still wins, as before the split. */
  @media (max-width: 767px) {
    .inheritance-trigger {
      min-height: 44px;
    }
    .inheritance-header {
      min-height: 44px;
      padding-right: 48px;
    }
  }
  .inheritance {
    --inspect-popover-width: 480px;
    --inspect-popover-padding: 0;
    --factor-panel-bg: var(--surface-overlay);
    --factor-panel-border: rgb(var(--accent-warning-rgb)/0.2);
    margin-top: 4px;
  }
  .inheritance :global(.inspect),
  .inheritance :global(.trigger) {
    width: 100%;
  }
  .inheritance-trigger {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 10px;
    border: 1px solid rgb(var(--accent-warning-rgb) / 0.2);
    border-radius: var(--radius-sm);
    background: rgb(var(--accent-warning-rgb) / 0.06);
    color: var(--accent-warning);
    font-size: 0.65rem;
    font-weight: 600;
  }
  .inheritance-trigger:hover {
    background: rgb(var(--accent-warning-rgb) / 0.12);
  }
  .inheritance-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 40px 10px 12px;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 0.7rem;
  }
  .inheritance-header :global(svg) {
    color: var(--accent-warning);
  }
  .inheritance-header small {
    font-size: 0.55rem;
    font-weight: 400;
    color: var(--text-disabled);
  }
</style>
