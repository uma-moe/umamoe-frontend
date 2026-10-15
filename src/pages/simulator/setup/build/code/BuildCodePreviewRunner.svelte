<script lang="ts">
  import { skillImage, type SkillCatalogEntry } from '@/lib/catalog/skill-catalog';
  import { runningStyleName } from '@/lib/race/race-display';
  import SimulatorRunnerFace from '../../../reports/SimulatorRunnerFace.svelte';
  import type { SimulatorUma } from '../../../simulator-uma';
  import { RUNNING_STYLES } from '../../trainee';

  interface Props {
    uma: SimulatorUma;
    skills: Map<number, SkillCatalogEntry>;
  }

  let { uma, skills }: Props = $props();

  const MOODS = ['Awful', 'Bad', 'Normal', 'Good', 'Great'];
  const STATS = [
    ['speed', 'speed'],
    ['stamina', 'stamina'],
    ['power', 'power'],
    ['guts', 'guts'],
    ['wisdom', 'wit']
  ] as const;

  const style = $derived(
    RUNNING_STYLES.indexOf(uma.trainee.runningStyle as (typeof RUNNING_STYLES)[number])
  );
</script>

<div class="runner">
  <SimulatorRunnerFace
    cardId={uma.cardId}
    size={36}
  />
  <div class="who">
    <strong>{uma.name}</strong>
    <span>
      {[
        runningStyleName(style + 1),
        (MOODS[Number(uma.trainee.motivation) - 1] ?? 'Normal') + ' mood',
        uma.fanCount !== undefined ? uma.fanCount.toLocaleString() + ' fans' : ''
      ]
        .filter(Boolean)
        .join(' · ')}
    </span>
  </div>
  <ul
    class="stats"
    aria-label="Stats"
  >
    {#each STATS as [key, icon]}
      <li>
        <img
          src="/assets/images/icon/stats/{icon}.webp"
          alt={key}
          width="14"
          height="14"
        />
        {uma.trainee[key]}
      </li>
    {/each}
  </ul>
  <ul
    class="skills"
    aria-label="{uma.skills.length} skills"
  >
    {#each uma.skills as skill (skill.skillId)}
      {@const entry = skills.get(skill.skillId)}
      <li title={entry?.name ?? 'Skill ' + skill.skillId}>
        {#if entry?.icon}<img
            src={skillImage(entry.icon)}
            alt={entry.name}
            width="20"
            height="20"
          />{:else}<span>{skill.skillId}</span>{/if}
      </li>
    {:else}
      <li class="none">No skills</li>
    {/each}
  </ul>
</div>

<style>
  .runner {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    grid-template-areas:
      'face who'
      'face stats'
      'face skills';
    gap: 4px 10px;
    align-items: center;
  }
  .runner > :first-child {
    grid-area: face;
    align-self: start;
  }
  .who {
    grid-area: who;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 8px;
    min-width: 0;
    line-height: 1.3;
  }
  .who strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .who span {
    font-size: 12px;
    color: var(--text-secondary);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .stats {
    grid-area: stats;
    display: flex;
    gap: 8px;
    font-size: 12px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .stats li {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .stats img {
    width: 14px;
    height: 14px;
    object-fit: contain;
  }
  .skills {
    grid-area: skills;
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .skills img {
    display: block;
    width: 20px;
    height: 20px;
    object-fit: contain;
  }
  .skills span,
  .skills .none {
    font-size: 11px;
    color: var(--text-secondary);
  }
</style>
