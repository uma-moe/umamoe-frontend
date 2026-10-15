<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import {
    loadSkillCatalog,
    resolveEncodedSkill,
    skillImage,
    type SkillCatalogEntry
  } from '@/lib/catalog/skill-catalog';
  import { formatRaceTime } from '@/lib/race/race-display';
  import { theme } from '@/stores/theme';
  import {
    courseSegments,
    type Course
  } from '@/pages/competitive/race-analysis/replay/replay-course';
  import SimulatorRunnerFace from '../SimulatorRunnerFace.svelte';
  import { skillDistributions } from './skill-distributions';
  import { simulatorSampleSummary } from '../../simulator-results';
  import type { MonteCarloResult } from '../../simulator-repository';
  import type { SimulatorUma } from '../../simulator-uma';

  /**
   * The followed runner's skills as a continuous heatmap under the replay's course strip, on its clock, sorted by when they usually fire.
   * The strip's heat at each moment is the share of races in which the skill starts within a second of it, on one absolute scale
   * so rows compare directly; dots mark core trigger spots where many races start it at nearly the same moment.
   */
  let {
    result,
    umas,
    runner,
    course,
    timeAt,
    distanceMax,
    time,
    startTime,
    endTime,
    onseek
  }: {
    result: MonteCarloResult;
    umas: SimulatorUma[];
    runner: number;
    course?: Course;
    timeAt: (distance: number) => number | undefined;
    distanceMax: number;
    time: number;
    startTime: number;
    endTime: number;
    ticks?: number[];
    onseek: (time: number) => void;
  } = $props();

  let catalog = $state.raw(new Map<number, SkillCatalogEntry>());

  onMount(() => {
    void loadSkillCatalog()
      .then((value) => (catalog = value))
      .catch(() => {});
  });

  /** Course sections named as in the Course strip, placed on the replay clock where the mean race's leader enters them. */
  const sections = $derived.by(() => {
    const parts = courseSegments(course, true),
      seen = new Map<string, number>();
    return parts.map((part) => {
      const label =
        part.label === 'Unspecified'
          ? part.start === 0
            ? 'Start'
            : 'Between sections'
          : part.label;
      const total = parts.filter((other) => other.label === part.label).length,
        count = (seen.get(label) ?? 0) + 1;
      seen.set(label, count);
      return {
        start: part.start,
        end: part.end,
        name: total > 1 && part.label !== 'Unspecified' ? label + ' ' + count : label,
        from: part.start <= 0 ? startTime : (timeAt(part.start) ?? startTime)
      };
    });
  });

  const sectionAt = (distance: number) =>
    sections.find(
      (section, index) =>
        distance >= section.start && (distance < section.end || index === sections.length - 1)
    )?.name ?? 'The race';
  /**
   * A half-second grid; each point counts the races that start the skill within a second of it.
   * Heat runs on a log scale from LOW to HIGH of races, so 2% and 6% look different while 60% still stands out.
   * Core spots are peaks where at least SPOT of races start within that second.
   */
  const STEP = 0.5,
    REACH = 1,
    LOW = 0.01,
    HIGH = 0.6,
    SPOT = 0.2,
    FIXED = 3;
  /** Magma, a perceptually even heat ramp: dark purple for rare, through pink and orange, to cream for most races. Light mode runs it the other way so more is always more visible. */
  const RAMP_DARK = [
    [44, 17, 72, 0.85],
    [120, 35, 128, 0.95],
    [205, 64, 110, 1],
    [246, 138, 88, 1],
    [253, 231, 169, 1]
  ];
  const RAMP_LIGHT = [
    [253, 231, 169, 1],
    [246, 138, 88, 1],
    [205, 64, 110, 1],
    [120, 35, 128, 1],
    [44, 17, 72, 1]
  ];

  const ramp = $derived($theme === 'light' ? RAMP_LIGHT : RAMP_DARK);

  const heat = (share: number) =>
    share <= 0
      ? 0
      : Math.max(0, Math.min(1, Math.log(Math.max(share, LOW) / LOW) / Math.log(HIGH / LOW)));

  function color(share: number) {
    if (share <= 0) return 'rgba(0,0,0,0)';
    const t = heat(share) * (ramp.length - 1),
      index = Math.min(ramp.length - 2, Math.floor(t)),
      mix = t - index,
      [a, b] = [ramp[index]!, ramp[index + 1]!];
    return (
      'rgba(' +
      [0, 1, 2]
        .map((channel) => Math.round(a[channel]! + (b[channel]! - a[channel]!) * mix))
        .join(',') +
      ',' +
      (a[3]! + (b[3]! - a[3]!) * mix).toFixed(2) +
      ')'
    );
  }

  /** Light smoothing over the half-second grid so the heat shows the shape, not single-race noise. */
  const smooth = (values: number[]) =>
    values.map((_, index) => {
      let sum = 0,
        weight = 0;
      for (let offset = -2; offset <= 2; offset++) {
        const value = values[index + offset];
        if (value === undefined) continue;
        const w = 3 - Math.abs(offset);
        sum += value * w;
        weight += w;
      }
      return values[index]! > 0 || sum > 0 ? sum / weight : 0;
    });

  const span = $derived(Math.max(1, endTime - startTime));
  const points = $derived(Math.max(2, Math.ceil(span / STEP) + 1));

  const pointOf = (value: number) =>
    Math.max(0, Math.min(points - 1, Math.round((value - startTime) / STEP)));
  const pointAt = (index: number) => Math.max(0, Math.min(100, ((index * STEP) / span) * 100));
  const at = (value: number) => Math.max(0, Math.min(100, ((value - startTime) / span) * 100));

  const owned = $derived([...new Set(umas[runner]?.skills.map((skill) => skill.skillId) ?? [])]);
  const table = $derived(
    skillDistributions(result, runner, owned).rows.filter(
      (row) => owned.includes(row.id) && row.triggered
    )
  );
  const skills = $derived(
    table.map((row) => {
      const resolved = resolveEncodedSkill(catalog, row.id),
        name = resolved.skill?.name ?? 'Skill ' + row.id;
      const passive = row.procs.every(({ proc }) => proc[6] < 0),
        starts = row.procs.map(({ proc }) => proc[4]).sort((a, b) => a - b);
      // A race counts once per grid point, even when the skill starts twice near it.
      const counts = new Int32Array(points),
        stamp = new Int32Array(points),
        reach = Math.round(REACH / STEP);
      for (const { run, proc } of row.procs) {
        const centre = pointOf(proc[4]);
        for (
          let index = Math.max(0, centre - reach);
          index <= Math.min(points - 1, centre + reach);
          index++
        )
          if (stamp[index] !== run + 1) {
            stamp[index] = run + 1;
            counts[index]!++;
          }
      }
      const share = Array.from(counts, (count) => count / Math.max(1, result.runs));
      const summary = simulatorSampleSummary(starts)!,
        lasting = row.procs.map(({ proc }) => proc[6]).filter((value) => value > 0);
      const places = new Map<string, Set<number>>();
      for (const { run, proc } of row.procs) {
        const place = sectionAt(proc[5]);
        places.set(place, (places.get(place) ?? new Set()).add(run));
      }
      return {
        id: row.id,
        name,
        icon: skillImage(resolved.skill?.icon),
        rate: row.rate,
        passive,
        summary,
        fixed: summary.p90 - summary.p10 <= FIXED,
        duration: lasting.length ? simulatorSampleSummary(lasting)!.median : 0,
        share,
        spots: spots(share),
        gradient:
          'linear-gradient(to right,' +
          smooth(share)
            .map((value, index) => color(value) + ' ' + pointAt(index).toFixed(2) + '%')
            .join(',') +
          ')',
        places: [...places]
          .map(([place, runs]) => ({ place, share: runs.size / Math.max(1, result.runs) }))
          .sort((a, b) => b.share - a.share)
      };
    })
  );
  const timed = $derived(
    skills
      .filter((skill) => !skill.passive)
      .sort((a, b) => a.summary.median - b.summary.median || a.id - b.id)
  );
  const always = $derived(skills.filter((skill) => skill.passive));
  const silent = $derived(owned.length - skills.length);

  type Skill = (typeof timed)[number];

  /** Peaks of at least SPOT, one per hill: two peaks count as separate spots only if the strip dips below half the smaller one between them. */
  function spots(share: number[]) {
    const peaks = share
      .flatMap((value, index) =>
        value >= SPOT && value >= (share[index - 1] ?? 0) && value > (share[index + 1] ?? 0)
          ? [index]
          : []
      )
      .sort((a, b) => share[b]! - share[a]!);
    const kept: number[] = [];
    for (const peak of peaks) {
      const sameHill = kept.some((other) => {
        const [from, to] = peak < other ? [peak, other] : [other, peak];
        return Math.min(...share.slice(from, to + 1)) >= share[peak]! / 2;
      });
      if (!sameHill) kept.push(peak);
    }
    return kept.map((index) => ({ time: startTime + index * STEP, share: share[index]! }));
  }

  const clock = (value: number) => formatRaceTime(Math.max(0, value), 1);
  const pct = (value: number) => Math.round(value) + '%';
  const timing = (skill: Skill) =>
    skill.fixed
      ? 'Usually at ' + clock(skill.summary.median) + ', ' + skill.places[0]!.place
      : '80% of its starts fall between ' +
        clock(skill.summary.p10) +
        ' and ' +
        clock(skill.summary.p90);
  const describe = (skill: Skill) =>
    skill.name +
    ' fires in ' +
    pct(skill.rate) +
    ' of races. ' +
    timing(skill) +
    '. ' +
    (skill.duration ? 'Lasts about ' + skill.duration.toFixed(1) + ' s.' : 'Instant effect.');
  const shareAt = (skill: Skill, moment: number) =>
    moment < startTime || moment > endTime ? 0 : (skill.share[pointOf(moment)] ?? 0);
  const live = (skill: Skill) => shareAt(skill, time) >= 0.15;

  // One tooltip in the top layer, so the replay's sideways-scrolling timeline cannot clip it.
  let tip = $state<{ skill: Skill; moment: number; x: number; below: number; above: number }>(),
    card = $state<HTMLElement>();

  $effect(() => {
    if (!card) return;
    const open = card.matches(':popover-open');
    if (tip && !open) card.showPopover();
    else if (!tip && open) card.hidePopover();
  });

  const tipLeft = (x: number) => (x + 292 > innerWidth ? Math.max(8, x - 282) : x + 12);
  const tipTop = (below: number, above: number) =>
    below + 4 + (card?.offsetHeight ?? 150) > innerHeight - 8
      ? Math.max(8, above - 4 - (card?.offsetHeight ?? 150))
      : below + 4;

  function point(event: PointerEvent, skill: Skill) {
    const track = (event.currentTarget as HTMLElement).getBoundingClientRect();
    tip = {
      skill,
      moment:
        startTime +
        Math.max(0, Math.min(1, (event.clientX - track.left) / Math.max(1, track.width))) * span,
      x: event.clientX,
      below: track.bottom,
      above: track.top
    };
  }

  /** Clicking a shaded cell shows that moment; anywhere else in the row shows the usual one. */
  const target = (skill: Skill) =>
    tip?.skill === skill && shareAt(skill, tip.moment) > 0
      ? tip.moment
      : (skill.spots[0]?.time ?? skill.summary.median);
</script>

<section
  class="skill-windows"
  aria-label="Skills over the race"
>
  <div class="line head">
    <div class="label">
      <span class="title">Skills</span>
      <SimulatorRunnerFace
        cardId={umas[runner]?.cardId}
        size={18}
      />
      <span class="who">{umas[runner]?.name}</span>
      <InspectPopover label="How to read the skill rows">
        {#snippet trigger()}
          <span class="help">
            <Icon
              name="info"
              size={14}
            />
          </span>
        {/snippet}
        <h3>Skills over the race</h3>
        <p>
          One row per skill of the runner you follow, on the same clock as the replay and sorted by
          when it usually fires. Pick another runner in the field to see hers.
        </p>
        <p>
          The strip runs from dark purple, where only a few races start the skill within a second of
          that moment, through pink and orange to cream, where most races do, on the same scale for
          every row. A long faint strip means it can start anywhere in that stretch, gaps under the
          straights or corners mean it only fires there, and a dot marks a core trigger spot where
          at least {pct(SPOT * 100)} of races start it at nearly the same moment.
        </p>
        <p>
          Hover a row for its timing, its duration and the share of races per course section; click
          to watch it in the replay. The thin lines are the course sections from the Course strip.
        </p>
      </InspectPopover>
    </div>
    <div
      class="key"
      aria-hidden="true"
    >
      <span class="ramp">
        <i
          style:background={'linear-gradient(to right,' +
            ramp.map((stop) => 'rgba(' + stop.join(',') + ')').join(',') +
            ')'}
        ></i>
        <small>{pct(LOW * 100)}</small>
        <small>8%</small>
        <small>{pct(HIGH * 100)}+</small>
      </span>
      <span>of races start it within a second of that moment</span>
      <span>
        <i class="k-spot"></i>
        core trigger spot
      </span>
    </div>
    <div
      class="value"
      title="Share of races in which the skill activates at least once"
    >
      Fires in
    </div>
  </div>
  {#each timed as skill (skill.id)}
    <div
      class="line row"
      class:live={live(skill)}
    >
      <span class="label">
        {#if skill.icon}
          <img
            src={skill.icon}
            alt=""
            width="14"
            height="14"
          />
        {:else}
          <i class="no-icon"></i>
        {/if}
        <span class="name">{skill.name}</span>
      </span>
      <span
        class="track"
        role="button"
        tabindex="0"
        aria-label={describe(skill) + ' Select to watch it in the replay.'}
        onpointermove={(event) => point(event, skill)}
        onpointerleave={() => (tip = undefined)}
        onclick={() => onseek(target(skill))}
        onkeydown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onseek(skill.summary.median);
          }
        }}
      >
        {#each sections as section (section.start)}
          {#if section.start > 0}
            <i
              class="section"
              style:left={at(section.from) + '%'}
            ></i>
          {/if}
        {/each}
        <i class="lane"></i>
        <i
          class="heat"
          style:background={skill.gradient}
        ></i>
        {#each skill.spots as spot (spot.time)}
          <i
            class="spot"
            style:left={at(spot.time) + '%'}
          ></i>
        {/each}
        <i
          class="cursor"
          style:left={at(time) + '%'}
        ></i>
      </span>
      <span class="value">{pct(skill.rate)}</span>
    </div>
  {:else}
    {#if !always.length}
      <p class="empty">
        {umas[runner]?.name ?? 'This runner'} has no skill that fired in these races.
      </p>
    {/if}
  {/each}
  {#if always.length}
    <div class="line always">
      <span class="label">Always active</span>
      <span class="list">
        {#each always as skill (skill.id)}
          <span class="item">
            {#if skill.icon}
              <img
                src={skill.icon}
                alt=""
                width="14"
                height="14"
              />
            {/if}{skill.name}
          </span>
        {/each}
      </span>
      <span class="value"></span>
    </div>
  {/if}
  {#if silent > 0}
    <p class="silent">
      {silent} learned {silent === 1 ? 'skill' : 'skills'} never fired.
    </p>
  {/if}
  <div
    class="tip"
    popover="manual"
    bind:this={card}
    role="tooltip"
    style:left={tip ? tipLeft(tip.x) + 'px' : undefined}
    style:top={tip ? tipTop(tip.below, tip.above) + 'px' : undefined}
  >
    {#if tip}
      <header>
        <strong>{tip.skill.name}</strong>
        <span>fires in {pct(tip.skill.rate)} of races</span>
      </header>
      {@const here = shareAt(tip.skill, tip.moment)}
      <p class="moment">
        <b>{clock(tip.moment)}</b>
        {here > 0
          ? 'starts within a second of this in ' + pct(here * 100) + ' of races'
          : 'never starts near this moment'}
      </p>
      {#if tip.skill.spots.length}
        <p>
          Core {tip.skill.spots.length === 1 ? 'spot' : 'spots'}: {tip.skill.spots
            .map((spot) => clock(spot.time) + ' (' + pct(spot.share * 100) + ')')
            .join(', ')}
        </p>
      {/if}
      <p>
        {timing(tip.skill)} · {tip.skill.duration
          ? 'lasts about ' + tip.skill.duration.toFixed(1) + ' s'
          : 'instant effect'}
      </p>
      <ul>
        {#each tip.skill.places.slice(0, 5) as place (place.place)}
          <li>
            <i style:width={'calc((100% - 40px) * ' + place.share + ')'}></i>
            <span>{place.place}</span>
            <b>{pct(place.share * 100)}</b>
          </li>
        {/each}
      </ul>
      {#if tip.skill.places.length > 5}
        <small>
          and {tip.skill.places.length - 5} more {tip.skill.places.length - 5 === 1
            ? 'section'
            : 'sections'} now and then
        </small>
      {/if}
      <small>Share of races it fires in each course section · click to watch that moment</small>
    {/if}
  </div>
</section>

<style>
  @import './simulator-skill-windows.css';
</style>
