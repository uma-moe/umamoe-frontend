<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import { describeCourse, trackName } from '@/lib/game-data/racing/courses';
  import DialogStatus from '../../../shell/DialogStatus.svelte';
  import { loadCharacters, type CharacterData } from '@/lib/game-data/characters';
  import { loadSkills, type SkillData } from '@/lib/game-data/skills/skills';
  import type { SimulatorUma } from '../../../simulator-uma';
  import { restoreSimulatorField } from '../../../simulator-roster.svelte';
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
    codePage,
    decodeBuildCode,
    encodeBuildCode,
    looksLikeBuildCode,
    sameRunner,
    type BuildCode,
    type BuildCodePage
  } from './build-code';
  import BuildCodePreview from './BuildCodePreview.svelte';

  /**
   * Build codes in and out. Pasting one loads the runner (stats, style, mood, aptitudes, skills, fans), the course and
   * its conditions, and for Build search her skill points, Fast Learner, the goal and the skills on offer with their
   * hints. Copying writes the whole tab as a code; a code copied from this tab restores all of it here. A code pasted
   * anywhere on the page opens this with it.
   */
  let {
    open = $bindable(false),
    target,
    current,
    onimport,
    onrestore
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
    /** Restores the whole tab from a code copied from it; a returned message is shown instead of closing. */
    onrestore?: (page: BuildCodePage) => string | void;
  } = $props();

  const uid = $props.id();
  let text = $state(''),
    code = $state.raw<BuildCode>(),
    error = $state(''),
    applyError = $state(''),
    pasteError = $state(''),
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
    pasteError = '';
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
  /** The whole tab, when the code was copied from this one and the tab can take it back. */
  const page = $derived(code && onrestore ? codePage(code, target) : undefined);
  /** The race field a whole race tab holds, or why it can't be read. */
  const field = $derived.by(() => {
    if (page?.tab !== 'race') return undefined;

    try {
      return { umas: restoreSimulatorField(page).umas, error: '' };
    } catch (reason) {
      return {
        umas: [],
        error: reason instanceof Error ? reason.message : 'The race field can’t be read.'
      };
    }
  });
  const goal = $derived(code ? buildCodeGoal(code) : {});
  const known = (id: number) => !skills.size || skills.has(id);
  const runners = $derived.by(() => {
    if (!code) return [];
    if (field) return field.umas.map((uma) => ({ uma, dropped: 0 }));

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

    const message =
      page && onrestore
        ? onrestore(page)
        : onimport({ umas: runners.map((runner) => runner.uma), offers, goal });
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

  async function pasteFromClipboard() {
    pasteError = '';
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch {
      pasteError = 'The clipboard can’t be read here. Paste into the field instead.';
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
  description="Load a runner, her course and its conditions from a code{current
    ? ', or copy this setup as one'
    : ''}."
  icon="clipboard"
  maxWidth="640px"
  maxHeight="88dvh"
  mobileMaxHeight="96dvh"
  compact
>
  {#snippet headerActions()}
    {#if current}
      <span class="copy-action">
        <Button
          variant="secondary"
          size="sm"
          icon={copied === 'Copied' ? 'check' : 'copy'}
          onclick={copy}
        >
          {copied || 'Copy this setup'}
        </Button>
      </span>
    {/if}
  {/snippet}
  <div class="import">
    {#if gameDataError}
      <div role="alert">
        <Banner
          title="Game data unavailable"
          tone="warning"
        >
          <p>{gameDataError}</p>
        </Banner>
      </div>
    {/if}
    <div class="code-row">
      <div class="code-field">
        <TextField
          id="{uid}-code"
          label="Build code"
          placeholder="H4sI…"
          autocomplete="off"
          bind:value={text}
          error={error || field?.error || pasteError || ''}
          help={error ? undefined : 'A code pasted anywhere on the page opens this with it.'}
        />
      </div>
      <Button
        variant="secondary"
        icon="clipboard"
        onclick={pasteFromClipboard}
      >
        Paste
      </Button>
    </div>
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
        whole={page !== undefined}
      />
    {:else if !text.trim()}
      <div class="holds">
        <strong>A code holds</strong>
        <ul>
          <li>Her stats, style, mood, aptitudes, skills and fans</li>
          <li>The course with its ground, weather, season and time of day</li>
          {#if target === 'build'}
            <li>Her skill points, the goal and the skills on offer with their hints</li>
          {/if}
        </ul>
      </div>
    {/if}
  </div>
  {#snippet actions()}
    <DialogStatus>
      {#if applyError}
        <span class="bad">{applyError}</span>
      {:else if code && runners.length}
        <strong>
          {page
            ? 'This whole tab'
            : runners.length === 1
              ? '1 runner'
              : runners.length + ' runners'}
        </strong>
        <span>
          {course
            ? trackName(course.race_track_id) + ' · ' + describeCourse(course)
            : 'Course unchanged'}
        </span>
      {:else if error || field?.error}
        <span class="blocked">This code can’t be loaded.</span>
      {:else if text.trim()}
        <span>Reading the code…</span>
      {:else}
        <span>Paste a code to see what it loads.</span>
      {/if}
    </DialogStatus>
    <Button
      variant="secondary"
      onclick={() => (open = false)}
    >
      Cancel
    </Button>
    <Button
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
  /* The code is data: set it in the monospace face, so a pasted code reads as one. */
  .code-row {
    --control-height: 36px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 8px;
  }
  .code-field :global(input) {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
  }
  .code-field :global(label) {
    font-size: 12px;
  }
  .code-row > :global(.ui-button) {
    height: 36px;
    min-height: 36px;
    margin-top: 21px;
    border-radius: var(--radius-sm);
    font-size: 12px;
  }
  .copy-action {
    display: flex;
    flex: none;
    white-space: nowrap;
  }
  .holds {
    display: grid;
    gap: 6px;
    padding: 12px 14px;
    border: 1px dashed var(--border-subtle);
    border-radius: var(--radius-md);
    font-size: 12px;
    color: var(--text-secondary);
  }
  .holds strong {
    font-weight: 650;
    color: var(--text-primary);
  }
  .holds ul {
    display: grid;
    gap: 3px;
    margin: 0;
    padding-left: 18px;
    line-height: 1.5;
  }
  @media (max-width: 767px) {
    .import {
      gap: 8px;
    }
    .code-row {
      --control-height: 32px;
      gap: 6px;
    }
    .code-field :global(label) {
      font-size: 11px;
    }
    .code-row > :global(.ui-button) {
      height: 32px;
      min-height: 32px;
      margin-top: 19px;
      font-size: 11px;
    }
    .holds {
      gap: 4px;
      padding: 8px 10px;
      font-size: 11px;
    }
  }
</style>
