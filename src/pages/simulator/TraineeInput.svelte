<script lang="ts">
  import SelectField from '@/components/SelectField.svelte';
  import { veteranBaseStat } from '@/lib/profile/profile-veterans';
  import { getRankInfoFromLabel } from '@/lib/rank';
  import { APTITUDE_GRADES } from './stamina-request';
  import { RUNNING_STYLES, createTrainee, type Trainee } from './trainee';

  interface Props {
    trainee?: Trainee;
  }

  let { trainee = $bindable(createTrainee()) }: Props = $props();

  // Several surfaces render one editor per runner, so ids must not collide.
  const uid = $props.id();

  const gameIcon = (file: string): string => `/game-assets/textures/${file}`;

  type StatKey = 'speed' | 'stamina' | 'power' | 'guts' | 'wisdom';
  type AptitudeKey = 'groundAptitudes' | 'distanceAptitudes' | 'styleAptitudes';

  /** Fixed to the game's stat order and colours, so the row reads like the in-game card. */
  const STATS: ReadonlyArray<{ key: StatKey; label: string; full: string; icon: string }> = [
    { key: 'speed', label: 'Speed', full: 'Speed', icon: gameIcon('speed.webp') },
    { key: 'stamina', label: 'Stamina', full: 'Stamina', icon: gameIcon('stamina.webp') },
    { key: 'power', label: 'Power', full: 'Power', icon: gameIcon('power.webp') },
    { key: 'guts', label: 'Guts', full: 'Guts', icon: gameIcon('guts.webp') },
    { key: 'wisdom', label: 'Wit', full: 'Wisdom', icon: gameIcon('wit.webp') }
  ];

  const MOOD_OPTIONS = [
    { value: '1', label: 'Awful', image: gameIcon('awful.webp') },
    { value: '2', label: 'Bad', image: gameIcon('bad.webp') },
    { value: '3', label: 'Normal', image: gameIcon('normal.webp') },
    { value: '4', label: 'Good', image: gameIcon('good.webp') },
    { value: '5', label: 'Great', image: gameIcon('great.webp') }
  ];

  const STYLE_OPTIONS = RUNNING_STYLES.map((style) => ({ value: style, label: style }));

  /** Grade badges are the same rank textures the veteran pages use. */
  function gradeIcon(grade: string): string {
    const index = getRankInfoFromLabel(grade).iconIndex;
    return `${gameIcon('uma_ranks/utx_ico_statusrank_')}${String(index).padStart(2, '0')}.webp`;
  }

  const GRADE_OPTIONS = APTITUDE_GRADES.map((grade) => ({
    value: grade,
    label: grade,
    image: gradeIcon(grade)
  }));

  interface AptitudeItem {
    key: AptitudeKey;
    index: number;
    label: string;
  }

  /** Grouped as the game presents them: surface first, then the four distance and style slots. */
  const APTITUDE_GROUPS: ReadonlyArray<{ label: string; items: ReadonlyArray<AptitudeItem> }> = [
    {
      label: 'Track',
      items: [
        { key: 'groundAptitudes', index: 0, label: 'Turf' },
        { key: 'groundAptitudes', index: 1, label: 'Dirt' }
      ]
    },
    {
      label: 'Distance',
      items: [
        { key: 'distanceAptitudes', index: 0, label: 'Sprint' },
        { key: 'distanceAptitudes', index: 1, label: 'Mile' },
        { key: 'distanceAptitudes', index: 2, label: 'Medium' },
        { key: 'distanceAptitudes', index: 3, label: 'Long' }
      ]
    },
    {
      label: 'Style',
      items: [
        { key: 'styleAptitudes', index: 0, label: 'Nige' },
        { key: 'styleAptitudes', index: 1, label: 'Senko' },
        { key: 'styleAptitudes', index: 2, label: 'Sashi' },
        { key: 'styleAptitudes', index: 3, label: 'Oikomi' }
      ]
    }
  ];

  /**
   * The engine's view of each stat: points past 1200 count half, then mood scales
   * the total. Beside Raw it keeps overtrained numbers honest.
   */
  const adjusted = $derived.by(() =>
    STATS.map((stat) => {
      const typed = String(trainee[stat.key] ?? '').trim();
      if (typed === '') return '—';
      const value = veteranBaseStat(Number(typed), Number(trainee.motivation) - 3);
      return value === null || !Number.isFinite(value) ? '—' : String(Math.round(value));
    })
  );

  /** Keeps the bound value a plain stat: digits only, four of them at most. */
  function setStat(key: StatKey, event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 4);
    if (input.value !== digits) input.value = digits;
    trainee[key] = digits;
  }
</script>

<div class="runner-card">
  <div class="stats">
    <div class="stats-row">
      <span class="row-label" aria-hidden="true"></span>
      {#each STATS as stat (stat.key)}
        <span class="stat-name" title={stat.full}>
          <img src={stat.icon} alt="" />
          <span>{stat.label}</span>
        </span>
      {/each}
    </div>

    <div class="stats-row">
      <span class="row-label" aria-hidden="true">Raw</span>
      {#each STATS as stat (stat.key)}
        <input
          id="{uid}-{stat.key}"
          class="stat-input"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder="0"
          aria-label="{stat.full} raw"
          value={trainee[stat.key]}
          oninput={(event) => setStat(stat.key, event)}
        />
      {/each}
    </div>

    <div class="stats-row">
      <span class="row-label" aria-hidden="true">Adj</span>
      {#each STATS as stat, index (stat.key)}
        <output class="stat-adjusted" for="{uid}-{stat.key}">{adjusted[index]}</output>
      {/each}
    </div>
  </div>

  <p class="hint">
    Adj is the stat as the engine sees it: points past 1200 count half, then mood scales the result.
  </p>

  <div class="aptitudes">
    {#each APTITUDE_GROUPS as group (group.label)}
      <div class="aptitude-row">
        <span class="aptitude-group" aria-hidden="true">{group.label}</span>
        <div class="aptitude-items">
          {#each group.items as item (item.key + item.index)}
            <div class="aptitude">
              <span class="aptitude-label" aria-hidden="true">{item.label}</span>
              <div class="aptitude-select">
                <SelectField
                  id="{uid}-{item.key}-{item.index}"
                  label="{item.label} aptitude"
                  hideLabel
                  imageOnly
                  options={GRADE_OPTIONS}
                  value={trainee[item.key][item.index]}
                  onchange={(value) => (trainee[item.key][item.index] = value)}
                />
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <div class="picks">
    <SelectField
      id="{uid}-running-style"
      label="Strategy"
      options={STYLE_OPTIONS}
      bind:value={trainee.runningStyle}
    />
    <SelectField
      id="{uid}-motivation"
      label="Motivation"
      options={MOOD_OPTIONS}
      bind:value={trainee.motivation}
    />
  </div>
</div>

<style>
  .runner-card { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; container-type: inline-size; }

  .stats { display: flex; flex-direction: column; gap: 5px; padding: var(--space-2); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--card-surface-bg); }
  .stats-row { display: grid; grid-template-columns: auto repeat(5, minmax(0, 1fr)); align-items: center; gap: 4px; }
  .row-label { padding-right: 4px; color: var(--color-text-subtle); font-size: 9px; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; }
  .stat-name { min-width: 0; display: flex; align-items: center; justify-content: center; gap: 3px; color: var(--color-text); font-size: 10px; font-weight: 650; }
  .stat-name img { width: 14px; height: 14px; flex: 0 0 auto; object-fit: contain; }
  .stat-name span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stat-input { width: 100%; min-width: 0; height: 30px; padding: 0 4px; border: 1px solid var(--factor-field-border); border-radius: 6px; background: var(--bg-primary); color: var(--factor-field-text); font-family: inherit; font-size: 13px; font-variant-numeric: tabular-nums; text-align: center; }
  .stat-input::placeholder { color: var(--factor-field-placeholder); }
  .stat-input:hover { border-color: var(--border-secondary); }
  .stat-input:focus { border-color: var(--factor-field-focus-border); outline: 0; background: var(--factor-field-focus-bg); box-shadow: var(--focus-ring); }
  .stat-adjusted { display: block; color: var(--color-text-muted); font-size: 12px; font-variant-numeric: tabular-nums; text-align: center; }

  .hint { margin: 0; color: var(--color-text-subtle); font-size: var(--font-xs); }

  .aptitudes { display: flex; flex-direction: column; gap: 6px; padding: var(--space-2); border-radius: var(--radius-md); background: var(--color-surface-2); }
  .aptitude-row { display: grid; grid-template-columns: 46px minmax(0, 1fr); align-items: center; gap: 6px; }
  .aptitude-group { color: var(--color-text-subtle); font-size: 10px; font-weight: 750; letter-spacing: 0.04em; }
  .aptitude-items { min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
  .aptitude { min-width: 0; max-width: 150px; flex: 1 1 110px; display: flex; align-items: center; justify-content: space-between; gap: 4px; }
  .aptitude-label { color: var(--color-text-muted); font-size: 11px; white-space: nowrap; }
  .aptitude-select { width: 46px; }
  /* The shared select is sized for a full-width form field; here it is a compact badge. */
  .aptitude-select :global(button.select-control) { min-height: 28px; padding: 0 4px; border-radius: 6px; }
  .aptitude-select :global(button.select-control img) { width: 18px; height: 18px; }
  .aptitude-select :global(div.select-panel) { left: auto; right: 0; width: max-content; min-width: 100%; }

  .picks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }

  /* Icons alone once the labels no longer fit without ellipsis. */
  @container (max-width: 300px) {
    .stat-name span { display: none; }
    .picks { grid-template-columns: 1fr; }
  }
</style>
