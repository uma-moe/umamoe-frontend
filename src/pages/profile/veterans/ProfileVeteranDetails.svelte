<script lang="ts">
  import { onMount } from 'svelte';
  import {
    loadSupportCardCatalog,
    supportCardImagePath,
    type SupportCardCatalogEntry
  } from '@/lib/catalog/support-card-catalog';
  import { supportTypeName } from '@/lib/supports/support-card';
  import { veteranSupportCards } from '@/lib/veterans/veteran-profile';
  import LimitBreak from '@/components/game/LimitBreak.svelte';
  import Icon from '@/components/Icon.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import type { ProfileVeteran } from '../profile-repository';
  import type { VeteranUiRecord } from '@/components/game/veteran-ui-types';
  import type { LineageBranch, LineageNodeData } from '@/components/lineage-types';
  import type { RaceHistoryEntry } from '@/lib/catalog/race-catalog';
  import {
    encodedSkills,
    resolveVeteranFactors,
    veteranFactorTotals
  } from '@/lib/profile/profile-veterans';
  import {
    resolveEncodedSkill,
    skillImage,
    skillRarity,
    skillPointTotal,
    sortEncodedSkills,
    type SkillCatalogEntry
  } from '@/lib/catalog/skill-catalog';
  import ProfileVeteranAffinity from './ProfileVeteranAffinity.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import AptitudeGrid from '@/components/game/AptitudeGrid.svelte';
  import SkillChip from '@/components/game/SkillChip.svelte';
  import SparkItem from '@/components/sparks/SparkItem.svelte';
  import RadioGroup from '@/components/controls/RadioGroup.svelte';
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
    skillCatalog: Map<number, SkillCatalogEntry>;
    family: { root: LineageNodeData; branches: LineageBranch[] };
    races: RaceHistoryEntry[];
    raceLoading: boolean;
    raceError: string;
    onplanner: () => void;
    onschedule: () => void;
  } = $props();

  let sparkSource = $state('family');
  let supportCatalog = $state<readonly SupportCardCatalogEntry[]>([]);
  let supportError = $state('');

  const supportDeck = $derived(veteranSupportCards(veteran));

  onMount(() => {
    let active = true;
    if (supportDeck.length)
      void loadSupportCardCatalog()
        .then((cards) => {
          if (active) supportCatalog = cards;
        })
        .catch(() => {
          if (active) supportError = 'Support names are unavailable; recorded card IDs are shown.';
        });
    return () => {
      active = false;
    };
  });

  let sparkSection: HTMLElement;

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
  const ownSources = $derived([
    { value: 'family', label: 'Combined', description: 'Own + P1 + P2' },
    {
      value: 'main',
      label: summary.name,
      shortLabel: 'Own',
      description: 'This veteran',
      image: summary.image
    }
  ]);
  const branchSources = $derived(
    family.branches.map(({ parent, grandparents }) => ({
      id: parent.id,
      label: 'Parent ' + parent.roleLabel.slice(1),
      options: [
        {
          value: parent.id.split(':').pop()!,
          label: parent.name,
          shortLabel: parent.roleLabel,
          description: 'Parent ' + parent.roleLabel.slice(1),
          image: parent.image
        },
        ...grandparents.map((node) => ({
          value: node.id.split(':').pop()!,
          label: node.name,
          shortLabel: 'GP' + node.roleLabel.split(' ').pop()!,
          description: node.roleLabel.replace(' legacy ', ' · Grandparent '),
          image: node.image
        }))
      ]
    }))
  );
  const selectedSparkSource = $derived(
    [...ownSources, ...branchSources.flatMap((branch) => branch.options)].find(
      (source) => source.value === sparkSource
    )
  );
  const sourceNode = $derived(
    sparkSource === 'main'
      ? veteran
      : veteran.succession_chara_array?.find((node) => String(node.position_id) === sparkSource)
  );
  const sparks = $derived(
    sparkSource === 'family'
      ? veteranFactorTotals(veteran)
      : sourceNode
        ? resolveVeteranFactors(sourceNode)
        : []
  );
  const sortedSparks = $derived(
    sparks.toSorted(
      (a, b) =>
        ['blue', 'pink', 'green', 'white'].indexOf(a.tone) -
          ['blue', 'pink', 'green', 'white'].indexOf(b.tone) || a.name.localeCompare(b.name)
    )
  );
  const contributions = $derived(
    [
      veteran,
      ...[10, 20].map((position) =>
        veteran.succession_chara_array?.find((node) => node.position_id === position)
      )
    ].map((node) => {
      const levels = new Map<number, number>();
      for (const factor of node ? resolveVeteranFactors(node) : [])
        levels.set(factor.id, (levels.get(factor.id) ?? 0) + factor.level);
      return levels;
    })
  );
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
  <section
    class="support-section"
    aria-label="Training support cards"
  >
    <header>
      <h3>
        Support deck <span>{supportDeck.length}</span>
      </h3>
    </header>
    {#if supportDeck.length}
      <ul class="support-deck">
        {#each supportDeck as support}
          {@const id = support.support_card_id}
          {@const card = supportCatalog.find((card) => Number(card.id) === id)}
          {@const type = card
            ? card.type === 'group'
              ? 'Group'
              : supportTypeName(card.type)
            : undefined}
          <li title={card ? `${card.name} · ${supportTypeName(card.type)}` : `Support card ${id}`}>
            <Artwork
              src={supportCardImagePath(id)}
              fallbackSrc="/assets/images/placeholder-card.webp"
              alt={card?.name ?? `Support card ${id}`}
              kind="card"
              size="sm"
            />
            <span class="support-name">
              {#if type}
                <span
                  class="support-type"
                  title={type + ' support'}
                >
                  {#if type === 'Friend' || type === 'Group'}
                    <span
                      role="img"
                      aria-label={type + ' support'}
                    >
                      <Icon
                        name={type === 'Group' ? 'community' : 'user'}
                        size={16}
                      />
                    </span>
                  {:else}
                    <img
                      src={'/assets/images/icon/stats/' + type.toLowerCase() + '.webp'}
                      alt={type + ' support'}
                      width="16"
                      height="16"
                    />
                  {/if}
                </span>
              {/if}{card?.name ?? 'Card ' + id}
            </span>
            <div class="support-meta">
              {#if card && [1, 2, 3].includes(card.rarity)}
                {@const rarity = card.rarity === 3 ? 'SSR' : card.rarity === 2 ? 'SR' : 'R'}
                <img
                  class="support-rarity"
                  src={'/game-assets/support-rarity/' + rarity.toLowerCase() + '.png'}
                  alt={rarity}
                  width="18"
                  height="18"
                />
              {/if}
              <span class="support-lb"><LimitBreak value={support.limit_break_count} /></span>
            </div>
          </li>
        {/each}
      </ul>
      {#if supportError}
        <p role="status">{supportError}</p>
      {/if}
    {:else}
      <p>No support cards recorded.</p>
    {/if}
  </section>
  <section
    class="spark-section"
    aria-label="Inheritance sparks"
    tabindex="-1"
    bind:this={sparkSection}
  >
    <header class="spark-header">
      <h3>
        Sparks <span>{sparks.length}</span>
      </h3>
      <p
        class="source-name"
        title={sparkSource === 'family'
          ? 'Combined stars from this veteran and both parents.'
          : selectedSparkSource?.label + ' · ' + selectedSparkSource?.description}
      >
        {#if sparkSource === 'family'}
          Own + P1 + P2
        {:else}
          {selectedSparkSource?.label}
          <span>{' · ' + selectedSparkSource?.description}</span>
        {/if}
      </p>
    </header>
    <div
      class="spark-sources"
      role="group"
      aria-label="Show sparks from"
    >
      <div class="own-sources">
        <RadioGroup
          id={lineageId + '-spark-runner'}
          legend="Veteran"
          options={ownSources}
          bind:value={sparkSource}
          cards
          compact
        />
      </div>
      {#each branchSources as branch (branch.id)}
        <div class="branch-sources">
          <RadioGroup
            id={lineageId + '-spark-runner'}
            legend={branch.label}
            options={branch.options}
            bind:value={sparkSource}
            cards
            compact
          />
        </div>
      {/each}
    </div>
    <div
      class="spark-list"
      role="region"
      aria-label="All inheritance sparks"
    >
      {#each ['blue', 'pink', 'green', 'white'] as tone}
        {@const group = sortedSparks.filter((factor) => factor.tone === tone)}
        {#if group.length}
          <div
            class="spark-group"
            data-tone={tone}
            role="list"
            aria-label={tone + ' sparks'}
          >
            {#each group as factor}
              {@const contribution =
                sparkSource === 'family'
                  ? factor.name +
                    ': ' +
                    factor.level +
                    ' stars total. Main ' +
                    (contributions[0]?.get(factor.id) ?? 0) +
                    ', P1 ' +
                    (contributions[1]?.get(factor.id) ?? 0) +
                    ', P2 ' +
                    (contributions[2]?.get(factor.id) ?? 0) +
                    '.'
                  : factor.name + ': ' + factor.level + ' stars.'}
              <span
                class="spark-token"
                role="listitem"
                aria-label={contribution}
                title={contribution}
              >
                <SparkItem
                  name={factor.name}
                  level={factor.level}
                  tone={factor.tone}
                  title={contribution}
                  mainStars={sparkSource === 'family' ? (contributions[0]?.get(factor.id) ?? 0) : 0}
                  compact
                />
              </span>
            {/each}
          </div>
        {/if}
      {/each}
      {#if !sparks.length}
        <p>No sparks recorded for this source.</p>
      {/if}
    </div>
  </section>
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
  @import './profile-veteran-details.css';
</style>
