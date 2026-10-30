<script lang="ts">
  import { number } from '../cm-data';
  import type { SkillOverview } from '../cm-exploration';
  import type { Course } from '../../race-analysis/replay/replay-course';
  import CmSkillLanes from './CmSkillLanes.svelte';
  import Combobox from '@/components/controls/Combobox.svelte';
  import Button from '@/components/controls/Button.svelte';
  import type { CmSkillDetails } from './cm-skill-details.svelte';

  interface Props {
    overview: SkillOverview;
    style: string;
    skills: { id: number; name: string }[];
    course?: Course;
    courseLabel?: string;
    selected: number[];
    details: CmSkillDetails;
    colors: Record<number, string>;
    skillName: (id: number) => string;
    element?: HTMLElement;
  }

  let {
    overview,
    style,
    skills,
    details,
    colors,
    skillName,
    course,
    courseLabel,
    selected = $bindable(),
    element = $bindable()
  }: Props = $props();

  let searchAnchor = $state<HTMLDivElement>();

  const comparisonOptions = $derived(
    skills
      .filter((row) => !selected.includes(row.id))
      .map((row) => ({ value: String(row.id), label: row.name + ' · ID ' + row.id }))
  );
</script>

{#if selected.length}
  <section
    class="comparison"
    bind:this={element}
    aria-label="Skill comparison"
  >
    <header>
      <div>
        <h2>
          Compare activation distances <span>
            {selected.length} skill{selected.length === 1 ? '' : 's'} · {number(
              overview.courseDistance
            )} m
          </span>
        </h2>
        <p class="sr-only">
          Compare activations normalized to each skill’s peak on one distance axis. Colour and line
          patterns identify each skill in the table.
        </p>
      </div>
      <div class="comparison-tools">
        <div
          class="comparison-add"
          bind:this={searchAnchor}
        >
          <Combobox
            id="cm-comparison-add"
            label="Add a skill to comparison"
            hideLabel
            placeholder="Search by skill name or ID…"
            prefixIcon="search"
            action
            popupAnchor={searchAnchor}
            options={comparisonOptions}
            onchange={(value) => {
              const id = Number(value);
              if (!selected.includes(id)) selected = [...selected, id];
            }}
            emptyText="No more matching skills in this running style."
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onclick={() => (selected = [])}
        >
          Clear comparison
        </Button>
      </div>
    </header>
    <CmSkillLanes
      {overview}
      {style}
      bind:selected
      {course}
      {courseLabel}
      {details}
      {colors}
      {skillName}
    />
  </section>
{/if}

<style>
  @import './skill-sections.css';
  .comparison {
    min-width: 0;
    margin-top: 16px;
    scroll-margin-top: 80px;
    padding: 12px;
    border: 1px solid var(--card-surface-border);
    border-radius: var(--radius-lg);
    background: var(--card-surface-bg);
  }
  .comparison-tools {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .comparison-tools :global(button.ui-button) {
    min-height: 28px;
    font-size: 11px;
  }
  .comparison-add {
    width: 320px;
    max-width: 100%;
    margin: 0;
  }
  @media (max-width: 600px) {
    .comparison-tools {
      width: 100%;
    }
    .comparison-add {
      flex: 1;
      min-width: 200px;
    }
    .comparison {
      scroll-margin-top: 60px;
    }
  }
</style>
