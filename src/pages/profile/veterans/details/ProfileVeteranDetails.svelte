<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import type { ProfileVeteran } from '../../profile-repository';
  import type { VeteranUiRecord } from '@/components/game/veteran-ui-types';
  import type { LineageBranch, LineageNodeData } from '@/components/lineage/lineage-types';
  import type { RaceHistoryEntry } from '@/lib/game-data/racing/races';
  import { encodedSkills } from '@/lib/profile/veterans/profile-veterans';
  import {
    resolveEncodedSkill,
    skillImage,
    skillRarity,
    skillPointTotal,
    sortEncodedSkills,
    type SkillData
  } from '@/lib/game-data/skills/skills';
  import ProfileVeteranAffinity from '../ProfileVeteranAffinity.svelte';
  import ProfileVeteranDetailSparks from './ProfileVeteranDetailSparks.svelte';
  import ProfileVeteranSupportDeck from './ProfileVeteranSupportDeck.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import AptitudeGrid from '@/components/game/AptitudeGrid.svelte';
  import SkillChip from '@/components/game/SkillChip.svelte';
  import { totalStats } from '@/lib/profile/profile-display';
  import Button from '@/components/controls/Button.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import LineageTree from '@/components/lineage/LineageTree.svelte';

  let {
    veteran,
    summary,
    skillCatalog,
    family,
    races,
    raceLoading,
    raceError,
    onplanner,
    onschedule
  }: {
    veteran: ProfileVeteran;
    summary: VeteranUiRecord;
    skillCatalog: Map<number, SkillData>;
    family: { root: LineageNodeData; branches: LineageBranch[] };
    races: RaceHistoryEntry[];
    raceLoading: boolean;
    raceError: string;
    onplanner: () => void;
    onschedule: () => void;
  } = $props();

  let sparkSource = $state('family');

  let sparkSection = $state<HTMLElement>();

  const lineageId = $props.id();

  const selectedFamilyId = $derived(
    sparkSource === 'family'
      ? undefined
      : sparkSource === 'main'
        ? family.root.id
        : family.branches
            .flatMap((branch) => [branch.parent, ...branch.grandparents])
            .find((node) => node.id.split(':').pop() === sparkSource)?.id
  );

  const stats = $derived((summary.stats ?? []).filter((stat) => stat.id !== 'total'));
  const skills = $derived(
    sortEncodedSkills(skillCatalog, encodedSkills(veteran)).map((id) => ({
      id,
      ...resolveEncodedSkill(skillCatalog, id)
    }))
  );

  const spTotal = $derived(skillPointTotal(skillCatalog, encodedSkills(veteran)));
  const created = $derived(
    veteran.creation_time && Number.isFinite(Date.parse(veteran.creation_time))
      ? new Date(veteran.creation_time).toLocaleDateString()
      : ''
  );

  function inspectFamily(node: LineageNodeData) {
    sparkSource = node.role === 'main' ? 'main' : node.id.split(':').pop()!;
    sparkSection?.scrollIntoView({ block: 'start' });
    sparkSection?.focus({ preventScroll: true });
  }
</script>

<div class="veteran-details">
  <section
    class="stat-overview"
    aria-label="Stats and totals"
  >
    <header>
      <h3>Stats</h3>
      <dl class="totals">
        <div>
          <dt>Total Stats</dt>
          <dd>{totalStats(veteran).toLocaleString()}</dd>
        </div>
        <div title="Base cost of learned skills including prerequisites, before hint discounts">
          <dt>SP total</dt>
          <dd>{spTotal?.toLocaleString() ?? '-'}</dd>
        </div>
      </dl>
    </header>
    <StatStrip
      items={stats}
      label="Displayed stats"
      presentation="inline"
      framed
    />
  </section>
  <div class="compact-overview">
    <section
      class="aptitudes"
      aria-label="Aptitudes"
    >
      <h3>Aptitudes</h3>
      <AptitudeGrid
        items={summary.aptitudes ?? []}
        compact
        stretch
        gradeFirst
      />
    </section>
    <section
      class="affinity-overview"
      aria-label="Veteran affinity"
    >
      <h3>
        Affinity{#if summary.affinityTarget}
          <small>For {summary.affinityTarget.name}</small>
        {/if}
      </h3>
      <ProfileVeteranAffinity {summary} />
    </section>
  </div>
  <ProfileVeteranSupportDeck {veteran} />
  <ProfileVeteranDetailSparks
    {veteran}
    {summary}
    {family}
    idPrefix={lineageId}
    bind:source={sparkSource}
    bind:section={sparkSection}
  />
  <section
    class="skills-section"
    aria-label="Learned skills"
  >
    <header>
      <h3>
        Learned skills <span>{skills.length}</span>
      </h3>
    </header>
    <div
      class="skill-list"
      role="region"
      aria-label="Learned skill list"
    >
      {#each skills as resolved}
        <span
          class="learned-skill"
          title={resolved.skill?.effect || resolved.skill?.description}
        >
          <SkillChip
            name={resolved.skill?.name ?? 'Skill ' + resolved.id}
            icon={skillImage(resolved.skill?.icon)}
            level={'Lv.' + resolved.level}
            rarity={skillRarity(resolved.skill, resolved.inherited)}
            compact
          />
        </span>
      {/each}{#if !skills.length}
        <p>No learned skills recorded.</p>
      {/if}
    </div>
  </section>
  <section
    class="race-section"
    aria-label="Race history"
  >
    <header>
      <h3>
        Race History <span>{races.length || ''}</span>
      </h3>
      <Button
        variant="secondary"
        size="sm"
        icon="calendar"
        disabled={raceLoading}
        onclick={onschedule}
      >
        Full Schedule
      </Button>
    </header>
    {#if raceError}
      <Banner
        title={raceError}
        tone="danger"
      />
    {:else if raceLoading}
      <p>Resolving race history…</p>
    {:else if races.length}
      <div
        class="race-list"
        role="region"
        aria-label="Recorded races"
      >
        {#each races as race}
          <span class="race grade-{race.grade.toLowerCase()}">
            <b>{race.grade}</b>
            <span>{race.shortName ?? race.name}</span>
          </span>
        {/each}
      </div>
    {:else}
      <p>No races recorded.</p>
    {/if}
  </section>
  {#if family.branches.length}
    <section
      class="family-section"
      aria-label="Family lineage"
    >
      <header>
        <h3>
          <Icon
            name="lineage"
            size={16}
          />Lineage
        </h3>
        <Button
          variant="secondary"
          size="sm"
          icon="external"
          onclick={onplanner}
        >
          Open Planner
        </Button>
      </header>
      <LineageTree
        compact
        root={family.root}
        branches={family.branches}
        selectedId={selectedFamilyId}
        onselect={inspectFamily}
      />
    </section>
  {/if}
  {#if veteran.fans != null || created || veteran.team_rating != null}
    <footer>
      {#if veteran.fans != null}
        <span>
          {veteran.fans.toLocaleString()} fans
        </span>
      {/if}{#if veteran.team_rating != null}
        <span>
          Team rating {veteran.team_rating.toLocaleString()}
        </span>
      {/if}{#if created}
        <span>Trained {created}</span>
      {/if}
    </footer>
  {/if}
</div>

<style>
  @import './veteran-details-shared.css';
  @import './profile-veteran-details.css';
</style>
