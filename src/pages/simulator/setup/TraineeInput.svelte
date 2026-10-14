<script lang="ts">
  import SelectField from '@/components/controls/SelectField.svelte';
  import { veteranBaseStat } from '@/lib/profile/profile-veterans';
  import { getRankInfoFromLabel } from '@/lib/rank';
  import { selectedCourse } from '../simulator-session.svelte';
  import { APTITUDE_GRADES } from '../requests/stamina-request';
  import { RUNNING_STYLES, createTrainee, type Trainee } from './trainee';

  let { trainee = $bindable(createTrainee()) }: { trainee?: Trainee } = $props();
  const uid = $props.id();

  const STATS = [
    { key: 'speed', label: 'Speed', icon: 'speed' },
    { key: 'stamina', label: 'Stamina', icon: 'stamina' },
    { key: 'power', label: 'Power', icon: 'power' },
    { key: 'guts', label: 'Guts', icon: 'guts' },
    { key: 'wisdom', label: 'Wit', icon: 'wit' }
  ] as const;
  const MOODS = ['Awful', 'Bad', 'Normal', 'Good', 'Great'].map((label, index) => ({
    value: String(index + 1),
    label,
    image: '/game-assets/textures/' + label.toLowerCase() + '.webp'
  }));
  const STYLES = RUNNING_STYLES.map((style, index) => ({
    value: style,
    label: ['Front Runner', 'Pace Chaser', 'Late Surger', 'End Closer', 'Runaway'][index]!
  }));
  const GRADES = APTITUDE_GRADES.map((grade) => ({
    value: grade,
    label: grade,
    image:
      '/game-assets/textures/uma_ranks/utx_ico_statusrank_' +
      String(getRankInfoFromLabel(grade).iconIndex).padStart(2, '0') +
      '.webp'
  }));

  type AptitudeKey = 'groundAptitudes' | 'distanceAptitudes' | 'styleAptitudes';

  type Aptitude = { key: AptitudeKey; index: number; label: string };

  const groups: { label: string; items: Aptitude[] }[] = [
    {
      label: 'Surface',
      items: ['Turf', 'Dirt'].map((label, index) => ({ key: 'groundAptitudes', index, label }))
    },
    {
      label: 'Distance',
      items: ['Sprint', 'Mile', 'Medium', 'Long'].map((label, index) => ({
        key: 'distanceAptitudes',
        index,
        label
      }))
    },
    {
      label: 'Style',
      items: ['Front Runner', 'Pace Chaser', 'Late Surger', 'End Closer'].map((label, index) => ({
        key: 'styleAptitudes',
        index,
        label
      }))
    }
  ];

  const active = $derived.by<Aptitude[]>(() => {
    const course = selectedCourse(),
      style = RUNNING_STYLES.indexOf(trainee.runningStyle as (typeof RUNNING_STYLES)[number]);
    return [
      { ...groups[0]!.items[(course?.surface ?? 1) - 1]! },
      { ...groups[1]!.items[(course?.distance_type ?? 3) - 1]! },
      { ...groups[2]!.items[style === 4 ? 0 : Math.max(0, style)]!, label: 'Style' }
    ];
  });

  function setStat(key: (typeof STATS)[number]['key'], event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    trainee[key] = input.value.replace(/\D/g, '').slice(0, 4);
    input.value = trainee[key];
  }
</script>

{#snippet aptitude(item: Aptitude, prefix: string)}
  <SelectField
    id="{uid}-{prefix}-{item.key}-{item.index}"
    label={item.label + ' aptitude'}
    imageOnly
    options={GRADES}
    value={trainee[item.key][item.index]}
    onchange={(value) => (trainee[item.key][item.index] = value)}
  />
{/snippet}
<div class="trainee">
  <div class="stats">
    {#each STATS as stat}
      <label>
        <span>
          <img
            src={'/assets/images/icon/stats/' + stat.icon + '.webp'}
            alt=""
          />
          {stat.label}
        </span>
        <input
          id="{uid}-{stat.key}"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          aria-label={stat.label + ' raw'}
          value={trainee[stat.key]}
          oninput={(event) => setStat(stat.key, event)}
        />
      </label>
    {/each}
  </div>
  <div class="picks">
    <SelectField
      id="{uid}-running-style"
      label="Running style"
      options={STYLES}
      bind:value={trainee.runningStyle}
    />
    <SelectField
      id="{uid}-motivation"
      label="Mood"
      options={MOODS}
      bind:value={trainee.motivation}
    />
  </div>
  <div class="active">
    {#each active as item}
      {@render aptitude(item, 'active')}
    {/each}
  </div>
  <details>
    <summary>All aptitudes</summary>
    <div class="all">
      {#each groups as group}
        <section>
          <h3>{group.label}</h3>
          {#each group.items as item}
            {@render aptitude(item, 'all')}
          {/each}
        </section>
      {/each}
    </div>
  </details>
  <details>
    <summary>Adjusted stats</summary>
    <div class="adjusted">
      {#each STATS as stat}
        <span>
          {stat.label}
          <strong>
            {String(trainee[stat.key]).trim()
              ? Math.round(
                  veteranBaseStat(Number(trainee[stat.key]), Number(trainee.motivation) - 3) ?? 0
                )
              : '—'}
          </strong>
        </span>
      {/each}
    </div>
    <p>Points above 1,200 count half, then mood adjusts the result.</p>
  </details>
</div>

<style>
  .trainee {
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }
  label {
    min-width: 0;
    font-size: 11px;
    color: var(--text-secondary);
  }
  label > span {
    display: flex;
    gap: 4px;
    align-items: center;
    justify-content: center;
    margin-bottom: 6px;
  }
  label img {
    width: 14px;
    height: 14px;
  }
  input {
    box-sizing: border-box;
    width: 100%;
    height: 34px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    font: inherit;
    font-size: 14px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  input:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }
  .picks {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .active {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  details {
    font-size: 11px;
  }
  summary {
    cursor: pointer;
    color: var(--accent-primary);
    padding: 4px 0;
  }
  .all {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    margin-top: 8px;
  }
  .all section {
    display: grid;
    gap: 8px;
    align-content: start;
    min-width: 0;
  }
  .all h3 {
    font-size: 12px;
    margin: 0 0 4px;
  }
  .adjusted {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 8px;
  }
  .adjusted strong {
    margin-left: 4px;
  }
  p {
    margin: 8px 0 0;
    color: var(--text-secondary);
    font-size: 11px;
  }
  @media (max-width: 480px) {
    .stats {
      gap: 4px;
    }
    label > span {
      font-size: 10px;
      gap: 3px;
    }
    .all {
      grid-template-columns: 1fr 1fr;
    }
    .active {
      gap: 8px;
    }
  }
</style>
