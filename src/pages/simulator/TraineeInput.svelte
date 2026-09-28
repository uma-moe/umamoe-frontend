<script lang="ts">
  import SegmentedControl from '@/components/SegmentedControl.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import SelectFieldSlim from '@/components/SelectFieldSlim.svelte';
  import TextField from '@/components/TextField.svelte';
  import { APTITUDE_GRADES } from './stamina-request';
  import { RUNNING_STYLES, createTrainee, type Trainee } from './trainee';

  interface Props {
    trainee?: Trainee;
  }

  let { trainee = $bindable(createTrainee()) }: Props = $props();

  // Several surfaces render one editor per runner, so ids must not collide.
  const uid = $props.id();

  const GRADE_OPTIONS = APTITUDE_GRADES.map((grade) => ({ value: grade, label: grade }));
  const STYLE_OPTIONS = RUNNING_STYLES.map((style) => ({ value: style, label: style }));
  const MOTIVATION_OPTIONS = [
    { value: '1', label: 'Awful' },
    { value: '2', label: 'Bad' },
    { value: '3', label: 'Normal' },
    { value: '4', label: 'Good' },
    { value: '5', label: 'Great' }
  ];

  function setAptitude(list: Array<string>, index: number, value: string): void {
    list[index] = value;
  }
</script>

<div class="trainee">
  <section class="panel" aria-labelledby="{uid}-stats-title">
    <h2 id="{uid}-stats-title">Trainee</h2>
    <div class="grid">
      <TextField id="{uid}-speed" type="number" min={1} max={3000} label="Speed" bind:value={trainee.speed} />
      <TextField id="{uid}-stamina" type="number" min={1} max={3000} label="Stamina" bind:value={trainee.stamina} />
      <TextField id="{uid}-power" type="number" min={1} max={3000} label="Power" bind:value={trainee.power} />
      <TextField id="{uid}-guts" type="number" min={1} max={3000} label="Guts" bind:value={trainee.guts} />
      <TextField id="{uid}-wisdom" type="number" min={1} max={3000} label="Wisdom" bind:value={trainee.wisdom} />
    </div>

    <SegmentedControl label="Running style" options={STYLE_OPTIONS} bind:value={trainee.runningStyle} />
    <SelectField id="{uid}-motivation" label="Motivation" options={MOTIVATION_OPTIONS} bind:value={trainee.motivation} />
  </section>

  <section class="panel" aria-labelledby="{uid}-apt-title">
    <h2 id="{uid}-apt-title">Aptitudes</h2>
    <p class="hint">Grades run S (best) down to G; the simulator reads them on an 8…1 scale.</p>
    <div class="grid">
      <SelectFieldSlim id="{uid}-apt-sprint" label="Sprint" options={GRADE_OPTIONS} value={trainee.distanceAptitudes[0]} onchange={(value) => setAptitude(trainee.distanceAptitudes, 0, value)} />
      <SelectFieldSlim id="{uid}-apt-mile" label="Mile" options={GRADE_OPTIONS} value={trainee.distanceAptitudes[1]} onchange={(value) => setAptitude(trainee.distanceAptitudes, 1, value)} />
      <SelectFieldSlim id="{uid}-apt-medium" label="Medium" options={GRADE_OPTIONS} value={trainee.distanceAptitudes[2]} onchange={(value) => setAptitude(trainee.distanceAptitudes, 2, value)} />
      <SelectFieldSlim id="{uid}-apt-long" label="Long" options={GRADE_OPTIONS} value={trainee.distanceAptitudes[3]} onchange={(value) => setAptitude(trainee.distanceAptitudes, 3, value)} />
      <SelectFieldSlim id="{uid}-apt-nige" label="Nige" options={GRADE_OPTIONS} value={trainee.styleAptitudes[0]} onchange={(value) => setAptitude(trainee.styleAptitudes, 0, value)} />
      <SelectFieldSlim id="{uid}-apt-senko" label="Senko" options={GRADE_OPTIONS} value={trainee.styleAptitudes[1]} onchange={(value) => setAptitude(trainee.styleAptitudes, 1, value)} />
      <SelectFieldSlim id="{uid}-apt-sashi" label="Sashi" options={GRADE_OPTIONS} value={trainee.styleAptitudes[2]} onchange={(value) => setAptitude(trainee.styleAptitudes, 2, value)} />
      <SelectFieldSlim id="{uid}-apt-oikomi" label="Oikomi" options={GRADE_OPTIONS} value={trainee.styleAptitudes[3]} onchange={(value) => setAptitude(trainee.styleAptitudes, 3, value)} />
      <SelectFieldSlim id="{uid}-apt-turf" label="Turf" options={GRADE_OPTIONS} value={trainee.groundAptitudes[0]} onchange={(value) => setAptitude(trainee.groundAptitudes, 0, value)} />
      <SelectFieldSlim id="{uid}-apt-dirt" label="Dirt" options={GRADE_OPTIONS} value={trainee.groundAptitudes[1]} onchange={(value) => setAptitude(trainee.groundAptitudes, 1, value)} />
    </div>
  </section>
</div>

<style>
  .trainee { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }
  .panel { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface-2); }
  .panel h2 { margin: 0; font-size: var(--font-md); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--space-3); }
  .hint { margin: 0; color: var(--color-text-muted); font-size: var(--font-xs); }
</style>
