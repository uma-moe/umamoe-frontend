<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import CharacterSelectDialog from '@/components/pickers/CharacterSelectDialog.svelte';
  import {
    characterImagePath,
    loadReleasedCharacters,
    type CharacterData
  } from '@/lib/game-data/characters';
  import { loadSkills } from '@/lib/game-data/skills/skills';
  import SimulatorRunnerFace from '../../reports/SimulatorRunnerFace.svelte';
  import type { SimulatorUma } from '../../simulator-uma';
  import { swapCharacterUnique } from './editor/uma-draft';

  /** Picking a card sets her name and swaps the old card's unique for the new one. */
  interface Props {
    uma: SimulatorUma;
    onchange?: () => void;
  }

  let { uma, onchange }: Props = $props();

  let open = $state(false),
    error = $state(''),
    characters = $state<CharacterData[]>([]);

  let skillIds = $state.raw(new Set<number>());

  const options = $derived(
    characters.map((character) => ({
      id: character.id,
      name: character.name,
      subtitle: character.subtitle,
      image: characterImagePath(Number(character.id)),
      rarity: character.rarity
    }))
  );

  async function choose() {
    open = true;
    error = '';
    try {
      characters = await loadReleasedCharacters();
    } catch {
      error = 'Character data could not be loaded.';
    }
  }

  async function select(ids: string[]) {
    const chosen = characters.find((item) => item.id === ids[0]);
    open = false;
    if (!chosen) return;

    let known = skillIds;
    if (!known.size) {
      try {
        known = new Set((await loadSkills()).keys());
        skillIds = known;
      } catch {
        // Without skill data her new unique is left out; the rest of her skills stay.
      }
    }

    const nextCardId = Number(chosen.id);
    uma.skills = swapCharacterUnique({
      skills: uma.skills,
      previousCardId: uma.cardId,
      nextCardId,
      knownSkill: (skillId) => known.has(skillId)
    });
    uma.cardId = nextCardId;
    uma.name = chosen.name;
    onchange?.();
  }
</script>

<button
  type="button"
  class="uma-picker"
  aria-label={uma.cardId ? 'Change Uma' : 'Pick an Uma'}
  onclick={choose}
>
  {#if uma.cardId}
    <SimulatorRunnerFace
      cardId={uma.cardId}
      size={24}
    />
    <span class="picker-name">{uma.name}</span>
  {:else}
    <Icon
      name="user"
      size={14}
    />
    <span class="picker-name">Pick Uma</span>
  {/if}
  <Icon
    name="chevron"
    size={12}
  />
</button>
<CharacterSelectDialog
  bind:open
  {options}
  {error}
  selected={uma.cardId ? [String(uma.cardId)] : []}
  onselect={select}
/>

<style>
  .uma-picker {
    height: var(--control-height, 36px);
    max-width: 100%;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    border: 1px solid var(--factor-field-border);
    border-radius: var(--radius-sm);
    background: var(--factor-field-bg);
    color: var(--color-text);
    font-family: inherit;
    font-size: 11px;
    font-weight: 650;
    cursor: pointer;
  }
  .uma-picker:hover {
    border-color: var(--border-secondary);
  }
  .uma-picker:focus-visible {
    outline: 0;
    box-shadow: var(--focus-ring);
  }
  .picker-name {
    min-width: 0;
    flex: 0 1 auto;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
