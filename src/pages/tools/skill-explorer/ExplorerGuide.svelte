<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';

  let {
    model,
    checkpoint
  }: {
    /** The values' model as players know it, such as V5. */
    model: string;
    checkpoint: string;
  } = $props();

  let open = $state(false);
</script>

<!-- How to read the chart, when to use the Optimizer instead, and how values are measured. -->
<button
  type="button"
  class="guide-trigger"
  aria-label="How Skill Explorer works"
  onclick={() => (open = true)}
>
  <Icon
    name="info"
    size={14}
  />
  <span>How it works</span>
</button>

<Dialog
  bind:open
  title="How Skill Explorer works"
  description="What these numbers measure, how to read the chart, and when to switch to the Build Optimizer."
  maxWidth="640px"
  maxHeight="86dvh"
  mobileMaxHeight="94dvh"
>
  <div class="guide-body">
    <section class="callout">
      <h3>Skill Explorer vs. Build Optimizer</h3>
      <p>
        <strong>Skill Explorer</strong>
        gives you a fast, broad overview of
        <strong>individual skills</strong>
        across different tracks: where they activate, which proc zones win races, and roughly how much
        win rate each adds on average.
      </p>
      <!-- prettier-ignore -->
      <p>
        Once you are tuning a <strong>specific Uma with a real skill list and SP budget</strong>,
        use the
        <a
          href="/simulator/skills"
          onclick={() => (open = false)}
        >Build Optimizer</a>
        or
        <a
          href="/simulator/race"
          onclick={() => (open = false)}
        >Race Simulator</a>.
        Stacking multiple skills of the same kind (especially acceleration) has diminishing returns,
        and real synergies depend on your full build. Skill Explorer averages across representative
        builds on purpose so it does not overfit to one setup.
      </p>
    </section>

    <section class="guide-section">
      <h3>Reading the chart</h3>
      <ul>
        <!-- prettier-ignore -->
        <li>
          <strong>Win rate, not raw lengths:</strong> Height is the
          <strong>win-rate percentage points</strong> added in full <strong>9-runner rooms</strong>,
          standardized to a <strong>20% ace baseline</strong> (<code>+2%</code> ≈ 2 extra wins per
          100 races). Distance gained alone does not tell the whole story: adding lengths when you
          are already far ahead or far behind barely moves win rate, while a timely burst in a
          contested acceleration or spurt window can decide close races even if the skill does
          little when it triggers early.
        </li>
        <!-- prettier-ignore -->
        <li>
          <strong>Horizontal axis:</strong> Switch between <strong>Activation point</strong>
          (average first proc), <strong>Avg WR proc</strong> (where the skill's win rate actually
          comes from, useful for random corner/straight skills that win mainly when they hit late),
          or <strong>SP efficiency</strong> (plots <strong>win rate per 100 SP</strong> vertically
          against total base SP cost including prerequisites, before hints, so higher means better
          value per SP).
        </li>
        <!-- prettier-ignore -->
        <li>
          <strong>Hover curve &amp; ± range:</strong> Hovering or comparing a skill shows its
          uncertainty curve and <strong>95% range (±)</strong>. Top skills are measured with direct
          paired full races for tighter sampling error, while the rest use the calibrated model with
          a wider estimate range. Treat values as comparison estimates rather than guaranteed exact
          gains on every build.
        </li>
        <li>
          <strong>Skill card proc chart:</strong>
          Bars show where the skill fires, and the
          <strong>green line</strong>
          plots
          <strong>win rate per proc</strong>
          across reliable sections so you can see whether a skill wins consistently or relies on hitting
          a narrow window.
        </li>
      </ul>
    </section>

    <section class="guide-section">
      <h3>Display modes &amp; toggles</h3>
      <ul>
        <li>
          <strong>In build / Optimal / Alone:</strong>
          <em>In build</em>
          adds the skill to representative ace builds for that style (upgrading weaker ○ / white tiers,
          or showing removal cost if already equipped).
          <em>Optimal</em>
          forces gated skills like Groundwork at their best tested timing.
          <em>Alone</em>
          tests the skill on a runner with no other skills.
        </li>
        <!-- prettier-ignore -->
        <li>
          <strong>Normalized vs. Per proc:</strong> <em>Normalized</em> (default) weights value by
          how often the skill activates (<code>value × proc rate</code>: a +10% skill firing half
          the time shows +5%). <em>Per proc</em> shows value only in races where it activates.
        </li>
        <!-- prettier-ignore -->
        <li>
          <strong>Uniques &amp; Evolved:</strong> Switch between <em>Inherited</em> and <em>Own</em>
          uniques (an Uma carries at most 1 own unique and 2 inherited). <em>Evolved</em> skills
          carry a pink frame and stay hidden by default so they do not crowd the chart. Toggle
          <strong>Evolved</strong>, search a base skill, or click <strong>Display evo</strong> on
          its card.
        </li>
      </ul>
    </section>

    <section class="guide-section">
      <h3>How values are measured</h3>
      <ul>
        <li>
          <strong>1:1 game-accurate 9-runner rooms:</strong>
          Activation rates, proc zones, and paired checks come from our 1:1 race simulator running full
          9-runner lobbies (lane movement, blocking, pace-up, overtaking, and real opponent builds from
          recent CMs).
        </li>
        <li>
          <strong>Representative ace ensemble:</strong>
          Each style is evaluated across multiple real non-debuffer ace builds with realistic skill counts
          and forecasted track stats. Click
          <strong>Reference build</strong>
          to inspect the headline build for the selected style.
        </li>
        <li>
          <strong>Model calibrated to full races:</strong>
          {model} (checkpoint {checkpoint}) estimates every skill across those fields and is
          calibrated per style against direct paired full-race checks of the highest-impact skills.
          Check each skill's
          <strong>± range</strong>
          to see how tight its individual estimate is.
        </li>
        <li>
          <strong>Gated &amp; race-day skills:</strong>
          Skills waiting on other activations (such as Groundwork) are set up using up to four cheap early
          skills whose own gain is excluded. Ground, weather, season, and night skills match the CM's
          actual race day (or show as
          <em>Forced</em>
          on generic track groups).
        </li>
      </ul>
    </section>

    <section class="guide-section">
      <h3>Highlight Uma</h3>
      <p>
        Pick an Uma to highlight her unique (in the selected version) and innate or potential
        skills. Unreleased Global Umas use JP data, and training-event skills are not highlighted.
      </p>
    </section>
  </div>

  {#snippet actions()}
    <Button
      variant="secondary"
      onclick={() => (open = false)}
    >
      Close
    </Button>
  {/snippet}
</Dialog>

<style>
  .guide-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    height: 24px;
    padding: 0 0.55rem;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-pill);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-family: inherit;
    font-size: 0.72rem;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition:
      border-color var(--duration-fast),
      color var(--duration-fast),
      background-color var(--duration-fast);
  }

  .guide-trigger:hover {
    border-color: rgb(var(--accent-primary-rgb) / 0.5);
    background: rgb(var(--accent-primary-rgb) / 0.1);
    color: var(--accent-primary);
  }

  .guide-trigger:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }

  .guide-body {
    display: grid;
    gap: 1rem;
    color: var(--text-secondary);
    font-size: 0.82rem;
    line-height: 1.55;
  }

  .callout {
    display: grid;
    gap: 0.45rem;
    padding: 0.75rem 0.9rem;
    border: 1px solid rgb(var(--accent-primary-rgb) / 0.28);
    border-radius: 8px;
    background: rgb(var(--accent-primary-rgb) / 0.08);
  }

  .callout h3 {
    color: var(--accent-primary);
  }

  .guide-section {
    display: grid;
    gap: 0.4rem;
    padding-top: 0.8rem;
    border-top: 1px solid var(--border-subtle);
  }

  h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 0.88rem;
    font-weight: 700;
  }

  p {
    margin: 0;
  }

  ul {
    display: grid;
    gap: 0.45rem;
    margin: 0;
    padding-left: 1.15rem;
  }

  li {
    padding-left: 0.1rem;
  }

  strong {
    color: var(--text-primary);
    font-weight: 650;
  }

  em {
    color: var(--text-primary);
    font-style: normal;
    font-weight: 600;
  }

  .guide-body a {
    color: var(--accent-primary);
    font-weight: 650;
    text-decoration: underline;
    text-decoration-color: rgb(var(--accent-primary-rgb) / 0.45);
    text-underline-offset: 2px;
  }

  .guide-body a:hover {
    text-decoration-color: var(--accent-primary);
  }

  code {
    padding: 0.05rem 0.3rem;
    border-radius: 4px;
    background: var(--surface-3);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 0.76rem;
  }

  @media (max-width: 520px) {
    .guide-trigger {
      padding: 0 0.42rem;
    }

    .guide-trigger span {
      display: none;
    }
  }
</style>
