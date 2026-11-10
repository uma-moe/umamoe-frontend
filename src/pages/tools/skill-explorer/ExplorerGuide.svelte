<script lang="ts">
  import InfoIcon from '@/components/feedback/InfoIcon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';

  let {
    model,
    checkpoint,
    margin
  }: {
    /** The values' model as players know it, such as V5. */
    model: string;
    checkpoint: string;
    /** How far 8 in 10 checked skills landed from their value, as a share; absent before a check. */
    margin: number | undefined;
  } = $props();

  const percent = (share: number) => Math.round(share * 100);
</script>

<!-- How to read the chart and where its values come from, behind the info button beside the scope's title. -->
<span class="explorer-guide">
  <InspectPopover label="Reading the skill chart">
    {#snippet trigger()}
      <InfoIcon />
    {/snippet}
    <h3>Reading the skill chart</h3>
    <p>
      Each icon is a skill. Its height is the win rate it adds in a Champions Meeting room: +2%
      means about 2 more wins in 100 races. Across, it sits at its mean first activation or at its
      SP cost. The lines split at the middle skill shown, so a weaker skill is only weaker than the
      others on screen.
    </p>
    <p>
      Hover a skill for details and click to pin it. Compare keeps several skills highlighted.
      Scroll or pinch to zoom, and drag to pan once zoomed.
    </p>

    <h3>Skill value</h3>
    <p>
      In build is what a skill adds to the reference build: what our optimizer buys this running
      style here with the SP the latest CM's runners spent on average, before hints. A gold or ◎
      replaces its weaker version, and a skill already in the build shows what removing it costs.
      Optimal times skills like Groundwork at their best tested point. Alone adds the skill to a
      runner with no other skills, like a solo sim.
    </p>
    <p>
      The build holds one own unique and two inherited ones, never both versions of the same unique.
      An own unique shows what it adds in place of the build's own unique, since an uma has only
      one. The unique toggle switches the chart between own and inherited versions.
    </p>
    <p>
      Over all races multiplies the value by how often the reference runner activates the skill: a
      skill worth +10% that activates in half the races shows +5%. Without it, values count only the
      races the skill activates in.
    </p>

    <h3>How values are measured</h3>
    <p>
      Activation rates and points come from players' runners. Every runner of the style in Champions
      Meeting fields on the course is given the skill; debuffers are left out. The fields hold the
      newest CMs' runners at the style mix CMs of that distance ran, and a CM course uses its own
      CM's runners.
    </p>
    <p>
      For the values, a typical runner of the style, with the stats you would expect for the course,
      races those fields thousands of times. {model} (checkpoint {checkpoint}), the model our
      optimizer builds with, turns the time a skill saves where it activates into win rate. Time
      saved in the final spurt counts for more than time at the start.
    </p>
    <p>
      Skills that wait on other activations, like Groundwork, are valued set up: up to four cheap
      skills are bought to open their window as early as possible, and what those add on their own
      does not count. Ground, weather, season and night skills are valued as if the race day had
      their condition and marked Forced; on a CM they show only when its day matches. Skills that
      never activate, negative skills and skills no player can get are left out.
    </p>
    <p>
      A wider view, such as Turf, shows the middle course of the group, and each course keeps its
      own build. All styles averages the styles that can activate a skill.
    </p>

    <h3>Accuracy</h3>
    <p>
      Values are best for comparing skills with each other. Exact numbers are estimates, scaled per
      running style to match full race simulations of its most valuable skills.
      {#if margin !== undefined}
        In those checks, 8 in 10 skills landed within {percent(margin)}% of their value: a skill
        shown at +10% measured between +{percent(0.1 * (1 - margin))}% and +{percent(
          0.1 * (1 + margin)
        )}%.
      {/if}
    </p>

    <h3>Highlight Uma</h3>
    <p>
      Pick an uma to highlight her unique, in the version the toggle shows, and the skills she
      starts with or unlocks with potential levels. Umas not on Global yet use Japanese data. Skills
      from training events are not highlighted.
    </p>
  </InspectPopover>
</span>

<style>
  .explorer-guide {
    display: inline-flex;
    color: var(--text-secondary);
    --inspect-popover-width: 440px;
  }
  h3 {
    margin: 0;
    font-size: 13px;
  }
  h3:not(:first-child) {
    margin-top: 10px;
  }
  p {
    margin: 4px 0 0;
    font-size: 11px;
    color: var(--text-secondary);
    line-height: 1.6;
  }
</style>
