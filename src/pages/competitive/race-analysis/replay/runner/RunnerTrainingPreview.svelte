<script lang="ts">
  import { onMount } from 'svelte';
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import { normalizeVeteranRecord } from '@/lib/veterans/records/veteran-normalizer';
  import { veteranSupportCards } from '@/lib/veterans/records/veteran-profile';
  import { loadCharacters, type CharacterData } from '@/lib/game-data/characters';
  import Artwork from '@/components/game/Artwork.svelte';
  import { portrait } from '../../../analysis-view';
  import RunnerSupportDeck from '../../../runners/RunnerSupportDeck.svelte';

  let { runner }: { runner: RaceRunner } = $props();

  let characters = $state.raw(new Map<number, CharacterData>());
  const deck = $derived(
    veteranSupportCards(runner.raw).map((card) => ({
      id: card.support_card_id,
      lb: card.limit_break_count ?? 0
    }))
  );
  const parents = $derived.by(() => {
    try {
      return normalizeVeteranRecord(runner.raw).parents;
    } catch {
      return [];
    }
  });

  onMount(() => {
    void loadCharacters()
      .then((value) => (characters = value))
      .catch(() => {});
  });
</script>

<div class="training-preview">
  <RunnerSupportDeck
    {deck}
    compact
  />
  <section
    class="lineage-preview"
    aria-label="Parents and grandparents"
  >
    <h3>Parents</h3>
    {#if parents.length}
      <div class="lineage">
        {#each [1, 2] as branch}
          {@const directParent = parents.find((parent) => parent.positionId === branch * 10)}
          {@const parentName = directParent
            ? (characters.get(directParent.cardId)?.name ?? 'Uma ' + directParent.cardId)
            : 'Not recorded'}
          <div
            class="branch"
            aria-label={'Parent ' + branch + ' lineage'}
          >
            <div class="grandparents">
              {#each [branch * 10 + 1, branch * 10 + 2] as position}
                {@const parent = parents.find((parent) => parent.positionId === position)}
                {@const name = parent
                  ? (characters.get(parent.cardId)?.name ?? 'Uma ' + parent.cardId)
                  : 'Not recorded'}
                <span
                  class="grandparent"
                  title={'Grandparent ' + (position % 10) + ' of parent ' + branch + ' - ' + name}
                >
                  <Artwork
                    src={parent ? portrait(parent.cardId) : undefined}
                    alt={'Grandparent ' + (position % 10) + ' of parent ' + branch + ' - ' + name}
                    size="xs"
                  />
                </span>
              {/each}
            </div>
            <span
              class="parent"
              title={'Parent ' + branch + ' - ' + parentName}
            >
              <Artwork
                src={directParent ? portrait(directParent.cardId) : undefined}
                alt={'Parent ' + branch + ' - ' + parentName}
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
</div>

<style>
  @import './runner-training-preview.css';
</style>
