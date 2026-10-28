<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { loadSkills, skillPointTotal, type SkillData } from '@/lib/game-data/skills/skills';
  import { normalizeVeteranRecord } from '@/lib/veterans/records/veteran-normalizer';
  import { veteranSupportCards } from '@/lib/veterans/records/veteran-profile';
  import RunnerTraining from './RunnerTraining.svelte';
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import ProfileVeteranIdentity from '@/pages/profile/veterans/ProfileVeteranIdentity.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import AptitudeGrid from '@/components/game/AptitudeGrid.svelte';
  import RaceSkill from './RaceSkill.svelte';
  import type { AptitudeGradeValue } from '@/components/game/AptitudeGrade.svelte';
  import AptitudeGrade from '@/components/game/AptitudeGrade.svelte';
  import { runningStyleName } from '@/lib/race/replay/race-display';
  import { identity, score, stats } from '../analysis-view';

  let {
    runner,
    skillNames = new Map<number, string>(),
    expanded = false,
    compact = false,
    outfit,
    metrics,
    inlineMetrics = false,
    training,
    headerActions,
    raceContext
  }: {
    runner: RaceRunner;
    skillNames?: Map<number, string>;
    expanded?: boolean;
    compact?: boolean;
    outfit?: string;
    metrics?: Snippet;
    /** Short compact metrics share the identity line instead of a row of their own. */
    inlineMetrics?: boolean;
    training?: Snippet;
    headerActions?: Snippet;
    raceContext?: { surface?: number; distance?: number };
  } = $props();

  let skillCatalog = $state.raw(new Map<number, SkillData>());

  const veteran = $derived.by(() => {
    try {
      return normalizeVeteranRecord(runner.raw);
    } catch {
      return undefined;
    }
  });

  const supports = $derived(veteranSupportCards(runner.raw));
  const aptitudes = $derived(
    [
      ['proper_ground_turf', 'Turf'],
      ['proper_ground_dirt', 'Dirt'],
      ['proper_distance_short', 'Sprint'],
      ['proper_distance_mile', 'Mile'],
      ['proper_distance_middle', 'Medium'],
      ['proper_distance_long', 'Long'],
      ['proper_running_style_nige', 'Front'],
      ['proper_running_style_senko', 'Pace'],
      ['proper_running_style_sashi', 'Late'],
      ['proper_running_style_oikomi', 'End']
    ].flatMap(([key, label]) =>
      typeof runner.raw[key!] === 'number'
        ? [{ id: key!, label: label!, value: Number(runner.raw[key!]) }]
        : []
    )
  );

  const grades = ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'] as AptitudeGradeValue[];

  const aptitudeItems = $derived(
    (aptitudes.length
      ? aptitudes
      : Object.entries(runner.aptitudes)
          .filter(([, value]) => value !== undefined)
          .map(([id, value]) => ({ id, label: id[0]!.toUpperCase() + id.slice(1), value: value! }))
    ).map(({ id, label, value }) => ({
      id,
      label,
      group: id.includes('distance')
        ? 'Distance'
        : id.includes('ground') || id === 'surface'
          ? 'Surface'
          : 'Style',
      grade: grades[Math.max(0, value - 1)] ?? 'G'
    }))
  );

  const totalStats = $derived(
    Object.values(runner.stats).reduce((total, value) => total + (value ?? 0), 0)
  );

  /** Null until the catalog prices every learned skill. */
  const skillPoints = $derived(skillPointTotal(skillCatalog, runner.skillIds));

  const raceAptitudes = $derived.by(() => {
    if (!raceContext) return [];
    const style = runner.result?.runningStyle ?? Number(runner.raw.runningStyle);
    const styleKey = ['', 'nige', 'senko', 'sashi', 'oikomi', 'nige'][style];
    const surfaceKey =
      raceContext.surface === 1 ? 'turf' : raceContext.surface === 2 ? 'dirt' : undefined;

    const distance = raceContext.distance;
    const distanceKey = distance
      ? distance <= 1400
        ? 'short'
        : distance <= 1800
          ? 'mile'
          : distance <= 2400
            ? 'middle'
            : 'long'
      : undefined;

    // Captures without per-category grades, such as the demo races, only carry summary grades.
    const hasCategoryGrades = aptitudes.length > 0;
    const aptitude = (
      key: string | undefined,
      aggregate: string,
      summary: keyof RaceRunner['aptitudes']
    ) => {
      const camel = key?.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
      const recorded = key ? (runner.raw[key] ?? runner.raw[camel!]) : undefined;
      const fallback = hasCategoryGrades ? undefined : runner.aptitudes[summary];
      const value = Number(recorded ?? runner.raw[aggregate] ?? fallback);

      return grades[value - 1];
    };

    return [
      {
        group: 'Distance',
        label: distanceKey
          ? { short: 'Sprint', mile: 'Mile', middle: 'Medium', long: 'Long' }[distanceKey]
          : undefined,
        grade: aptitude(
          distanceKey ? 'proper_distance_' + distanceKey : undefined,
          'apt_distance',
          'distance'
        )
      },
      {
        group: 'Surface',
        label: surfaceKey ? (surfaceKey === 'turf' ? 'Turf' : 'Dirt') : undefined,
        grade: aptitude(
          surfaceKey ? 'proper_ground_' + surfaceKey : undefined,
          'apt_ground',
          'surface'
        )
      },
      {
        group: 'Style',
        label: styleKey ? runningStyleName(style, true) : undefined,
        grade: aptitude(
          styleKey ? 'proper_running_style_' + styleKey : undefined,
          'apt_style',
          'style'
        )
      }
    ];
  });

  onMount(() => {
    // Only compact cards head their skills with the SP total; without the catalog the total is left out.
    if (!compact) return;

    void loadSkills()
      .then((catalog) => (skillCatalog = catalog))
      .catch(() => {});
  });
</script>

<div
  class="build"
  class:compact
>
  <header class="build-identity">
    <div class="identity-line">
      <ProfileVeteranIdentity
        summary={compact
          ? { ...identity(runner), scenario: outfit ?? identity(runner).scenario }
          : identity(runner)}
        score={score(runner) || undefined}
        rankPlacement={compact ? 'details' : 'column'}
      />
      {#if compact && inlineMetrics && metrics}
        <div class="identity-metrics">
          {@render metrics()}
        </div>
      {/if}
      {@render headerActions?.()}
    </div>
    <!-- Compact cards keep a runner's results with who they are, ahead of the build that produced them. -->
    {#if compact && !inlineMetrics}
      {@render metrics?.()}
    {/if}
  </header>
  <div class="build-content">
    <section class="stat-overview">
      {#if compact}
        <header class="section-heading">
          <h3>Stats</h3>
          <span>
            Total stats <strong>{totalStats.toLocaleString('en-US')}</strong>
          </span>
        </header>
      {/if}
      <StatStrip
        items={stats(runner)}
        presentation={compact || !expanded ? 'inline' : 'icons'}
        compact
      />
    </section>
    {#if raceContext && !expanded}
      <section class="aptitude-overview">
        {#if compact}
          <h3>Race aptitudes</h3>
        {/if}
        <div
          class="compact-aptitudes race-aptitudes"
          aria-label="Aptitudes for this race"
        >
          {#each raceAptitudes as item}
            <span
              class="aptitude-cell race-aptitude"
              style:--aptitude-color={item.grade
                ? `var(--aptitude-${item.grade.toLowerCase()})`
                : 'var(--text-muted)'}
              title={item.group + ' · ' + (item.label ?? 'not detected')}
            >
              <span class="race-aptitude-label">
                {#if item.label}
                  <small>{item.group}</small>
                  {item.label}
                {:else}
                  {item.group}
                {/if}
              </span>
              {#if item.grade}
                <AptitudeGrade
                  grade={item.grade}
                  label={item.label ?? item.group}
                  size="sm"
                />
              {:else}
                <span
                  class="unknown-grade"
                  aria-label={(item.label ?? item.group) + ': not recorded'}
                  title="Aptitude not recorded"
                >
                  —
                </span>
              {/if}
            </span>
          {/each}
        </div>
      </section>
    {/if}
    {#if expanded}
      {#if aptitudeItems.length}
        <section class="aptitude-overview">
          {#if compact}
            <h3>Aptitudes</h3>
          {/if}
          {#if compact && raceContext && aptitudes.length}
            <div
              class="full-aptitudes"
              aria-label="All aptitudes"
            >
              {#each ['Distance', 'Surface', 'Style'] as group}
                <div>
                  <span>{group}</span>
                  <div>
                    {#each aptitudeItems.filter((item) => item.group === group) as item}
                      <span
                        class="aptitude-cell"
                        style:--aptitude-color={`var(--aptitude-${item.grade.toLowerCase()})`}
                      >
                        <span>{item.label}</span>
                        <AptitudeGrade
                          grade={item.grade}
                          label={item.label}
                          size="sm"
                        />
                      </span>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {:else if compact}
            <div
              class="compact-aptitudes"
              aria-label="Race aptitudes"
            >
              {#each aptitudeItems as item}
                <span
                  class="aptitude-cell"
                  style:--aptitude-color={`var(--aptitude-${item.grade.toLowerCase()})`}
                >
                  <span>{item.label}</span>
                  <AptitudeGrade
                    grade={item.grade}
                    label={item.label}
                    size="sm"
                  />
                </span>
              {/each}
            </div>
          {:else}
            <AptitudeGrid
              items={aptitudeItems}
              compact
              stretch
            />
          {/if}
        </section>
      {/if}
      {#if !compact}
        {@render metrics?.()}
      {/if}
      <section class="skills-section">
        {#if compact}
          <header class="section-heading">
            <h3>
              Learned skills <span>{runner.skillIds.length}</span>
            </h3>
            {#if skillPoints !== null}
              <span
                title="Base cost of the learned skills, including prerequisites, before hint discounts"
              >
                Total SP <strong>{skillPoints.toLocaleString('en-US')}</strong>
              </span>
            {/if}
          </header>
        {/if}
        <div class="skills">
          {#each runner.skillIds as id}
            <RaceSkill
              {id}
              name={skillNames.get(id)}
              fill={compact}
            />
          {/each}
        </div>
      </section>
      {@render training?.()}
      {#if !training}
        <RunnerTraining
          deck={supports.map((card) => ({
            id: card.support_card_id,
            lb: card.limit_break_count ?? 0
          }))}
          parents={veteran?.parents}
          ownFactors={veteran?.factors}
          label={runner.name}
        />
      {/if}
    {/if}
  </div>
</div>

<style>
  @import './runner-build.css';
</style>
