<script lang="ts">
  import Combobox from '@/components/controls/Combobox.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';
  import SkillChip from '@/components/game/SkillChip.svelte';
  import {
    loadSkills,
    skillPointTotal,
    skillImage,
    skillRarity,
    type SkillData
  } from '@/lib/game-data/skills/skills';
  import type { MonteCarloSkillInput } from '../../../requests/race-sim-request';
  import SkillPoints, { LEARNED_SKILL_POINTS_NOTE } from '@/components/game/SkillPoints.svelte';
  import { selectableOwnedSkill } from './uma-draft';

  interface Props {
    skills?: Array<MonteCarloSkillInput>;
    /** Keeps control ids unique when a page renders one editor per runner. */
    idPrefix: string;
    /** Her card, so her own inherited unique stays out of the picker. */
    cardId?: number;
    /** Put the cursor in the search when the dialog opens. */
    autofocus?: boolean;
  }

  let { skills = $bindable([]), idPrefix, cardId, autofocus = false }: Props = $props();

  /** The simulator reads levels 1…6; `buildSkills` clamps anything else. */
  const MAX_LEVEL = 6;
  const LEVEL_OPTIONS = Array.from({ length: MAX_LEVEL }, (_, index) => ({
    value: String(index + 1),
    label: `Lv ${index + 1}`
  }));

  const headingId = $derived(`${idPrefix}-skills-title`);

  let skillLookup = $state<Map<number, SkillData>>(new Map());
  let query = $state('');
  let error = $state('');
  // Anchors the suggestion panel: it has to escape the scrolling sidebar, which
  // would otherwise clip a list that opens past the pane's bottom edge.
  let searchAnchor = $state<HTMLDivElement>();

  $effect(() => {
    void loadSkills()
      .then((loaded) => {
        skillLookup = loaded;
      })
      .catch(() => {
        error = 'Skill data could not be loaded.';
      });
  });

  /** Everything she could add: no personal uniques, nothing she already has, and no duplicate. */
  const options = $derived(
    [...skillLookup.values()]
      .filter(
        (skill) =>
          selectableOwnedSkill(skill, cardId) &&
          !skills.some((picked) => picked.skillId === skill.skill_id)
      )
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

<section
  class="skills"
  aria-labelledby={headingId}
>
  <div class="head">
    <h3 id={headingId}>Skills</h3>
    <span class="count">{skills.length}</span>
    <SkillPoints
      value={skillPointTotal(
        skillLookup,
        skills.map((skill) => skill.skillId * 10 + (skill.level ?? 1))
      )}
      note={LEARNED_SKILL_POINTS_NOTE}
    />
  </div>

  <div
    class="search"
    bind:this={searchAnchor}
  >
    <Combobox
      id="{idPrefix}-skill-search"
      label="Add a skill"
      hideLabel
      placeholder="Add a skill…"
      prefixIcon="search"
      {options}
      bind:query
      action
      {autofocus}
      popupAnchor={searchAnchor}
      maxResults={12}
      emptyText={error || 'No skills match.'}
      onchange={addSkill}
    />
  </div>

  {#if skills.length > 0}
    <ul class="picked">
      {#each skills as picked (picked.skillId)}
        {@const skill = skillLookup.get(picked.skillId)}
        {@const name = skill?.name ?? `Skill ${picked.skillId}`}
        {@const unique = skillRarity(skill, Boolean(skill?.inherited)) === 'unique-main'}
        <li>
          <div class="chip">
            <SkillChip
              {name}
              icon={skillImage(skill?.icon)}
              rarity={skillRarity(skill, Boolean(skill?.inherited))}
              compact
              fill
              onremove={() => removeSkill(picked.skillId)}
            />
          </div>
          {#if unique}
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
          {/if}
        </li>
      {/each}
    </ul>
  {:else if error}
    <div role="alert">
      <Banner
        title="Skills unavailable"
        tone="warning"
      >
        <p>{error}</p>
      </Banner>
    </div>
  {:else}
    <p class="empty">No skills yet. Search to add some.</p>
  {/if}
</section>

<style>
  /* A heading line, the search, then the skills two to a row where there is room, at the setup forms' sizes. */
  .skills {
    display: grid;
    gap: 8px;
    min-width: 0;
    padding-top: 12px;
    border-top: 1px solid var(--border-subtle);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 650;
  }
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
  .head > :global(.skill-points) {
    margin-left: auto;
    font-size: 12px;
  }
  .search {
    --control-height: var(--setup-control-height, 36px);
    --combobox-max-height: 240px;
    min-width: 0;
  }
  .picked {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* The chip and, for her unique, its level stay on one line; the chip takes the remaining width. */
  .picked li {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .chip {
    flex: 1 1 auto;
    min-width: 0;
  }
  .level {
    flex: 0 0 72px;
  }
  .chip :global(.skill-chip) {
    min-height: 32px;
    font-size: 12px;
  }
  /* The shared select is sized for a full-width form field; here it is a compact level stepper. */
  .level :global(button.select-control) {
    min-height: 32px;
    padding: 0 8px;
    border-radius: var(--radius-sm);
    font-size: 12px;
  }
  .level :global(div.select-panel) {
    left: auto;
    right: 0;
  }
  .empty {
    margin: 0;
    padding: 12px;
    border: 1px dashed var(--border-subtle);
    border-radius: var(--radius-md);
    font-size: 12px;
    color: var(--text-secondary);
    text-align: center;
  }
  @media (max-width: 520px) {
    .picked {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
