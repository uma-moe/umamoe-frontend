<script lang="ts">
  import DataTable from '@/components/data/DataTable.svelte';
  import Button from '@/components/controls/Button.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import Icon from '@/components/Icon.svelte';
  import RaceSkill from '../../runners/RaceSkill.svelte';
  import CmSkillLanes from './CmSkillLanes.svelte';
  import { number, pct, styleNames, styleOrder } from '../cm-data';
  import { skillStyles, type SkillOverview } from '../cm-exploration';
  import type { Course } from '../../race-analysis/replay/replay-course';
  import type { skillRows } from './cm-skill-rows';
  import type { CmSkillDetails } from './cm-skill-details.svelte';

  /** CM Data's skill performance table: one row per skill, its activation lanes on expand. */
  let {
    overview,
    rows,
    style,
    details,
    colors,
    skillName,
    caption,
    columnHelp,
    course,
    courseLabel,
    playersLabel = 'Players',
    playersUnavailable,
    selected = $bindable([]),
    inspected = $bindable(),
    sortKey = $bindable('players')
  }: {
    overview: SkillOverview;
    rows: ReturnType<typeof skillRows>;
    style: string;
    details: CmSkillDetails;
    colors: Record<number, string>;
    skillName: (id: number) => string;
    caption: string;
    columnHelp: Record<string, string>;
    course?: Course;
    courseLabel?: string;
    /** The heading of the count column: distinct players, or learners where players are unknown. */
    playersLabel?: string;
    /** Why counts that are still missing will not arrive; until then they read as loading. */
    playersUnavailable?: string;
    /** Skills added to the comparison. */
    selected?: number[];
    /** The skill whose activation lanes are open. */
    inspected?: number;
    sortKey?: string;
  } = $props();

  const shortStyleNames: Record<number, string> = {
    5: 'Run',
    1: 'Front',
    2: 'Pace',
    3: 'Late',
    4: 'End'
  };

  const variants = (id: number) => [
    id,
    ...(overview.variants?.[id] ?? []).filter((variant) => variant !== id)
  ];
  const variantName = (id: number) =>
    skillName(id) + (id >= 900000 && id < 1000000 ? ' (Inherited)' : '');
  const aliases = (id: number) => variants(id).slice(1).map(variantName).join(', ');

  const activationCounts = $derived.by(() => {
    const counts = new Map<string, { learned: number; activated: number }>();
    for (const row of overview.rows) {
      counts.set(row[0] + ':' + skillStyles[row[1]], { learned: row[3], activated: row[4] });
    }

    return counts;
  });

  function activationByStyle(id: number) {
    return styleOrder
      .filter((style) => style !== 6)
      .map((style) => {
        const counts = activationCounts.get(id + ':' + style);
        return { style, learned: counts?.learned ?? 0, activated: counts?.activated ?? 0 };
      });
  }

  function inspect(id: number) {
    inspected = inspected === id ? undefined : id;
  }

  function toggle(id: number) {
    selected = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
  }
</script>

<div class="skill-table">
  <DataTable
    plain
    compact
    {caption}
    maxHeight={960}
    bind:sortKey
    sortDirection="descending"
    onvisiblerows={(visible) => {
      const needsAllTimings = sortKey === 'meanDistance' || sortKey === 'medianDistance';
      details.prefetch((needsAllTimings ? rows : visible).map((row) => Number(row.id)));
    }}
    onrowclick={(row) => inspect(Number(row.id))}
    expandedRow={inspected}
    emptyMessage="No skills match these filters."
    columns={[
      { key: 'name', label: 'Skill' },
      { key: 'players', label: playersLabel, numeric: true },
      { key: 'procs', label: 'Activations', numeric: true },
      { key: 'meanDistance', label: 'Mean distance', numeric: true },
      { key: 'medianDistance', label: 'Median distance', numeric: true },
      { key: 'timing', label: 'Compare', sortable: false }
    ]}
    {columnHelp}
    {rows}
  >
    {#snippet cell(row, column)}
      {#if column.key === 'name'}
        {@const otherVariants = variants(Number(row.id)).slice(1)}
        <button
          class="skill-select"
          class:active={inspected === Number(row.id)}
          aria-label={'Inspect ' + row.name}
          aria-expanded={inspected === Number(row.id)}
          aria-controls={inspected === Number(row.id) ? 'cm-skill-detail' : undefined}
          title={typeof row.variants === 'string' ? row.variants : undefined}
          onclick={() => inspect(Number(row.id))}
        >
          <span
            class="chevron"
            class:open={inspected === Number(row.id)}
          >
            <Icon
              name="chevron"
              size={16}
            />
          </span>
          <span
            class="skill-label skill-chip-cell"
            class:with-variants={otherVariants.length > 0}
          >
            <RaceSkill
              id={Number(row.id)}
              name={String(row.name)}
              fill
            />
            {#if otherVariants.length}
              <span
                class="variant-alternatives"
                title={aliases(Number(row.id))}
              >
                {#each otherVariants.slice(0, 1) as id}
                  <RaceSkill
                    {id}
                    name={skillName(id)}
                    iconOnly
                  />
                {/each}
                <span>
                  {otherVariants.length}
                  {otherVariants.length === 1 ? 'alternative' : 'alternatives'}
                </span>
              </span>
            {/if}
          </span>
        </button>
      {:else if column.key === 'players'}
        {#if Number.isFinite(Number(row.players))}
          {number(Number(row.players))}
        {:else if playersUnavailable}
          <span title={playersUnavailable}>—</span>
        {:else}
          <span title="Loading player counts…">…</span>
        {/if}
      {:else if column.key === 'timing'}
        {@const compared = selected.includes(Number(row.id))}
        <IconButton
          icon={compared ? 'check' : 'add'}
          size="sm"
          label={(compared ? 'Remove ' : 'Add ') +
            row.name +
            (compared ? ' from comparison' : ' to comparison')}
          title={compared ? 'Remove from comparison' : 'Add to comparison'}
          selected={compared}
          onclick={(event) => {
            event.stopPropagation();
            toggle(Number(row.id));
          }}
        />
      {:else if column.key === 'procs'}
        <div class="activation-summary">
          <strong title="Activation events, including repeated activations">
            {number(Number(row.procs))}
          </strong>
          <span
            title={number(Number(row.active)) +
              ' activated / ' +
              number(Number(row.owned)) +
              ' learned entries'}
          >
            {pct(Number(row.activation))}
          </span>
          {#if style === 'all'}
            <div
              class="style-procs"
              aria-label="Activation rates by running style"
            >
              {#each activationByStyle(Number(row.id)) as entry}
                <span
                  title={styleNames[entry.style] +
                    ': ' +
                    number(entry.activated) +
                    ' / ' +
                    number(entry.learned) +
                    ' learned entries'}
                >
                  <i style:background={colors[entry.style]}></i>
                  {shortStyleNames[entry.style]}
                  <strong>{entry.learned ? pct(entry.activated / entry.learned) : '—'}</strong>
                </span>
              {/each}
            </div>
          {/if}
        </div>
      {:else if column.key === 'meanDistance' || column.key === 'medianDistance'}
        {#if Number.isFinite(Number(row[column.key]))}
          ~{number(Math.round(Number(row[column.key])))} m
        {:else if details.errors[Number(row.id)] && column.key === 'meanDistance'}
          <Button
            variant="secondary"
            size="sm"
            title={details.errors[Number(row.id)]}
            ariaLabel={'Retry timing for ' + row.name}
            onclick={(event) => {
              event.stopPropagation();
              void details.load(Number(row.id));
            }}
          >
            Retry
          </Button>
        {:else if !details.values[Number(row.id)] && !details.errors[Number(row.id)]}
          <span title="Loading activation distances">…</span>
        {:else}
          <span title="No activation events in this running style">—</span>
        {/if}
      {:else}
        {number(Number(row[column.key]))}
      {/if}
    {/snippet}
    {#snippet rowDetail(row)}
      <section
        id="cm-skill-detail"
        class="skill-detail"
        aria-label={skillName(Number(row.id)) + ' activation details'}
      >
        {#key row.id}
          <CmSkillLanes
            {overview}
            {style}
            selected={[Number(row.id)]}
            removable={false}
            aliases={aliases(Number(row.id))}
            onclose={() => (inspected = undefined)}
            {details}
            {colors}
            {skillName}
            {course}
            {courseLabel}
          />
        {/key}
      </section>
    {/snippet}
  </DataTable>
</div>

<style>
  @import '../../runners/skill-chip-cell.css';
  @import './cm-skill-table.css';
</style>
