<script lang="ts">
  import type { plannerSkillSparks } from '@/lib/lineage/planner';

  let {
    skills,
    skillIcons = new Map<string, string>(),
    compact = false
  }: {
    skills: ReturnType<typeof plannerSkillSparks>;
    skillIcons?: Map<string, string>;
    compact?: boolean;
  } = $props();
</script>

<div
  class="skill-odds-scroll"
  class:compact
>
  <div class="skill-row skill-header">
    <span>Spark</span>
    <span>#</span>
    <span class="learned">If Learned</span>
    <span class="upgraded">If Upgraded</span>
    <span class="gold">If Gold</span>
  </div>
  {#each skills as skill}
    <div class="skill-row">
      <span
        class="skill-name"
        title={skill.name}
      >
        {#if skillIcons.has(skill.name)}
          <img
            src={skillIcons.get(skill.name)}
            alt=""
            loading="lazy"
          />
        {/if}
        <span>{skill.name}</span>
      </span>
      <span>{skill.count}</span>
      <strong>{skill.learned}%</strong>
      <strong class="upgraded">{skill.upgraded}%</strong>
      <strong class="gold">{skill.gold}%</strong>
    </div>
  {/each}
</div>

<style>
  .learned {
    color: rgb(var(--on-surface-rgb) / 0.8);
  }
  .compact {
    max-height: 322px;
  }
  .compact .skill-row {
    grid-template-columns: 2fr 28px repeat(3, minmax(60px, 1fr));
    padding: 2px 10px;
    font-size: 0.6rem;
  }
  .compact .skill-header {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 5px 10px;
    font-size: 0.5rem;
    background: var(--surface-overlay);
  }
  .compact .skill-name img {
    width: 18px;
    height: 18px;
  }
  .skill-odds-scroll {
    overflow: auto;
    container: skill-odds / inline-size;
  }
  .skill-row {
    display: grid;
    grid-template-columns: 2fr 50px repeat(3, minmax(65px, 1fr));
    align-items: center;
    min-width: 340px;
    padding: 3px 12px;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 0.65rem;
    color: var(--text-secondary);
  }
  .skill-row:last-child {
    border: 0;
  }
  .skill-row > :not(:first-child) {
    text-align: center;
    font-family: var(--font-mono);
  }
  .skill-row > span:nth-child(2) {
    color: var(--text-disabled);
  }
  .skill-header {
    padding-block: 6px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 0.55rem;
    font-weight: 600;
    color: var(--text-disabled);
  }
  .skill-name {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    white-space: nowrap;
    font-weight: 600;
  }
  .skill-name > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .skill-name img {
    width: 22px;
    height: 22px;
    flex: none;
    border-radius: 3px;
  }
  .upgraded {
    color: var(--accent-secondary);
  }
  .gold {
    color: #ffd54f;
  }
  @container skill-odds (max-width:420px) {
    .skill-odds-scroll .skill-row {
      min-width: 0;
      grid-template-columns: minmax(0, 1fr) 20px repeat(3, 48px);
      gap: 4px;
      padding: 5px 8px;
      font-size: 10px;
    }
    .skill-odds-scroll .skill-header {
      font-size: 8px;
      letter-spacing: 0;
    }
    .skill-name {
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .skill-name img {
      width: 18px;
      height: 18px;
    }
  }
</style>
