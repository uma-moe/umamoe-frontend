<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import { loadCharacters, type CharacterData } from '@/lib/game-data/characters';
  import { loadSkills, type SkillData } from '@/lib/game-data/skills/skills';
  import type { SimulatorUma } from '../../../simulator-uma';
  import {
    ensureSimulatorCourses,
    simulatorCourseData,
    simulatorSession
  } from '../../../simulator-session.svelte';
  import type { SkillOffer } from '../skill-offers';
  import {
    buildCodeConditions,
    buildCodeGoal,
    buildCodeOffers,
    buildCodeUma,
    decodeBuildCode,
    encodeBuildCode,
    looksLikeBuildCode,
    sameRunner,
    type BuildCode
  } from './build-code';
  import BuildCodePreview from './BuildCodePreview.svelte';

  /**
   * Build codes in and out. Pasting one loads the runner (stats, style, mood, aptitudes, skills, fans), the course and
   * its conditions, and for Build search her skill points, Fast Learner, the goal and the skills on offer with their
   * hints. Copying writes the page's setup as a code. A code pasted anywhere on the page opens this with it.
   */
  let {
    open = $bindable(false),
    target,
    current,
    onimport
  }: {
    open?: boolean;
    /** What the page takes: the race field takes both runners, Build search also what she can buy. */
    target: 'race' | 'stamina' | 'build';
    /** The page's setup as a code, for copying. */
    current?: () => BuildCode | undefined;
    /** Applies the runners and the rest; a returned message is shown instead of closing. */
    onimport: (value: {
      umas: SimulatorUma[];
      offers: SkillOffer[];
      goal: ReturnType<typeof buildCodeGoal>;
    }) => string | void;
  } = $props();

  const uid = $props.id();
  let text = $state(''),
    code = $state.raw<BuildCode>(),
    error = $state(''),
    applyError = $state(''),
    copied = $state('');

  let gameDataError = $state('');
  let skills = $state.raw(new Map<number, SkillData>()),
    characters = $state.raw(new Map<number, CharacterData>());

  $effect(() => {
    if (!open) return;
    applyError = '';
    copied = '';
    gameDataError = '';
    let active = true;
    void ensureSimulatorCourses();
    void loadSkills()
      .then((value) => {
        if (active) skills = value;
      })
      .catch((reason: unknown) => {
        if (active)
          gameDataError =
            reason instanceof Error ? reason.message : 'Skill names could not be loaded.';
      });

    void loadCharacters()
      .then((value) => {
        if (active) characters = value;
      })
      .catch((reason: unknown) => {
        if (active)
          gameDataError =
            reason instanceof Error ? reason.message : 'Character names could not be loaded.';
      });

    return () => {
      active = false;
    };
  });

  // Read the code as it is typed or pasted; a later edit wins over a slower earlier read.
  let reading = 0;
  $effect(() => {
    const value = text,
      attempt = ++reading;

    code = undefined;
    error = '';
    if (!value.trim()) return;
    decodeBuildCode(value)
      .then((result) => {
        if (attempt === reading) code = result;
      })
      .catch((reason: unknown) => {
        if (attempt === reading)
          error = reason instanceof Error ? reason.message : 'Couldn’t read this code.';
      });
  });

  const course = $derived(
    code?.courseId ? simulatorCourseData.courses.get(Number(code.courseId)) : undefined
  );

  const conditions = $derived(buildCodeConditions(code?.racedef));
  const goal = $derived(code ? buildCodeGoal(code) : {});
  const known = (id: number) => !skills.size || skills.has(id);
  const runners = $derived.by(() => {
    if (!code) return [];
    const list = [code.uma1, code.uma2].filter((runner) => runner != null);
    const wanted = target === 'race' && !sameRunner(code.uma1, code.uma2) ? list : list.slice(0, 1);
    return wanted.map((runner) => {
      const card = Number(runner.outfitId);
      return buildCodeUma(runner, {
        name: characters.get(card)?.name ?? (card ? 'Uma ' + card : 'Imported runner'),
        course,
        knownSkill: known
      });
    });
  });

  const offers = $derived(
    target === 'build' && code && runners[0]
      ? buildCodeOffers(
          code,
          runners[0].uma.skills.map((skill) => skill.skillId),
          known
        )
      : []
  );

  function apply() {
    if (!code || !runners.length) return;
    // The course first, so the page counts her skills for it; put back if the page can't take the runners.
    const before = {
      courseId: simulatorSession.courseId,
      ground: simulatorSession.ground,
      weather: simulatorSession.weather,
      season: simulatorSession.season,
      startTime: simulatorSession.startTime
    };

    if (course) {
      simulatorSession.courseId = String(course.course_id);
      if (conditions.ground) simulatorSession.ground = conditions.ground;
      if (conditions.weather) simulatorSession.weather = conditions.weather;
      if (conditions.season) simulatorSession.season = conditions.season;
      if (conditions.startTime) simulatorSession.startTime = conditions.startTime;
    }

    const message = onimport({ umas: runners.map((runner) => runner.uma), offers, goal });
    if (message) {
      Object.assign(simulatorSession, before);
      applyError = message;
      return;
    }

    text = '';
    open = false;
  }

  async function copy() {
    const setup = current?.();
    if (!setup) return;
    try {
      await navigator.clipboard.writeText(await encodeBuildCode(setup));
      copied = 'Copied';
    } catch {
      copied = 'Couldn’t copy';
    }
  }

  /** A code pasted outside a text field opens the import with it. */
  function paste(event: ClipboardEvent) {
    const value = event.clipboardData?.getData('text') ?? '';
    const element = event.target instanceof Element ? event.target : null;
    if (open || !looksLikeBuildCode(value)) return;
    if (
      element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
    )
      return;
    event.preventDefault();
    text = value.trim();
    open = true;
  }
</script>

<svelte:window onpaste={paste} />

<Dialog
  bind:open
  title="Build code"
  icon="clipboard"
  maxWidth="600px"
  maxHeight="88dvh"
>
  <div class="import">
    {#if gameDataError}
      <p
        class="apply-error"
        role="alert"
      >
        {gameDataError}
      </p>
    {/if}
    <TextField
      id="{uid}-code"
      label="Build code"
      placeholder="H4sI…"
      autocomplete="off"
      bind:value={text}
      {error}
      help={error
        ? undefined
        : 'Paste a code to load it. A code pasted anywhere on the page opens this too.'}
    />
    {#if code && runners.length}
      <BuildCodePreview
        {code}
        {target}
        {course}
        {conditions}
        {runners}
        {offers}
        {goal}
        {skills}
      />
      {#if applyError}<p
          class="apply-error"
          role="alert"
        >
          {applyError}
        </p>{/if}
    {/if}
  </div>
  {#snippet actions()}
    {#if current}<Button
        variant="ghost"
        icon={copied === 'Copied' ? 'check' : 'copy'}
        onclick={copy}
      >
        {copied || 'Copy this setup'}
      </Button>{/if}<Button
      variant="secondary"
      onclick={() => (open = false)}
    >
      Cancel
    </Button><Button
      icon="download"
      disabled={!code || !runners.length}
      onclick={apply}
    >
      Load
    </Button>
  {/snippet}
</Dialog>

<style>
  .import {
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .import :global(input) {
    font-size: 13px;
  }
  .apply-error {
    margin: 0;
    font-size: 12px;
    color: var(--accent-error);
  }
</style>
