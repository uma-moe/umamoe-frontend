<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Combobox from '@/components/controls/Combobox.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import SkillChip from '@/components/game/SkillChip.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import { skillImage, skillRarity, type SkillData } from '@/lib/game-data/skills/skills';
  import DialogStatus from '@/pages/simulator/shell/DialogStatus.svelte';
  import {
    BUILD_RUNS,
    BUILD_WINDOW_MINUTES,
    MAX_BUILD_SKILLS,
    addToBuild,
    removeFromBuild,
    sameBuild
  } from './explorer-build';
  import { skillFamily } from '../skill-explorer-view';

  interface Props {
    /** The build as it is being edited, in the order skills were added. */
    build: number[];
    /** The build the values shown are for. */
    measured: number[];
    reference?: number[];
    /** Skills the simulator values on this course, which a build can hold. */
    addable: number[];
    skillLookup: Map<number, SkillData>;
    styleName: string;
    /** The values shown are for a build the visitor picked, not the reference build. */
    custom: boolean;
    /** The edited build differs from the one the values are for, and from the reference build. */
    edited: boolean;
    loading: boolean;
    /** The visitor accepted that a changed build races on the simulator; until then the build is read-only. */
    accepted?: boolean;
    onvalue: (build: number[]) => void;
  }

  let {
    build,
    measured,
    reference,
    addable,
    skillLookup,
    styleName,
    custom,
    edited,
    loading,
    accepted = $bindable(false),
    onvalue
  }: Props = $props();

  const id = $props.id();

  let open = $state(false);
  let draft = $state.raw<number[]>([]);
  let query = $state('');
  // Anchors the suggestions inside the dialog, as the simulator's skill editor does.
  let searchAnchor = $state<HTMLDivElement>();

  const title = $derived(custom || edited ? 'Your build' : 'Reference build');
  const full = $derived(draft.length >= MAX_BUILD_SKILLS);
  const changed = $derived(draft.length > 0 && !sameBuild(draft, measured));
  const options = $derived(
    addable
      .filter((skillId) => !draft.includes(skillId) && skillLookup.has(skillId))
      .map((skillId) => {
        const skill = skillLookup.get(skillId);
        return {
          value: String(skillId),
          label: skill?.name ?? `Skill ${skillId}`,
          keywords: `skill ${skillId}`,
          image: skillImage(skill?.icon)
        };
      })
  );

  function edit() {
    draft = [...build];
    query = '';
    open = true;
  }

  /** A skill joins the draft, in place of another version of it; a full build only swaps versions. */
  function add(value: string) {
    const skillId = Number(value);
    if (!Number.isInteger(skillId) || draft.includes(skillId)) return;
    if (full && !draft.some((id) => skillFamily(id) === skillFamily(skillId))) return;

    draft = addToBuild(draft, skillId);
  }

  const valueTitle = `Races your build to show what each skill adds to it, usually 10–30 seconds. You can value ${BUILD_RUNS} builds every ${BUILD_WINDOW_MINUTES} minutes.`;

  function value() {
    onvalue(draft);
    open = false;
  }
</script>

<!-- The build the values are measured in, on the scope's title row beside the target stats. It opens a dialog to
     change it; a build changed from a skill's card updates its values from the row. -->
<div class="build-control">
  <Button
    variant="secondary"
    size="sm"
    icon="edit"
    {loading}
    ariaLabel={`Edit the build: ${title}, ${build.length} skills`}
    onclick={edit}
  >
    {title}
    <span class="count">{build.length} skills</span>
  </Button>
  {#if edited}
    <Button
      size="sm"
      icon="refresh"
      {loading}
      title={valueTitle}
      onclick={() => onvalue(build)}
    >
      Update values
    </Button>
  {/if}
</div>

<Dialog
  bind:open
  {title}
  description={custom
    ? 'The chart shows what each skill adds to your build. These values come from fewer races than the reference build, so small differences can be noise.'
    : `The chart shows what each skill adds to these skills: what our optimizer buys a ${styleName} runner on this course with the latest CM's average SP.`}
  maxWidth="640px"
  maxHeight="88dvh"
  mobileMaxHeight="96dvh"
  mobileActionsStack
>
  <section
    class="skills"
    aria-labelledby="{id}-skills"
  >
    <div class="head">
      <h3 id="{id}-skills">Skills</h3>
      <span class="count">{draft.length}</span>
    </div>

    {#if accepted}
      <div
        class="search"
        bind:this={searchAnchor}
      >
        <Combobox
          id="{id}-skill-search"
          label="Add a skill"
          hideLabel
          placeholder={full ? 'The build is full. Remove a skill to add another.' : 'Add a skill…'}
          prefixIcon="search"
          {options}
          bind:query
          action
          popupAnchor={searchAnchor}
          maxResults={12}
          emptyText="No skills match."
          onchange={add}
        />
      </div>
    {/if}

    {#if draft.length > 0}
      <ul class="picked">
        {#each draft as skillId (skillId)}
          {@const skill = skillLookup.get(skillId)}
          <li>
            <SkillChip
              name={skill?.name ?? `Skill ${skillId}`}
              icon={skillImage(skill?.icon)}
              rarity={skillRarity(skill, Boolean(skill?.inherited))}
              compact
              fill
              onremove={accepted ? () => (draft = removeFromBuild(draft, skillId)) : undefined}
            />
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">No skills yet. Search to add some.</p>
    {/if}
  </section>

  {#if !accepted}
    <Banner title="Changing the build">
      A changed build is raced on our simulator, which takes 10–30 seconds. You can value {BUILD_RUNS}
      builds every
      {BUILD_WINDOW_MINUTES} minutes, and their values come from fewer races than the reference build,
      so small differences can be noise.
    </Banner>
  {/if}

  {#snippet actions()}
    {#if !accepted}
      <Button
        variant="secondary"
        onclick={() => (open = false)}
      >
        Close
      </Button>
      <Button
        icon="edit"
        onclick={() => (accepted = true)}
      >
        Accept and edit
      </Button>
    {:else}
      <DialogStatus>
        {#if draft.length === 0}
          <span class="blocked">A build needs at least one skill.</span>
        {:else}
          <strong>{draft.length} skills</strong>
          {#if full}<span>the most a build holds</span>{/if}
        {/if}
      </DialogStatus>
      {#if reference && !sameBuild(draft, reference)}
        <Button
          variant="ghost"
          onclick={() => (draft = [...(reference ?? [])])}
        >
          Use reference build
        </Button>
      {/if}
      <Button
        variant="secondary"
        onclick={() => (open = false)}
      >
        Cancel
      </Button>
      <Button
        icon="refresh"
        disabled={!changed}
        title={valueTitle}
        onclick={value}
      >
        Update values
      </Button>
    {/if}
  {/snippet}
</Dialog>

<style>
  .build-control {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
    min-width: 0;
  }

  /* The heading, count, search and chips of the simulator's skill editor (RunnerSkills). */
  .count {
    min-width: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--color-surface-3);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 650;
    line-height: 18px;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .skills {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .head {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 650;
  }

  .search {
    --control-height: var(--setup-control-height, 36px);
    --combobox-max-height: 240px;
    min-width: 0;
  }

  .picked {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .picked li {
    display: flex;
    min-width: 0;
  }

  .picked :global(.skill-chip) {
    min-height: 32px;
    font-size: 12px;
  }

  .empty {
    margin: 0;
    padding: 12px;
    border: 1px dashed var(--border-subtle);
    border-radius: var(--radius-md);
    font-size: 12px;
    color: var(--text-secondary);
    text-align: center;
  }

  @media (max-width: 520px) {
    .picked {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
