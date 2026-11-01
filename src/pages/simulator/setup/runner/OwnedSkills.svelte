<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '@/components/Icon.svelte';
  import SkillChip from '@/components/game/SkillChip.svelte';
  import {
    loadSkills,
    skillImage,
    skillRarity,
    type SkillData
  } from '@/lib/game-data/skills/skills';
  import type { SimulatorUma } from '../../simulator-uma';
  import { missingCharacterUnique } from './editor/uma-draft';

  interface Props {
    uma: SimulatorUma;
    onedit?: () => void;
    onchange?: () => void;
  }

  let { uma, onedit, onchange }: Props = $props();

  let skillLookup = $state.raw(new Map<number, SkillData>());

  const uniqueSkillId = $derived(
    missingCharacterUnique(uma, (skillId) => skillLookup.has(skillId))
  );
  const unique = $derived(uniqueSkillId === undefined ? undefined : skillLookup.get(uniqueSkillId));

  onMount(() => {
    let active = true;
    void loadSkills()
      .then((value) => {
        if (active) skillLookup = value;
      })
      .catch(() => {
        // The chips fall back to their ids; the dialog reports its own load errors.
      });

    return () => {
      active = false;
    };
  });

  function addUnique() {
    if (uniqueSkillId === undefined) return;

    uma.skills = [{ skillId: uniqueSkillId, level: 1 }, ...uma.skills];
    onchange?.();
  }
</script>

<div class="owned">
  <span class="owned-label">
    Owns
    {#if uma.skills.length}<span class="count">{uma.skills.length}</span>{/if}
  </span>
  {#if uma.skills.length}
    <ul aria-label="Skills she owns">
      {#each uma.skills as learned (learned.skillId)}
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
    <small>No skills yet.</small>
  {/if}
  {#if uniqueSkillId !== undefined && unique}
    <button
      type="button"
      class="add-unique"
      title="Add {unique.name} to her skills"
      aria-label="Add her unique {unique.name}"
      onclick={addUnique}
    >
      <img
        src={skillImage(unique.icon)}
        alt=""
        loading="lazy"
      />
      <span>{unique.name}</span>
      <Icon
        name="add"
        size={12}
      />
    </button>
  {/if}
  <button
    type="button"
    class="add-skill"
    onclick={() => onedit?.()}
  >
    <Icon
      name="add"
      size={14}
    />
    Add skills
  </button>
</div>

<style>
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
  .add-unique {
    height: 24px;
    min-height: 24px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px 0 0;
    border: 1px dashed var(--border-secondary);
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }
  .add-unique:hover {
    border-color: var(--accent-primary);
    color: var(--color-text);
  }
  .add-unique:focus-visible {
    outline: 0;
    box-shadow: var(--focus-ring);
  }
  .add-unique img {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }
  /* Keeps the chips' 24px height instead of making the line taller. */
  .add-skill {
    height: 24px;
    min-height: 24px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    border: 1px solid var(--border-secondary);
    border-radius: 6px;
    background: var(--factor-field-bg);
    color: var(--color-text);
    font-family: inherit;
    font-size: 11px;
    font-weight: 650;
    white-space: nowrap;
    cursor: pointer;
  }
  .add-skill:hover {
    border-color: var(--accent-primary);
  }
  .add-skill:focus-visible {
    outline: 0;
    box-shadow: var(--focus-ring);
  }
</style>
