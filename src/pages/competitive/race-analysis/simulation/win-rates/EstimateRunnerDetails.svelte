<script lang="ts">
  import { ordinalPlace } from '@/lib/race/replay/race-display';
  import { skillImage, type SkillData } from '@/lib/game-data/skills/skills';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import { identity, portrait } from '@/pages/competitive/analysis-view';
  import type { MonteCarloResult } from '@/pages/simulator/simulator-repository';
  import { percent } from './estimate-format';
  import { runnerName, type RunnerOdds } from './estimate-groups';
  import {
    hpCheckSummary,
    staminaForExtraMaxHp,
    type HpCheck,
    type HpCheckSummary
  } from './estimate-hp';
  import { skillActivationRates } from './estimate-skills';

  let {
    odds,
    result,
    catalog,
    onclose
  }: {
    odds: RunnerOdds;
    result: MonteCarloResult;
    catalog: Map<number, SkillData>;
    onclose: () => void;
  } = $props();

  const HEADLINES = [
    { label: 'Win', places: 1 },
    { label: 'Podium', places: 3 },
    { label: 'Top 5', places: 5 }
  ];
  const HP_CHECKS: { check: HpCheck; title: string }[] = [
    { check: 'spurt', title: 'Full spurt chance' },
    { check: 'survival', title: 'Finish survival chance' }
  ];

  const hpSummaries = $derived(
    HP_CHECKS.map(({ check, title }) => ({
      check,
      title,
      summary: hpCheckSummary(check, result, odds.source)
    }))
  );
  // Both checks share one HP scale, so their bars compare.
  const largestExtraHp = $derived(
    Math.max(
      1,
      ...hpSummaries.flatMap(({ summary }) =>
        (summary?.milestones ?? []).map((milestone) => milestone.extraHp)
      )
    )
  );
  const races = $derived(odds.finishes.reduce((sum, count) => sum + count, 0));
  const mostFinishes = $derived(Math.max(1, ...odds.finishes));
  const skills = $derived(
    skillActivationRates(result, odds.source, odds.runner?.skillIds ?? []) ?? []
  );

  function finishRate(count: number) {
    return races ? (count / races) * 100 : 0;
  }

  function rateWithin(places: number) {
    return finishRate(odds.finishes.slice(0, places).reduce((sum, count) => sum + count, 0));
  }

  function staminaLabel(extraMaxHp: number | undefined) {
    if (extraMaxHp === undefined || !odds.runner) return undefined;

    const stamina = staminaForExtraMaxHp(odds.runner, extraMaxHp);
    return stamina === undefined ? undefined : '+' + stamina;
  }
</script>

{#snippet hpCheck(title: string, summary: HpCheckSummary | undefined)}
  <section class="detail-section">
    <header class="section-head">
      <h3>{title}</h3>
      {#if summary}
        <span class="current-rate">
          <small>Now</small>
          <strong>{percent(summary.passRate * 100)}</strong>
        </span>
      {/if}
    </header>
    {#if !summary}
      <p class="empty">HP data was not returned for these races.</p>
    {:else if summary.milestones.length === 0}
      <p class="empty">Every simulated race already passed this HP check.</p>
    {:else}
      <table class="hp-needs">
        <caption class="sr-only">{title}: the HP each higher chance needs</caption>
        <thead>
          <tr>
            <th scope="col">Chance</th>
            <th scope="col">Extra HP needed</th>
            <th scope="col">Stamina</th>
          </tr>
        </thead>
        <tbody>
          {#each summary.milestones as milestone (milestone.rate)}
            <tr>
              <th scope="row">{percent(milestone.rate * 100)}</th>
              <td>
                <span class="hp-need">
                  <span
                    class="hp-bar"
                    aria-hidden="true"
                  >
                    <i style:width={(milestone.extraHp / largestExtraHp) * 100 + '%'}></i>
                  </span>
                  <b>+{Math.ceil(milestone.extraHp)}</b>
                </span>
              </td>
              <td class="stamina">{staminaLabel(milestone.extraMaxHp) ?? '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
{/snippet}

<Dialog
  open
  title={runnerName(odds)}
  description={odds.runner ? identity(odds.runner).detail : undefined}
  image={portrait(odds.runner?.cardId)}
  maxWidth="920px"
  maxHeight="90dvh"
  contentPadding="12px"
  mobileContentPadding="8px"
  {onclose}
>
  <div class="details">
    <section class="detail-section">
      <dl class="headlines">
        {#each HEADLINES as headline (headline.label)}
          <div>
            <dd>{percent(rateWithin(headline.places))}</dd>
            <dt>{headline.label}</dt>
          </div>
        {/each}
      </dl>
      <h3>Exact placements</h3>
      <ol
        class="placements"
        style:--places={odds.finishes.length}
      >
        {#each odds.finishes as count, index (index)}
          <li title={count + (count === 1 ? ' race' : ' races')}>
            <strong>{percent(finishRate(count))}</strong>
            <span class="bar">
              <i style:height={(count / mostFinishes) * 100 + '%'}></i>
            </span>
            <span>{ordinalPlace(index + 1)}</span>
          </li>
        {/each}
      </ol>
    </section>
    <div class="hp-checks">
      {#each hpSummaries as { check, title, summary } (check)}
        {@render hpCheck(title, summary)}
      {/each}
    </div>
    {#if skills.length > 0}
      <section class="detail-section">
        <header class="section-head">
          <h3>Skill activations</h3>
          <span>
            {skills.filter((skill) => skill.rate > 0).length} of {skills.length} activated
          </span>
        </header>
        <ul class="skills">
          {#each skills as skill (skill.skillId)}
            {@const data = catalog.get(skill.skillId)}
            {@const icon = skillImage(data?.icon)}
            <li>
              {#if icon}
                <img
                  src={icon}
                  alt=""
                  loading="lazy"
                />
              {/if}
              <span class="skill-name">{data?.name ?? 'Skill ' + skill.skillId}</span>
              <b class:inactive={skill.rate === 0}>{percent(skill.rate)}</b>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
</Dialog>

<style>
  @import './estimate-runner-details.css';
</style>
