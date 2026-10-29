<script lang="ts">
  import SkillChip from '@/components/game/SkillChip.svelte';
  import { skillImage, skillRarity, type SkillData } from '@/lib/game-data/skills/skills';
  import { buildSearch } from './build-search.svelte';

  /** The skills she owns, on one line under her stats, labelled like the fields above them. */
  interface Props {
    skillLookup: Map<number, SkillData>;
  }

  let { skillLookup }: Props = $props();

  const owned = $derived(buildSearch.uma.skills);
</script>

<div class="owned">
  <span class="owned-label">
    Owns
    {#if owned.length}<span class="count">{owned.length}</span>{/if}
  </span>
  {#if owned.length}
    <ul aria-label="Skills she owns">
      {#each owned as learned (learned.skillId)}
        {@const skill = skillLookup.get(learned.skillId)}
        <li>
          <SkillChip
            name={skill?.name ?? 'Skill ' + learned.skillId}
            icon={skillImage(skill?.icon)}
            rarity={skillRarity(skill, Boolean(skill?.inherited))}
            compact
          />
        </li>
      {/each}
    </ul>
  {:else}
    <small>No skills yet; add the ones she has with Edit build.</small>
  {/if}
</div>

<style>
  /* The label and every chip centred on one 24px line, wrapping as a group. */
  .owned {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    min-width: 0;
    padding-top: 2px;
  }
  .owned-label {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    flex: none;
    color: var(--color-text);
    font-size: 12px;
    font-weight: 600;
  }
  .count {
    font-weight: 500;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .owned ul {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .owned li {
    display: flex;
    min-width: 0;
  }
  .owned :global(.skill-chip) {
    min-height: 24px;
    font-size: 11px;
  }
  .owned :global(.skill-chip img) {
    width: 24px;
    height: 24px;
  }
  .owned :global(.skill-body) {
    min-height: 24px;
    align-items: center;
    padding-block: 2px;
  }
  .owned small {
    font-size: 12px;
    color: var(--text-secondary);
  }
</style>
