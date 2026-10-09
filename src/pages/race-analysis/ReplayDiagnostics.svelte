<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import { diagnosticHorse, diagnosticLabel, skillActiveDuration, hpChangeEvents, type DiagnosticRow, raceMetricHelp, lastSpurtResult } from '@/lib/race/race-diagnostics';
  import type { EChartsCoreOption } from 'echarts/core';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import Artwork from '@/components/Artwork.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { theme } from '@/stores/theme';
  import { raceTimeAtDistance } from '@/lib/race/race-replay';
  import { formatRaceTime } from '@/lib/race/race-display';
  import DataTable, { type TableColumn } from '@/components/DataTable.svelte';
  import Button from '@/components/Button.svelte';
  import Disclosure from '@/components/Disclosure.svelte';
  import Icon from '@/components/Icon.svelte';
  import MetricHelp from './MetricHelp.svelte';
  import RaceSkill from '@/pages/competitive/RaceSkill.svelte';

  let { capture, index, skillNames, distance, blocking, overview, onseek, onselect }: {
    capture: ParsedRaceCapture; index: number; skillNames: Map<number, string>;
    distance: number;
    blocking?: Snippet; overview?: Snippet;
    onseek: (time: number) => void; onselect: (index: number) => void;
  } = $props();
  const instanceId = $props.id();
  let rawOpen = $state(true);
  let sourceOpen = $state(false);
  let expandedMode = $state<string>();
  let spurtOpen = $state(false);
  const horse = $derived(diagnosticHorse(capture, index));
  const runner = $derived(capture.runners.find(r => r.index === index));
  const activations = $derived(capture.events.filter(e => e.type === 3 && e.params[0] === index));
  const skillRows = $derived([...new Set([
    ...(runner?.skillIds ?? []), ...activations.map(e => e.params[1]!),
    ...(horse?.skillActivationDecisions ?? []).map(d => Number(d.skillId))
  ])].map(id => {
    const events = activations.filter(e => e.params[1] === id);
    const roll = horse?.skillActivationDecisions?.find(d => d.skillId === id);
    return { id, count: events.length, first: events[0]?.frameTime ?? '—', duration: events.length || roll?.activated ? skillActiveDuration(horse, id) ?? '—' : '—',
      status: roll ? (roll.activated ? 'Activated' : !roll.passed ? 'Wit check failed' : roll.required ? 'Passed wit check, failed condition' : 'Not triggered') : (events.length ? 'Activated' : 'Not recorded'),
      witRequired:Number(roll?.required===true),witPassed:Number(roll?.passed===true),roll: typeof roll?.roll === 'number' ? roll.roll : '—', threshold: typeof roll?.threshold === 'number' ? roll.threshold : '—' };
  }));
  const activationThresholds = $derived([...new Set(skillRows.flatMap(row=>typeof row.threshold==='number'?[row.threshold]:[]))]);
  const sharedThreshold = $derived(activationThresholds.length===1?activationThresholds[0]:undefined);
  const activatedSkills = $derived(skillRows.filter(row=>row.status==='Activated').length);
  const sampleRows = $derived((horse?.sampleTimes ?? capture.detailed?.annotations.sampleTimes ?? []).map((time, i) => ({
    time, targetSpeed: horse?.targetSpeeds?.[i] ?? '—', acceleration: horse?.accelerationRates?.[i] ?? '—'
  })));
  const speedLimit = $derived(Math.max(1,...sampleRows.map(row=>typeof row.targetSpeed==='number'?row.targetSpeed:0)));
  const accelerationLimit = $derived(Math.max(1,...sampleRows.map(row=>typeof row.acceleration==='number'?Math.abs(row.acceleration):0)));
  const rushingPeriods = $derived((horse?.temptationSpans??[]).map(span=>({...span,duration:span.endTime-span.startTime})));
  const rushing = $derived(horse?.temptationDecision);
  const spurt = $derived(horse?.lastSpurtDecision ?? horse?.lastSpurtDecisions?.at(-1));
  const spurtResult = $derived(lastSpurtResult(capture,index));
  const spurtSelected = $derived(spurt?.result === 'True' || spurt?.result === 'TrueExceedNeedMaximumHp');
  const spurtHpBalance = $derived(typeof spurt?.checkHp==='number'&&typeof spurt.fullSpurtNeedHp==='number'?spurt.checkHp-spurt.fullSpurtNeedHp:undefined);
  const lateStart = $derived(horse?.lostStartAccelerationFrame || (runner?.result?.startDelayTime ?? 0) >= .08);
  const modeRows = $derived(Object.entries(capture.detailed?.annotations.flags ?? {}).flatMap(([key, flag]) => {
    const spans = horse?.spans.filter(span => (span.mask & flag) !== 0) ?? [];
    return spans.length ? [{ id:key,mode: diagnosticLabel(key), duration: spans.reduce((total, span) => total + span.endTime - span.startTime, 0), periods: spans.length, time: spans[0]!.startTime }] : [];
  }));
  const hpRows = $derived(hpChangeEvents(capture,horse?.hpSkillApplications??[]));
  const sectionSpeeds = $derived(horse?.baseTargetSpeedSections ?? []);
  const sectionRows = $derived(sectionSpeeds.map(row=>({
    section:Number(row.sectionIndex)+1,phase:display(row.phase,'phase'),
    start:distance*Number(row.sectionIndex)/24,end:distance*(Number(row.sectionIndex)+1)/24,
    speed:Number(row.baseTargetSpeed),rng:Number(row.randomPercentage),
    time:raceTimeAtDistance(capture.frames,distance*Number(row.sectionIndex)/24,index)??'—'
  })).sort((a,b)=>a.section-b.section));
  const averageRng = $derived(sectionRows.length?sectionRows.reduce((total,row)=>total+row.rng,0)/sectionRows.length:0);
  const rngLimit = $derived(Math.max(.1,Math.ceil(Math.max(0,...sectionRows.map(row=>Math.abs(row.rng)))*10)/10));
  const sectionChart = $derived.by(():EChartsCoreOption=>{
    const text=$theme==='dark'?'#a6afbd':'#596477';
    const grid=$theme==='dark'?'#ffffff12':'#00000012';
    const speedMin=Math.floor(Math.min(...sectionRows.map(row=>row.speed))*2)/2;
    const speedMax=Math.max(speedMin+.5,Math.ceil(Math.max(...sectionRows.map(row=>row.speed))*2)/2);
    const xAxis={type:'category' as const,data:sectionRows.map(row=>row.section),axisLine:{lineStyle:{color:grid}},axisTick:{show:false},axisLabel:{show:false},axisPointer:{type:'line' as const,lineStyle:{color:text,type:'dashed' as const}},splitLine:{show:false}};
    const rngPoints=sectionRows.map(row=>({value:row.rng,itemStyle:{color:row.rng>0?'#87ceab':row.rng<0?'#ed8d8d':text}}));
    return {
      animation:false,aria:{enabled:true},grid:[{left:48,right:12,top:20,height:64},{left:48,right:12,top:116,height:60}],
      axisPointer:{link:[{xAxisIndex:[0,1]}]},
      tooltip:{trigger:'axis',textStyle:{fontSize:11},formatter:(params:unknown)=>{
        const point=(Array.isArray(params)?params[0]:params) as {dataIndex:number};
        const row=sectionRows[point.dataIndex];
        return row?`<strong>Section ${row.section}</strong><br>${row.phase}<br>${number(row.start)}–${number(row.end)} m<br>Target speed: ${row.speed.toFixed(2)} m/s<br>RNG: ${signed(row.rng)}%${row.rng===0?'':row.rng>0?' (faster)':' (slower)'}`:'';
      }},
      xAxis:[xAxis,{...xAxis,gridIndex:1,axisTick:{show:true,alignWithLabel:true,interval:(i:number)=>i===0||i===sectionRows.length-1||sectionRows[i]!.section%4===0},axisLabel:{show:true,color:text,fontSize:10,margin:8,interval:(i:number)=>i===0||i===sectionRows.length-1||sectionRows[i]!.section%4===0}}],
      yAxis:[
        {type:'value',min:speedMin,max:speedMax,splitNumber:2,axisLabel:{color:text,fontSize:10,formatter:(value:number)=>number(value,1)},splitLine:{lineStyle:{color:grid}}},
        {type:'value',gridIndex:1,min:-rngLimit,max:rngLimit,interval:rngLimit,axisLabel:{color:text,fontSize:10,formatter:(value:number)=>signed(value,1)+'%'},splitLine:{lineStyle:{color:grid,type:'dashed'}}}
      ],
      series:[
        {name:'Base target speed',type:'line',step:'middle',symbol:'circle',symbolSize:4,lineStyle:{width:2,color:'#69b7ee'},itemStyle:{color:'#69b7ee'},data:sectionRows.map(row=>row.speed)},
        {name:'RNG stems',type:'bar',xAxisIndex:1,yAxisIndex:1,barWidth:2,silent:true,data:rngPoints,
          markLine:{silent:true,symbol:'none',label:{show:false},lineStyle:{color:text,width:1,type:'solid',opacity:.5},data:[{yAxis:0}]}},
        {name:'RNG adjustment',type:'scatter',xAxisIndex:1,yAxisIndex:1,symbol:'circle',symbolSize:6,data:rngPoints}
      ]
    };
  });
  const paceChart = $derived.by(():EChartsCoreOption=>{
    const text=$theme==='dark'?'#a6afbd':'#596477';
    const grid=$theme==='dark'?'#ffffff12':'#00000012';
    return {
      animation:false,aria:{enabled:true},grid:{left:42,right:46,top:22,bottom:25},
      tooltip:{trigger:'axis',valueFormatter:(value:unknown)=>typeof value==='number'?value.toFixed(2):'—'},
      xAxis:{type:'value',min:0,max:sampleRows.at(-1)?.time??1,axisLabel:{color:text,fontSize:10,formatter:(value:number)=>timeLabel(value)},splitLine:{show:false}},
      yAxis:[{type:'value',name:'m/s',nameTextStyle:{color:text,fontSize:10},axisLabel:{color:text,fontSize:10},splitLine:{lineStyle:{color:grid}}},
        {type:'value',name:'m/s²',nameTextStyle:{color:text,fontSize:10},axisLabel:{color:text,fontSize:10},splitLine:{show:false}}],
      series:[
        {name:'Target speed (m/s)',type:'line',showSymbol:false,lineStyle:{width:2,color:'#69b7ee'},itemStyle:{color:'#69b7ee'},data:sampleRows.map(row=>[row.time,typeof row.targetSpeed==='number'?row.targetSpeed:null])},
        {name:'Acceleration (m/s²)',type:'line',yAxisIndex:1,showSymbol:false,lineStyle:{width:1.5,color:'#df8ca1'},itemStyle:{color:'#df8ca1'},data:sampleRows.map(row=>[row.time,typeof row.acceleration==='number'?row.acceleration:null])}
      ]
    };
  });

  function display(value: unknown, key = ''): string | number {
    if (value === undefined || value === null) return '—';
    if (key === 'phase' && typeof value === 'number') return ['Early race', 'Mid race', 'Late race', 'Last spurt', 'Finished'][value] ?? String(value);
    if (key === 'result' && typeof value === 'string') return ({ True: 'Spurt selected', TrueExceedNeedMaximumHp: 'Full spurt selected', False: 'No spurt selected', FalseBelowNeedMinimumHp: 'Insufficient HP' } as Record<string, string>)[value] ?? value;
    if (key === 'outcome' && typeof value === 'string') return ({NoMode:'No mode',Rejected:'Conditions not met',Started:'Started',FailedRoll:'Roll failed'} as Record<string,string>)[value]??value;
    if (typeof value === 'number') return Number.isInteger(value) ? value : Number(value.toFixed(4));
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.map(v => display(v)).join(', ');
    if (typeof value === 'object') return Object.entries(value).map(([k, v]) => diagnosticLabel(k) + ': ' + display(v, k)).join(', ');
    return String(value);
  }
  function rows(value: unknown): Record<string, string | number>[] {
    return (Array.isArray(value) ? value : [value]).map((item, i) => {
      const row: DiagnosticRow = item && typeof item === 'object' ? item : { value: item };
      return { id: i, ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, display(v, k)])) };
    });
  }
  function seekRow(row: Record<string, string | number>) {
    const time = row.time ?? row.startTime;
    if (typeof time === 'number') onseek(time);
  }
  function number(value: unknown, digits = 0) {
    return typeof value === 'number' ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
  }
  function count(value: number, noun: string) { return `${value} ${noun}${value === 1 ? '' : 's'}`; }
  function timeLabel(value:number) {const rounded=Math.round(value*10)/10;return rounded===0?'0:00':formatRaceTime(rounded,rounded%1?1:0);}
  function signed(value:number,digits=2) {const rounded=Number(value.toFixed(digits));return (rounded>0?'+':'')+rounded.toFixed(digits);}
  function seekSection(value:number) {const time=sectionRows[Math.round(value)]?.time;if(typeof time==='number')onseek(time);}
  function runnerName(value:unknown) {return capture.runners.find(r=>r.index===Number(value))?.name??'Unknown runner';}
  function percentPosition(value:unknown) {return typeof value==='number'?Math.min(100,Math.max(0,value)):0;}
</script>

{#snippet runnerReference(value: number)}
  {#if value>=0}
    <button class="runner-reference detail-runner" type="button" onclick={()=>onselect(value)}><Artwork src={portrait(capture.runners.find(r=>r.index===value)?.cardId)} alt="" size="xs"/>{value===index?'Self':runnerName(value)}</button>
  {:else}<span class="muted">None</span>{/if}
{/snippet}

{#snippet eventTable(value: unknown, title: string, tableColumns: TableColumn[])}
  {#if Array.isArray(value) && !value.length}
    <p class="empty">No observations recorded for this runner.</p>
  {:else}
  <DataTable columnHelp={raceMetricHelp} plain compact caption={title} rows={rows(value)} columns={tableColumns} maxHeight={Array.isArray(value)&&value.length>12?300:undefined} onrowclick={seekRow} emptyMessage="No observations recorded for this runner.">
    {#snippet cell(row, column)}
      {#if /^(time|startTime|endTime)$/.test(column.key) && typeof row[column.key] === 'number'}
        <Button variant="ghost" size="sm" onclick={() => onseek(Number(row[column.key]))}>{Number(row[column.key]).toFixed(3)} s ↗</Button>
      {:else if /^(horseIndex|.*HorseIndex)$/.test(column.key) && Number(row[column.key]) >= 0}
        {@render runnerReference(Number(row[column.key]))}
      {:else if column.key==='referenceHorseIndex'}<span class="muted">None</span>
      {:else if column.key === 'skillId'}
        <RaceSkill id={Number(row[column.key])} name={skillNames.get(Number(row[column.key]))}/>
        {#if Number(row.detailIndex)>0}<small class="effect-index">Effect {Number(row.detailIndex)+1}</small>{/if}
      {:else if column.key==='attemptedMode'}
        {['None','Speed up','Overtake','Pace up','Pace down','Pace up (extended)'][Number(row.attemptedMode)]??row.attemptedMode}
      {:else if column.key==='outcome'}
        <span class:activated={row.outcome==='Started'} class:failed={row.outcome==='Roll failed'}>{row.outcome}</span>
      {:else if column.key==='mode'}
        {['None','Late Surger position','Pace Chaser position','Front Runner position','Boost'][Number(row.mode)]??row.mode}
      {:else if column.key==='duration'}{Number(row.duration).toFixed(2)}
      {:else if column.key==='roll'&&typeof row.roll==='number'&&typeof row.threshold==='number'}<span class:activated={Number(row.roll)<Number(row.threshold)} class:failed={Number(row.roll)>=Number(row.threshold)}>{Number(row.roll).toFixed(2)}% {Number(row.roll)<Number(row.threshold)?'<':'≥'} {Number(row.threshold).toFixed(2)}%</span>
      {:else if /^(roll|threshold)$/.test(column.key)}{typeof row[column.key]==='number'?Number(row[column.key]).toFixed(2)+'%':'—'}
      {:else if column.key === 'mask'}
        {Object.entries(capture.detailed?.annotations.flags ?? {}).filter(([, flag]) => (Number(row.mask) & flag) !== 0).map(([name]) => diagnosticLabel(name)).join(', ') || 'None'}
      {:else}{typeof row[column.key]==='number'?number(row[column.key],2):row[column.key]}{/if}
    {/snippet}
  </DataTable>
  {/if}
{/snippet}

{#snippet outcomeSummary()}
  {#if horse}
    <dl class="outcome-summary" aria-label="Runner outcome summary">
      <div class="outcome" class:danger={typeof horse.finalHp==='number'&&horse.finalHp<=0}>
        <dt>HP at finish<MetricHelp label="HP at finish"/></dt>
        <dd><strong>{number(horse.finalHp)} <small>HP</small></strong><span class="outcome-detail">{#if typeof horse.hpExhaustedDistance==='number'}Exhausted at {number(horse.hpExhaustedDistance)} m{:else if typeof horse.startHp==='number'}Started with {number(horse.startHp)} HP{/if}</span></dd>
      </div>
      <div class="outcome" class:caution={spurtResult.noSpurt||(spurtResult.delay??0)>=.05}>
        <dt>Spurt delay<MetricHelp label="Spurt delay"/></dt>
        <dd><strong>{spurtResult.noSpurt?'No spurt':spurtResult.delay===undefined?'Not recorded':number(spurtResult.delay,1)}{#if spurtResult.delay!==undefined}{' '}<small>m</small>{/if}</strong><span class="outcome-detail" class:caution={spurtResult.speedPenalty}>{#if spurtResult.speed!==undefined}Speed {number(spurtResult.speed,2)} m/s{#if (spurtResult.reduction??0)>=.005}{' '}(−{number(spurtResult.reduction,2)}){/if}{/if}</span></dd>
      </div>
      <div class="outcome">
        <dt>Course loss<MetricHelp label="Course loss"/></dt><dd><strong>{number(horse.worldTransformDistanceLoss,2)} <small>m</small></strong><span class="outcome-detail">Extra distance travelled</span></dd>
      </div>
      <div class="outcome" class:caution={lateStart}>
        <dt>Start<MetricHelp label="Start"/></dt>
        <dd><strong>{lateStart?'Delayed':horse.lostStartAccelerationFrame===undefined&&runner?.result?.startDelayTime===undefined?'Not recorded':'Clean'}</strong><span class="outcome-detail">{#if runner?.result?.startDelayTime!==undefined}<span>{number(runner.result.startDelayTime*1000,1)} ms delay</span>{/if}{#if horse.lostStartAccelerationFrame}<span>Lost acceleration frame</span>{/if}</span></dd>
      </div>
    </dl>
  {:else}
    <p class="fallback">Detailed simulation data is unavailable. Showing recorded skill activations and blocking events.</p>
  {/if}
{/snippet}

<section class="diagnostics" aria-label={(runner?.name ?? 'Runner') + ' detailed diagnostics'}>
  {#if overview}<div class="runner-overview">{@render overview()}{@render outcomeSummary()}</div>{:else}{@render outcomeSummary()}{/if}

  <div class="report-grid">
    <section class="report-block skills-report" aria-label="Runner skill performance">
        <header class="section-heading">
          <h3>Skill performance <small>{activatedSkills}/{skillRows.length} activated</small></h3>
          {#if sharedThreshold!==undefined}<span class="activation-threshold">Wit checks pass below <strong>{sharedThreshold.toFixed(2)}%</strong><MetricHelp label="Wit check threshold"/></span>{/if}
        </header>
        <DataTable columnHelp={raceMetricHelp} plain compact caption="Runner skill analysis" rows={skillRows} columns={[
          { key: 'id', label: 'Skill' }, { key: 'status', label: 'Outcome' }, { key: 'count', label: 'Triggers', numeric: true },
          { key: 'first', label: 'First (s)', numeric: true }, ...(horse ? [{ key: 'duration', label: 'Active (s)', numeric: true },
          { key: 'roll', label: 'Wit check', numeric: true }] : [])
        ]}>
          {#snippet cell(row, column)}
            {#if column.key === 'id'}<RaceSkill id={Number(row.id)} name={skillNames.get(Number(row.id))}/>
            {:else if column.key === 'status'}<span class="skill-status" class:activated={row.status === 'Activated'} class:failed={row.status === 'Wit check failed'} class:caution={row.status==='Passed wit check, failed condition'}>{row.status}</span>
            {:else if column.key === 'roll'}<span class="wit-check" class:failed={row.witRequired===1&&row.witPassed===0}>{#if row.witRequired!==1}<span class="muted" title="No wit check required">—</span>{:else if typeof row.roll==='number'&&typeof row.threshold==='number'}{Number(row.roll).toFixed(2)}%{#if sharedThreshold===undefined}<small>Pass below {Number(row.threshold).toFixed(2)}%</small>{/if}{:else}<span class="muted">Not recorded</span>{/if}</span>
            {:else if column.key === 'first' && typeof row.first === 'number'}<Button variant="ghost" size="sm" onclick={() => onseek(Number(row.first))}>{Number(row.first).toFixed(3)} s ↗</Button>
            {:else}{typeof row[column.key] === 'number' ? Number(row[column.key]).toFixed(column.key === 'count' ? 0 : 2) : row[column.key]}{/if}
          {/snippet}
        </DataTable>
    </section>
    {#if horse}
      <div class="behaviour-report">
        <section class="report-block" aria-label="Runner race modes">
          <header class="section-heading">
            <h3>Race behaviour <small>{modeRows.length} active</small></h3>
          </header>
          <DataTable columnHelp={raceMetricHelp} plain compact caption="Race modes" rows={modeRows} maxHeight={220} emptyMessage="No race modes recorded." columns={[
            { key: 'mode', label: 'Mode' }, { key: 'duration', label: 'Active time (s)', numeric: true },
            { key: 'periods', label: 'Periods', numeric: true }, { key: 'time', label: 'First (s)', numeric: true }
          ]} onrowclick={seekRow} rowKey="id" expandedRow={expandedMode}>
            {#snippet cell(row, column)}
              {#if column.key === 'time'}<Button variant="ghost" size="sm" onclick={() => onseek(Number(row.time))}>{Number(row.time).toFixed(3)} s ↗</Button>
              {:else if column.key === 'periods'}<button class="period-toggle" type="button" aria-label={'Show '+row.mode+' periods'} aria-expanded={expandedMode===row.id} onclick={()=>expandedMode=expandedMode===row.id?undefined:String(row.id)}>{row.periods}<span class:opened={expandedMode===row.id}><Icon name="chevron" size={12}/></span></button>
              {:else if column.key === 'duration'}{Number(row.duration).toFixed(2)}{:else}{row[column.key]}{/if}
            {/snippet}
            {#snippet rowDetail(row)}
              <ol class="mode-periods" aria-label={row.mode+' periods'}>
                {#each horse.spans.filter(span=>(span.mask&(capture.detailed?.annotations.flags[String(row.id)]??0))!==0) as span}
                  <li><span><Button variant="ghost" size="sm" onclick={()=>onseek(span.startTime)}>{span.startTime.toFixed(3)} s ↗</Button><span class="period-arrow">→</span><Button variant="ghost" size="sm" onclick={()=>onseek(span.endTime)}>{span.endTime.toFixed(3)} s ↗</Button></span><span>{display(span.phase,'phase')}</span><small>{(span.endTime-span.startTime).toFixed(2)} s</small></li>
                {/each}
              </ol>
            {/snippet}
          </DataTable>
        </section>
        {#if spurt}
          <section class="report-block spurt-report" aria-label="Last-spurt decision">
            <header class="section-heading">
              <h3>Last-spurt decision</h3>
              {#if typeof spurt.time === 'number'}<Button variant="ghost" size="sm" onclick={() => onseek(Number(spurt.time))}>{spurt.time.toFixed(3)} s ↗</Button>{/if}
              <button class="calculation-toggle" type="button" aria-label="Last-spurt calculation" aria-expanded={spurtOpen} aria-controls={instanceId+'-spurt-calculation'} onclick={()=>spurtOpen=!spurtOpen}>Calculation <span class:opened={spurtOpen}><Icon name="chevron" size={12}/></span></button>
            </header>
            {#if !spurtOpen}
            <dl class="spurt-summary">
              <div><dt>HP at decision<MetricHelp label="HP at decision"/></dt><dd>{number(spurt.checkHp)}</dd></div>
              <div><dt>HP for full spurt<MetricHelp label="HP for full spurt"/></dt><dd>{number(spurt.fullSpurtNeedHp)}</dd></div>
              <div><dt>Full spurt speed<MetricHelp label="Full spurt speed"/></dt><dd>{number(spurt.fullSpurtTargetSpeed, 2)} <small>m/s</small></dd></div>
            </dl>
            {#if typeof spurt.checkHp === 'number' && typeof spurt.fullSpurtNeedHp === 'number'}
              <p class="decision-note" class:caution={spurt.checkHp < spurt.fullSpurtNeedHp}>
                {spurt.checkHp < spurt.fullSpurtNeedHp ? number(spurt.fullSpurtNeedHp - spurt.checkHp) + ' HP short of a full spurt' : 'Enough HP for a full spurt'}{#if spurt.speedPenalty}; speed reduced{/if}{#if spurt.delayPenalty}; spurt delayed{/if}
              </p>
            {/if}
            {/if}
            <div class="spurt-calculation" id={instanceId+'-spurt-calculation'} hidden={!spurtOpen}>
              {#if spurtHpBalance!==undefined}
                <div class="hp-equation" aria-label="HP available minus HP required for a full spurt">
                  <span><small>Available HP</small><strong>{number(spurt.checkHp,2)}</strong></span><b aria-hidden="true">−</b>
                  <span><small>Required HP</small><strong>{number(spurt.fullSpurtNeedHp,2)}</strong></span><b aria-hidden="true">=</b>
                  <span class:shortfall={spurtHpBalance<0}><small>{spurtHpBalance<0?'HP shortfall':'HP spare'}</small><strong>{signed(spurtHpBalance)}</strong></span>
                </div>
              {/if}
              <table class="spurt-comparison">
                <caption class="sr-only">Full and selected spurt</caption>
                <thead><tr><th scope="col">Spurt</th><th scope="col">Full</th><th scope="col">Selected</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Start <small>m</small></th><td>{number(spurt.checkDistance,2)}</td><td>{spurtSelected?number(spurt.selectedStartDistance,2):'—'}</td></tr>
                  <tr><th scope="row">Speed <small>m/s</small></th><td>{number(spurt.fullSpurtTargetSpeed,2)}</td><td>{spurtSelected?number(spurt.selectedTargetSpeed,2):'—'}</td></tr>
                </tbody>
              </table>
              <p class="spurt-result">
                <strong>{spurtSelected?(spurt.speedPenalty||spurt.delayPenalty?'Reduced spurt selected':display(spurt.result,'result')):display(spurt.result,'result')}</strong>
                {#if spurtSelected&&typeof spurt.selectedStartDistance==='number'&&typeof spurt.checkDistance==='number'}<span>{spurt.delayPenalty?number(spurt.selectedStartDistance-spurt.checkDistance,2)+' m delay':'No delay'}</span>{/if}
                {#if spurtSelected&&typeof spurt.selectedTargetSpeed==='number'&&typeof spurt.fullSpurtTargetSpeed==='number'}<span>{spurt.speedPenalty?number(spurt.fullSpurtTargetSpeed-spurt.selectedTargetSpeed,2)+' m/s slower':'Full speed'}</span>{/if}
                {#if typeof spurt.calculationCount==='number'}<span>{count(spurt.calculationCount,'calculation')}</span>{/if}
              </p>
              {#if (horse.lastSpurtDecisions?.length??0)>1}<h4>Decision history</h4>{@render eventTable(horse.lastSpurtDecisions,'Last-spurt decisions',[
                {key:'time',label:'Time (s)'},{key:'checkDistance',label:'Distance (m)',numeric:true},{key:'checkHp',label:'HP available',numeric:true},
                {key:'fullSpurtNeedHp',label:'HP required',numeric:true},{key:'fullSpurtTargetSpeed',label:'Full speed (m/s)',numeric:true},
                {key:'selectedStartDistance',label:'Start (m)',numeric:true},{key:'selectedTargetSpeed',label:'Speed (m/s)',numeric:true},{key:'result',label:'Result'},
                {key:'delayPenalty',label:'Delayed'},{key:'speedPenalty',label:'Slower'},{key:'calculationCount',label:'Calculations',numeric:true}
              ])}{/if}
            </div>
          </section>
        {/if}
        {#if blocking}<div class="blocking-summary">{@render blocking()}</div>{/if}
        <div class="incident-status">
          {#if !hpRows.length}<span>No recovery or HP debuffs</span>{/if}
          {#if !horse.temptationDecision && !rushingPeriods.length}<span>No rushing</span>{/if}
        </div>
      </div>
    {:else if blocking}<div class="blocking-summary">{@render blocking()}</div>{/if}
  </div>
  {#if horse}
    <div class="measurements" aria-label="Runner pace and speed">
          <div class="measurement-grid">
            <section class="report-block pace-report">
              <header class="section-heading">
                <h4>Pace over time<MetricHelp label="Pace over time"/> <small>{count(sampleRows.length,'sample')}</small></h4>
              </header>
              <div class="measurement-legend"><span class="target-key">Target speed (m/s)</span><span class="accel-key">Acceleration (m/s²)</span><small>Select a time to watch it in replay.</small></div>
              {#if sampleRows.some(row=>typeof row.targetSpeed==='number'||typeof row.acceleration==='number')}
                <div class="pace-chart"><LazyEChartsSurface option={paceChart} label="Simulator pace over time" height={180} onaxisclick={onseek}/></div>
              {:else}<p class="empty">No pace samples recorded.</p>{/if}
            </section>
            {#if sectionSpeeds.length}
              <section class="report-block section-speeds">
                <header class="section-heading">
                  <h4>Base target speed<MetricHelp label="Base target speed"/> <small>{count(sectionSpeeds.length,'section')}</small></h4>
                </header>
                <div class="section-chart">
                  <span class="chart-lane-label speed">Target speed (m/s)</span>
                  <span class="chart-lane-label rng">RNG adjustment (%)</span>
                  <LazyEChartsSurface option={sectionChart} label="Base target speed and RNG by course section" height={200} onaxisclick={seekSection}/>
                </div>
                <div class="rng-summary"><span class="rng-key"><span class="rng-value negative">− Slower</span><span class="rng-value positive">+ Faster</span></span><span>Average RNG <strong class="rng-value" class:positive={averageRng>0} class:negative={averageRng<0}>{signed(averageRng)}%</strong></span></div>
              </section>
            {/if}
          </div>
      <Disclosure id={instanceId + '-raw'} title="Detailed measurements & simulation data" description={count(sampleRows.length,'sample')+', '+count(sectionRows.length,'section')} compact bind:open={rawOpen}>
        {#if rawOpen}
        <div class="measurement-data">
          <div class="measurement-details-grid">
            <section class="detail-panel pace-samples" aria-label="Exact telemetry samples">
              <header class="section-heading"><h4>Pace samples <small>{count(sampleRows.length,'sample')}</small></h4><span class="detail-hint">Select a time to replay</span></header>
              <DataTable columnHelp={raceMetricHelp} plain compact caption="Simulator telemetry samples" rows={sampleRows} columns={[
                {key:'time',label:'Time (s)'},{key:'targetSpeed',label:'Target (m/s)',numeric:true},{key:'acceleration',label:'Accel. (m/s²)',numeric:true}
              ]} maxHeight={262} onrowclick={seekRow}>
                {#snippet cell(row,column)}
                  {#if column.key==='time'}<Button variant="ghost" size="sm" onclick={()=>onseek(Number(row.time))}>{Number(row.time).toFixed(3)} s ↗</Button>
                  {:else if typeof row[column.key]==='number'}
                    <span class="sample-value">
                      {#if column.key==='targetSpeed'}<span class="speed-meter" aria-hidden="true"><span style:width={Number(row.targetSpeed)/speedLimit*100+'%'}></span></span>
                      {:else}<span class="rng-meter acceleration-meter" aria-hidden="true"><span style:left={(Number(row.acceleration)<0?50-Math.abs(Number(row.acceleration))/accelerationLimit*50:50)+'%'} style:width={Math.abs(Number(row.acceleration))/accelerationLimit*50+'%'}></span></span>{/if}
                      <strong>{column.key==='targetSpeed'?Number(row.targetSpeed).toFixed(2):signed(Number(row.acceleration))}</strong>
                    </span>
                  {:else}<span class="muted">—</span>{/if}
                {/snippet}
              </DataTable>
            </section>
            {#if sectionRows.length}
            <section class="detail-panel section-details" aria-label="Course section speed details">
              <header class="section-heading"><h4>Base speed & RNG <small>{count(sectionRows.length,'section')}</small></h4><span class="detail-hint">Select a section to replay</span></header>
              <DataTable columnHelp={raceMetricHelp} plain compact caption="Base target speed by section" rows={sectionRows} columns={[
                {key:'section',label:'Section'},{key:'start',label:'Distance (m)'},{key:'phase',label:'Phase'},
                {key:'speed',label:'Target (m/s)',numeric:true},{key:'rng',label:'RNG (%)',numeric:true}
              ]} maxHeight={262}>
                {#snippet cell(row,column)}
                  {#if column.key==='section'}
                    {#if typeof row.time==='number'}<Button variant="ghost" size="sm" ariaLabel={'Section '+row.section+' ↗'} onclick={()=>onseek(Number(row.time))}>{row.section} ↗</Button>{:else}{row.section}{/if}
                  {:else if column.key==='start'}<span class="muted">{number(row.start)}–{number(row.end)}</span>
                  {:else if column.key==='rng'}
                    <span class="rng-cell">
                      <span class="rng-meter" aria-hidden="true"><span class:negative={Number(row.rng)<0} style:left={(Number(row.rng)<0?50-Math.abs(Number(row.rng))/rngLimit*50:50)+'%'} style:width={Math.abs(Number(row.rng))/rngLimit*50+'%'}></span></span>
                      <span class="rng-value" class:positive={Number(row.rng)>0} class:negative={Number(row.rng)<0}>{signed(Number(row.rng))}%</span>
                    </span>
                  {:else if column.key==='speed'}{Number(row.speed).toFixed(2)}{:else}{String(row[column.key]).replace(' race','')}{/if}
                {/snippet}
              </DataTable>
            </section>
            {/if}
          </div>
          <div class="detail-traces">
            <section class="detail-panel reference-panel">
              {#each [{title:'Position keeping',spans:horse.positionKeepReferenceSpans??[],key:'referenceHorseIndex'},
                {title:'Race pacemakers',spans:capture.detailed?.annotations.paceMakerSpans??[],key:'horseIndex'}] as group}
                <div class="reference-group">
                  <Disclosure id={instanceId+'-'+group.key} title={group.title} description={count(group.spans.length,'period')} compact open>
                    {#if group.spans.length}
                      <ol class="reference-periods" aria-label={group.title+' periods'}>
                        {#each group.spans as span}
                          <li>
                            <Button variant="ghost" size="sm" onclick={()=>onseek(span.startTime)}>{span.startTime.toFixed(3)}–{span.endTime.toFixed(3)} s ↗</Button>
                            {#if Number(span[group.key])>=0}
                              <button class="runner-reference" type="button" onclick={()=>onselect(Number(span[group.key]))}><Artwork src={portrait(capture.runners.find(r=>r.index===Number(span[group.key]))?.cardId)} alt="" size="xs"/>{runnerName(span[group.key])}</button>
                            {:else}<span>No reference runner</span>{/if}
                            <small>{number(span.endTime-span.startTime,2)} s</small>
                          </li>
                        {/each}
                      </ol>
                    {:else}<p class="empty">No {group.title.toLowerCase()} periods recorded.</p>{/if}
                  </Disclosure>
                </div>
              {/each}
            </section>
            <section class="detail-panel detail-table position-decisions">
              <Disclosure id={instanceId+'-position-decisions'} title="Position-keep decisions" description={count(horse.positionKeepDecisions?.length??0,'decision')} compact open>
                {@render eventTable(horse.positionKeepDecisions??[],'Position-keep decisions',[
                  {key:'time',label:'Time (s)'},{key:'attemptedMode',label:'Mode'},{key:'outcome',label:'Result'},
                  {key:'referenceHorseIndex',label:'Reference'},{key:'roll',label:'Check / chance',numeric:true}
                ])}
              </Disclosure>
            </section>
            {#if horse.hpSkillApplications?.length}
              <section class="detail-panel detail-table hp-application-details">
                <Disclosure id={instanceId+'-hp-applications'} title="Recovery & HP changes" description={count(hpRows.length,'event')} compact open>
                  <DataTable columnHelp={{...raceMetricHelp,Source:'The runner who activated this skill. Self means the selected runner. Select a name to inspect that runner.'}} plain compact caption="HP change details" rows={rows(hpRows)} columns={[
                    {key:'time',label:'Time (s)'},{key:'skillId',label:'Skill'},{key:'casterHorseIndex',label:'Source'},
                    {key:'before',label:'HP before → after',numeric:true},{key:'appliedHpDelta',label:'HP change',numeric:true}
                  ]} maxHeight={hpRows.length>8?300:undefined} onrowclick={seekRow}>
                    {#snippet cell(row,column)}
                      {#if column.key==='time'}<Button variant="ghost" size="sm" onclick={()=>onseek(Number(row.time))}>{Number(row.time).toFixed(3)} s ↗</Button>
                      {:else if column.key==='skillId'}<RaceSkill id={Number(row.skillId)} name={skillNames.get(Number(row.skillId))}/>
                      {:else if column.key==='casterHorseIndex'}{@render runnerReference(Number(row.casterHorseIndex))}{#if Number(row.targetHorseIndex)!==index}<span class="muted"> → {runnerName(row.targetHorseIndex)}</span>{/if}
                      {:else if column.key==='before'}<span class="detail-transition">{typeof row.before==='number'&&typeof row.after==='number'?`${row.estimated==='Yes'?'≈ ':''}${number(row.before)} → ${number(row.after)}`:'—'}</span>
                      {:else if column.key==='appliedHpDelta'}<span class="application-change" class:recovery={Number(row.appliedHpDelta)>0} class:debuff={Number(row.appliedHpDelta)<0}><span><strong>{signed(Number(row.appliedHpDelta))}</strong>{#if typeof row.percent==='number'} <span class="change-percent">({signed(row.percent,1)}%)</span>{/if}</span>{#if signed(Number(row.requestedHpDelta))!==signed(Number(row.appliedHpDelta))}<small>Requested {signed(Number(row.requestedHpDelta))}</small>{/if}</span>{/if}
                    {/snippet}
                  </DataTable>
                  <p class="detail-footnote">≈ Estimated HP. Change percentages use maximum HP.</p>
                </Disclosure>
              </section>
            {/if}
            {#if horse.temptationDecision || horse.temptationSpans?.length}
              <section class="detail-panel rushing-details">
                <Disclosure id={instanceId+'-rushing'} title="Rushing details" description={count(rushingPeriods.length,'period')} compact open>
                  {#if rushing}
                    <div class="rushing-summary">
                      <div class="rushing-status"><strong>{rushing.enabled?'Rushing enabled':rushing.preventedByModifier?'Prevented by modifier':'No rushing'}</strong><small>{rushing.enabled?'Check passed':rushing.preventedByModifier?'Modifier prevented activation':'Check failed'}</small></div>
                      <div class="rushing-roll">
                        <div><span>Check <strong>{number(rushing.roll,2)}% {typeof rushing.roll==='number'&&typeof rushing.threshold==='number'?(rushing.roll<rushing.threshold?'<':'≥'):''}</strong></span><span>Rushing chance <strong>{number(rushing.threshold,2)}%</strong></span></div>
                        <span class="roll-meter" aria-hidden="true"><span style:width={percentPosition(rushing.threshold)+'%'}></span><i style:left={percentPosition(rushing.roll)+'%'}></i></span>
                        <small>The check must be below the rushing chance to pass.</small>
                      </div>
                      <dl class="rushing-facts"><div><dt>Start section</dt><dd>{typeof rushing.startSection==='number'&&rushing.startSection>0?'Section '+rushing.startSection:'Not scheduled'}</dd></div><div><dt>Prevented by modifier</dt><dd>{display(rushing.preventedByModifier)}</dd></div></dl>
                    </div>
                  {/if}
                  {#if rushingPeriods.length}<div class="detail-table">{@render eventTable(rushingPeriods,'Rushing periods',[
                    {key:'startTime',label:'Start (s)'},{key:'endTime',label:'End (s)'},{key:'duration',label:'Active (s)',numeric:true},{key:'mode',label:'Mode'}
                  ])}</div>{/if}
                </Disclosure>
              </section>
            {/if}
          </div>
          <footer class="simulation-meta"><span>Engine <strong>{capture.detailed?.engineBuild}</strong></span><span>Seed <strong>{capture.detailed?.seed}</strong></span><span>Schema <strong>{capture.detailed?.annotations.schemaVersion}</strong></span>{#if typeof horse.popularity==='number'}<span>Popularity <strong>{horse.popularity}</strong></span>{/if}</footer>
          <Disclosure id={instanceId+'-source'} title="Raw simulator response" compact bind:open={sourceOpen}>
            {#if sourceOpen}<pre>{JSON.stringify(capture.detailed,null,2)}</pre>{/if}
          </Disclosure>
        </div>
        {/if}
      </Disclosure>
    </div>
  {/if}
</section>

<style>
  .diagnostics{min-width:0;display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
  .section-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}
  h3,h4{margin:0;font-size:13px;font-weight:600}
  h3 small,h4 small{margin-left:5px;color:var(--text-secondary);font-size:10px;font-weight:400}
  p{margin:0;font-size:11px;color:var(--text-secondary);line-height:1.5}
  .outcome-summary{margin:0;display:grid;grid-template-columns:minmax(0,1fr);gap:0;padding:0;background:none;border-radius:0}
  
  .outcome{display:grid;grid-template-columns:120px minmax(0,1fr);gap:12px;align-items:center;min-width:0;padding:10px 0;border-bottom:0}
  .outcome+.outcome{border-top:1px solid var(--border-subtle)}
  
  .outcome dt{display:flex;align-items:center;color:var(--text-secondary);font-size:11px}.outcome dd{display:grid;grid-template-columns:120px minmax(0,1fr);align-items:center;gap:12px;margin:0;border:0;padding:0}.outcome strong{font-size:17px;font-weight:600;font-variant-numeric:tabular-nums}.outcome-detail{display:flex;flex-wrap:wrap;gap:4px 12px;color:var(--text-secondary);font-size:11px}
  .outcome.caution strong,.outcome-detail.caution,.decision-note.caution{color:var(--accent-warning)}
  .outcome.danger strong{color:var(--accent-error)}
  .outcome small{font-size:11px;font-weight:400;color:var(--text-secondary)}
  
  .report-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);align-items:start;gap:20px;padding-top:6px}
  .report-block{min-width:0}
  .section-heading{--inspect-popover-width:760px;margin-bottom:2px;min-height:22px}
  .section-heading>h3,.section-heading>h4{margin-right:auto}
  .activation-threshold{font-size:10px;color:var(--text-secondary);white-space:nowrap}
  .activation-threshold strong{font-weight:500;color:var(--text-primary);font-variant-numeric:tabular-nums}
  .behaviour-report{display:grid;grid-template-columns:minmax(0,1fr);align-content:start;gap:8px;min-width:0}
  .behaviour-report>.report-block+.report-block,.blocking-summary{padding-top:8px;border-top:1px solid var(--border-subtle)}
  .behaviour-report>.spurt-report{border-top:0;padding-top:0}
  .incident-status{--inspect-popover-width:600px;display:flex;align-items:center;flex-wrap:wrap;gap:4px 14px;font-size:10px;color:var(--text-secondary)}
  .incident-status>span{display:flex;align-items:center;gap:6px}
  .spurt-summary{display:grid;grid-template-columns:minmax(0,1fr);gap:2px;margin:0;padding:4px 0}
  .spurt-summary>div{display:flex;align-items:center;justify-content:space-between;gap:12px;border:0;padding:0}
  .spurt-summary dt{line-height:1.2}
  .spurt-summary dd{font-size:14px;font-weight:600;line-height:1.2;margin:0}
  .spurt-summary small{font-size:10px;font-weight:400;color:var(--text-secondary)}
  .decision-note{margin-top:4px;font-size:11px}
  .spurt-calculation{margin-top:4px;padding:6px 0;background:transparent}
  .spurt-calculation[hidden]{display:none}
  .hp-equation{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;align-items:center;gap:8px;margin-bottom:8px;font-variant-numeric:tabular-nums}
  .hp-equation>span{display:flex;flex-wrap:wrap;align-items:baseline;gap:3px 6px}
  .hp-equation strong{font-size:12px;font-weight:600}
  .hp-equation small{font-size:10px;color:var(--text-secondary);font-weight:400}
  .hp-equation>b{font-size:14px;color:var(--text-secondary);font-weight:500}
  .hp-equation .shortfall strong{color:var(--accent-warning)}
  .spurt-comparison{width:100%;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums}
  .spurt-comparison th,.spurt-comparison td{padding:4px 0;text-align:right}
  .spurt-comparison th:first-child{text-align:left;color:var(--text-secondary);font-weight:400}
  .spurt-comparison thead{color:var(--text-secondary);font-size:10px}
  .spurt-comparison thead th{font-weight:400;border-bottom:1px solid var(--border-subtle)}
  .spurt-comparison td:last-child{color:var(--accent-primary);font-weight:600}
  .spurt-comparison small{font-size:10px;font-weight:400}
  .spurt-result{display:flex;flex-wrap:wrap;gap:2px 10px;margin-top:6px;font-size:10px}
  .spurt-result strong{flex-basis:100%;color:var(--text-primary);font-weight:500}
  .measurements{min-width:0;display:grid;gap:4px;padding-top:8px;border-top:1px solid var(--border-subtle)}
  .measurement-data{display:grid;gap:12px;min-width:0;padding-top:8px}
  .measurement-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:20px;align-items:start}
  .measurement-details-grid,.detail-traces{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));min-width:0;gap:12px;align-items:stretch}
  .detail-panel{min-width:0;padding:6px 0;background:transparent;border-top:1px solid var(--border-subtle)}
  .detail-hint,.detail-footnote{font-size:10px;color:var(--text-secondary)}
  .detail-footnote{margin-top:4px}
  .muted{color:var(--text-secondary)}
  .measurement-data :global(table){font-size:12px}
  .measurement-data :global(th),.measurement-data :global(.sort){text-transform:none;letter-spacing:0;font-size:11px}
  .measurement-data :global(.compact th),.measurement-data :global(.compact td){padding:3px 6px}
  .measurement-data :global(.ui-button--ghost.ui-button--sm){padding:0;font-weight:500}
  .measurement-data :global(.compact[open]>.disclosure-content){margin-top:2px}
  .pace-samples :global(th:first-child){width:100px}
  .pace-samples :global(th),.pace-samples :global(td),.section-details :global(th),.section-details :global(td){height:26px;box-sizing:border-box}
  .pace-samples :global(thead th),.section-details :global(thead th){height:28px}
  .section-details :global(th:first-child){width:64px}
  .section-details :global(th:nth-child(2)){width:100px}
  .section-details :global(th:nth-child(3)){width:80px}
  .detail-table :global(table){min-width:440px}
  .hp-application-details{grid-column:1/-1}
  .hp-application-details :global(table){width:min(100%,960px);min-width:760px}
  .hp-application-details :global(th:first-child){width:72px}
  .hp-application-details :global(th:nth-child(2)){width:210px}
  .hp-application-details :global(th:nth-child(3)){width:160px}
  .hp-application-details :global(th:nth-child(4)){width:160px}
  .hp-application-details :global(th:last-child){width:160px}
  .hp-application-details :global(.skill-chip){vertical-align:middle}
  .hp-application-details .runner-reference{font-size:11px}
  .sample-value{display:inline-grid;grid-template-columns:72px 54px;align-items:center;gap:10px;font-variant-numeric:tabular-nums}
  .sample-value strong{font-weight:500}
  .speed-meter{display:block;position:relative;height:5px;background:color-mix(in srgb,var(--text-secondary) 8%,transparent);border-radius:2px}
  .speed-meter>span{position:absolute;inset:0 auto 0 0;background:#69b7ee;border-radius:2px}
  .rng-meter.acceleration-meter>span{background:#df8ca1}
  .effect-index{margin-left:5px;font-size:10px;color:var(--text-secondary)}
  .detail-runner{font-size:10px;color:var(--text-secondary)}
  .detail-transition{font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:500}
  .application-change{display:grid;justify-items:end;gap:2px;font-variant-numeric:tabular-nums}
  .application-change strong{font-weight:500}
  .application-change>span{display:inline-flex;align-items:baseline;gap:6px}
  .application-change small{font-size:10px;color:var(--text-secondary)}
  .change-percent{font-size:11px}
  .application-change.recovery,.detail-table .activated{color:var(--accent-secondary)}
  .application-change.debuff,.detail-table .failed{color:var(--accent-error)}
  .rushing-details{grid-column:1/-1}
  .rushing-summary{display:grid;grid-template-columns:minmax(130px,.8fr) minmax(240px,1fr) minmax(230px,1fr);align-items:center;gap:18px;padding:3px 0 5px}
  .rushing-status{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;font-size:12px}
  .rushing-status strong{font-weight:600}
  .rushing-status small,.rushing-roll>small{font-size:10px;color:var(--text-secondary)}
  .rushing-roll{display:grid;gap:4px}
  .rushing-roll>div{display:flex;justify-content:space-between;gap:10px;font-size:11px;color:var(--text-secondary)}
  .rushing-roll strong{margin-left:4px;color:var(--text-primary);font-weight:500;font-variant-numeric:tabular-nums}
  .roll-meter{position:relative;display:block;height:6px;background:color-mix(in srgb,var(--text-secondary) 10%,transparent);border-radius:2px}
  .roll-meter>span{position:absolute;inset:0 auto 0 0;background:var(--accent-warning);opacity:.6;border-radius:2px}
  .roll-meter>i{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--text-primary);transform:translateX(-1px)}
  .rushing-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0;font-size:11px}
  .rushing-facts>div{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:0;border:0}
  .rushing-facts dd{margin:0}
  .measurement-data :global(.compact summary){min-height:30px}
  .measurement-legend{display:flex;align-items:center;flex-wrap:wrap;gap:4px 14px;font-size:10px;color:var(--text-secondary)}
  .measurement-legend>span{display:inline-flex;align-items:center;gap:5px}
  .measurement-legend>span::before{content:'';width:12px;height:2px;background:#69b7ee}
  .measurement-legend>.accel-key::before{background:#df8ca1}
  .measurement-legend small{margin-left:auto;font-size:10px}
  .pace-chart{min-width:0}
  .section-chart{position:relative;min-width:0}
  .chart-lane-label{position:absolute;left:48px;z-index:1;display:flex;align-items:center;gap:6px;pointer-events:none;color:var(--text-secondary);font-size:11px;font-weight:500}
  .chart-lane-label::before{content:'';width:12px;height:2px;background:#69b7ee}
  .chart-lane-label.rng::before{width:6px;height:6px;border-radius:50%;background:linear-gradient(90deg,#ed8d8d 50%,#87ceab 50%)}
  .chart-lane-label.speed{top:0}.chart-lane-label.rng{top:96px}
  .rng-summary{display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px 12px;margin-top:4px;font-size:10px;color:var(--text-secondary)}
  .rng-key{display:flex;gap:12px}
  .rng-value{font-weight:500;font-variant-numeric:tabular-nums}
  .rng-value.positive{color:var(--accent-secondary)}
  .rng-value.negative{color:var(--accent-error)}
  .rng-cell{display:inline-grid;grid-template-columns:72px 60px;align-items:center;gap:8px}
  .rng-meter{position:relative;height:8px;background:color-mix(in srgb,var(--text-secondary) 8%,transparent);border-radius:2px}
  .rng-meter::after{content:'';position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--text-secondary);opacity:.6}
  .rng-meter>span{position:absolute;top:0;bottom:0;background:#87ceab;border-radius:1px}
  .rng-meter>span.negative{background:#ed8d8d}
  .reference-group+.reference-group{margin-top:8px;padding-top:4px;border-top:1px solid var(--border-subtle)}
  .reference-periods{list-style:none;padding:0;margin:0;max-height:260px;overflow:auto;scrollbar-width:thin}
  .reference-periods>li{display:flex;align-items:center;gap:8px;padding:3px 0;border-top:1px solid var(--border-subtle);font-size:11px}
  .reference-periods small{margin-left:auto;white-space:nowrap;color:var(--text-secondary);font-size:10px}
  .runner-reference{display:inline-flex;align-items:center;gap:4px;min-width:0;padding:0;border:0;background:none;color:var(--text-secondary);font:inherit;font-size:10px;text-align:left;cursor:pointer}
  .runner-reference:hover{color:var(--accent-primary)}
  .runner-reference :global(.art){width:18px;height:18px;border:0;background:transparent;flex:none}
  .simulation-meta{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:10px;color:var(--text-secondary);padding-top:8px;border-top:1px solid var(--border-subtle)}
  .simulation-meta strong{font-weight:500;color:var(--text-primary)}
  .diagnostics :global(.ui-button--ghost.ui-button--sm){min-height:20px;font-size:11px;padding:1px 4px}
  .diagnostics :global(.compact th),.diagnostics :global(.compact td){padding-block:3px}
  .diagnostics :global(table){font-size:12px}
  .diagnostics :global(th),.diagnostics :global(.sort){font-size:11px;font-weight:500;text-transform:none;letter-spacing:0}
  .skills-report :global(th:nth-child(2)){width:28%}
  .skills-report :global(th:last-child){width:112px}
  .diagnostics :global(.compact .sort){min-height:22px}
  .skill-status{color:var(--text-secondary)}
  .skill-status.activated{color:var(--accent-secondary)}
  .skill-status.failed{color:var(--accent-error)}
  .period-toggle,.calculation-toggle{display:inline-flex;align-items:center;justify-content:flex-end;gap:5px;min-width:36px;min-height:20px;padding:0;border:0;background:none;color:var(--accent-primary);font:inherit;cursor:pointer}
  .calculation-toggle{font-size:10px;color:var(--text-secondary)}
  .period-toggle>span,.calculation-toggle>span{display:flex}.period-toggle .opened,.calculation-toggle .opened{transform:rotate(180deg)}
  .mode-periods{list-style:none;margin:0;padding:4px 8px;background:var(--surface-2)}
  .mode-periods>li{display:flex;align-items:center;gap:12px;font-size:10px;color:var(--text-secondary)}
  .mode-periods>li>span:first-child{display:flex;align-items:center;gap:3px}
  .mode-periods small{margin-left:auto;font-size:10px}
  .empty{padding:6px 0}
  .fallback{padding:8px 10px;border-left:2px solid var(--accent-warning);background:var(--surface-2)}
  dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0 20px;margin:8px 0 12px;font-size:11px}
  dl>div{min-width:0;padding:8px 0;border-bottom:1px solid var(--border-subtle)}
  dt{color:var(--text-secondary)}
  dd{margin:4px 0 0;overflow-wrap:anywhere;font-weight:500;font-variant-numeric:tabular-nums}
  pre{max-height:300px;overflow:auto;padding:12px;background:var(--surface-2);font-size:10px;white-space:pre-wrap;overflow-wrap:anywhere}
  @media(max-width:1100px){.report-grid{grid-template-columns:minmax(0,1fr);gap:12px}.behaviour-report{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 20px}.incident-status,.blocking-summary{grid-column:1/-1}}
  @media(max-width:1250px){.measurement-details-grid,.detail-traces{grid-template-columns:minmax(0,1fr)}}
  @media(max-width:950px){.measurement-grid{grid-template-columns:minmax(0,1fr);gap:12px}.rushing-summary{grid-template-columns:minmax(0,1fr) minmax(0,1.5fr)}.rushing-facts{grid-column:1/-1}}
  @media(max-width:550px){.rushing-summary{grid-template-columns:minmax(0,1fr);gap:12px}.detail-panel{padding:4px 6px}.detail-hint{display:none}.sample-value{grid-template-columns:40px 48px;gap:6px}.pace-samples :global(th:first-child){width:82px}}
  @media(max-width:700px){.behaviour-report{grid-template-columns:minmax(0,1fr)}.outcome-summary{margin:0;display:grid;grid-template-columns:minmax(0,1fr);gap:0;padding:0;background:none;border-radius:0}.outcome{display:grid;grid-template-columns:120px minmax(0,1fr);gap:12px;align-items:center;min-width:0;padding:10px 0}.section-heading{flex-wrap:wrap;gap:5px}dl{grid-template-columns:repeat(2,minmax(0,1fr));gap:0 12px} .reference-periods>li{flex-wrap:wrap}.measurement-legend small{margin-left:0;flex-basis:100%}.mode-periods>li{gap:4px;flex-wrap:wrap}.mode-periods>li>span:first-child{flex-basis:100%}}

.runner-overview{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-bottom:2px;padding-bottom:10px;border-bottom:1px solid var(--border-subtle)}.runner-overview>.outcome-summary{grid-template-columns:repeat(4,minmax(0,1fr));gap:0;margin:0;padding:8px 0 0;border-top:1px solid var(--border-subtle)}.runner-overview .outcome{grid-template-columns:max-content minmax(0,1fr);gap:2px 12px;padding:0 18px;border:0;align-content:start}.runner-overview .outcome:first-child{padding-left:0}.runner-overview .outcome:last-child{padding-right:0}.runner-overview .outcome+.outcome{border-left:1px solid var(--border-subtle)}.runner-overview .outcome dt{font-size:11px}.runner-overview .outcome dd{display:contents}.runner-overview .outcome strong{text-align:right;font-size:16px;align-self:center}.runner-overview .outcome-detail{grid-column:1/-1;font-weight:400;font-size:10px}.runner-overview .fallback{margin:0}
@media(max-width:1100px){.runner-overview>.outcome-summary{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 0}.runner-overview .outcome:nth-child(3){padding-left:0;border-left:0}.runner-overview .outcome:nth-child(2){padding-right:0}}
@media(max-width:800px){.runner-overview{gap:8px}.runner-overview .outcome{padding-inline:10px;gap:2px 5px}.runner-overview .outcome strong{font-size:14px}.runner-overview .outcome dt{font-size:10px}.runner-overview .outcome-detail{font-size:10px}}
.wit-check{display:inline-grid;justify-items:end;font-variant-numeric:tabular-nums}.wit-check small{color:var(--text-secondary);font-size:10px}.wit-check.failed{color:var(--accent-error)}.skill-status.caution{color:var(--accent-warning)}
.skills-report :global(.skill-chip){vertical-align:middle}
@media(max-width:800px){.outcome{padding-block:6px}.outcome-detail{font-weight:400;font-size:10px}}
</style>
