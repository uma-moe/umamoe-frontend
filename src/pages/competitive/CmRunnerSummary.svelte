<script lang="ts">
  import type { Build, Summary } from './hakuraku-types';
  import { buildRunner, styleColors } from './cm-data';
  import RunnerSummary from './RunnerSummary.svelte';
  let { build, data, modified=false, labelStats=true, colors=styleColors }: { build:Build;data:Summary;modified?:boolean;labelStats?:boolean;colors?:Record<number,string> }=$props();
</script>
<RunnerSummary runner={buildRunner(build,data)} outfit={data.cards[build.card]?.outfit} color={colors[build.style===6?6:build.racingStyle]} {modified} {labelStats}/>
