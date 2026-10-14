<script lang="ts">
  import VeteranSummary from '@/components/game/VeteranSummary.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import type { VeteranUiRecord } from '@/components/game/veteran-ui-types';
  import { characterImagePath, type CharacterCatalogEntry } from '@/lib/catalog/character-catalog';
  import { factorCatalogState } from '@/lib/catalog/factor-catalog';
  import {
    parentCharacter,
    parentFactors,
    parentSparkMatched,
    type ParentFactorFilter,
    type parentAffinityDetails,
    type SelectableParent
  } from '@/lib/veterans/parent-picker';
  import { combineVeteranFactors, sparkGroups, scenarios } from '@/pages/veterans/veteran-adapter';

  interface Props {
    parent: SelectableParent;
    characters: Map<number, CharacterCatalogEntry>;
    affinity?: ReturnType<typeof parentAffinityDetails>;
    combined?: boolean;
    filters?: ParentFactorFilter[];
    onselect: () => void;
    onedit?: () => void;
    ondelete?: () => void;
  }

  let {
    parent,
    characters,
    affinity = null,
    combined = true,
    filters = [],
    onselect,
    onedit,
    ondelete
  }: Props = $props();

  const character = $derived(parentCharacter(parent, characters));
  const name = $derived(parent.name || character.name);
  const summary = $derived.by<VeteranUiRecord>(() => {
    $factorCatalogState;
    const highlight = (factors: ReturnType<typeof parentFactors>, source: 'own' | 'p1' | 'p2') =>
      factors.map((factor) => ({
        ...factor,
        matched: parentSparkMatched(parent, factor, source, filters)
      }));
    const factors = highlight(parentFactors(parent), 'own');
    const ancestors = (parent.succession_chara_array ?? [])
      .filter((node) => [10, 20].includes(node.position_id))
      .sort((a, b) => a.position_id - b.position_id)
      .map((node) => ({
        ...node,
        sparks: highlight(parentFactors(node), node.position_id === 10 ? 'p1' : 'p2')
      }))
      .filter((node) => node.sparks.length);
    const allFactors = [...factors, ...ancestors.flatMap((node) => node.sparks)];
    const matchedIds = new Set(
      allFactors.filter((factor) => factor.matched).map((factor) => factor.id)
    );
    return {
      id: parent.pickerId,
      name: character.name,
      image: character.cardId ? characterImagePath(character.cardId) : undefined,
      rank: '',
      scenario: parent.scenario_id
        ? (scenarios[parent.scenario_id] ?? `Scenario ${parent.scenario_id}`)
        : undefined,
      detail: parent.name || parent.trainerName,
      affinity: affinity
        ? affinity.parentOne.total + affinity.race.p1Left + affinity.race.p1Right
        : NaN,
      sparks: sparkGroups(parent.pickerId, factors, 'main'),
      combinedSparks: sparkGroups(
        parent.pickerId,
        combineVeteranFactors(allFactors).map((factor) => ({
          ...factor,
          matched: matchedIds.has(factor.id)
        }))
      ),
      parents: ancestors.map((node) => ({
        id: String(node.position_id),
        position: node.position_id === 10 ? 'P1' : 'P2',
        name: characters.get(node.card_id)?.name ?? `Character ${node.card_id}`,
        image: characterImagePath(node.card_id),
        affinity: !affinity
          ? NaN
          : node.position_id === 10
            ? affinity.parentOne.left + affinity.race.p1Left
            : affinity.parentOne.right + affinity.race.p1Right,
        sparks: sparkGroups(`${parent.pickerId}:${node.position_id}`, node.sparks, 'parent')
      }))
    };
  });
</script>

<article class="parent-row">
  <VeteranSummary
    veteran={summary}
    compact
    showStats={false}
    {combined}
  />
  <button
    type="button"
    class="select-parent"
    aria-label={`Select ${name}`}
    onclick={onselect}
  ></button>
  {#if onedit || ondelete}
    <div class="actions">
      {#if onedit}
        <IconButton
          icon="edit"
          label={`Edit ${name}`}
          onclick={onedit}
        />
      {/if}{#if ondelete}
        <IconButton
          icon="trash"
          label={`Delete ${name}`}
          onclick={ondelete}
        />
      {/if}
    </div>
  {/if}
</article>

<style>
  .parent-row {
    position: relative;
    display: flex;
    align-items: flex-start;
    min-width: 0;
    padding: 8px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--surface-1);
  }
  .parent-row:hover {
    border-color: rgb(var(--accent-primary-rgb) / 0.5);
    background: rgb(var(--accent-primary-rgb) / 0.04);
  }
  .parent-row > :global(.veteran-summary-container) {
    flex: 1;
  }
  .parent-row :global(.veteran-summary) {
    padding: 0;
    border: 0;
    background: transparent;
  }
  .parent-row :global(h3) {
    font-size: 13px;
  }
  .select-parent {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: inherit;
    background: transparent;
    cursor: pointer;
  }
  .select-parent:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
  }
  .actions {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    margin-left: 6px;
  }
  @media (max-width: 600px) {
    .parent-row {
      padding: 6px;
    }
  }
</style>
