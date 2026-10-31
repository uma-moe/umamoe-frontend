<script lang="ts">
  import { onMount } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import type { SelectOption } from '@/components/controls/SelectField.svelte';
  import {
    characterImagePath,
    loadCharacterNames,
    loadReleasedCharacters,
    type CharacterNames
  } from '@/lib/game-data/characters';
  import {
    DISTANCE_NAMES,
    SURFACE_NAMES,
    describeCourse,
    loadCourses,
    trackName,
    type RaceCourse
  } from '@/lib/game-data/racing/courses';
  import { loadSkills, skillImage, type SkillData } from '@/lib/game-data/skills/skills';
  import {
    loadSupportCards,
    type SupportCardData
  } from '@/lib/game-data/support-cards/support-cards';
  import {
    courseSegments,
    loadReplayCourses
  } from '@/pages/competitive/race-analysis/replay/replay-course';
  import { numberMeetings, type NumberedMeeting } from '@/pages/simulator/courses/cm-presets';
  import { timelineRepository } from '@/pages/timeline/timeline-repository';
  import type { RaceDay } from './skill-explorer/cm/race-day';
  import { meetingOptions, type MeetingOption } from './skill-explorer/cm/meetings';
  import TargetStatline from './skill-explorer/statlines/TargetStatline.svelte';
  import {
    loadStatlines,
    targetStatlines,
    type StatlinesData
  } from './skill-explorer/statlines/statlines-data';
  import {
    explorerUmas,
    firstBanners,
    loadUmaSkills,
    skillsGivenBy,
    unvaluedSkills,
    type ExplorerUma,
    type FirstBanner,
    type UmaSkills,
    type UnvaluedSkills
  } from './skill-explorer/umas/uma-skills';
  import SkillExplorerFilters from './skill-explorer/SkillExplorerFilters.svelte';
  import SkillScatter from './skill-explorer/scatter/SkillScatter.svelte';
  import SkillCard, {
    type RelatedSkill,
    type TerrainSegment
  } from './skill-explorer/skill-card/SkillCard.svelte';
  import { countGate, describeRequirements } from './skill-explorer/skill-card/skill-requirements';
  import {
    loadSkillEffects,
    releasedSkills,
    skillEffectDetails,
    type SkillEffectAlternative
  } from './skill-explorer/skill-card/skill-effects';
  import {
    loadProviderCatalog,
    skillProviders,
    type ProviderCatalog
  } from './skill-explorer/skill-card/skill-providers';
  import { formatWinPoints } from './skill-explorer/scatter/scatter-scale';
  import {
    SKILL_KINDS,
    STYLE_NAMES,
    loadExplorerIndex,
    loadScope,
    type ExplorerIndex,
    type ExplorerScope,
    type ScopeData,
    type SkillKind,
    type StyleKey
  } from './skill-explorer/skill-explorer-data';
  import {
    SKILL_RARITIES,
    isNegativeSkill,
    limitOf,
    plotView,
    type ShowLimit,
    type SkillRarity,
    type XMode,
    type YMode
  } from './skill-explorer/skill-explorer-view';

  type Surface = 'all' | '1' | '2';
  type Distance = 'all' | '1' | '2' | '3' | '4';

  /** Skills named as feeding a count gate. */
  const FEEDERS_SHOWN = 5;

  let index = $state.raw<ExplorerIndex>();
  // Both a named skill and its Global mechanic entry are required; names include future translations.
  let skills = $state.raw(new Map<number, SkillData>());
  let skillEffects = $state.raw(new Map<number, SkillEffectAlternative[]>());
  let raceCourses = $state.raw(new Map<number, RaceCourse>());
  let pageError = $state('');
  let timelineMeetings = $state.raw<NumberedMeeting[]>([]);
  let statlines = $state.raw<StatlinesData>();

  let umaCards = $state.raw<UmaSkills[]>([]);
  let characterNames = $state.raw<CharacterNames>({});
  let releasedCards = $state.raw<ReadonlySet<number>>(new Set());
  let banners = $state.raw<ReadonlyMap<number, FirstBanner>>(new Map());
  let supportCards = $state.raw<SupportCardData[]>([]);
  let providerCatalog = $state.raw<ProviderCatalog>({ umas: [], supports: [] });
  let providerStatus = $state<'loading' | 'ready' | 'error'>('loading');

  let scopeData = $state.raw<ScopeData>();
  let scopeLoading = $state(false);
  let scopeError = $state('');
  let terrain = $state.raw<TerrainSegment[]>();

  let style = $state<StyleKey>('all');
  let surface = $state<Surface>('all');
  let distance = $state<Distance>('all');
  let courseId = $state('');
  let meetingNumber = $state('');
  let xMode = $state<XMode>('position');
  let yMode = $state<YMode>('value');
  let rarities = $state.raw<ReadonlySet<SkillRarity>>(new Set(SKILL_RARITIES));
  let kinds = $state.raw<ReadonlySet<SkillKind>>(new Set(SKILL_KINDS));
  let search = $state('');
  let umaCardId = $state<number>();
  let show = $state<ShowLimit>('100');
  let bestOfFamily = $state(false);
  let showDayBound = $state(true);
  let procScaled = $state(true);
  let comparedSkillIds = $state.raw<ReadonlySet<number>>(new Set());

  const explorerCourses = $derived(index?.courses ?? []);

  // Only meetings on a course the model has values for.
  const meetings = $derived(
    meetingOptions({
      meetings: timelineMeetings,
      courses: [...raceCourses.values()],
      now: Date.now()
    }).filter((meeting) => explorerCourses.some((course) => course.courseId === meeting.courseId))
  );
  const selectedMeeting = $derived(
    meetings.find((meeting) => String(meeting.number) === meetingNumber)
  );

  // Every uma in the game data, so ones still to come to Global can be picked as soon as they are named.
  const umas = $derived(
    explorerUmas({
      cards: umaCards,
      names: characterNames,
      released: releasedCards,
      banners,
      now: Date.now()
    })
  );
  const selectedUma = $derived(umas.find((uma) => uma.cardId === umaCardId));
  const selectedUmaNote = $derived(selectedUma && umaNote(selectedUma));
  const providers = $derived(
    skillProviders({
      catalog: providerCatalog,
      names: characterNames,
      released: releasedCards,
      supports: supportCards
    })
  );

  // A meeting picks its course, so a CM shows its course on its race day.
  const selectedCourse = $derived(
    explorerCourses.find((course) => String(course.courseId) === courseId)
  );
  const scope = $derived<ExplorerScope>(
    selectedCourse
      ? { kind: 'course', course: selectedCourse }
      : { kind: 'group', surface, distance }
  );

  /** The meeting's race day, from the timeline's announced conditions. */
  const raceDay = $derived<RaceDay | undefined>(selectedMeeting?.day);
  /** On a CM with a known day, a day-bound skill shows only where its day holds: nothing is assumed. */
  const dayFromMeeting = $derived(selectedMeeting !== undefined && raceDay !== undefined);

  const target = $derived(
    statlines
      ? targetStatlines(statlines, {
          cm: selectedMeeting?.number,
          course: selectedCourse
            ? { distance: selectedCourse.distance, dirt: selectedCourse.surface === 2 }
            : undefined
        })
      : undefined
  );

  const meetingSelectOptions = $derived<SelectOption[]>([
    { value: '', label: 'Any course' },
    ...meetings.map((meeting) => ({
      value: String(meeting.number),
      label: meetingLabel(meeting.number, meeting.courseId),
      description: meetingNote(meeting)
    }))
  ]);

  const surfaceOptions = $derived<SelectOption[]>([
    { value: 'all', label: 'All surfaces' },
    ...(['1', '2'] as const).map((value) => ({
      value,
      label: SURFACE_NAMES[Number(value)]!,
      disabled: !explorerCourses.some((course) => String(course.surface) === value)
    }))
  ]);

  const distanceOptions = $derived<SelectOption[]>([
    { value: 'all', label: 'All lengths' },
    ...(['1', '2', '3', '4'] as const).map((value) => ({
      value,
      label: DISTANCE_NAMES[Number(value)]!,
      disabled: !explorerCourses.some(
        (course) =>
          String(course.distanceType) === value &&
          (surface === 'all' || String(course.surface) === surface)
      )
    }))
  ]);

  const courseOptions = $derived<SelectOption[]>([
    { value: '', label: 'All matching courses' },
    ...explorerCourses
      .filter(
        (course) =>
          (surface === 'all' || String(course.surface) === surface) &&
          (distance === 'all' || String(course.distanceType) === distance)
      )
      .map((course) => ({ value: String(course.courseId), label: courseLabel(course.courseId) }))
      .sort((left, right) => left.label.localeCompare(right.label))
  ]);

  const view = $derived(
    scopeData
      ? plotView({
          points: scopeData.styles[style],
          skills,
          facts: index?.skills ?? new Map(),
          xMode,
          yMode,
          rarities,
          kinds,
          search,
          comparedSkillIds,
          umaSkillIds: selectedUma && skillsGivenBy(selectedUma),
          bestOfFamily,
          limit: limitOf(show),
          showDayBound,
          day: selectedMeeting ? raceDay : undefined,
          procScaled,
          courseDistance: selectedCourse?.distance
        })
      : undefined
  );

  const yTitle = $derived(
    (yMode === 'value'
      ? 'Est. win rate added to the reference build'
      : 'Est. win rate gained on its own') + (procScaled ? ', over all races' : ', when it procs')
  );
  /** What the plot's axes mean: when it changes, the zoom starts again from the whole plot. */
  const viewKey = $derived(
    [JSON.stringify(scope), style, xMode, yMode, procScaled, selectedCourse?.distance].join('|')
  );
  const pointsById = $derived(
    new Map((scopeData?.styles[style] ?? []).map((point) => [point.skillId, point]))
  );
  const margin = $derived(scopeData?.margins[style]);

  function courseLabel(id: number): string {
    const course = raceCourses.get(id);
    const explorerCourse = explorerCourses.find((candidate) => candidate.courseId === id);
    if (course === undefined) return `Course ${id}`;

    const siblings = [...raceCourses.values()].filter(
      (other) => other.race_track_id === course.race_track_id
    );
    return `${trackName(explorerCourse?.trackId ?? course.race_track_id)} ${describeCourse(course, siblings)}`;
  }

  function meetingLabel(number: number, id: number): string {
    return `CM${number} · ${courseLabel(id)}`;
  }

  function meetingNote(meeting: MeetingOption): string | undefined {
    if (meeting.timing === 'live') return 'Running now';
    if (meeting.timing === 'upcoming') return 'Upcoming';
    return undefined;
  }

  function scopeTitle(): string {
    if (selectedMeeting) return meetingLabel(selectedMeeting.number, selectedMeeting.courseId);
    if (selectedCourse) return courseLabel(selectedCourse.courseId);

    const surfaceName = surface === 'all' ? '' : `${SURFACE_NAMES[Number(surface)]} `;
    const distanceName =
      distance === 'all' ? 'courses' : `${DISTANCE_NAMES[Number(distance)]} courses`;
    return `All ${surfaceName}${distanceName}`;
  }

  /** A readable name for a model variant; others show as the model names them. */
  function modelName(variant: string): string {
    // V5 variants name their checkpoint and prior, e.g. v5-candidate+v5b-wide-all.
    if (variant.startsWith('v5')) {
      return 'V5';
    }

    const names: Record<string, string> = {
      validated: 'validated model',
      'higher-order': 'higher-order model',
      'higher-order-full': 'full-data model'
    };
    return names[variant] ?? variant;
  }

  /** What of the picked uma's skills the model has no value for yet, being newer than it. */
  function unvaluedNote({ unique, skills: count }: UnvaluedSkills): string | undefined {
    const skillsLabel = `${count} ${count === 1 ? 'skill' : 'skills'}`;
    if (unique && count > 0) return `unique and ${skillsLabel} not valued yet`;
    if (unique) return 'unique not valued yet';
    if (count > 0) return `${skillsLabel} not valued yet`;
    return undefined;
  }

  /** Why some of the picked uma's skills are missing from the plot: no value yet, or her unique cannot fire here. */
  function umaNote(uma: ExplorerUma): string | undefined {
    const unvalued = unvaluedSkills(uma, (skillId) => index?.skills.has(skillId) === true);
    const valuedUnique = uma.unique !== undefined && !unvalued.unique;
    const uniqueFiresHere =
      scopeData === undefined ||
      scopeData.styles[style].some((point) => point.skillId === uma.unique);
    const silentUnique = valuedUnique && !uniqueFiresHere;
    const where = style === 'all' ? 'here' : `for ${STYLE_NAMES[style]} here`;

    const notes = [
      unvaluedNote(unvalued),
      silentUnique ? `unique never fires ${where}` : undefined
    ];
    const shown = notes.filter((note) => note !== undefined);
    return shown.length > 0 ? shown.join(', ') : undefined;
  }

  /** A skill as other skills' cards name it: a unique by its character, any other by its icon. */
  function relatedSkill(skillId: number, win?: number): RelatedSkill {
    const skill = skills.get(skillId);
    const card = index?.skills.get(skillId)?.card;
    return {
      skillId,
      name: skill?.name ?? `Skill ${skillId}`,
      image: card === undefined ? skillImage(skill?.icon) : characterImagePath(card),
      win
    };
  }

  function partnersOf(skillId: number): RelatedSkill[] {
    if (style === 'all') return [];

    const partners = scopeData?.partners?.[style]?.get(skillId) ?? [];
    return partners
      .filter((partner) => skills.has(partner.skillId))
      .map((partner) => relatedSkill(partner.skillId, partner.win));
  }

  /** A count-gated skill's gate, and the scope's most valuable skills that mostly fire where it counts. */
  function gateOf(skillId: number, conditions: string) {
    const gate = countGate(conditions);
    if (gate === undefined) return undefined;

    const [from, to] = gate.sections;
    const feeders = (scopeData?.styles[style] ?? [])
      .filter((point) => {
        const skill = skills.get(point.skillId);
        if (point.skillId === skillId || skill === undefined || isNegativeSkill(skill))
          return false;

        const countsForGate =
          gate.counted === 'any' || index?.skills.get(point.skillId)?.kind === 'recovery';
        if (!countsForGate) return false;

        const inWindow = point.sections.slice(from, to).reduce((sum, share) => sum + share, 0);
        return inWindow > point.rate / 2;
      })
      .sort((left, right) => right.win - left.win)
      .slice(0, FEEDERS_SHOWN)
      .map((point) => relatedSkill(point.skillId));
    return { gate, feeders };
  }

  function inReferenceBuild(skillId: number): boolean {
    return style !== 'all' && Boolean(scopeData?.builds?.[style]?.includes(skillId));
  }

  /** A meeting picks its course; the course list opens up so the pick is always among its options. */
  function chooseMeeting(value: string) {
    meetingNumber = value;
    const meeting = meetings.find((candidate) => String(candidate.number) === value);
    if (meeting === undefined) return;

    surface = 'all';
    distance = 'all';
    courseId = String(meeting.courseId);
  }

  function toggleCompared(skillId: number) {
    const next = new Set(comparedSkillIds);
    if (next.has(skillId)) next.delete(skillId);
    else next.add(skillId);

    comparedSkillIds = next;
  }

  onMount(() => {
    Promise.all([
      loadExplorerIndex(),
      loadSkills(),
      loadCourses(),
      loadStatlines(),
      loadSkillEffects()
    ])
      .then(([nextIndex, nextSkills, nextCourses, nextStatlines, nextEffects]) => {
        index = nextIndex;
        skills = releasedSkills(nextSkills, nextEffects);
        skillEffects = nextEffects;
        raceCourses = nextCourses;
        statlines = nextStatlines;
      })
      .catch((error: unknown) => {
        pageError = error instanceof Error ? error.message : 'Skill values could not be loaded.';
      });

    const umaIdentity = Promise.all([loadCharacterNames(), loadReleasedCharacters()]).then(
      ([names, released]) => {
        characterNames = names;
        releasedCards = new Set(released.map((character) => Number(character.id)));
      }
    );

    Promise.all([loadSupportCards(), loadProviderCatalog(), umaIdentity])
      .then(([cards, catalog]) => {
        supportCards = cards;
        providerCatalog = catalog;
        providerStatus = 'ready';
      })
      .catch(() => {
        providerStatus = 'error';
      });

    // Meetings and umas' banner dates come from the timeline; without it no meeting can be picked, and umas not on
    // Global read as JP only.
    timelineRepository
      .load()
      .then((data) => {
        timelineMeetings = numberMeetings(data.events);
        banners = firstBanners(data.events);
      })
      .catch(() => {
        timelineMeetings = [];
        banners = new Map();
      });

    // The uma picker is an aid; without its data it stays empty and the rest of the explorer works.
    Promise.all([loadUmaSkills(), umaIdentity])
      .then(([cards]) => {
        umaCards = cards;
      })
      .catch(() => {
        umaCards = [];
      });
  });

  $effect(() => {
    if (index === undefined) return;

    const requested = scope;
    const controller = new AbortController();
    scopeLoading = true;
    scopeError = '';
    loadScope(requested, controller.signal)
      .then((data) => {
        scopeData = data;
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        scopeError = error instanceof Error ? error.message : 'This selection could not be loaded.';
      })
      .finally(() => {
        if (!controller.signal.aborted) scopeLoading = false;
      });

    return () => controller.abort();
  });

  $effect(() => {
    const course = selectedCourse;
    terrain = undefined;
    if (course === undefined) return;

    let current = true;
    loadReplayCourses()
      .then((data) => {
        if (current) terrain = courseSegments(data.courses[course.courseId], true);
      })
      .catch(() => {
        // The terrain strip is a guide; the distribution reads without it.
      });

    return () => {
      current = false;
    };
  });
</script>

<svelte:head>
  <title>Skill Explorer - uma.moe</title>
  <meta
    name="description"
    content="Every Uma Musume skill's value and proc point on every course, by running style, surface and length."
  />
</svelte:head>

<AppPage
  compactHeading
  routeId="skill-explorer"
  title="Skill Explorer"
  description="What each skill is worth and where it procs, on every course."
  width="wide"
>
  {#if pageError}
    <Banner
      title="Skill Explorer unavailable"
      tone="danger"
    >
      {pageError}
    </Banner>
  {:else if index === undefined}
    <Spinner
      centered
      label="Loading skill values…"
      showLabel
      minHeight="320px"
    />
  {:else}
    <div class="skill-explorer">
      <SkillExplorerFilters
        bind:style
        bind:surface
        bind:distance
        bind:courseId
        bind:meetingNumber
        bind:xMode
        bind:yMode
        bind:rarities
        bind:kinds
        bind:search
        bind:umaCardId
        bind:show
        bind:bestOfFamily
        bind:showDayBound
        {dayFromMeeting}
        bind:procScaled
        {umas}
        {surfaceOptions}
        {distanceOptions}
        {courseOptions}
        meetingOptions={meetingSelectOptions}
        onmeetingchange={chooseMeeting}
      />

      <div class="scope-line">
        <h2>{scopeTitle()}</h2>
        {#if scopeData}
          <span>
            {scopeData.courses}
            {scopeData.courses === 1 ? 'course' : 'courses'} · {view?.plotted.length ?? 0} skills
          </span>
        {/if}
        {#if selectedUma && selectedUmaNote}
          <span>{selectedUma.name}: {selectedUmaNote}</span>
        {/if}
        {#if scopeLoading}
          <Spinner size={18} />
        {/if}
        {#if target}
          <TargetStatline
            {target}
            selectedStyle={style}
          />
        {/if}
      </div>

      {#if scopeError}
        <Banner
          title="This selection could not load"
          tone="warning"
        >
          {scopeError}
        </Banner>
      {:else if view && view.plotted.length === 0}
        <EmptyState
          icon="search"
          title="No skills to show"
          description="Nothing this style can fire matches these filters here."
        />
      {:else if view}
        <SkillScatter
          points={view.plotted}
          xAxis={view.xAxis}
          xUnit={view.xUnit}
          xTitle={view.xTitle}
          xSplit={view.xSplit}
          ySplit={view.ySplit}
          {yTitle}
          format={formatWinPoints}
          quadrants={view.quadrants}
          {viewKey}
          {comparedSkillIds}
          oncompare={toggleCompared}
          onclearcomparison={() => (comparedSkillIds = new Set())}
          details={skillDetails}
        />
      {/if}

      <Disclosure
        id="skill-explorer-method"
        title="How skill values are calculated"
        compact
      >
        <div class="method">
          <p>
            Every value comes from racing. For each running style, a typical runner (no particular
            uma, with the stats you would expect for that course) races a hundred real Champions
            Meeting fields on the course: the CM's own recorded rooms, or runners from the nearest
            CM when the course has none. Those races show where and how often each skill activates.
            The model the optimizer builds with ({modelName(index.model.variant)}, checkpoint
            {index.model.checkpoint}) then works out how much time the skill saves at that spot and
            what that does to the win rate.
          </p>
          <ul>
            <li>
              <strong>Win rate</strong>
              is how much the skill adds to the win rate when it activates.
            </li>
            <li>
              <strong>Scale by proc rate</strong>
              multiplies that by how often it activates: a skill worth +10% that procs in half the races
              shows +5%.
            </li>
            <li>
              <strong>In build</strong>
              adds the skill to a typical {index.buildSize}-skill build the model picks, replacing
              its gold or ◎ version if the build has one. For a skill already in that build, it is
              what removing it costs.
            </li>
            <li>
              <strong>Alone</strong>
              adds the skill to a runner with no other skills.
            </li>
            <li>
              <strong>Works best with</strong>
              lists the skills that raise its value most when owned together. Win rate gains shrink as
              a build gets stronger anyway, so that alone does not count as a combo.
            </li>
          </ul>
          <p>
            <strong>How accurate is it?</strong>
            The values are best for comparing skills with each other; the exact numbers are estimates.
            {#if margin !== undefined}
              Checked against full race simulations, 8 in 10 skills landed within {Math.round(
                margin * 100
              )}% of their own value: a skill shown at +10% measured between +{Math.round(
                10 * (1 - margin)
              )}% and +{Math.round(10 * (1 + margin))}%.
            {/if}
          </p>
          <p>
            <strong>Courses.</strong>
            A CM shows its own course. A wider view such as Turf shows the middle (median) course of the
            group, so it is what a skill is worth on a typical turf course; activation spots average the
            races where it fired. Strong and weaker split at the middle skill shown. All styles averages
            only the styles that can activate the skill.
          </p>
          <p>
            <strong>Special cases.</strong>
            A skill that needs the runner's own activations first, such as a count of skills used or recoveries,
            is raced again with the skills that trigger it added. A ground, weather, season or night skill
            whose condition the day lacks is valued as if it held and marked Forced; Scale by proc rate
            then uses how often it procs when the condition holds. On a CM, these skills show only when
            the race day matches; elsewhere you can hide them under Skill filters. Other skills that never
            activate for the runner, and negative skills, are left out.
          </p>
          <p>
            <strong>Picking an uma</strong>
            highlights her unique (as an inherited skill) and the skills she starts with or unlocks with
            potential levels, from Global game data for umas out on Global and Japanese data for those
            still to come. Skills from training events are not included. Only skills in the Global skill
            list are shown.
          </p>
        </div>
      </Disclosure>
    </div>
  {/if}
</AppPage>

{#snippet skillDetails(skillId: number)}
  {@const point = pointsById.get(skillId)}
  {@const skill = skills.get(skillId)}
  {#if point && skill}
    {@const card = index?.skills.get(skillId)?.card}
    <SkillCard
      point={dayFromMeeting ? { ...point, forced: 0 } : point}
      name={skill.name}
      image={card === undefined ? skillImage(skill.icon) : characterImagePath(card)}
      badge={card === undefined ? undefined : skillImage(skill.icon)}
      description={skill.description}
      effects={skillEffectDetails(skillEffects.get(skillId), selectedCourse?.distance)}
      spCost={skill.baseCost}
      providers={providers.get(skillId)}
      {providerStatus}
      requirements={describeRequirements(skill.conditions ?? '', trackName)}
      partners={partnersOf(skillId)}
      gate={gateOf(skillId, skill.conditions ?? '')}
      scopeCourses={scopeData?.courses ?? 0}
      course={selectedCourse && terrain
        ? { distance: selectedCourse.distance, terrain }
        : undefined}
      inBuild={inReferenceBuild(skillId)}
    />
  {/if}
{/snippet}

<style>
  @import './skill-explorer/skill-explorer-page.css';
</style>
