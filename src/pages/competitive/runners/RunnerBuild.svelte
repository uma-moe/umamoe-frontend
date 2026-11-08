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
  import AptitudeTile from '@/components/game/AptitudeTile.svelte';
  import { identity, score, skillPointsStat, stats } from '../analysis-view';
  import { aptitudeGrades, raceAptitudes } from './race-aptitudes';

  let {
    runner,
    skillNames = new Map<number, string>(),
    expanded = false,
    compact = false,
    outfit,
    metrics,
    inlineMetrics = false,
    training,
    showOwnSparks = true,
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
    showOwnSparks?: boolean;
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
          ? 'Track'
          : 'Style',
      grade: aptitudeGrades[Math.max(0, value - 1)] ?? 'G'
    }))
  );

  const statPresentation = $derived.by(() => {
    if (compact) return 'values';
    return expanded ? 'icons' : 'inline';
  });

  /** Null until the catalog prices every learned skill. */
  const skillPoints = $derived(skillPointTotal(skillCatalog, runner.skillIds));
  const statItems = $derived(
    compact ? [...stats(runner), skillPointsStat(skillPoints)] : stats(runner)
  );

  const raceAptitudeTiles = $derived(raceContext ? raceAptitudes(runner, raceContext) : []);

  onMount(() => {
    // Compact cards include the SP total; until the catalog loads it reads as a dash.
    if (!compact) return;

    void loadSkills()
      .then((catalog) => (skillCatalog = catalog))
      .catch(() => {});
  });
</script>

<div
  class="build"
  class:compact
  class:race-context={compact && Boolean(raceContext)}
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
    <section
      class="stat-overview"
      class:stat-grid={compact}
    >
      <StatStrip
        items={statItems}
        label={runner.name + ' build stats'}
        presentation={statPresentation}
        compact
      />
    </section>
    {#if raceContext && (compact || !expanded)}
      <section class="aptitude-overview">
        <div
          class="compact-aptitudes race-aptitudes"
          aria-label="Aptitudes for this race"
        >
          {#each raceAptitudeTiles as item}
            <AptitudeTile
              label={item.label ?? item.group}
              grade={item.grade}
              title={item.group + ': ' + (item.label ?? 'not detected')}
            />
          {/each}
        </div>
      </section>
    {/if}
    {#if expanded}
      {#if aptitudeItems.length && !(compact && raceContext)}
        <section class="aptitude-overview">
          {#if compact}
            <h3>Aptitudes</h3>
          {/if}
          {#if compact}
            <div
              class="compact-aptitudes"
              aria-label="Race aptitudes"
            >
              {#each aptitudeItems as item}
                <AptitudeTile
                  label={item.label}
                  grade={item.grade}
                />
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
          {showOwnSparks}
          label={runner.name}
        />
      {/if}
    {/if}
  </div>
</div>

<style>
  @import './runner-build.css';
</style>
