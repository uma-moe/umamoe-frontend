<script
  lang="ts"
  module
>
  import type { skillRarity } from '@/lib/game-data/skills/skills';

  /** A skill the explorer names beside another: a unique by its uma, any other by its icon. */
  export interface RelatedSkill {
    skillId: number;
    name: string;
    image?: string;
    rarity: ReturnType<typeof skillRarity>;
  }
</script>

<script lang="ts">
  import SkillChip from '@/components/game/SkillChip.svelte';

  interface Props {
    skills: RelatedSkill[];
    /** Chips at the size of a card's text; off, the chip's own size (the reference build's dialog). */
    compact?: boolean;
  }

  let { skills, compact = true }: Props = $props();
</script>

<!-- The explorer's skill lists (the reference build, a card's partners and feeders): fixed-width chips two to a row. -->
<ul
  class="chips"
  class:compact
>
  {#each skills as skill (skill.skillId)}
    <li>
      <SkillChip
        name={skill.name}
        icon={skill.image}
        rarity={skill.rarity}
        fill
      />
    </li>
  {/each}
</ul>

<style>
  .chips {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 3px 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
  }

  /* An odd last skill takes the whole row. */
  li:last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }

  /* A chip shrinks to its column, cutting its name short. */
  li :global(.skill-chip) {
    flex: 1 1 auto;
    min-width: 0;
  }

  li :global(.skill-chip .skill-body) {
    align-items: center;
  }

  /* Compact: at the size of the card's text. */
  .compact li :global(.skill-chip) {
    min-height: 20px;
    font-size: 0.68rem;
  }

  .compact li :global(.skill-chip img) {
    width: 20px;
    height: 20px;
  }

  .compact li :global(.skill-chip .skill-body) {
    min-height: 20px;
    padding: 0 6px;
  }

  /* The image is set off from the name by the chip's own border. */
  li :global(.skill-chip.with-icon .skill-body) {
    border-left: 1px solid var(--skill-border);
  }

  /* A unique shows its uma's portrait, which has no frame of its own: give it a frame like the skill icons', in the
     chip's colours, which also sets it off from the name. */
  li :global(.skill-chip[class*='rarity-unique'] img) {
    box-sizing: border-box;
    border: 2px solid var(--skill-border);
    border-radius: 6px 0 0 6px;
    background: var(--skill-bg);
    object-fit: cover;
    object-position: top;
  }

  li :global(.skill-chip.rarity-unique-main img) {
    border-color: rgb(255 209 102 / 0.55);
  }

  li :global(.skill-chip[class*='rarity-unique'] .skill-body) {
    border-left: 0;
  }
</style>
