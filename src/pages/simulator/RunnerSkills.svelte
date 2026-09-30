<script lang="ts">
  import Combobox from '@/components/Combobox.svelte';
  import SelectFieldSlim from '@/components/SelectFieldSlim.svelte';
  import SkillChip from '@/components/SkillChip.svelte';
  import {
    loadSkillCatalog,
    skillImage,
    skillRarity,
    type SkillCatalogEntry
  } from '@/lib/catalog/skill-catalog';
  import type { MonteCarloSkillInput } from './race-sim-request';

  interface Props {
    skills?: Array<MonteCarloSkillInput>;
    /** Keeps control ids unique when a page renders one editor per runner. */
    idPrefix: string;
  }

  let { skills = $bindable([]), idPrefix }: Props = $props();

  /** The simulator reads levels 1…6; `buildSkills` clamps anything else. */
  const MAX_LEVEL = 6;
  const LEVEL_OPTIONS = Array.from({ length: MAX_LEVEL }, (_, index) => ({
    value: String(index + 1),
    label: `Lv ${index + 1}`
  }));

  const headingId = $derived(`${idPrefix}-skills-title`);

  let catalog = $state<Map<number, SkillCatalogEntry>>(new Map());
  let query = $state('');
  let error = $state('');
  // Anchors the suggestion panel: it has to escape the scrolling sidebar, which
  // would otherwise clip a list that opens past the pane's bottom edge.
  let searchAnchor = $state<HTMLDivElement>();

  $effect(() => {
    void loadSkillCatalog()
      .then((loaded) => { catalog = loaded; })
      .catch(() => { error = 'Skill data could not be loaded.'; });
  });

  /** Everything this runner does not already have, so a skill cannot be added twice. */
  const options = $derived(
    [...catalog.values()]
      .filter((skill) => !skills.some((picked) => picked.skillId === skill.skill_id))
      .map((skill) => ({
        value: String(skill.skill_id),
        label: skill.name,
        keywords: `skill ${skill.skill_id}`,
        image: skillImage(skill.icon)
      }))
  );

  function addSkill(value: string): void {
    const skillId = Number(value);
    if (!Number.isInteger(skillId) || skillId <= 0) return;
    if (skills.some((picked) => picked.skillId === skillId)) return;
    skills = [...skills, { skillId, level: 1 }];
  }

  function removeSkill(skillId: number): void {
    skills = skills.filter((picked) => picked.skillId !== skillId);
  }

  function setLevel(skillId: number, value: string): void {
    const level = Math.min(MAX_LEVEL, Math.max(1, Math.round(Number(value)) || 1));
    skills = skills.map((picked) => (picked.skillId === skillId ? { ...picked, level } : picked));
  }
</script>

<section class="skills" aria-labelledby={headingId}>
  <div class="head">
    <h3 id={headingId}>Skills</h3>
    <span class="count">{skills.length}</span>
  </div>

  <div class="search" bind:this={searchAnchor}>
    <Combobox
      id="{idPrefix}-skill-search"
      label="Add a skill"
      hideLabel
      placeholder="Add a skill…"
      prefixIcon="search"
      options={options}
      bind:query
      action
      popupAnchor={searchAnchor}
      maxResults={12}
      emptyText={error || 'No skills match.'}
      onchange={addSkill}
    />
  </div>

  {#if skills.length > 0}
    <ul class="picked">
      {#each skills as picked (picked.skillId)}
        {@const skill = catalog.get(picked.skillId)}
        {@const name = skill?.name ?? `Skill ${picked.skillId}`}
        <li>
          <div class="chip">
            <SkillChip
              {name}
              icon={skillImage(skill?.icon)}
              rarity={skillRarity(skill, Boolean(skill?.inherited))}
              compact
              onremove={() => removeSkill(picked.skillId)}
            />
          </div>
          <div class="level">
            <SelectFieldSlim
              id="{idPrefix}-level-{picked.skillId}"
              label="Level for {name}"
              hideLabel
              options={LEVEL_OPTIONS}
              value={String(picked.level ?? 1)}
              onchange={(value) => setLevel(picked.skillId, value)}
            />
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .skills { min-width: 0; display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--card-surface-bg); }
  .head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
  .search { min-width: 0; --combobox-max-height: 200px; }
  h3 { margin: 0; color: var(--color-text); font-size: var(--font-sm); font-weight: 700; }
  .count { min-width: 20px; padding: 1px 6px; border-radius: 999px; background: var(--color-surface-3); color: var(--color-text-muted); font-size: var(--font-xs); font-variant-numeric: tabular-nums; text-align: center; }

  .picked { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
  .picked li { min-width: 0; display: flex; align-items: center; gap: 6px; }
  .chip { flex: 1 1 auto; min-width: 0; }
  .level { flex: none; width: 62px; }
  /* The shared select is sized for a full-width form field; here it is a compact stepper. */
  .level :global(button.select-control) { min-height: 28px; padding: 0 6px; border-radius: 6px; font-size: 12px; }
  .level :global(div.select-panel) { left: auto; right: 0; }
</style>
