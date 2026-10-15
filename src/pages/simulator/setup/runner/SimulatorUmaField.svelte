<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import SimulatorTeamPicker from './SimulatorTeamPicker.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import SkillChip from '@/components/game/SkillChip.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import {
    loadCharacterCatalog,
    type CharacterCatalogEntry
  } from '@/lib/catalog/character-catalog';
  import {
    loadSkillCatalog,
    resolveEncodedSkill,
    skillPointTotal,
    skillImage,
    skillRarity,
    type SkillCatalogEntry
  } from '@/lib/catalog/skill-catalog';
  import RunnerLineupRow from '@/pages/competitive/runners/RunnerLineupRow.svelte';
  import { styleColors, stats } from '@/pages/competitive/analysis-view';
  import SimulatorUmaEditor from './SimulatorUmaEditor.svelte';
  import SimulatorVeteranPicker from '../veterans/SimulatorVeteranPicker.svelte';
  import SimSection from '../../shell/SimSection.svelte';
  import { simulatorUmaSummary, type SimulatorUma } from '../../simulator-uma';
  import {
    simulatorRoster,
    createRosterUma,
    ensureSimulatorRoster,
    importSimulatorUmas,
    simulatorTeamLabel
  } from '../../simulator-roster.svelte';
  import { selectedCourse } from '../../simulator-session.svelte';

  let {
    number = 3,
    actions: extraActions
  }: {
    /** Its place among the form's numbered sections. */
    number?: number;
    actions?: Snippet;
  } = $props();

  let editing = $state<SimulatorUma>(),
    editorOpen = $state(false),
    veteransOpen = $state(false),
    error = $state('');

  const course = $derived(selectedCourse());

  let skills = $state.raw(new Map<number, SkillCatalogEntry>());
  let characters = $state.raw(new Map<number, CharacterCatalogEntry>());
  let visibleSkills = $state<Record<string, number>>({});

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

  function fitSkills(
    node: HTMLElement,
    params: { id: string; skills: { encoded: number; cost: number }[] }
  ) {
    let id = params.id;
    const measure = () => {
      const bounds = node.getBoundingClientRect();
      let count = 0;
      for (const child of node.children) {
        const box = child.getBoundingClientRect(),
          shown = box.bottom <= bounds.bottom + 0.5 && box.right <= bounds.right + 0.5;
        child.setAttribute('aria-hidden', String(!shown));
        if (shown && child.classList.contains('skill-item')) count++;
      }
      if (visibleSkills[id] !== count) visibleSkills[id] = count;
    };
    const observer = new ResizeObserver(measure);
    const observe = () => {
      observer.disconnect();
      observer.observe(node);
      for (const child of node.children) observer.observe(child);
    };
    observe();
    return {
      update(next: typeof params) {
        id = next.id;
        observe();
      },
      destroy() {
        observer.disconnect();
      }
    };
  }

  onMount(() => {
    let active = true;
    void loadSkillCatalog()
      .then((value) => {
        if (active) skills = value;
      })
      .catch(() => {});
    void loadCharacterCatalog()
      .then((value) => {
        if (active) characters = value;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  });

  async function edit(uma: SimulatorUma) {
    await ensureSimulatorRoster().catch(() => {});
    editing = uma;
    editorOpen = true;
  }

  async function add() {
    await ensureSimulatorRoster().catch(() => {});
    editing = createRosterUma('Uma ' + (simulatorRoster.umas.length + 1));
    editorOpen = true;
  }

  function remove(uma: SimulatorUma) {
    if (simulatorRoster.umas.length <= 2) return;
    simulatorRoster.umas = simulatorRoster.umas.filter((item) => item.id !== uma.id);
    simulatorRoster.configured = true;
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
      error = (reason as Error).message;
    }
  }
</script>

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
      onclick={add}
    >
      Add Uma
    </Button><Button
      variant="secondary"
      size="sm"
      icon="veterans"
      disabled={simulatorRoster.umas.length >= 18}
      onclick={() => (veteransOpen = true)}
    >
      Choose from Veterans
    </Button>{@render extraActions?.()}
  {/snippet}
  <div class="field">
    <div
      class="column-headings"
      aria-hidden="true"
    >
      <span>
        Runner <small>select to edit</small>
      </span>
      <span>Build stats</span>
      <span>Learned skills</span>
      <span class="action-headings">
        <span>Team</span>
        <span>Actions</span>
      </span>
    </div>
    <div class="runners">
      {#each simulatorRoster.umas as uma, index (uma.id)}
        {@const summary = simulatorUmaSummary(uma, index, course)}
        {@const encodedSkills = uma.skills.map((skill) => skill.skillId * 10 + (skill.level ?? 1))}
        {@const preview = rankSkills(encodedSkills)}
        {@const sp = skillPointTotal(skills, encodedSkills)}
        {@const outfit = characters.get(uma.cardId ?? 0)?.subtitle}
        <article
          class="runner"
          data-uma-id={uma.id}
          title={simulatorTeamLabel(uma.teamId)}
        >
          <button
            class="summary"
            aria-label={'Edit ' + uma.name}
            title={outfit}
            onclick={() => edit(uma)}
          >
            <RunnerLineupRow
              runner={summary}
              {outfit}
              color={styleColors[Number(summary.raw.runningStyle)]}
              showStats={false}
            />
          </button>
          <div class="build-stats">
            <StatStrip
              items={[
                ...stats(summary),
                { id: 'sp', label: 'SP', value: sp?.toLocaleString() ?? '—' }
              ]}
              presentation="values"
              compact
              label={uma.name + ' build stats'}
            />
          </div>
          <div class="skill-summary">
            <div
              class="skill-preview preview-skills"
              use:fitSkills={{ id: uma.id, skills: preview }}
            >
              {#each preview as item (item.encoded)}
                {@const resolved = resolveEncodedSkill(skills, item.encoded)}
                <span
                  class="skill-item"
                  data-sp={item.cost}
                  data-owned-unique={item.unique}
                >
                  <SkillChip
                    name={resolved.skill?.name ?? 'Skill ' + Math.floor(item.encoded / 10)}
                    icon={skillImage(resolved.skill?.icon)}
                    rarity={skillRarity(resolved.skill, resolved.inherited)}
                    level={item.unique ? 'Lv ' + resolved.level : undefined}
                    compact
                  />
                </span>
              {:else}
                <span class="no-skills">No skills added</span>
              {/each}
            </div>
            <InspectPopover
              label={'Skills for ' + uma.name}
              align="end"
            >
              {#snippet trigger()}
                <span class="more-skills">
                  {uma.skills.length > (visibleSkills[uma.id] ?? 0)
                    ? '+' + (uma.skills.length - (visibleSkills[uma.id] ?? 0)) + ' more'
                    : 'Skills'}<Icon
                    name="chevron"
                    size={12}
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
              {#if preview.length}
                <ul class="all-skills">
                  {#each preview as item}
                    {@const resolved = resolveEncodedSkill(skills, item.encoded)}
                    <li class:owned-unique={item.unique}>
                      <SkillChip
                        name={resolved.skill?.name ?? 'Skill ' + Math.floor(item.encoded / 10)}
                        icon={skillImage(resolved.skill?.icon)}
                        rarity={skillRarity(resolved.skill, resolved.inherited)}
                        level={item.unique || resolved.level > 1
                          ? 'Lv ' + resolved.level
                          : undefined}
                        compact
                      />
                      <span class="skill-cost">
                        {item.unique
                          ? 'Own unique'
                          : item.cost >= 0
                            ? item.cost.toLocaleString() + ' SP'
                            : '—'}
                      </span>
                    </li>
                  {/each}
                </ul>
                <p class="skill-list-note">
                  Own unique first · remaining skills by base SP cost, before hint discounts.
                </p>
              {:else}
                <p class="empty-skills">No skills added yet.</p>
              {/if}
            </InspectPopover>
          </div>
          <div class="row-actions">
            <div class="team-control">
              <SimulatorTeamPicker
                value={uma.teamId ?? 0}
                label={'Assign team for ' + uma.name}
                onchange={(id) => {
                  uma.teamId = id;
                  simulatorRoster.configured = true;
                }}
              />
            </div>
            <div
              class="row-buttons"
              role="group"
              aria-label={'Actions for ' + uma.name}
            >
              <span title="Edit build">
                <Button
                  variant="secondary"
                  size="sm"
                  icon="edit"
                  ariaLabel={'Edit build for ' + uma.name}
                  onclick={() => edit(uma)}
                />
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
/>
{#if editing}
  <SimulatorUmaEditor
    uma={editing}
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
