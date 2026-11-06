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

  let characters = $state.raw(new Map<number, CharacterData>());

  function characterName(cardId: number) {
    return characters.get(cardId)?.name ?? 'Uma ' + cardId;
  }

  /** Parents sit at 10 and 20; each one's own parents follow at 11, 12 and 21, 22. */
  function lineageEntry(positionId: number) {
    const parent = parents.find((entry) => entry.positionId === positionId);
    const branch = Math.floor(positionId / 10);
    const role =
      positionId % 10 === 0
        ? 'Parent ' + branch
        : 'Grandparent ' + (positionId % 10) + ' of parent ' + branch;

    return {
      portrait: parent ? portrait(parent.cardId) : undefined,
      label: role + ' - ' + (parent ? characterName(parent.cardId) : 'Not recorded')
    };
  }

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
  <h3>Parents</h3>
  {#if parents.length}
    <div class="lineage">
      {#each [1, 2] as branch}
        {@const directParent = lineageEntry(branch * 10)}
        <div
          class="branch"
          aria-label={'Parent ' + branch + ' lineage'}
        >
          <div class="grandparents">
            {#each [branch * 10 + 1, branch * 10 + 2] as position}
              {@const grandparent = lineageEntry(position)}
              <span
                class="grandparent"
                title={grandparent.label}
              >
                <Artwork
                  src={grandparent.portrait}
                  alt={grandparent.label}
                  size="xs"
                />
              </span>
            {/each}
          </div>
          <span
            class="parent"
            title={directParent.label}
          >
            <Artwork
              src={directParent.portrait}
              alt={directParent.label}
              size="sm"
            />
          </span>
        </div>
      {/each}
    </div>
  {:else}
    <p>No inheritance setup was captured.</p>
  {/if}
</section>

<style>
  @import './runner-lineage.css';
</style>
