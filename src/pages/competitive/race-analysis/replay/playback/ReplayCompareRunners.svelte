<script lang="ts">
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import { portrait } from '@/pages/competitive/analysis-view';

  let {
    runners,
    followed,
    hidden = $bindable([])
  }: {
    /** In finish order. */
    runners: RaceRunner[];
    /** The runner the replay follows stays on the chart. */
    followed: number;
    /** Runner indices left off the comparison. */
    hidden?: number[];
  } = $props();

  const id = $props.id();

  const others = $derived(runners.filter((runner) => runner.index !== followed));
  const hiddenOthers = $derived(others.filter((runner) => hidden.includes(runner.index)).length);

  function setShown(index: number, shown: boolean) {
    hidden = shown ? hidden.filter((other) => other !== index) : [...hidden, index];
  }

  function setAllShown(shown: boolean) {
    hidden = shown ? [] : others.map((runner) => runner.index);
  }
</script>

<div class="compare-runners">
  <h3>Compared runners</h3>
  <div class="all-runners">
    <Checkbox
      id={id + '-all'}
      label="All runners"
      checked={hiddenOthers === 0}
      indeterminate={hiddenOthers > 0 && hiddenOthers < others.length}
      onchange={setAllShown}
    />
  </div>
  <ul>
    {#each runners as runner, place (runner.index)}
      {@const isFollowed = runner.index === followed}
      {@const checkboxId = id + '-' + runner.index}
      {@const finish = runner.result?.finishOrder ?? place + 1}
      <li class:followed={isFollowed}>
        <Checkbox
          id={checkboxId}
          label={finish + '. ' + runner.name}
          hideLabel
          description={isFollowed ? 'Followed' : undefined}
          checked={isFollowed || !hidden.includes(runner.index)}
          disabled={isFollowed}
          onchange={(shown) => setShown(runner.index, shown)}
        />
        <!-- The checkbox carries the accessible name; this label only widens its click target to the row. -->
        <label
          class="runner"
          for={checkboxId}
          aria-hidden="true"
        >
          <Artwork
            src={portrait(runner.cardId)}
            alt=""
            size="xs"
          />
          <span class="place">{finish}</span>
          <span class="name">{runner.name}</span>
          {#if isFollowed}
            <small>Followed</small>
          {/if}
        </label>
      </li>
    {/each}
  </ul>
</div>

<style>
  @import './replay-compare-runners.css';
</style>
