<script lang="ts">
  import { onMount } from 'svelte';
  import SkillChip from '@/components/game/SkillChip.svelte';
  import {
    loadSkillCatalog,
    resolveEncodedSkill,
    skillImage,
    skillRarity,
    type SkillCatalogEntry
  } from '@/lib/catalog/skill-catalog';

  let {
    id,
    name,
    iconOnly = false,
    fill = false,
    level
  }: {
    id: number;
    name?: string;
    iconOnly?: boolean;
    /** Stretch to the container's width. */
    fill?: boolean;
    /** Shown inside the chip, after the name. */
    level?: string;
  } = $props();

  let catalog = $state.raw(new Map<number, SkillCatalogEntry>());

  onMount(() => {
    void loadSkillCatalog()
      .then((value) => (catalog = value))
      .catch(() => {});
  });

  const resolved = $derived(resolveEncodedSkill(catalog, id));
  const skill = $derived(
    resolved.skill ??
      (name ? [...catalog.values()].find((entry) => entry.name === name) : undefined)
  );
</script>

<SkillChip
  name={skill?.name ?? name ?? 'Skill ' + id}
  icon={skillImage(skill?.icon)}
  rarity={skillRarity(skill, resolved.inherited)}
  compact
  {iconOnly}
  {fill}
  {level}
/>
