<script lang="ts">
  import SkillChip from '@/components/game/SkillChip.svelte';
  import { skillImage, skillRarity, type SkillData } from '@/lib/game-data/skills/skills';
  import { buildSearch } from './build-search.svelte';

  /** The skills she owns, under her stats. */
  interface Props {
    skillLookup: Map<number, SkillData>;
  }

  let { skillLookup }: Props = $props();
</script>

<div class="owned">
  <span class="owned-label">Owns</span>
  {#if buildSearch.uma.skills.length}
    <ul>
      {#each buildSearch.uma.skills as learned (learned.skillId)}
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
    <small>No skills yet; add the ones she has with Full build &amp; skills.</small>
  {/if}
</div>

<style>
  .owned {
    display: flex;
    align-items: baseline;
    gap: 8px 12px;
    min-width: 0;
  }
  .owned-label {
    flex: none;
    font-size: 12px;
    font-weight: 600;
  }
  .owned ul {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .owned small {
    font-size: 12px;
    color: var(--text-secondary);
  }
</style>
