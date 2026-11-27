<script lang="ts">
  import { onMount } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import type { SelectOption } from '@/components/controls/SelectField.svelte';
  import { umaPortrait, skillIcon } from '@/lib/game-assets/art-links';
  import {
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
  import {
    isEvoSkill,
    loadSkills,
    skillRarity,
    type SkillData
  } from '@/lib/game-data/skills/skills';
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
  import {
    restoreCourseSelection,
    saveCourseSelection
  } from './skill-explorer/course-selection-storage';
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
  import BuildPanel, { type ReferenceBuildView } from './skill-explorer/build/BuildPanel.svelte';
  import ExplorerGuide from './skill-explorer/ExplorerGuide.svelte';
  import SkillExplorerFilters from './skill-explorer/SkillExplorerFilters.svelte';
  import SkillScatter from './skill-explorer/scatter/SkillScatter.svelte';
  import SkillCard, { type TerrainSegment } from './skill-explorer/skill-card/SkillCard.svelte';
  import type { RelatedSkill } from './skill-explorer/SkillChipList.svelte';
  import { countGate, describeRequirements } from './skill-explorer/skill-card/skill-requirements';
  import {
    loadSkillEffects,
    releasedSkills,
    type SkillEffectAlternative
  } from '@/lib/game-data/skills/skill-effects';
  import { skillEffectDetails } from './skill-explorer/skill-card/skill-effects';
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
    DEFAULT_SKILL_RARITIES,
    gateFeeders,
    hiddenRarity,
    limitOf,
    plotView,
    raritiesOf,
    skillPurchaseCost,
    type ShowLimit,
    type SkillRarity,
    type UniqueVersion,
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
  /** Every Global skill, with those the explorer has no mechanics for: names for the build panel. */
  let allSkills = $state.raw(new Map<number, SkillData>());
  let skillEffects = $state.raw(new Map<number, SkillEffectAlternative[]>());
  let raceCourses = $state.raw(new Map<number, RaceCourse>());
  let pageError = $state('');
  let timelineMeetings = $state.raw<NumberedMeeting[]>([]);
  let timelineLoaded = $state(false);
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
  let rarities = $state.raw<ReadonlySet<SkillRarity>>(new Set(DEFAULT_SKILL_RARITIES));
  let uniqueVersion = $state<UniqueVersion>('inherited');
  let kinds = $state.raw<ReadonlySet<SkillKind>>(new Set(SKILL_KINDS));
  let search = $state('');
  let umaCardId = $state<number>();
  let show = $state<ShowLimit>('100');
  let bestOfFamily = $state(false);
  let showDayBound = $state(true);
  let procScaled = $state(true);
  let comparedSkillIds = $state.raw<ReadonlySet<number>>(new Set());
  let revealedEvoIds = $state.raw<ReadonlySet<number>>(new Set());

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
            ? {
                courseId: selectedCourse.courseId,
                distance: selectedCourse.distance,
                dirt: selectedCourse.surface === 2
              }
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

  /** The reference build, which the values are measured in, is shown on a single course for a single style. */
  const buildStyle = $derived(selectedCourse && style !== 'all' ? style : undefined);
  const referenceBuild = $derived(buildStyle ? scopeData?.builds?.[buildStyle] : undefined);
  const styleReferences = $derived(buildStyle ? (scopeData?.references?.[buildStyle] ?? []) : []);
  const styleBaseline = $derived(buildStyle ? scopeData?.baselines?.[buildStyle] : undefined);
  const umaNameByCard = $derived(new Map(umas.map((uma) => [uma.cardId, uma.name])));
  const referenceBuildViews = $derived<ReferenceBuildView[]>(
    styleReferences.map((ref) => ({
      card: ref.card,
      name: umaNameByCard.get(ref.card) ?? `Card ${ref.card}`,
      portrait: umaPortrait(ref.card),
      stats: ref.stats,
      baselineWin: ref.baselineWin,
      source: ref.source,
      skills: ref.skills.map((skillId) => relatedSkill(skillId))
    }))
  );
  const points = $derived(scopeData?.styles[style] ?? []);
  const hasSectionWins = $derived(points.some((point) => point.sectionWins !== undefined));
  const heldRarities = $derived(raritiesOf(points, skills));
  // With both versions of uniques valued, one shows at a time: a version alone shows whatever the toggle says.
  const bothUniqueVersions = $derived(
    heldRarities.includes('inherited') && heldRarities.includes('personal')
  );
  const hasEvolved = $derived(heldRarities.includes('evolved'));
  const shownUniqueVersion = $derived(bothUniqueVersions ? uniqueVersion : undefined);
  const rarityOptions = $derived(
    shownUniqueVersion === undefined
      ? heldRarities
      : heldRarities.filter((rarity) => rarity !== hiddenRarity(shownUniqueVersion))
  );

  const view = $derived(
    scopeData
      ? plotView({
          points,
          skills,
          facts: index?.skills ?? new Map(),
          xMode,
          yMode,
          rarities,
          uniqueVersion: shownUniqueVersion,
          kinds,
          search,
          comparedSkillIds,
          evolvesFrom: index?.evolvesFrom,
          revealedEvoIds,
          umaSkillIds:
            selectedUma && skillsGivenBy(selectedUma, shownUniqueVersion === 'own', index?.skills),
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
    (yMode === 'alone'
      ? `Est. win rate${xMode === 'cost' ? ' per 100 SP' : ''} gained on its own`
      : `Est. win rate${xMode === 'cost' ? ' per 100 SP' : ''} added to the reference build` +
        (yMode === 'forced' ? ', waiting skills forced' : '')) +
      (procScaled ? ', normalized for proc rate' : ', per proc')
  );
  /** What the plot's axes mean: when it changes, the zoom starts again from the whole plot. */
  const viewKey = $derived(
    [JSON.stringify(scope), style, xMode, yMode, procScaled, selectedCourse?.distance].join('|')
  );
  const pointsById = $derived(new Map(points.map((point) => [point.skillId, point])));
  const evosByBase = $derived.by(() => {
    const grouped = new Map<number, number[]>();
    if (!index) return grouped;
    for (const [evoId, baseId] of index.evolvesFrom) {
      if (!pointsById.has(evoId) || !skills.has(evoId)) continue;
      const list = grouped.get(baseId);
      if (list) list.push(evoId);
      else grouped.set(baseId, [evoId]);
    }

    for (const ids of grouped.values()) {
      ids.sort(
        (left, right) => (pointsById.get(right)?.win ?? 0) - (pointsById.get(left)?.win ?? 0)
      );
    }

    return grouped;
  });

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
    return `CM${number} ${courseLabel(id)}`;
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
      scopeData === undefined || points.some((point) => point.skillId === uma.unique);
    const silentUnique = valuedUnique && !uniqueFiresHere;
    const where = style === 'all' ? 'here' : `for ${STYLE_NAMES[style]} here`;

    const notes = [
      unvaluedNote(unvalued),
      silentUnique ? `unique never fires ${where}` : undefined
    ];
    const shown = notes.filter((note) => note !== undefined);
    return shown.length > 0 ? shown.join(', ') : undefined;
  }

  /** A skill as other skills' cards name it: a unique by its character, any other (including evolved) by its icon. */
  function relatedSkill(skillId: number): RelatedSkill {
    const skill = skills.get(skillId);
    const card = isEvoSkill(skill) ? undefined : index?.skills.get(skillId)?.card;
    return {
      skillId,
      name: skill?.name ?? `Skill ${skillId}`,
      image: card === undefined ? skillIcon(skill?.icon) : umaPortrait(card),
      rarity: skillRarity(skill, Boolean(skill?.inherited))
    };
  }

  /** Partners are found for the reference build only. Named without their gains: the model's sizes run several times
   *  what races show, while its picks mostly hold. */
  function partnersOf(skillId: number): RelatedSkill[] {
    if (style === 'all') return [];

    const partners = scopeData?.partners?.[style]?.get(skillId) ?? [];
    return partners
      .filter((partner) => skills.has(partner.skillId))
      .map((partner) => relatedSkill(partner.skillId));
  }

  /** A count-gated skill's gate, and the scope's most valuable build-legal skills that mostly fire where it counts. */
  function gateOf(skillId: number, conditions: string) {
    const gate = countGate(conditions);
    if (gate === undefined) return undefined;

    const opened = skills.get(skillId);
    const charLocked =
      opened !== undefined && (isEvoSkill(opened) || opened.unique === true || opened.rarity >= 3);
    const ownerCardId =
      (charLocked ? index?.skills.get(skillId)?.card : undefined) ?? selectedUma?.cardId;
    const feeders = gateFeeders({
      skillId,
      gate,
      points,
      skills,
      facts: index?.skills,
      ownerCardId,
      day: selectedMeeting ? raceDay : undefined,
      limit: FEEDERS_SHOWN
    }).map((point) => relatedSkill(point.skillId));
    return { gate, feeders };
  }

  function evolutionsOf(skillId: number): number[] {
    return evosByBase.get(skillId) ?? [];
  }

  function areEvosShown(evoIds: readonly number[]): boolean {
    return evoIds.length > 0 && evoIds.every((id) => revealedEvoIds.has(id));
  }

  function toggleDisplayEvos(evoIds: readonly number[]) {
    if (evoIds.length === 0) return;

    const next = new Set(revealedEvoIds);
    if (areEvosShown(evoIds)) {
      for (const id of evoIds) next.delete(id);
    } else {
      for (const id of evoIds) next.add(id);
    }

    revealedEvoIds = next;
  }

  function evoToggleFor(skillId: number) {
    const evoIds = evolutionsOf(skillId);
    if (evoIds.length === 0) return undefined;
    return {
      count: evoIds.length,
      shown: areEvosShown(evoIds),
      toggle: () => toggleDisplayEvos(evoIds)
    };
  }

  function inReferenceBuild(skillId: number): boolean {
    if (style === 'all') return false;
    if (styleReferences.length > 0) {
      return styleReferences.some((ref) => ref.skills.includes(skillId));
    }

    return Boolean(referenceBuild?.includes(skillId));
  }

  function restorePick(loaded: ExplorerIndex): void {
    const saved = restoreCourseSelection();
    if (saved === undefined) return;

    const valued = loaded.courses.some((course) => String(course.courseId) === saved.courseId);
    if (!valued) return;

    courseId = saved.courseId;
    meetingNumber = saved.meetingNumber;
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
        allSkills = nextSkills;
        skills = releasedSkills(nextSkills, nextEffects);
        skillEffects = nextEffects;
        raceCourses = nextCourses;
        statlines = nextStatlines;
        restorePick(nextIndex);
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
        timelineLoaded = true;
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
    if (index === undefined) return;
    saveCourseSelection({ courseId, meetingNumber });
  });

  $effect(() => {
    if (index === undefined || !timelineLoaded || meetingNumber === '') return;
    if (meetings.some((meeting) => String(meeting.number) === meetingNumber)) return;

    meetingNumber = '';
  });

  $effect(() => {
    if (!hasSectionWins && xMode === 'wrPosition') {
      xMode = 'position';
    }
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
    content="Compare what every Uma Musume skill is worth and where it activates on every course, by running style, surface and length."
  />
</svelte:head>

<AppPage
  compactHeading
  routeId="skill-explorer"
  title="Skill Explorer"
  badge="Beta"
  description="Overview of individual skill value and activation timing across every course."
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
        {hasSectionWins}
        bind:yMode
        bind:rarities
        {rarityOptions}
        bind:uniqueVersion
        {bothUniqueVersions}
        {hasEvolved}
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
        <div class="scope-head">
          <div class="scope-title">
            <h2>{scopeTitle()}</h2>
            <ExplorerGuide
              model={modelName(index.model.variant)}
              checkpoint={index.model.checkpoint}
            />
          </div>
          {#if scopeData}
            <span class="scope-meta">
              {#if scopeData.courses > 1}
                {scopeData.courses} courses,
              {/if}
              {view?.plotted.length ?? 0} skills
            </span>
          {/if}
          {#if selectedUma && selectedUmaNote}
            <span class="scope-meta">{selectedUma.name}: {selectedUmaNote}</span>
          {/if}
          {#if scopeLoading}
            <Spinner size={18} />
          {/if}
        </div>
        {#if (buildStyle && referenceBuild) || target}
          <!-- The values' build and target stats: they share the title row on wide screens, and align edge-to-edge below it on smaller ones. -->
          <div class="scope-tools">
            {#if buildStyle && (referenceBuild || referenceBuildViews.length > 0)}
              <BuildPanel
                skills={(referenceBuild ?? []).map((skillId) => relatedSkill(skillId))}
                references={referenceBuildViews}
                styleName={STYLE_NAMES[buildStyle]}
                baseline={styleBaseline}
              />
            {/if}
            {#if target}
              <TargetStatline
                {target}
                selectedStyle={style}
              />
            {/if}
          </div>
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
          description="No skill this running style can activate here matches these filters."
        />
      {:else if view}
        <SkillScatter
          points={view.plotted}
          xAxis={view.xAxis}
          xUnit={view.xUnit}
          xTitle={view.xTitle}
          xSplit={view.xSplit}
          ySplit={view.ySplit}
          yUnitSuffix={view.yUnitSuffix}
          yFloor={view.yFloor}
          {yTitle}
          format={formatWinPoints}
          quadrants={view.quadrants}
          bands={view.bands}
          marks={view.marks}
          {viewKey}
          {comparedSkillIds}
          oncompare={toggleCompared}
          onclearcomparison={() => (comparedSkillIds = new Set())}
          {revealedEvoIds}
          onclearevos={() => (revealedEvoIds = new Set())}
          evoToggle={evoToggleFor}
          details={skillDetails}
        />
      {/if}
    </div>
  {/if}
</AppPage>

{#snippet skillDetails(skillId: number)}
  {@const point = pointsById.get(skillId)}
  {@const skill = skills.get(skillId)}
  {#if point && skill}
    {@const card = isEvoSkill(skill) ? undefined : index?.skills.get(skillId)?.card}
    {@const evoIds = evolutionsOf(skillId)}
    {@const baseId = index?.evolvesFrom.get(skillId)}
    <SkillCard
      point={dayFromMeeting ? { ...point, forced: 0 } : point}
      name={skill.name}
      image={card === undefined ? skillIcon(skill.icon) : umaPortrait(card)}
      badge={card === undefined ? undefined : skillIcon(skill.icon)}
      description={skill.description}
      effects={skillEffectDetails(skillEffects.get(skillId), selectedCourse?.distance)}
      spCost={skillPurchaseCost(skill, skills, index?.evolvesFrom)}
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
      mode={yMode}
      {procScaled}
      nameSkills={(ids) => ids.map((id) => relatedSkill(id))}
      evolutions={evoIds.map((id) => relatedSkill(id))}
      evolutionsShown={areEvosShown(evoIds)}
      ontoggleevolutions={evoIds.length > 0 ? () => toggleDisplayEvos(evoIds) : undefined}
      evolvesFrom={baseId !== undefined && skills.has(baseId) ? relatedSkill(baseId) : undefined}
    />
  {/if}
{/snippet}

<style>
  @import './skill-explorer/skill-explorer-page.css';
</style>
