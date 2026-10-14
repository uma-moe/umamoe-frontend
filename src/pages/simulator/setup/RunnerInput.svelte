<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
  import { runningStyleName } from '@/lib/race/race-display';
  import SimulatorRunnerFace from '../reports/SimulatorRunnerFace.svelte';
  import { APTITUDE_GRADES } from '../requests/stamina-request';
  import type { SimulatorUma } from '../simulator-uma';
  import SimSection from '../shell/SimSection.svelte';
  import SimulatorUmaEditor from './SimulatorUmaEditor.svelte';
  import SimulatorVeteranPicker from './SimulatorVeteranPicker.svelte';
  import { GREEN_BONUS, withBonus, type HpPlan } from './hp-plan';
  import { RUNNING_STYLES } from './trainee';

  /**
   * The runner, typed in directly: stats (with what green skills make them, when the page counts those), running
   * style, mood and her aptitudes for this course. Veterans or the full editor fill in a whole build at once, skills
   * included. Shared by the HP calculator and Build search.
   */
  let {
    uma = $bindable(),
    green,
    course,
    idPrefix = 'hp',
    note,
    onbuild,
    oncode,
    children
  }: {
    uma: SimulatorUma;
    /** Green skills by the stat they raise, as the HP calculator counts them; left out, the stats stand alone. */
    green?: HpPlan['green'];
    course?: CourseCatalogEntry;
    /** Keeps field ids apart between pages. */
    idPrefix?: string;
    note?: string;
    /** A whole build was loaded or edited. */
    onbuild?: (uma: SimulatorUma) => void;
    /** Opens the page's build code dialog. */
    oncode?: () => void;
    /** More about her under the fields, such as the skills she owns. */
    children?: Snippet;
  } = $props();

  let veteransOpen = $state(false),
    editorOpen = $state(false);

  const STATS = [
    ['speed', 'Speed', 'speed'],
    ['stamina', 'Stamina', 'stamina'],
    ['power', 'Power', 'power'],
    ['guts', 'Guts', 'guts'],
    ['wisdom', 'Wit', 'wit']
  ] as const;
  const STYLE_OPTIONS = RUNNING_STYLES.map((value, index) => ({
    value,
    label: runningStyleName(index + 1)
  }));
  const MOOD_OPTIONS = ['Great', 'Good', 'Normal', 'Bad', 'Awful'].map((label, index) => ({
    value: String(5 - index),
    label
  }));
  const GRADE_OPTIONS = APTITUDE_GRADES.map((grade) => ({ value: grade, label: grade }));

  /** The stat with its green skills, when it has any. */
  function withGreens(key: (typeof STATS)[number][0]) {
    if (!green) return undefined;
    const bonus = green[key].gold * GREEN_BONUS.gold + green[key].white * GREEN_BONUS.white;
    const raw = Number(uma.trainee[key]);
    return bonus && Number.isFinite(raw) && raw > 0 ? withBonus(raw, bonus) : undefined;
  }
  // Her aptitudes for this course and style, each one entry of the trainee's full grid.
  const aptitudes = $derived.by(() => {
    const style = RUNNING_STYLES.indexOf(
      uma.trainee.runningStyle as (typeof RUNNING_STYLES)[number]
    );
    return [
      {
        id: 'distance',
        label: 'Distance',
        list: 'distanceAptitudes',
        index: (course?.distance_type ?? 3) - 1
      },
      {
        id: 'surface',
        label: 'Surface',
        list: 'groundAptitudes',
        index: (course?.surface ?? 1) - 1
      },
      {
        id: 'style',
        label: 'Style',
        list: 'styleAptitudes',
        index: style === 4 ? 0 : Math.max(0, style)
      }
    ] as const;
  });

  function load(value: SimulatorUma) {
    uma = value;
    onbuild?.(value);
  }
</script>

<SimSection
  number={1}
  title="Runner"
  {note}
>
  {#snippet actions()}
    {#if uma.cardId}<span class="identity">
        <SimulatorRunnerFace
          cardId={uma.cardId}
          size={24}
        />
        {uma.name}
      </span>{/if}
    <Button
      variant="secondary"
      size="sm"
      icon="veterans"
      onclick={() => (veteransOpen = true)}
    >
      Choose from Veterans
    </Button>
    {#if oncode}<Button
        variant="secondary"
        size="sm"
        icon="clipboard"
        onclick={oncode}
      >
        Build code
      </Button>{/if}
    <Button
      variant="secondary"
      size="sm"
      icon="edit"
      onclick={() => (editorOpen = true)}
    >
      Full build &amp; skills
    </Button>
  {/snippet}
  <div class="fields stats">
    {#each STATS as [key, label, icon]}
      {@const effective = withGreens(key)}
      <div class="stat">
        <TextField
          id="{idPrefix}-{key}"
          {label}
          type="number"
          min={1}
          max={3000}
          prefixImage="/assets/images/icon/stats/{icon}.webp"
          bind:value={uma.trainee[key]}
        />
        {#if effective !== undefined}<small
            class="effective"
            title="{effective.toLocaleString()} with green skills"
          >
            → {effective.toLocaleString()}
            <span class="sr-only">{' with greens'}</span>
          </small>{/if}
      </div>
    {/each}
  </div>
  <div class="fields">
    <SelectField
      id="{idPrefix}-style"
      label="Running style"
      options={STYLE_OPTIONS}
      bind:value={uma.trainee.runningStyle}
    />
    <SelectField
      id="{idPrefix}-mood"
      label="Mood"
      options={MOOD_OPTIONS}
      bind:value={uma.trainee.motivation}
    />
    {#each aptitudes as aptitude (aptitude.id)}
      <SelectField
        id="{idPrefix}-aptitude-{aptitude.id}"
        label="{aptitude.label} aptitude"
        options={GRADE_OPTIONS}
        value={uma.trainee[aptitude.list][aptitude.index] ?? 'A'}
        onchange={(grade) => (uma.trainee[aptitude.list][aptitude.index] = grade)}
      />
    {/each}
  </div>
  {@render children?.()}
</SimSection>

<SimulatorVeteranPicker
  bind:open={veteransOpen}
  onselect={load}
/>
<SimulatorUmaEditor
  {uma}
  bind:open={editorOpen}
  onsave={load}
/>

<style>
  .fields {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px 12px;
    --control-height: var(--setup-control-height, 36px);
  }
  .fields :global(.field) {
    gap: 4px;
  }
  .fields :global(label) {
    font-size: 12px;
  }
  .fields :global(input),
  .fields :global(.select-control) {
    font-size: 13px;
  }
  .stats {
    align-items: start;
  }
  .stats :global(input) {
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .stat {
    position: relative;
    display: grid;
    gap: 4px;
    min-width: 0;
    container: hp-stat / inline-size;
  }
  /* The stat with its greens, on the label line so it takes no row of its own. */
  .effective {
    position: absolute;
    top: 0;
    right: 0;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--color-green);
    font-variant-numeric: tabular-nums;
  }
  .identity {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
  }
  /* A narrow form, as on a tablet: three stats a row. */
  @container sim-form (max-width:640px) {
    .stats {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  /* On a phone: three stats a row and two fields a row, without the stat icons. */
  @container sim-form (max-width:560px) {
    .fields {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .stats {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .stats :global(.prefix-icon) {
      display: none;
    }
    .stats :global(input.has-prefix) {
      padding-left: 10px;
    }
  }
</style>
