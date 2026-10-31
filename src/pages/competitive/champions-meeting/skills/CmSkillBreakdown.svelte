<script lang="ts">
  import InfoIcon from '@/components/feedback/InfoIcon.svelte';
  import RaceSkill from '../../runners/RaceSkill.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import Icon from '@/components/Icon.svelte';
  import { number, pct, styleNames } from '../cm-data';
  import { skillStyles, type SkillOverview, type SkillDetail } from '../cm-exploration';
  import {
    selectedStyles,
    skillCohorts,
    type BucketRange,
    type SkillCohortCell,
    type SkillCohort
  } from './cm-skill-analysis';

  let {
    overview,
    skills,
    colors,
    style,
    range,
    comparison = false,
    skillName
  }: {
    overview: SkillOverview;
    skills: { detail: SkillDetail; color?: string; dash?: string }[];
    colors: Record<number, string>;
    style: string;
    range?: BucketRange;
    comparison?: boolean;
    skillName: (id: number) => string;
  } = $props();
  const controlId = $props.id();
  let measure = $state('winrate');
  let expanded = $state<number[]>([]);
  const styles = $derived(selectedStyles(Object.keys(skillStyles), style));
  const groups = $derived(
    skills.map((skill) => {
      const rows = overview.rows.filter(
        (row) => row[0] === skill.detail.skillId && styles.includes(row[1])
      );
      const counts = Object.fromEntries(
        rows.map((row) => [row[1], { learned: row[3], active: row[4], repeat: row[6] }])
      );
      const totals = rows.reduce(
        (sum, row) => ({
          learned: sum.learned + row[3],
          active: sum.active + row[4],
          repeat: sum.repeat + row[6]
        }),
        { learned: 0, active: 0, repeat: 0 }
      );

      return {
        ...skill,
        counts,
        totals,
        cohorts: skillCohorts({ overview, detail: skill.detail, style, range })
      };
    })
  );
  const columns = $derived(style === 'all' ? [...styles, 'all'] : ['all']);

  function toggle(id: number) {
    expanded = expanded.includes(id) ? expanded.filter((value) => value !== id) : [...expanded, id];
  }

  function outcome(cell?: SkillCohortCell) {
    if (!cell) return '—';
    switch (measure) {
      case 'entries':
        return number(cell.entries);
      case 'wins':
        return number(cell.wins);
      case 'teamWins':
        return cell.teamWins === undefined ? '—' : number(cell.teamWins);
      case 'teamWinrate':
        return cell.entries && cell.teamWins !== undefined
          ? pct(cell.teamWins / cell.entries)
          : '—';
      default:
        return cell.entries ? pct(cell.wins / cell.entries) : '—';
    }
  }

  function outcomeRate(cell?: SkillCohortCell) {
    if (!cell?.entries) return undefined;
    if (measure === 'winrate') return cell.wins / cell.entries;
    if (measure === 'teamWinrate' && cell.teamWins !== undefined)
      return cell.teamWins / cell.entries;

    return undefined;
  }

  function describe(cell?: SkillCohortCell) {
    if (!cell) return 'No entries';
    return (
      number(cell.wins) +
      ' individual wins' +
      (cell.teamWins === undefined ? '' : ', ' + number(cell.teamWins) + ' team wins') +
      ' / ' +
      number(cell.entries) +
      ' runner entries'
    );
  }
</script>

{#snippet activationRows(group: (typeof groups)[number])}
  {#each [{ label: 'Activation rate (1+)', field: 'active' as const }, { label: 'Repeat activation rate (2+)', field: 'repeat' as const }] as metric}
    <tr class="activation-row">
      <th scope="row">{metric.label}</th>
      {#each columns as key}
        {@const cell = key === 'all' ? group.totals : group.counts[key]}
        <td
          class:total={key === 'all'}
          class:rate={Boolean(cell?.learned)}
          style:--rate-position={cell?.learned ? pct(cell[metric.field] / cell.learned) : undefined}
          title={cell
            ? number(cell[metric.field]) + ' / ' + number(cell.learned) + ' learned entries'
            : 'No learned entries'}
        >
          {cell?.learned ? pct(cell[metric.field] / cell.learned) : '—'}
        </td>
      {/each}
      <td class="entries">{number(group.totals[metric.field])}</td>
    </tr>
  {/each}
{/snippet}

{#snippet outcomeCells(row: SkillCohort)}
  {#each columns as key}
    {@const cell = key === 'all' ? row.total : row.cells[key]}
    {@const value = outcome(cell)}
    {@const rate = outcomeRate(cell)}
    <td
      class:total={key === 'all'}
      class:rate={rate !== undefined}
      style:--rate-position={rate === undefined ? undefined : pct(rate)}
      title={describe(cell)}
    >
      {value}
    </td>
  {/each}
  <td class="entries">{number(row.total.entries)}</td>
{/snippet}

{#snippet outcomeRows(cohorts: SkillCohort[])}
  {#each cohorts as row}
    <tr class="cohort-row">
      <th scope="row">
        {#if row.variantId !== undefined}
          <span class="outcome-skill skill-chip-cell">
            <RaceSkill
              id={row.variantId}
              fill
            />
          </span>
        {:else}
          {row.label}
        {/if}
      </th>
      {@render outcomeCells(row)}
    </tr>
  {/each}
{/snippet}

<section
  class="breakdown"
  class:comparison
  aria-label="Skill breakdown"
>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable tables must be reachable with the keyboard.) -->
  <div
    class="table-scroll"
    role="region"
    aria-label="Skill outcome breakdown"
    tabindex="0"
  >
    <table>
      <caption class="sr-only">Skill activation rates and outcomes by running style</caption>
      <thead>
        <tr>
          <th scope="col">
            <span class="sr-only">Activation / outcome</span>
            <div class="measure-select">
              <span class="measure-label">Outcomes</span>
              <SelectField
                id={controlId + '-measure'}
                label="Outcome measure"
                hideLabel
                bind:value={measure}
                options={[
                  { value: 'winrate', label: 'Individual win rate' },
                  { value: 'teamWinrate', label: 'Team win rate' },
                  { value: 'entries', label: 'Runner entries' },
                  { value: 'wins', label: 'Individual wins' },
                  { value: 'teamWins', label: 'Team wins' }
                ]}
              />
              <InspectPopover
                label="How skill percentages are calculated"
                align="start"
              >
                {#snippet trigger()}<InfoIcon />{/snippet}
                <div class="rates-help">
                  <strong>Different rows use different denominators</strong>
                  {#if comparison}
                    <p>
                      Skill rows show entries where any variant activated. Expand a skill for
                      activation rates, variants and inactive entries.
                    </p>
                  {/if}
                  <p>
                    <b>Activation rate:</b>
                    entries that activated at least once ÷ entries that learned the skill. Repeat activation
                    rate counts learned entries with two or more activations.
                  </p>
                  <p>
                    <b>Individual win rate:</b>
                    individual wins ÷ entries in that outcome row. Team win rate uses team wins over the
                    same entries.
                  </p>
                  <p>
                    Example: 60 of 100 learned entries activated the skill: 60% activation. If 12 of
                    those 60 entries won, their individual win rate is 20%.
                  </p>
                </div>
              </InspectPopover>
            </div>
          </th>
          {#each columns as key}
            <th scope="col">
              <span class="style-heading">
                {#if key !== 'all'}<i style:background={colors[skillStyles[key] ?? 0]}></i>{/if}
                {key === 'all' ? 'Total' : styleNames[skillStyles[key] ?? 0]}
              </span>
            </th>
          {/each}
          <th scope="col">Entries</th>
        </tr>
      </thead>
      {#each groups as group (group.detail.skillId)}
        {#if comparison}
          {@const active = group.cohorts[0]}
          <tbody
            class="compared-skill"
            data-skill={group.detail.skillId}
            aria-label={skillName(group.detail.skillId) + ' outcomes'}
          >
            {#if active}
              <tr class="compared-main">
                <th scope="row">
                  <button
                    class="skill-toggle skill-chip-cell"
                    aria-label={skillName(group.detail.skillId) + ' outcome details'}
                    aria-expanded={expanded.includes(group.detail.skillId)}
                    title={active.label}
                    onclick={() => toggle(group.detail.skillId)}
                  >
                    <span
                      class="chevron"
                      class:open={expanded.includes(group.detail.skillId)}
                    >
                      <Icon
                        name="chevron"
                        size={14}
                      />
                    </span>
                    <svg
                      class="series-swatch"
                      viewBox="0 0 28 10"
                      aria-hidden="true"
                    >
                      <path
                        d="M0,5H28"
                        stroke={group.color}
                        stroke-dasharray={group.dash}
                      />
                    </svg>
                    <RaceSkill
                      id={group.detail.skillId}
                      name={skillName(group.detail.skillId)}
                      fill
                    />
                  </button>
                </th>
                {@render outcomeCells(active)}
              </tr>
            {/if}
            {#if expanded.includes(group.detail.skillId)}
              {@render activationRows(group)}
              {@render outcomeRows(group.cohorts.slice(1))}
            {/if}
          </tbody>
        {:else}
          <tbody
            class="activation-rows"
            aria-label="Activation and double-proc rates"
          >
            {@render activationRows(group)}
          </tbody>
          <tbody
            class="outcome-rows"
            aria-label="Win outcomes by activation"
          >
            {@render outcomeRows(group.cohorts)}
          </tbody>
        {/if}
      {/each}
    </table>
  </div>
  <p class="outcome-note">
    {#if comparison}
      Activated entries · expand a skill for its full breakdown.
    {:else if groups[0]}
      Activation rates use {number(groups[0].totals.learned)} learned entries. Win rates use the entries
      in each outcome row.
    {/if}
    {range ? 'Outcomes use first activations in the selected range. ' : ''}Win rates describe
    captured builds, not skill gain. Variants can overlap.
    <span
      class="rate-legend"
      aria-label="Rate color scale, zero to one hundred percent"
    >
      0% <i></i>
      100%
    </span>
  </p>
</section>

<style>
  @import '../../runners/skill-chip-cell.css';
  @import './cm-skill-breakdown.css';
</style>
