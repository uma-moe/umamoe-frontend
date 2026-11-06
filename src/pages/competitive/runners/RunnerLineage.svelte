<script lang="ts">
  import { onMount } from 'svelte';
  import type { Build } from '../hakuraku-types';
  import Artwork from '@/components/game/Artwork.svelte';
  import { loadCharacters, type CharacterData } from '@/lib/game-data/characters';
  import { portrait } from '../analysis-view';

  let {
    parents = []
  }: {
    parents?: Pick<NonNullable<Build['parents']>[number], 'positionId' | 'cardId'>[];
  } = $props();

  /** Each parent at 10 and 20, followed by their own two parents. */
  const lineagePositions = [10, 11, 12, 20, 21, 22];

  let characters = $state.raw(new Map<number, CharacterData>());

  const lineage = $derived(
    lineagePositions.map((positionId) => {
      const parent = parents.find((entry) => entry.positionId === positionId);
      const name = parent
        ? (characters.get(parent.cardId)?.name ?? 'Uma ' + parent.cardId)
        : 'Not recorded';
      const branch = Math.floor(positionId / 10);
      const role = positionId % 10 === 0 ? 'Parent ' + branch : 'Grandparent';

      return { positionId, parent, name, role };
    })
  );

  onMount(() => {
    void loadCharacters()
      .then((rows) => (characters = rows))
      .catch(() => {});
  });
</script>

<section
  class="lineage-section"
  aria-label="Parents and grandparents"
>
  <h3>Parents & grandparents</h3>
  {#if parents.length}
    <ul class="lineage">
      {#each lineage as { positionId, parent, name, role } (positionId)}
        <li
          class="tile"
          title={role + ': ' + name}
        >
          <span class="tile-art">
            <Artwork
              src={parent ? portrait(parent.cardId) : undefined}
              alt=""
              size="sm"
            />
          </span>
          <div class="tile-text">
            <span class="tile-name">{name}</span>
            <span class="tile-meta">{role}</span>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p>No inheritance setup was captured.</p>
  {/if}
</section>

<style>
  @import './runner-lineage.css';
</style>
