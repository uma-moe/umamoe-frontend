<script lang="ts">
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import CharacterSelectDialog from '@/components/pickers/CharacterSelectDialog.svelte';
  import {
    characterImagePath,
    loadReleasedCharacterCatalog,
    type CharacterCatalogEntry
  } from '@/lib/catalog/character-catalog';
  import TraineeInput from './TraineeInput.svelte';
  import RunnerSkills from './RunnerSkills.svelte';
  import SimulatorTeamPicker from './SimulatorTeamPicker.svelte';
  import type { SimulatorUma } from '../simulator-uma';

  let {
    uma,
    open = $bindable(false),
    onsave
  }: {
    uma: SimulatorUma;
    open?: boolean;
    onsave: (uma: SimulatorUma) => void;
  } = $props();

  let draft = $state<SimulatorUma>();
  let gate = $state(''),
    fans = $state('');
  let characterOpen = $state(false),
    characters = $state<CharacterCatalogEntry[]>([]),
    characterError = $state('');

  const uid = $props.id();

  const options = $derived(
    characters.map((character) => ({
      id: character.id,
      name: character.name,
      subtitle: character.subtitle,
      image: characterImagePath(Number(character.id)),
      rarity: character.rarity
    }))
  );
  const invalid = $derived(
    !draft ||
      !draft.name.trim() ||
      [
        draft.trainee.speed,
        draft.trainee.stamina,
        draft.trainee.power,
        draft.trainee.guts,
        draft.trainee.wisdom
      ].some(
        (value) => !/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > 3000
      ) ||
      (gate !== '' && (!/^\d+$/.test(gate) || Number(gate) < 1 || Number(gate) > 18)) ||
      (fans !== '' && (!/^\d+$/.test(fans) || Number(fans) > 4294967295)) ||
      (draft.teamId !== undefined &&
        (!Number.isInteger(draft.teamId) || draft.teamId < 0 || draft.teamId > 255))
  );

  $effect(() => {
    if (!open) {
      characterOpen = false;
      return;
    }
    draft = structuredClone($state.snapshot(uma));
    gate = uma.frameOrder ? String(uma.frameOrder) : '';
    fans = uma.fanCount === undefined ? '' : String(uma.fanCount);
  });

  async function chooseCharacter() {
    characterOpen = true;
    characterError = '';
    try {
      characters = await loadReleasedCharacterCatalog();
    } catch {
      characterError = 'Character data could not be loaded.';
    }
  }
</script>

<Dialog
  bind:open
  title="Edit Uma"
  maxWidth="760px"
  maxHeight="90dvh"
  mobileMaxHeight="94dvh"
>
  {#if draft}
    <div class="editor">
      <div class="identity">
        <button
          class="portrait"
          aria-label="Choose character"
          onclick={chooseCharacter}
        >
          <Artwork
            src={draft.cardId ? characterImagePath(draft.cardId) : undefined}
            alt={draft.name}
            size="lg"
            shape="portrait"
          />
          <span>Change</span>
        </button>
        <div class="identity-fields">
          <TextField
            id="{uid}-name"
            label="Name"
            bind:value={draft.name}
          />
          <span>
            {draft.source ?? 'Manual build'}{#if !draft.cardId}
              <span class="character-status">Choose a character from the portrait</span>
            {/if}
          </span>
        </div>
      </div>
      <TraineeInput bind:trainee={draft.trainee} />
      <RunnerSkills
        idPrefix={uid}
        bind:skills={draft.skills}
      />
      <details class="advanced">
        <summary>Gate, team and fans</summary>
        <div>
          <TextField
            id="{uid}-gate"
            label="Starting gate"
            type="number"
            min={1}
            max={18}
            placeholder="Automatic"
            bind:value={gate}
          />
          <div class="team-field">
            <span>Team color</span>
            <SimulatorTeamPicker
              label="Team color"
              value={draft.teamId ?? 0}
              onchange={(id) => {
                if (draft) draft.teamId = id;
              }}
            />
          </div>
          <TextField
            id="{uid}-fans"
            label="Fans"
            type="number"
            min={0}
            max={4294967295}
            placeholder="Not set"
            bind:value={fans}
          />
        </div>
      </details>
      {#if draft.source === 'CM Data'}
        <p class="hint">
          The captured build records aptitudes for its CM course. Check them when changing the
          course.
        </p>
      {/if}
      {#if invalid}
        <p class="hint">
          Enter a name and stats from 1 to 3,000. Check the gate, team and fan values.
        </p>
      {/if}
    </div>
  {/if}
  {#snippet actions()}
    <Button
      variant="secondary"
      onclick={() => (open = false)}
    >
      Cancel
    </Button>
    <Button
      disabled={invalid}
      onclick={() => {
        if (draft && !invalid) {
          onsave({
            ...draft,
            frameOrder: gate ? Number(gate) : undefined,
            fanCount: fans ? Number(fans) : undefined
          });
          open = false;
        }
      }}
    >
      Save Uma
    </Button>
  {/snippet}
</Dialog>
<CharacterSelectDialog
  bind:open={characterOpen}
  {options}
  error={characterError}
  onretry={chooseCharacter}
  selected={draft?.cardId ? [String(draft.cardId)] : []}
  onselect={(ids) => {
    const character = characters.find((item) => item.id === ids[0]);
    if (draft && character) {
      draft.cardId = Number(character.id);
      draft.name = character.name;
    }
    characterOpen = false;
  }}
/>

<style>
  .team-field {
    display: grid;
    gap: 6px;
    align-content: start;
  }
  .team-field > span {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
  }
  .advanced {
    font-size: 12px;
  }
  .advanced summary {
    cursor: pointer;
    color: var(--accent-primary);
  }
  .advanced > div {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
    margin-top: 12px;
  }
  .editor {
    display: grid;
    gap: 18px;
    min-width: 0;
  }
  .identity {
    display: flex;
    gap: 20px;
    align-items: center;
    padding: 4px 0 16px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .identity-fields {
    display: grid;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }
  .identity-fields > span {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    font-size: 11px;
    color: var(--accent-secondary);
  }
  .character-status {
    color: var(--text-secondary);
  }
  .identity :global(.field) {
    min-width: 0;
  }
  .identity :global(input) {
    font-size: 16px;
    font-weight: 600;
  }
  .portrait {
    display: grid;
    gap: 3px;
    place-items: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent-primary);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .portrait :global(.art) {
    width: 90px;
    height: 110px;
    border: 0;
    background: transparent;
  }
  .portrait :global(.art img) {
    object-fit: contain;
    object-position: center bottom;
  }
  .portrait:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 4px;
  }
  .hint {
    margin: 0;
    font-size: 11px;
    color: var(--text-secondary);
  }
  @media (max-width: 500px) {
    .identity {
      gap: 14px;
    }
    .portrait :global(.art) {
      width: 72px;
      height: 94px;
    }
    .identity-fields > span {
      gap: 4px;
    }
    .character-status {
      flex-basis: 100%;
      font-size: 10px;
    }
  }
</style>
