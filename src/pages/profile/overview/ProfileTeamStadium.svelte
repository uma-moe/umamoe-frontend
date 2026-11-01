<script lang="ts">
  import { characterImagePath, type CharacterData } from '@/lib/game-data/characters';
  import { loadSkills, type SkillData } from '@/lib/game-data/skills/skills';
  import {
    groupStadiumMembers,
    runningStyleName,
    scenarioName,
    totalStats
  } from '@/lib/profile/profile-display';
  import type { VeteranUiRecord } from '@/components/game/veteran-ui-types';
  import ProfileVeteranCard from '../veterans/ProfileVeteranCard.svelte';
  import { veteranAptitudes, veteranStatTiles } from '../veterans/roster/roster-records';
  import Button from '@/components/controls/Button.svelte';
  import Tabs from '@/components/navigation/Tabs.svelte';
  import ProfileVeteranDialog from '../veterans/details/ProfileVeteranDialog.svelte';
  import type { ProfileVeteran, StadiumMember } from '../profile-repository';

  let {
    accountId,
    members,
    characters
  }: {
    accountId: string;
    members: StadiumMember[];
    characters: Map<number, CharacterData>;
  } = $props();

  let detail = $state<ProfileVeteran>(),
    detailOpen = $state(false);

  let selectedStadiumTab = $state(0);
  let skills = $state<Map<number, SkillData>>(new Map());
  let skillError = $state('');

  const stadiumGroups = $derived(groupStadiumMembers(members));
  const stadiumIndex = $derived(
    Math.min(selectedStadiumTab, Math.max(0, stadiumGroups.length - 1))
  );

  const stadiumGroup = $derived(stadiumGroups[stadiumIndex]);

  $effect(() => {
    accountId;
    selectedStadiumTab = 0;
  });

  $effect(() => {
    void loadSkills()
      .then((value) => (skills = value))
      .catch(() => (skillError = 'Skill names could not be loaded.'));
  });

  function summary(member: StadiumMember | ProfileVeteran): VeteranUiRecord {
    return {
      id: String(member.id),
      name: characters.get(member.card_id ?? 0)?.name ?? 'Unknown',
      image: member.card_id ? characterImagePath(member.card_id) : undefined,
      rank: '',
      score: member.rank_score ?? undefined,
      scenario: scenarioName(member.scenario_id),
      detail: runningStyleName(member.running_style),
      affinity: Number.NaN,
      sparks: [],
      aptitudes: veteranAptitudes(member),
      stats: [
        ...veteranStatTiles(member),
        { id: 'total', label: 'Total', value: totalStats(member).toLocaleString() }
      ]
    };
  }
</script>

{#if stadiumGroup}
  <div class="stadium-navigation">
    <Tabs
      variant="pills"
      id="stadium-distance-tabs"
      controls="stadium-distance-panel"
      label="Team Stadium distance"
      items={stadiumGroups.map((group, index) => ({ id: String(index), label: group.distance }))}
      value={String(stadiumIndex)}
      onchange={(value) => (selectedStadiumTab = Number(value))}
    />
  </div>
  <div class="stadium-carousel">
    <span class="stadium-previous">
      <Button
        variant="secondary"
        size="sm"
        icon="chevron"
        ariaLabel="Previous distance"
        disabled={stadiumGroups.length < 2}
        onclick={() =>
          (selectedStadiumTab = (stadiumIndex - 1 + stadiumGroups.length) % stadiumGroups.length)}
      />
    </span>
    <span
      class="stadium-position"
      role="status"
    >
      {stadiumGroup.distance}, {stadiumIndex + 1} of {stadiumGroups.length}
    </span>
    <span class="stadium-next">
      <Button
        variant="secondary"
        size="sm"
        icon="chevron"
        ariaLabel="Next distance"
        disabled={stadiumGroups.length < 2}
        onclick={() => (selectedStadiumTab = (stadiumIndex + 1) % stadiumGroups.length)}
      />
    </span>
    {#key accountId + ':' + stadiumGroup.distance}
      <div
        id="stadium-distance-panel"
        class="stadium-grid"
        role="tabpanel"
        aria-labelledby={'stadium-distance-tabs-' + stadiumIndex}
      >
        {#each stadiumGroup.members as member (member.id)}
          <div class="stadium-member">
            <ProfileVeteranCard
              veteran={{ ...member, member_id: member.id }}
              summary={summary(member)}
              skillCatalog={skills}
              statsOnly
              ondetails={() => {
                detail = { ...member, member_id: member.id };
                detailOpen = true;
              }}
            />
          </div>
        {/each}
      </div>
    {/key}
  </div>
{/if}
{#if skillError}
  <p role="status">{skillError}</p>
{/if}
{#if detail}
  <ProfileVeteranDialog
    veteran={detail}
    {accountId}
    summary={summary(detail)}
    skillCatalog={skills}
    bind:open={detailOpen}
  />
{/if}

<style>
  .stadium-navigation {
    min-width: 0;
    width: 100%;
  }
  .stadium-navigation :global(.tab) {
    flex: 1 1 0;
    min-width: 0;
    padding-inline: 6px;
  }
  .stadium-carousel {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    gap: var(--space-2);
    align-items: center;
  }
  .stadium-previous {
    grid-column: 1;
    grid-row: 1;
  }
  .stadium-next {
    grid-column: 3;
    grid-row: 1;
  }
  .stadium-previous :global(svg) {
    transform: rotate(90deg);
  }
  .stadium-next :global(svg) {
    transform: rotate(-90deg);
  }
  .stadium-position {
    grid-column: 2;
    grid-row: 2;
    text-align: center;
    color: var(--color-text-muted);
    font-size: var(--font-xs);
    font-variant-numeric: tabular-nums;
  }
  .stadium-grid {
    grid-column: 2;
    grid-row: 1;
  }
  .stadium-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-3);
    animation: stadium-reveal 160ms ease-out;
  }
  @keyframes stadium-reveal {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .stadium-grid {
      animation: none;
    }
  }
  @media (max-width: 900px) {
    .stadium-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 900px) {
    .stadium-position {
      grid-row: 1;
    }
    .stadium-grid {
      grid-column: 1/-1;
      grid-row: 2;
    }
  }
  .stadium-member {
    min-width: 0;
    display: grid;
  }
</style>
