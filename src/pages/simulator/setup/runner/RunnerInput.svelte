<script lang="ts">
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import type { AptitudeGradeValue } from '@/components/game/AptitudeGrade.svelte';
  import Menu from '@/components/navigation/Menu.svelte';
  import type { RaceCourse } from '@/lib/game-data/racing/courses';
  import { moodIcon, runningStyleName } from '@/lib/race/replay/race-display';
  import { getRankInfoFromLabel, getStatRankInfo, rankIconPath } from '@/lib/rank';
  import { APTITUDE_GRADES } from '../../requests/stamina-request';
  import type { SimulatorUma } from '../../simulator-uma';
  import SimSection from '../../shell/SimSection.svelte';
  import SimulatorUmaEditor from './editor/SimulatorUmaEditor.svelte';
  import OwnedSkills from './OwnedSkills.svelte';
  import RunnerCharacterPicker from './RunnerCharacterPicker.svelte';
  import SimulatorVeteranPicker from '../veterans/SimulatorVeteranPicker.svelte';
  import { GREEN_BONUS, withBonus, type HpPlan } from '../hp/hp-plan';
  import { RUNNING_STYLES } from '../trainee';

  /**
   * The runner, typed in directly: stats (with what green skills make them, when the page counts those), running
   * style, mood and her aptitudes for this course. Her character, stat and aptitude grades carry the game's icons;
   * the skills she owns sit under the fields with their own editor. Shared by the HP calculator and Build search.
   */
  let {
    uma = $bindable(),
    green,
    course,
    note,
    onbuild,
    oncode
  }: {
    uma: SimulatorUma;
    /** Green skills by the stat they raise, as the HP calculator counts them; left out, the stats stand alone. */
    green?: HpPlan['green'];
    course?: RaceCourse;
    note?: string;
    /** Her build changed under the page's own controls, so the page can recount it. */
    onbuild?: (uma: SimulatorUma) => void;
    /** Opens the page's build code dialog. */
    oncode?: () => void;
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

  const uid = $props.id();

  const STYLE_OPTIONS = RUNNING_STYLES.map((value, index) => ({
    value,
    label: runningStyleName(index + 1)
  }));

  // Mood and grades with their in-game icons, as the editor shows them.
  const MOOD_OPTIONS = (['Great', 'Good', 'Normal', 'Bad', 'Awful'] as const).map(
    (label, index) => ({
      value: String(5 - index),
      label,
      image: moodIcon(label)
    })
  );

  const GRADE_OPTIONS = APTITUDE_GRADES.map((grade) => ({
    value: grade,
    label: grade,
    image: rankIconPath(getRankInfoFromLabel(grade).iconIndex)
  }));

  const styleIndex = $derived(
    RUNNING_STYLES.indexOf(uma.trainee.runningStyle as (typeof RUNNING_STYLES)[number])
  );

  /** The stat with its green skills, when it has any. */
  function withGreens(key: (typeof STATS)[number][0]) {
    if (!green) return undefined;
    const bonus = green[key].gold * GREEN_BONUS.gold + green[key].white * GREEN_BONUS.white;
    const raw = Number(uma.trainee[key]);
    return bonus && Number.isFinite(raw) && raw > 0 ? withBonus(raw, bonus) : undefined;
  }

  // Her aptitudes for this course and style, each one entry of the trainee's full grid.
  const aptitudes = $derived.by(() => {
    const entries = [
      {
        id: 'distance',
        label: 'Distance',
        list: 'distanceAptitudes',
        index: (course?.distance_type ?? 3) - 1
      },
      {
        id: 'surface',
        label: 'Track',
        list: 'groundAptitudes',
        index: (course?.surface ?? 1) - 1
      },
      {
        id: 'style',
        label: 'Style',
        list: 'styleAptitudes',
        index: styleIndex === 4 ? 0 : Math.max(0, styleIndex)
      }
    ] as const;

    return entries.map((entry) => ({
      ...entry,
      grade: (uma.trainee[entry.list][entry.index] ?? 'A') as AptitudeGradeValue
    }));
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
    <Menu
      label="Import"
      menuLabel="Import a runner"
      icon="upload"
      items={[
        { id: 'veterans', label: 'Choose from Veterans', icon: 'veterans' },
        ...(oncode ? [{ id: 'code', label: 'Build code', icon: 'clipboard' as const }] : [])
      ]}
      onselect={(id) => (id === 'code' ? oncode?.() : (veteransOpen = true))}
    />
  {/snippet}
  <div class="runner-fields">
    <div class="fields stats">
      <div class="picker-slot">
        <span class="picker-label">Uma</span>
        <RunnerCharacterPicker
          {uma}
          onchange={() => onbuild?.(uma)}
        />
      </div>
      {#each STATS as [key, label, icon]}
        {@const effective = withGreens(key)}
        {@const rank = getStatRankInfo(Number(uma.trainee[key]))}
        <div class="stat">
          <TextField
            id="{uid}-{key}"
            {label}
            type="number"
            min={1}
            max={3000}
            labelImage="/assets/images/icon/stats/{icon}.webp"
            prefixImage={rankIconPath(rank.iconIndex)}
            bind:value={uma.trainee[key]}
          />
          <span class="sr-only">{label} rank {rank.label}</span>
          {#if effective !== undefined}<small
              class="effective"
              title="{effective.toLocaleString('en-US')} with green skills"
            >
              → {effective.toLocaleString('en-US')}
              <span class="sr-only">{' with greens'}</span>
            </small>{/if}
        </div>
      {/each}
    </div>
    <div class="fields">
      <SelectField
        id="{uid}-style"
        label="Running style"
        options={STYLE_OPTIONS}
        bind:value={uma.trainee.runningStyle}
        onchange={() => onbuild?.(uma)}
      />
      <SelectField
        id="{uid}-mood"
        label="Mood"
        imageOnly
        options={MOOD_OPTIONS}
        bind:value={uma.trainee.motivation}
      />
      {#each aptitudes as aptitude (aptitude.id)}
        <SelectField
          id="{uid}-aptitude-{aptitude.id}"
          label={aptitude.label}
          imageOnly
          options={GRADE_OPTIONS}
          value={aptitude.grade}
          onchange={(grade) => (uma.trainee[aptitude.list][aptitude.index] = grade)}
        />
      {/each}
    </div>
  </div>
  <OwnedSkills
    {uma}
    onedit={() => (editorOpen = true)}
    onchange={() => onbuild?.(uma)}
  />
</SimSection>

<SimulatorVeteranPicker
  bind:open={veteransOpen}
  onselect={load}
/>
<SimulatorUmaEditor
  {uma}
  {course}
  focusSkills
  bind:open={editorOpen}
  onsave={load}
/>

<style>
  /* Stats, then style, mood and aptitudes; one row of ten once the form is wide enough for them. */
  .runner-fields {
    display: grid;
    gap: 8px 12px;
  }
  @container sim-form (min-width: 1280px) {
    .runner-fields {
      /* Her character, five stats, then her running style with room for its name, the mood icon with only what it
         needs, and the three aptitudes, which take less room. */
      grid-template-columns:
        minmax(0, 1.15fr) repeat(5, minmax(0, 1fr)) minmax(0, 1.35fr)
        minmax(80px, 0.6fr) repeat(3, minmax(0, 0.8fr));
    }
    .runner-fields > .fields {
      display: contents;
    }
  }
  .fields {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px 12px;
    --control-height: var(--setup-control-height, 36px);
  }
  .fields.stats {
    grid-template-columns: auto repeat(5, minmax(0, 1fr));
  }
  .fields:not(.stats) {
    grid-template-columns: minmax(0, 1.35fr) minmax(80px, 0.6fr) repeat(3, minmax(0, 0.8fr));
  }
  /* No row gap: the picker's dialog is an empty row of the slot, and a gap before it would make the Runner row taller
     than the stat fields, stretching the selects beside them. */
  .picker-slot {
    display: grid;
    align-content: start;
    min-width: 0;
  }
  .picker-label {
    margin-bottom: 4px;
    color: var(--color-text);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.2;
  }
  .stats {
    align-items: start;
  }
  .stat {
    position: relative;
    display: grid;
    gap: 4px;
    min-width: 0;
    container: hp-stat / inline-size;
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
  /* The stat input shares its width with the rank icon and the steppers; keep enough for four digits. */
  .stats :global(input) {
    padding-left: 38px;
    padding-right: 30px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .stats :global(.prefix-icon) {
    left: 12px;
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
  /* A phone: all five stats still in one row; style and mood share a line, the three aptitudes the next. */
  @container sim-form (max-width:560px) {
    .runner-fields,
    .fields {
      gap: 6px 8px;
    }
    .fields.stats {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
    .picker-slot {
      grid-column: 1 / -1;
    }
    .fields:not(.stats) {
      grid-template-columns: repeat(6, minmax(0, 1fr));
      align-items: end;
    }
    .fields:not(.stats) > :global(*) {
      grid-column: span 2;
    }
    .fields:not(.stats) > :global(*:nth-child(-n + 2)) {
      grid-column: span 3;
    }
    /* The phone's number pad sets a stat, so the steppers make room for the four digits and their grade. */
    .stats :global(.number-controls) {
      display: none;
    }
    .stats :global(input),
    .stats :global(input.has-prefix) {
      padding-inline: 4px;
    }
    .stats :global(input.has-prefix) {
      padding-left: 23px;
    }
    .stats :global(.prefix-icon) {
      left: 5px;
      width: 14px;
      height: 14px;
    }
    .fields :global(.field-label.with-image) {
      gap: 3px;
    }
    .fields :global(.label-icon) {
      width: 12px;
      height: 12px;
    }
  }
</style>
