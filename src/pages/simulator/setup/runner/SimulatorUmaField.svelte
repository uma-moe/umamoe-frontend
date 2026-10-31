<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import Menu, { type MenuItem } from '@/components/navigation/Menu.svelte';
  import SimulatorTeamPicker from './SimulatorTeamPicker.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import SkillChip from '@/components/game/SkillChip.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import { loadCharacters, type CharacterData } from '@/lib/game-data/characters';
  import {
    loadSkills,
    resolveEncodedSkill,
    skillPointTotal,
    skillImage,
    skillRarity,
    type SkillData
  } from '@/lib/game-data/skills/skills';
  import { identity, stats, styleColors } from '@/pages/competitive/analysis-view';
  import SimulatorUmaEditor from './editor/SimulatorUmaEditor.svelte';
  import SimulatorVeteranPicker from '../veterans/SimulatorVeteranPicker.svelte';
  import SimSection from '../../shell/SimSection.svelte';
  import { simulatorUmaSummary, type SimulatorUma } from '../../simulator-uma';
  import {
    simulatorRoster,
    clearSimulatorField,
    createRosterUma,
    ensureSimulatorRoster,
    importSimulatorUmas
  } from '../../simulator-roster.svelte';
  import { selectedCourse, simulatorSession } from '../../simulator-session.svelte';
  import SkillPoints, { LEARNED_SKILL_POINTS_NOTE } from '@/components/game/SkillPoints.svelte';

  let {
    number = 3,
    imports = [],
    onimport,
    actions: extraActions
  }: {
    /** Its place among the form's numbered sections. */
    number?: number;
    /** The page's own ways to fill the field, listed in the Import menu after Veterans. */
    imports?: MenuItem[];
    onimport?: (id: string) => void;
    actions?: Snippet;
  } = $props();

  let editing = $state<SimulatorUma>(),
    adding = $state(false),
    editorOpen = $state(false),
    veteransOpen = $state(false),
    error = $state('');

  const course = $derived(selectedCourse());

  let skills = $state.raw(new Map<number, SkillData>());
  let characters = $state.raw(new Map<number, CharacterData>());

  /** Own unique first, then by base SP cost: the order the skill list shows. */
  function rankSkills(ids: number[]) {
    return ids
      .map((encoded) => {
        const { skill, inherited } = resolveEncodedSkill(skills, encoded);
        return {
          encoded,
          unique: skillRarity(skill, inherited) === 'unique-main',
          cost: skillPointTotal(skills, [encoded]) ?? -1
        };
      })
      .sort(
        (a, b) => Number(b.unique) - Number(a.unique) || b.cost - a.cost || a.encoded - b.encoded
      );
  }

  onMount(() => {
    let active = true;
    void loadSkills()
      .then((value) => {
        if (active) skills = value;
      })
      .catch((reason: unknown) => {
        if (active)
          error = reason instanceof Error ? reason.message : 'Skill data could not be loaded.';
      });

    void loadCharacters()
      .then((value) => {
        if (active) characters = value;
      })
      .catch((reason: unknown) => {
        if (active)
          error = reason instanceof Error ? reason.message : 'Character data could not be loaded.';
      });

    return () => {
      active = false;
    };
  });

  async function edit(uma?: SimulatorUma) {
    try {
      await ensureSimulatorRoster();
    } catch (reason) {
      error =
        reason instanceof Error
          ? reason.message
          : 'Character data could not be loaded. You can still edit this runner manually.';
    }

    adding = !uma;
    editing = uma ?? createRosterUma('Uma ' + (simulatorRoster.umas.length + 1));
    editorOpen = true;
  }

  function remove(uma: SimulatorUma) {
    if (simulatorRoster.umas.length <= 2) return;
    simulatorRoster.umas = simulatorRoster.umas.filter((item) => item.id !== uma.id);
    simulatorRoster.configured = true;
  }

  /** Empties the field, rather than the two runners a race needs; the page says what to do next. */
  function clearField() {
    if (!window.confirm('Remove all ' + simulatorRoster.umas.length + ' runners?')) return;

    clearSimulatorField();
    simulatorSession.umaId = '';
  }

  function duplicate(uma: SimulatorUma) {
    if (simulatorRoster.umas.length >= 18) return;
    const copy = structuredClone($state.snapshot(uma));
    copy.id = crypto.randomUUID();
    copy.name += ' copy';
    copy.frameOrder = undefined;
    simulatorRoster.umas.push(copy);
    simulatorRoster.configured = true;
  }

  function addVeterans(umas: SimulatorUma[]) {
    try {
      importSimulatorUmas(umas);
      error = '';
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Could not add these runners.';
    }
  }
</script>

{#snippet skillList(uma: SimulatorUma, ranked: ReturnType<typeof rankSkills>)}
  <span class="skill-summary">
    <InspectPopover
      label={'Skills for ' + uma.name}
      align="end"
    >
      {#snippet trigger()}
        <span class="skill-count">
          {uma.skills.length === 1 ? '1 skill' : uma.skills.length + ' skills'}<Icon
            name="chevron"
            size={11}
          />
        </span>
      {/snippet}
      <div class="skill-list-heading">
        <div>
          <strong>
            Learned skills <span>{uma.skills.length}</span>
          </strong>
          <small>{uma.name}</small>
        </div>
        <span title="Edit build and skills">
          <Button
            variant="secondary"
            size="sm"
            icon="edit"
            ariaLabel={'Edit skills for ' + uma.name}
            onclick={() => edit(uma)}
          />
        </span>
      </div>
      {#if ranked.length}
        <ul class="all-skills">
          {#each ranked as item}
            {@const resolved = resolveEncodedSkill(skills, item.encoded)}
            <li
              class:owned-unique={item.unique}
              data-sp={item.cost}
            >
              <SkillChip
                name={resolved.skill?.name ?? 'Skill ' + Math.floor(item.encoded / 10)}
                icon={skillImage(resolved.skill?.icon)}
                rarity={skillRarity(resolved.skill, resolved.inherited)}
                level={item.unique || resolved.level > 1 ? 'Lv ' + resolved.level : undefined}
                compact
                fill
              />
              <span class="skill-cost">
                {#if item.unique}
                  Own unique
                {:else}
                  <SkillPoints value={item.cost >= 0 ? item.cost : null} />
                {/if}
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="empty-skills">No skills added yet.</p>
      {/if}
    </InspectPopover>
  </span>
{/snippet}

<SimSection
  {number}
  title="Race field"
  note={simulatorRoster.umas.length + ' of 18 runners'}
>
  {#snippet actions()}
    <Button
      variant="secondary"
      size="sm"
      icon="add"
      ariaLabel="Add Uma"
      disabled={simulatorRoster.umas.length >= 18}
      onclick={() => edit()}
    >
      Add Uma
    </Button>
    <Menu
      label="Import"
      menuLabel="Import runners"
      icon="upload"
      items={[
        {
          id: 'veterans',
          label: 'Choose from Veterans',
          icon: 'veterans',
          disabled: simulatorRoster.umas.length >= 18
        },
        ...imports
      ]}
      onselect={(id) => (id === 'veterans' ? (veteransOpen = true) : onimport?.(id))}
    />

    {@render extraActions?.()}
    <Button
      variant="ghost"
      size="sm"
      icon="close"
      ariaLabel="Clear field"
      disabled={!simulatorRoster.umas.length}
      onclick={clearField}
    >
      Clear field
    </Button>
  {/snippet}
  <div class="field">
    {#if !simulatorRoster.umas.length}
      <p class="empty-field">The field is empty. Add Uma, or import a field to race.</p>
    {/if}
    <div class="runners">
      {#each simulatorRoster.umas as uma, index (uma.id)}
        {@const summary = simulatorUmaSummary(uma, index, course)}
        {@const look = identity(summary)}
        {@const encodedSkills = uma.skills.map((skill) => skill.skillId * 10 + (skill.level ?? 1))}
        {@const ranked = rankSkills(encodedSkills)}
        {@const sp = skillPointTotal(skills, encodedSkills)}
        {@const outfit = characters.get(uma.cardId ?? 0)?.subtitle}
        <article
          class="runner"
          data-uma-id={uma.id}
          aria-label={uma.name}
        >
          <Artwork
            src={look.image}
            alt=""
            size="sm"
          />
          <div class="identity">
            <h3 title={uma.name}>{uma.name}</h3>
            <p class="build">
              {#if outfit}
                <span
                  class="outfit"
                  title={outfit}
                >
                  {outfit}
                </span>
              {/if}
              <span style:color={styleColors[Number(summary.raw.runningStyle)]}>{look.detail}</span>
            </p>
          </div>
          <!-- Her team, as a dot on her portrait's corner; it opens the team colors. -->
          <span class="team-control">
            <SimulatorTeamPicker
              value={uma.teamId ?? 0}
              label={'Assign team for ' + uma.name}
              onchange={(id) => {
                uma.teamId = id;
                simulatorRoster.configured = true;
              }}
            />
          </span>
          <!-- Everything else she can do, in one group of matching buttons. -->
          <div
            class="row-tools"
            role="group"
            aria-label={'Actions for ' + uma.name}
          >
            <span
              class="edit-control"
              title="Edit build"
            >
              <Button
                variant="secondary"
                size="sm"
                icon="edit"
                ariaLabel={'Edit ' + uma.name}
                onclick={() => edit(uma)}
              >
                Edit
              </Button>
            </span>
            <span
              title={simulatorRoster.umas.length >= 18 ? 'The race field is full' : 'Copy runner'}
            >
              <Button
                variant="secondary"
                size="sm"
                icon="copy"
                ariaLabel={'Copy ' + uma.name}
                disabled={simulatorRoster.umas.length >= 18}
                onclick={() => duplicate(uma)}
              />
            </span>
            <span
              class="delete-control"
              title={simulatorRoster.umas.length <= 2
                ? 'Keep at least two runners'
                : 'Delete runner'}
            >
              <Button
                variant="secondary"
                size="sm"
                icon="trash"
                ariaLabel={'Delete ' + uma.name}
                disabled={simulatorRoster.umas.length <= 2}
                onclick={() => remove(uma)}
              />
            </span>
          </div>
          <div class="stats">
            <StatStrip
              items={stats(summary)}
              presentation="values"
              compact
              label={uma.name + ' build stats'}
            />
          </div>
          <div class="runner-meta">
            <SkillPoints
              value={sp}
              note={LEARNED_SKILL_POINTS_NOTE}
            />
            {@render skillList(uma, ranked)}
          </div>
        </article>
      {/each}
    </div>
    {#if error}
      <p role="alert">{error}</p>
    {/if}
  </div>
</SimSection>
<SimulatorVeteranPicker
  bind:open={veteransOpen}
  onselectMany={addVeterans}
  room={simulatorRoster.configured ? 18 - simulatorRoster.umas.length : 18}
  placed={simulatorRoster.configured ? simulatorRoster.umas : []}
/>
{#if editing}
  <SimulatorUmaEditor
    uma={editing}
    {adding}
    bind:open={editorOpen}
    onsave={(uma) => {
      if (simulatorRoster.umas.some((item) => item.id === uma.id))
        simulatorRoster.umas = simulatorRoster.umas.map((item) =>
          item.id === uma.id ? uma : item
        );
      else if (simulatorRoster.umas.length < 18) simulatorRoster.umas.push(uma);
      simulatorRoster.configured = true;
    }}
  />
{/if}

<style>
  @import './simulator-uma-field.css';
</style>
