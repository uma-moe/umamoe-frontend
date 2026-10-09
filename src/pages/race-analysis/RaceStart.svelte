<script lang="ts">
  import Button from '@/components/Button.svelte';
  import FileDrop from '@/components/FileDrop.svelte';
  import Icon from '@/components/Icon.svelte';
  import { raceFrameAtTime } from '@/lib/race/race-replay';
  import { formatRaceTime } from '@/lib/race/race-display';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { makeDemoRaces } from '@/pages/competitive/demo-races';

  let { loading, onfiles, onexample }: {
    loading: boolean;
    onfiles: (files: FileList) => void;
    onexample: (count: number) => void;
  } = $props();

  const sample = makeDemoRaces(1)[0]!;
  const duration = sample.frames.at(-1)!.time;
  const colors = ['var(--accent-primary)', 'var(--accent-warning)', 'var(--accent-purple)'];
  let time = $state(105), previewWidth = $state(600);
  const frame = $derived(raceFrameAtTime(sample.frames, time)!);
  const leader = $derived(Math.max(...frame.horses.map(horse => horse.distance)));
  const phase = $derived(leader >= 2400 ? 'Finish' : leader >= 2000 ? 'Final leg' : leader >= 1600 ? 'Late race' : leader >= 400 ? 'Mid race' : 'Early race');
  const viewStart = $derived(Math.min(2300, Math.max(0, leader - 90)));
  const distanceX = (distance: number) => 44 + (distance - viewStart) / 100 * (previewWidth - 88);
</script>

<div class="race-start">
  <section class="start-upload" aria-label="Upload race captures">
    <header>
      <h2 id="start-upload-title">Start with your races</h2>
      <p>Upload a capture to replay the race, inspect your runners, and see where they gained or lost ground.</p>
    </header>
    <div class="upload-target">
      <FileDrop id="race-upload" label="Drop your race files here" description=".json or .json.gz files for one race or a whole session" actionLabel={loading ? 'Reading captures…' : 'Choose race files'} accept=".json,.gz" multiple disabled={loading} {onfiles}/>
    </div>
    <span class="local-note"><Icon name="info" size={14}/>Uploads are automatically resimulated. Captures go to the simulator; mismatched replays go to Sentry for debugging.</span>
    <div class="capture-guide">
      <div><h3>Need race files?</h3><p>Capture your races with HorseACT, then import them here.</p></div>
      <Button href="https://github.com/ayaliz/horseACT#installation" target="_blank" variant="secondary" size="sm" icon="external">Capture guide</Button>
    </div>
  </section>

  <section class="start-demo" aria-labelledby="start-demo-title">
    <header class="demo-heading"><h2 id="start-demo-title">Explore before uploading</h2><span class="demo-label">Demo data</span></header>
    <p>Try a single race or explore a session with 24 races.</p>
    <div class="race-preview">
      <div class="preview-heading"><Icon name="race" size={18}/><strong>Tokyo (2,400 m, Turf)</strong><span>{phase}</span></div>
      <div class="preview-plot" bind:clientWidth={previewWidth}>
      <svg class="preview-track" viewBox="0 0 {previewWidth} 228" role="img" aria-label="Demo race positions. Drag the time slider below to follow the runners.">
        <rect class="track-surface" x="0" y="30" width={previewWidth} height="166"/>
        {#each [30, 196] as y}<line class="rail" x1="0" x2={previewWidth} y1={y} y2={y}/>{/each}
        {#each [72, 113, 154] as y}<line class="lane" x1="0" x2={previewWidth} y1={y} y2={y}/>{/each}
        {#each [0, 25, 50, 75, 100] as offset}
          <line class="distance-line" x1={distanceX(viewStart + offset)} x2={distanceX(viewStart + offset)} y1="30" y2="196"/>
          <text class="distance-label" x={distanceX(viewStart + offset)} y="218" text-anchor="middle">{Math.round(viewStart + offset).toLocaleString()} m</text>
        {/each}
        {#each sample.runners as runner}
          {@const horse = frame.horses[runner.index]!}
          {@const x = distanceX(horse.distance)}
          {@const y = 44 + horse.lanePosition / 5000 * 134}
          <g>
            <title>{runner.name}</title>
            <image href={portrait(runner.cardId)} x={x - 18} y={y - 32} width="36" height="40"/>
            <circle cx={x} cy={y + 10} r="3" fill={colors[Math.floor(runner.index / 3)]}/>
          </g>
        {/each}
      </svg>
      </div>
      <div class="preview-timeline">
        <label for="demo-race-time">Scrub through the race</label><span>{formatRaceTime(time, 1)}</span>
        <input id="demo-race-time" aria-label="Demo race time" type="range" min="0" max={duration} step="0.1" bind:value={time}/>
      </div>
    </div>
    <div class="demo-actions">
      <Button icon="race" variant="secondary" size="sm" disabled={loading} onclick={() => onexample(1)}>Try one demo race</Button>
      <Button icon="chart" variant="secondary" size="sm" disabled={loading} onclick={() => onexample(24)}>Try 24 demo races</Button>
    </div>
  </section>
</div>

<div class="analysis-guide" aria-label="What you can analyse">
  <div><Icon name="race" size={20}/><div><h3>Replay the race</h3><p>Follow positions, skill timings, and blocking from start to finish.</p></div></div>
  <div><Icon name="user" size={20}/><div><h3>Inspect your runners</h3><p>Check builds, speed, remaining HP, and the final spurt.</p></div></div>
  <div><Icon name="chart" size={20}/><div><h3>Compare a session</h3><p>Add multiple races to compare teams, strategies, and skills.</p></div></div>
</div>

<style>
  .race-start { display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:16px; }
  .start-upload,.start-demo { min-width:0;background:var(--surface-1);border-radius:var(--radius-lg);padding:24px;display:flex;flex-direction:column;gap:12px; }
  h2 { margin:0;font-size:18px;line-height:1.4; }h3 { margin:0;font-size:13px;line-height:1.5; }
  p { margin:4px 0 0;font-size:12px;line-height:1.6;color:var(--text-secondary); }
  .upload-target { flex:1;display:grid;margin-top:4px; }.upload-target :global(.drop) { box-sizing:border-box;min-height:230px;background:var(--bg-primary);gap:12px; }
  .upload-target :global(.drop > svg) { width:32px;height:32px;color:var(--accent-primary); }
  .upload-target :global(.drop-action) { min-height:36px;padding-inline:18px;background:var(--accent-primary);color:var(--button-primary-text);border-color:transparent; }
  .local-note { display:flex;align-items:center;justify-content:center;gap:6px;font-size:11px;color:var(--text-muted); }
  .capture-guide { display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:12px; }.capture-guide :global(.ui-button) { flex:none; }
  .capture-guide p { max-width:290px;font-size:11px; }
  .demo-heading,.preview-heading { display:flex;align-items:center;gap:8px; }.demo-heading { justify-content:space-between; }.start-demo > p { margin-top:-8px; }
  .demo-label { padding:3px 6px;border-radius:4px;background:var(--surface-3);color:var(--text-secondary);font-size:10px;white-space:nowrap; }
  .race-preview { background:var(--bg-primary);border:1px solid var(--border-subtle);border-radius:var(--radius-md);overflow:hidden;margin-top:4px; }
  .preview-heading { padding:12px 14px;font-size:11px; }.preview-heading :global(svg) { color:var(--accent-primary); }.preview-heading span { margin-left:auto;color:var(--text-muted); }
  .preview-plot { min-width:0; }.preview-track { display:block;width:100%;height:228px; }.track-surface { fill:var(--surface-1); }.rail { stroke:var(--border-secondary); }.lane { stroke:var(--border-subtle);stroke-dasharray:6 6; }.distance-line { stroke:var(--border-subtle); }.distance-label { fill:var(--text-muted);font-size:9px;font-variant-numeric:tabular-nums; }
  .preview-timeline { display:grid;grid-template-columns:1fr auto;gap:8px;padding:6px 14px 14px;font-size:11px;color:var(--text-secondary); }.preview-timeline span { font-variant-numeric:tabular-nums; }.preview-timeline input { grid-column:1/-1;width:100%;margin:0;accent-color:var(--accent-primary);cursor:pointer; }
  .demo-actions { display:flex;gap:8px;flex-wrap:wrap;margin-top:auto; }.demo-actions :global(.ui-button) { flex:1;min-height:36px; }
  .analysis-guide { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;padding:20px 4px 0; }.analysis-guide > div { display:flex;align-items:flex-start;gap:12px; }.analysis-guide :global(svg) { flex:none;margin-top:1px;color:var(--text-muted); }.analysis-guide p { font-size:11px;max-width:350px; }
  @media(max-width:1100px) { .start-upload,.start-demo { padding:18px; }.capture-guide { flex-wrap:wrap;gap:8px; }.analysis-guide { gap:16px; } }
  @media(max-width:767px) { .race-start { grid-template-columns:minmax(0,1fr);gap:12px; }.start-upload,.start-demo { padding:16px; }h2 { font-size:16px; }.upload-target :global(.drop) { min-height:180px; }.capture-guide { margin-top:4px; }.analysis-guide { grid-template-columns:minmax(0,1fr);gap:16px;padding:8px 4px; }.demo-actions :global(.ui-button) { min-height:32px; }.preview-heading { padding:10px;font-size:10px; }.preview-timeline { padding-inline:10px; } }
</style>
