<script lang="ts">
  import { totalStats } from '@/lib/profile/profile-display';
  import type { ProfileVeteran } from '../profile-repository';
  import type { VeteranUiRecord } from '@/components/game/veteran-ui-types';
  import {
    encodedSkills,
    veteranBaseStat,
    veteranCreationTime,
    veteranFactors,
    veteranFactorTotals,
    type VeteranFactorFilter
  } from '@/lib/profile/veterans/profile-veterans';
  import {
    resolveEncodedSkill,
    skillPointTotal,
    skillImage,
    skillRarity,
    sortEncodedSkills,
    type SkillData
  } from '@/lib/game-data/skills/skills';
  import Icon from '@/components/Icon.svelte';
  import ProfileVeteranAffinity from './ProfileVeteranAffinity.svelte';
  import Badge from '@/components/Badge.svelte';
  import ProfileVeteranIdentity from './ProfileVeteranIdentity.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import AptitudeGrid from '@/components/game/AptitudeGrid.svelte';
  import ProfileVeteranSparks from './ProfileVeteranSparks.svelte';
  import SkillChip from '@/components/game/SkillChip.svelte';
  import ProfileVeteranQueryMatches from './ProfileVeteranQueryMatches.svelte';
  import type { VeteranQueryMatch } from '@/lib/profile/veterans/profile-veteran-query';
  import SkillPoints, { LEARNED_SKILL_POINTS_NOTE } from '@/components/game/SkillPoints.svelte';

  let {
    veteran,
    summary,
    skillCatalog,
    baseStats = false,
    mood = 0,
    selectedFactors = [],
    selectedSkills = [],
    queryMatches = [],
    statsOnly = false,
    expandedSection = 'skills',
    sparkSource = 'family',
    legacyUrl,
    onfactor,
    onskill,
    ondetails
  }: {
    veteran: ProfileVeteran;
    summary: VeteranUiRecord;
    skillCatalog: Map<number, SkillData>;
    baseStats?: boolean;
    mood?: number;
    selectedFactors?: VeteranFactorFilter[];
    selectedSkills?: number[];
    statsOnly?: boolean;
    queryMatches?: VeteranQueryMatch[];
    legacyUrl?: string;
    expandedSection?: 'sparks' | 'skills' | 'compact';
    sparkSource?: 'family' | 'parent' | 'p1' | 'p2';
    onfactor?: (filter: VeteranFactorFilter) => void;
    onskill?: (id: number) => void;
    ondetails?: () => void;
  } = $props();

  const id = $props.id();

  const sourceLabel = $derived(
    { family: 'family total', parent: 'Own', p1: 'P1', p2: 'P2' }[sparkSource]
  );

  const skills = $derived(sortEncodedSkills(skillCatalog, encodedSkills(veteran)));
  const sparks = $derived(
    sparkSource === 'family' ? veteranFactorTotals(veteran) : veteranFactors(veteran, sparkSource)
  );

  const stats = $derived(
    (summary.stats ?? [])
      .filter((stat) => stat.id !== 'total')
      .map((stat) => {
        if (!baseStats) return stat;
        const value = veteranBaseStat(
          veteran[stat.id as 'speed' | 'stamina' | 'power' | 'guts' | 'wiz'],
          mood
        );

        return {
          ...stat,
          value: value?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? '-'
        };
      })
  );

  const statTotal = $derived(
    baseStats
      ? (['speed', 'stamina', 'power', 'guts', 'wiz'] as const).reduce(
          (sum, key) => sum + (veteranBaseStat(veteran[key], mood) ?? 0),
          0
        )
      : totalStats(veteran)
  );

  const spTotal = $derived(skillPointTotal(skillCatalog, encodedSkills(veteran)));
  const trainedAt = $derived(veteranCreationTime(veteran));
  const created = $derived(trainedAt === null ? '' : new Date(trainedAt).toLocaleDateString());

  function openDetails(event: MouseEvent) {
    (event.currentTarget as HTMLButtonElement).focus({ preventScroll: true });
    ondetails?.();
  }
</script>

{#snippet identity()}
  <ProfileVeteranIdentity
    {summary}
    rarity={veteran.rarity}
    score={veteran.rank_score}
  />
{/snippet}

<article
  class="veteran-card"
  class:stats-only={statsOnly}
  aria-label={`${summary.name} ${statsOnly ? 'stadium runner' : 'veteran'}`}
>
  <div class="card-heading">
    {#if ondetails}
      <button
        class="card-open"
        aria-label={`View ${summary.name} details`}
        onclick={openDetails}
      >
        {@render identity()}
      </button>
    {:else}
      <div class="card-open">{@render identity()}</div>
    {/if}
    {#if summary.labels?.length || summary.stickers?.length}
      <div
        class="card-annotations"
        aria-label="Card labels and stickers"
      >
        {#each summary.labels ?? [] as label}
          <Badge>{label}</Badge>
        {/each}
        {#each summary.stickers ?? [] as sticker}
          <img
            class="sticker"
            src={sticker.image}
            alt={sticker.name}
            title={sticker.name}
            loading="lazy"
          />
        {/each}
      </div>
    {/if}
  </div>

  <div class="card-body">
    <div class="card-stats">
      <StatStrip
        items={stats}
        label={baseStats ? 'Base stats' : 'Displayed stats'}
        presentation="tiles"
      />
    </div>
    {#if summary.aptitudes?.length}
      <div class="card-aptitudes">
        <AptitudeGrid
          items={summary.aptitudes}
          layout="tiles"
        />
      </div>
    {/if}

    {#if !statsOnly}
      <section
        class="card-affinity"
        aria-label="Veteran affinity"
      >
        <header title={summary.affinityNote}>
          <h4>Affinity</h4>
          {#if summary.affinityTarget}
            <small>For {summary.affinityTarget.name}</small>
          {/if}
        </header>
        <ProfileVeteranAffinity {summary} />
      </section>

      <section
        class="sparks"
        aria-label="Veteran sparks"
      >
        <header>
          <h4>
            {sparkSource === 'family' ? 'Combined sparks' : sourceLabel + ' sparks'}
            <span class="count">{sparks.length}</span>
          </h4>
        </header>
        <ProfileVeteranSparks
          items={sparks}
          id={id + '-sparks'}
          source={sparkSource}
          expanded={expandedSection === 'sparks'}
          layout="rows"
          {selectedFactors}
          {queryMatches}
          {onfactor}
        />
        {#if !sparks.length}
          <small>No sparks recorded.</small>
        {/if}
      </section>
    {/if}
    {#if skills.length}
      <section class="learned-skills">
        <header>
          <h4>
            Learned skills <span class="count">{skills.length}</span>
          </h4>
        </header>
        <div
          class="skill-list"
          id={id + '-skills'}
          hidden={expandedSection !== 'skills'}
        >
          {#each skills as skillId}
            {@const resolved = resolveEncodedSkill(skillCatalog, skillId)}
            {@const id = resolved.skill?.skill_id ?? Math.floor(skillId / 10)}
            {@const rarity = skillRarity(resolved.skill, resolved.inherited)}
            {#snippet chip()}
              <!-- Only the trainee's own unique levels up; every other skill stays at Lv.1. -->
              <SkillChip
                name={resolved.skill?.name ?? `Skill ${id}`}
                icon={skillImage(resolved.skill?.icon)}
                level={rarity === 'unique-main' ? `Lv.${resolved.level}` : undefined}
                {rarity}
                compact
                fill
              />
            {/snippet}
            {#if onskill}
              <button
                class="skill-filter"
                class:matched={selectedSkills.includes(id)}
                aria-label={`Filter by learned skill ${resolved.skill?.name ?? id}`}
                onclick={() => onskill?.(id)}
              >
                {@render chip()}
              </button>
            {:else}
              <span class="skill-filter">{@render chip()}</span>
            {/if}
          {/each}
        </div>
      </section>
    {/if}
    <ProfileVeteranQueryMatches matches={queryMatches} />
  </div>
  <footer>
    <span class="stat-total">
      {statTotal.toLocaleString(undefined, { maximumFractionDigits: 1 })} Total Stats
    </span>
    <SkillPoints
      value={spTotal}
      note={LEARNED_SKILL_POINTS_NOTE}
    />
    {#if veteran.fans != null}
      <span>
        {veteran.fans.toLocaleString()} fans
      </span>
    {:else if created}
      <span>{created}</span>
    {/if}
    <span class="footer-actions">
      {#if legacyUrl}
        <a
          class="text-action"
          href={legacyUrl}
        >
          <Icon
            name="database"
            size={12}
          />Use as legacy
        </a>
      {/if}{#if ondetails}
        <button
          class="text-action"
          onclick={openDetails}
        >
          Details <Icon
            name="arrow-right"
            size={12}
          />
        </button>
      {/if}
    </span>
  </footer>
</article>

<style>
  .veteran-card {
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border-primary);
    border-radius: 10px;
    background: var(--card-surface-bg);
    container-type: inline-size;
  }
  .veteran-card:hover {
    border-color: var(--border-secondary);
  }
  .card-heading {
    border-bottom: 1px solid var(--border-subtle);
    background: var(--surface-1);
  }
  .card-annotations {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 0 12px 8px;
  }
  .card-annotations :global(.badge) {
    max-width: 100%;
    min-height: 20px;
    padding: 3px 6px;
    font-size: 10px;
    font-weight: 500;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  .sticker {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }
  .card-open {
    display: block;
    width: 100%;
    padding: 10px 12px;
    border: 0;
    background: transparent;
    color: var(--color-text);
    text-align: left;
    cursor: pointer;
  }
  .card-open:not(button),
  .skill-filter:not(button) {
    cursor: default;
  }
  .card-body {
    min-width: 0;
    display: grid;
    gap: 8px;
    padding: 10px 12px;
  }
  .sparks,
  .learned-skills {
    min-width: 0;
    display: grid;
    gap: 5px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  h4 {
    margin: 0;
    color: var(--text-primary);
    font-size: 10px;
    font-weight: 600;
  }
  .count {
    margin-left: 3px;
    color: var(--color-text-muted);
    font-size: 10px;
    font-weight: 400;
  }
  /* Equal columns, as on the race analysis builds, so long and short names line up in rows. */
  .skill-list {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
  }
  .skill-filter {
    min-width: 0;
    display: flex;
    align-items: stretch;
    min-height: 24px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .skill-filter.matched :global(.skill-body) {
    border-color: var(--color-gold);
    box-shadow: 0 0 8px rgb(255 215 0 / 0.3);
    background: linear-gradient(45deg, rgb(255 215 0 / 0.1), rgb(255 215 0 / 0.05));
  }
  .card-affinity {
    display: grid;
    gap: 6px;
    padding-bottom: 8px;
  }
  .card-affinity header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 4px;
  }
  .card-affinity header small {
    font-size: 10px;
    color: var(--color-text-muted);
  }
  .skill-filter:hover {
    filter: brightness(1.15);
  }
  .skill-list[hidden] {
    display: none;
  }
  .skill-filter :global(.skill-chip) {
    min-height: 26px;
    font-size: 10px;
  }
  .skill-filter :global(.skill-chip img) {
    width: 26px;
    height: 26px;
    align-self: center;
  }
  .skill-filter :global(.skill-body) {
    min-height: 26px;
    align-items: center;
  }
  .skill-filter :global(.skill-name) {
    white-space: normal;
    overflow: visible;
    line-height: 1.25;
  }
  footer {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    min-height: 30px;
    margin-top: auto;
    padding: 4px 12px;
    border-top: 1px solid var(--border-subtle);
    color: var(--color-text-muted);
    font-size: 10px;
  }
  .footer-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
  }
  .text-action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 24px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-accent);
    font-size: 10px;
    text-decoration: none;
    cursor: pointer;
  }
  small {
    color: var(--color-text-muted);
    font-size: 10px;
  }
  button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
  .card-open:focus-visible {
    outline-offset: -2px;
  }
  @container (max-width: 400px) {
    .skill-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @container (max-width:330px) {
    .card-open {
      padding: 8px;
    }
    .card-body {
      padding: 8px;
    }
  }
  @media (max-width: 767px) {
    .text-action {
      min-height: 32px;
    }
  }
</style>
