<script lang="ts">
  import type { RaceRunner } from '@/lib/race/race-capture-parser';
  import ProfileVeteranIdentity from '@/pages/profile/ProfileVeteranIdentity.svelte';
  import StatStrip from '@/components/StatStrip.svelte';
  import AptitudeGrid from '@/components/AptitudeGrid.svelte';
  import RaceSkill from './RaceSkill.svelte';
  import type { AptitudeGradeValue } from '@/components/AptitudeGrade.svelte';
  import { identity, score, stats } from './analysis-view';
  let { runner, skillNames = new Map<number, string>(), expanded = false }: { runner: RaceRunner; skillNames?: Map<number,string>; expanded?: boolean } = $props();
  const grades = ['G','F','E','D','C','B','A','S'] as AptitudeGradeValue[];
</script>
<div class="build">
  <ProfileVeteranIdentity summary={identity(runner)} score={score(runner) || undefined}/>
  <StatStrip items={stats(runner)} presentation="icons" compact/>
  {#if expanded}
    <AptitudeGrid items={Object.entries(runner.aptitudes).filter(([,value])=>value!==undefined).map(([id,value])=>({id,label:id,grade:grades[Math.max(0,(value??1)-1)]??'G'}))} compact stretch/>
    <div class="skills">{#each runner.skillIds as id}<RaceSkill {id} name={skillNames.get(id)}/>{/each}</div>
  {/if}
</div>
<style>.build{display:grid;gap:10px;min-width:0;container-type:inline-size}.skills{display:flex;flex-wrap:wrap;gap:5px}</style>
