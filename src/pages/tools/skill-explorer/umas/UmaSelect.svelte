<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import CharacterSelectDialog from '@/components/pickers/CharacterSelectDialog.svelte';
  import type { CharacterPickerOption } from '@/components/pickers/picker-types';
  import { characterImagePath } from '@/lib/game-data/characters';
  import type { ExplorerUma, UmaRelease } from './uma-skills';

  interface Props {
    umas: ExplorerUma[];
    /** The picked card, or none for every skill. */
    cardId: number | undefined;
  }

  let { umas, cardId = $bindable() }: Props = $props();

  const id = $props.id();
  let open = $state(false);

  const monthFormat = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });

  const selected = $derived(umas.find((uma) => uma.cardId === cardId));
  const options = $derived<CharacterPickerOption[]>(
    umas.map((uma) => ({
      id: String(uma.cardId),
      name: uma.name,
      subtitle: subtitleOf(uma),
      image: characterImagePath(uma.cardId)
    }))
  );

  function releaseLabel(release: UmaRelease): string | undefined {
    switch (release.kind) {
      case 'released':
        return undefined;
      case 'upcoming':
        return `Upcoming ${release.estimated ? '~' : ''}${monthFormat.format(release.date)}`;
      case 'jp':
        return 'JP only';
      default: {
        const unknownRelease: never = release;
        throw new Error(`Unknown uma release ${JSON.stringify(unknownRelease)}`);
      }
    }
  }

  /** Her outfit, and when she comes to Global if she is not out yet. */
  function subtitleOf(uma: ExplorerUma): string {
    return [uma.outfit, releaseLabel(uma.release)].filter(Boolean).join(' · ');
  }

  function select(ids: string[]) {
    open = false;

    const [picked] = ids;
    cardId = picked === undefined ? undefined : Number(picked);
  }
</script>

<div class="uma-select">
  <span
    class="label"
    id="{id}-label"
  >
    Uma
  </span>
  <div class="control">
    <button
      type="button"
      class="uma"
      aria-labelledby="{id}-label {id}-value"
      title={selected ? `${selected.name} · ${subtitleOf(selected)}` : undefined}
      disabled={umas.length === 0}
      onclick={() => (open = true)}
    >
      <span class="portrait">
        {#if selected}
          <Artwork
            src={characterImagePath(selected.cardId)}
            alt=""
            size="xs"
            shape="circle"
          />
        {:else}
          <Icon
            name="user"
            size={16}
          />
        {/if}
      </span>
      <span
        class="copy"
        id="{id}-value"
      >
        {#if selected}
          <strong>{selected.name}</strong>
          <small>{subtitleOf(selected)}</small>
        {:else}
          Any uma
        {/if}
      </span>
      <Icon
        name="chevron"
        size={14}
      />
    </button>
    {#if selected}
      <button
        type="button"
        class="clear"
        aria-label="Show every uma's skills"
        onclick={() => (cardId = undefined)}
      >
        <Icon
          name="close"
          size={16}
        />
      </button>
    {/if}
  </div>
</div>

<CharacterSelectDialog
  bind:open
  label="Select uma"
  {options}
  selected={cardId === undefined ? [] : [String(cardId)]}
  onselect={select}
/>

<style>
  @import './uma-select.css';
</style>
