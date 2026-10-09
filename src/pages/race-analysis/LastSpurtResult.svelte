<script lang="ts">
  import type { lastSpurtResult } from '@/lib/race/race-diagnostics';
  let {result}:{result:ReturnType<typeof lastSpurtResult>}=$props();
</script>
<div class="spurt-result">
  <span class:warning={result.noSpurt||(result.delay??0)>=.05} class:clean={!result.noSpurt&&result.delay!==undefined&&result.delay<.05}>{#if result.noSpurt}No spurt{:else}Delay: {result.delay===undefined?'—':result.delay.toFixed(1)+' m'}{/if}</span>
  <small>Speed: <span class:warning={result.speedPenalty} class:clean={result.speed!==undefined&&!result.speedPenalty}>{result.speed===undefined?'—':result.speed.toFixed(2)+' m/s'}{#if (result.reduction??0)>=.005}{' '}(−{result.reduction!.toFixed(2)}){:else if result.speedPenalty} (penalty){/if}</span></small>
</div>
<style>
  .spurt-result{white-space:nowrap;font-variant-numeric:tabular-nums;line-height:1.4}small{display:block;margin-top:3px;font-size:10px;color:var(--text-secondary)}.warning{color:var(--accent-warning)}.clean{color:var(--accent-success)}
</style>
