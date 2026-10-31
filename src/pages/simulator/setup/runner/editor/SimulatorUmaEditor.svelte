<script lang="ts">
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import { runningStyleName } from '@/lib/race/replay/race-display';
  import { getRankInfoFromLabel } from '@/lib/rank';
  import { loadSkills } from '@/lib/game-data/skills/skills';
  import Artwork from '@/components/game/Artwork.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import CharacterSelectDialog from '@/components/pickers/CharacterSelectDialog.svelte';
  import {
    characterImagePath,
    loadCharacters,
    loadReleasedCharacters,
    type CharacterData
  } from '@/lib/game-data/characters';
  import type { RaceCourse } from '@/lib/game-data/racing/courses';
  import DialogStatus from '../../../shell/DialogStatus.svelte';
  import { selectedCourse } from '../../../simulator-session.svelte';
  import type { SimulatorUma } from '../../../simulator-uma';
  import { APTITUDE_GRADES } from '../../../requests/stamina-request';
  import { RUNNING_STYLES } from '../../trainee';
  import SimulatorTeamPicker from '../SimulatorTeamPicker.svelte';
  import RunnerSkills from './RunnerSkills.svelte';
  import {
    STAT_FIELDS,
    draftProblem,
    fansInvalid,
    gateInvalid,
    swapCharacterUnique
  } from './uma-draft';

  /**
   * One runner's whole build in one column, with the same fields as the Runner section of the setup forms: her
   * character and race entry, her stats, her style, mood and the three aptitudes this course reads, then her skills.
   * Choosing a character puts that card's unique skill in her list. Edits stay in a draft until saved.
   */
  let {
    uma,
    course,
    adding = false,
    open = $bindable(false),
    onsave
  }: {
    uma: SimulatorUma;
    /** The course the build is for, when it is not the setup's selected course. */
    course?: RaceCourse;
    /** A new runner for the field rather than changes to one already there. */
    adding?: boolean;
    open?: boolean;
    onsave: (uma: SimulatorUma) => void;
  } = $props();

  // The same options, in the same order, as the Runner section of the setup forms.
  const STYLE_OPTIONS = RUNNING_STYLES.map((value, index) => ({
    value,
    label: runningStyleName(index + 1)
  }));

  // Mood and grades with their in-game icons.
  const MOOD_OPTIONS = ['Great', 'Good', 'Normal', 'Bad', 'Awful'].map((label, index) => ({
    value: String(5 - index),
    label,
    image: '/game-assets/textures/' + label.toLowerCase() + '.webp'
  }));

  const GRADE_OPTIONS = APTITUDE_GRADES.map((grade) => ({
    value: grade,
    label: grade,
    image:
      '/game-assets/textures/uma_ranks/utx_ico_statusrank_' +
      String(getRankInfoFromLabel(grade).iconIndex).padStart(2, '0') +
      '.webp'
  }));

  const SURFACES = ['Turf', 'Dirt'];
  const DISTANCES = ['Sprint', 'Mile', 'Medium', 'Long'];
  const STYLE_APTITUDES = ['Front', 'Pace', 'Late', 'End'];

  /** Without a course, Medium and Turf stand in, as on the setup forms; a Runaway races on Front Runner. */
  const DEFAULT_DISTANCE = 3;
  const DEFAULT_SURFACE = 1;
  const RUNAWAY = 4;

  const uid = $props.id();

  let draft = $state<SimulatorUma>();
  let gate = $state(''),
    fans = $state('');

  let characterOpen = $state(false),
    characters = $state<CharacterData[]>([]),
    characterError = $state('');

  // Names and outfits for the character field, and the skills a unique must be among to be added.
  let characterLookup = $state.raw(new Map<number, CharacterData>()),
    skillIds = $state.raw(new Set<number>());
  /** Whether this draft has had its starting unique; only a new runner gets one on opening. */
  let uniqueGiven = false;

  const raceCourse = $derived(course ?? selectedCourse());
  const character = $derived(draft?.cardId ? characterLookup.get(draft.cardId) : undefined);

  const characterOptions = $derived(
    characters.map((character) => ({
      id: character.id,
      name: character.name,
      subtitle: character.subtitle,
      image: characterImagePath(Number(character.id)),
      rarity: character.rarity
    }))
  );

  // Her aptitudes for this course and style, each one entry of the trainee's full grid.
  const aptitudes = $derived.by(() => {
    const style = RUNNING_STYLES.indexOf(
      (draft?.trainee.runningStyle ?? '') as (typeof RUNNING_STYLES)[number]
    );

    const distance = (raceCourse?.distance_type ?? DEFAULT_DISTANCE) - 1;
    const surface = (raceCourse?.surface ?? DEFAULT_SURFACE) - 1;
    const styleIndex = style === RUNAWAY ? 0 : Math.max(0, style);

    // Each named for what it reads here, such as Sprint or Turf.
    return [
      {
        id: 'distance',
        label: DISTANCES[distance] ?? 'Distance',
        list: 'distanceAptitudes',
        index: distance
      },
      {
        id: 'surface',
        label: SURFACES[surface] ?? 'Surface',
        list: 'groundAptitudes',
        index: surface
      },
      {
        id: 'style',
        label: STYLE_APTITUDES[styleIndex] ?? 'Style',
        list: 'styleAptitudes',
        index: styleIndex
      }
    ] as const;
  });

  const problem = $derived(draft ? draftProblem(draft, { gate, fans }) : 'Loading…');

  $effect(() => {
    if (!open) {
      characterOpen = false;
      return;
    }

    draft = structuredClone($state.snapshot(uma));
    gate = uma.frameOrder ? String(uma.frameOrder) : '';
    fans = uma.fanCount === undefined ? '' : String(uma.fanCount);
    uniqueGiven = !adding;
  });

  // A new runner starts with a character, so she starts with that card's unique once the skill data is in.
  $effect(() => {
    if (uniqueGiven || !draft?.cardId || !skillIds.size) return;

    draft.skills = swapCharacterUnique({
      skills: draft.skills,
      nextCardId: draft.cardId,
      knownSkill: (skillId) => skillIds.has(skillId)
    });
    uniqueGiven = true;
  });

  $effect(() => {
    if (!open) return;

    let active = true;
    void loadCharacters()
      .then((value) => {
        if (active) characterLookup = value;
      })
      .catch(() => {
        // The field falls back to her name; the picker reports its own load errors.
      });

    void loadSkills()
      .then((value) => {
        if (active) skillIds = new Set(value.keys());
      })
      .catch(() => {
        // Without skill data no unique is added; the skill list says why.
      });

    return () => {
      active = false;
    };
  });

  async function chooseCharacter() {
    characterOpen = true;
    characterError = '';
    try {
      characters = await loadReleasedCharacters();
    } catch {
      characterError = 'Character data could not be loaded.';
    }
  }

  function selectCharacter(ids: string[]) {
    const chosen = characters.find((item) => item.id === ids[0]);
    characterOpen = false;
    if (!draft || !chosen) return;

    const nextCardId = Number(chosen.id);
    draft.skills = swapCharacterUnique({
      skills: draft.skills,
      previousCardId: draft.cardId,
      nextCardId,
      knownSkill: (skillId) => skillIds.has(skillId)
    });
    draft.cardId = nextCardId;
    draft.name = chosen.name;
  }

  function save() {
    if (!draft || problem) return;

    onsave({
      ...draft,
      frameOrder: gate ? Number(gate) : undefined,
      fanCount: fans ? Number(fans) : undefined
    });
    open = false;
  }
</script>

<Dialog
  bind:open
  title={adding ? 'Add Uma' : 'Edit Uma'}
  maxWidth="760px"
  maxHeight="92dvh"
  mobileMaxHeight="96dvh"
  compact
>
  {#if draft}
    {@const editing = draft}
    <div class="uma-editor">
      <!-- Who she is and where she starts; her team is the dot on her portrait, as on the race field. -->
      <div class="fields entry">
        <div class="character-field">
          <span
            class="field-label"
            id="{uid}-character-label"
          >
            Character
          </span>
          <button
            type="button"
            class="character"
            aria-labelledby="{uid}-character-label {uid}-character-name"
            onclick={chooseCharacter}
          >
            <span class="portrait">
              {#if editing.cardId}
                <Artwork
                  src={characterImagePath(editing.cardId)}
                  alt=""
                  size="sm"
                />
              {/if}
            </span>
            <span
              class="character-copy"
              id="{uid}-character-name"
            >
              <strong>
                {character?.name ?? (editing.cardId ? editing.name : 'Choose a character')}
              </strong>
              {#if character?.subtitle}
                <small>{character.subtitle}</small>
              {/if}
            </span>
            <Icon
              name="chevron"
              size={14}
            />
          </button>
          <span class="team-control">
            <SimulatorTeamPicker
              label="Team color"
              value={editing.teamId ?? 0}
              onchange={(id) => (editing.teamId = id)}
            />
          </span>
        </div>
        <TextField
          id="{uid}-name"
          label="Name"
          bind:value={editing.name}
        />
        <TextField
          id="{uid}-gate"
          label="Gate"
          type="number"
          min={1}
          max={18}
          placeholder="Auto"
          error={gateInvalid(gate) ? '1 to 18' : undefined}
          bind:value={gate}
        />
        <TextField
          id="{uid}-fans"
          label="Fans"
          type="number"
          min={0}
          max={4294967295}
          placeholder="Not set"
          error={fansInvalid(fans) ? 'Whole number' : undefined}
          bind:value={fans}
        />
      </div>

      <div class="fields stats">
        {#each STAT_FIELDS as stat (stat.key)}
          <TextField
            id="{uid}-{stat.key}"
            label={stat.label}
            type="number"
            min={1}
            max={3000}
            prefixImage="/assets/images/icon/stats/{stat.icon}.webp"
            bind:value={editing.trainee[stat.key]}
          />
        {/each}
      </div>

      <div class="fields">
        <SelectField
          id="{uid}-running-style"
          label="Running style"
          options={STYLE_OPTIONS}
          bind:value={editing.trainee.runningStyle}
        />
        <SelectField
          id="{uid}-motivation"
          label="Mood"
          options={MOOD_OPTIONS}
          bind:value={editing.trainee.motivation}
        />
        {#each aptitudes as aptitude (aptitude.id)}
          <SelectField
            id="{uid}-aptitude-{aptitude.id}"
            label="{aptitude.label} aptitude"
            imageOnly
            options={GRADE_OPTIONS}
            value={editing.trainee[aptitude.list][aptitude.index] ?? 'A'}
            onchange={(grade) => (editing.trainee[aptitude.list][aptitude.index] = grade)}
          />
        {/each}
      </div>

      <RunnerSkills
        idPrefix={uid}
        bind:skills={editing.skills}
      />
    </div>
  {/if}
  {#snippet actions()}
    <DialogStatus>
      {#if problem}
        <span class="blocked">{problem}</span>
      {:else if draft?.source === 'CM Data'}
        <strong>CM Data</strong>
        <span>
          Her aptitudes were captured for its CM course. Check them if you race elsewhere.
        </span>
      {:else}
        <span>{draft?.source ?? 'Manual build'}</span>
      {/if}
    </DialogStatus>
    <Button
      variant="secondary"
      onclick={() => (open = false)}
    >
      Cancel
    </Button>
    <Button
      icon={adding ? 'add' : 'check'}
      disabled={Boolean(problem)}
      onclick={save}
    >
      Save Uma
    </Button>
  {/snippet}
</Dialog>
<CharacterSelectDialog
  bind:open={characterOpen}
  options={characterOptions}
  error={characterError}
  onretry={chooseCharacter}
  selected={draft?.cardId ? [String(draft.cardId)] : []}
  onselect={selectCharacter}
/>

<style>
  @import './uma-editor.css';
</style>
