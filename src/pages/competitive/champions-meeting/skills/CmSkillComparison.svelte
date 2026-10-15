<script lang="ts">
  import { number } from '../cm-data';
  import type { SkillOverview } from '../cm-exploration';
  import type { Course } from '../../race-analysis/replay/replay-course';
  import CmSkillLanes from './CmSkillLanes.svelte';
  import Combobox from '@/components/controls/Combobox.svelte';
  import Button from '@/components/controls/Button.svelte';

  interface Props {
    overview: SkillOverview;
    style: string;
    skills: { id: number; name: string }[];
    course?: Course;
    courseLabel: string;
    selected: number[];
    element?: HTMLElement;
  }

  let {
    overview,
    style,
    skills,
    course,
    courseLabel,
    selected = $bindable(),
    element = $bindable()
  }: Props = $props();

  const comparisonOptions = $derived(
    skills
      .filter((row) => !selected.includes(row.id))
      .map((row) => ({ value: String(row.id), label: row.name + ' [Id ' + row.id + ']' }))
  );
</script>

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
      <p>Compare where skills activate, using a shared distance cursor.</p>
    </div>
    <div class="comparison-tools">
      <div class="comparison-add">
        <Combobox
          id="cm-comparison-add"
          label="Add a skill to comparison"
          hideLabel
          placeholder="Search by skill name or ID…"
          prefixIcon="search"
          action
          options={comparisonOptions}
          onchange={(value) => {
            const id = Number(value);
            if (!selected.includes(id)) selected = [...selected, id];
          }}
          emptyText="No more matching skills in this running style."
        />
      </div>
      {#if selected.length}
        <Button
          variant="ghost"
          size="sm"
          onclick={() => (selected = [])}
        >
          Clear comparison
        </Button>
      {/if}
    </div>
  </header>
  {#if selected.length}
    <CmSkillLanes
      {overview}
      {style}
      bind:selected
      {course}
      {courseLabel}
    />
  {:else}
    <p class="comparison-empty">
      Use <strong>Compare</strong>
      in the list or search above to add skills here. Opening a skill’s details keeps your comparison
      intact.
    </p>
  {/if}
</section>

<style>
  @import './skill-sections.css';
  .comparison {
    min-width: 0;
    margin-top: 16px;
    scroll-margin-top: 80px;
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
  .comparison-empty {
    padding: 6px 0;
    font-size: 12px;
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
