<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import {
    loadCharacterCatalog,
    type CharacterCatalogEntry
  } from '@/lib/catalog/character-catalog';
  import { describeCourse, trackName } from '@/lib/catalog/course-catalog';
  import {
    loadSkillCatalog,
    skillImage,
    type SkillCatalogEntry
  } from '@/lib/catalog/skill-catalog';
  import { runningStyleName } from '@/lib/race/race-display';
  import SimulatorRunnerFace from '../../reports/SimulatorRunnerFace.svelte';
  import { simulatorRoster } from '../../simulator-roster.svelte';
  import type { SimulatorUma } from '../../simulator-uma';
  import {
    ensureSimulatorCatalog,
    GROUND_OPTIONS,
    SEASON_OPTIONS,
    simulatorCatalog,
    simulatorSession,
    TIME_OPTIONS,
    WEATHER_OPTIONS
  } from '../../simulator-session.svelte';
  import type { SkillOffer } from './skill-offers';
  import { RUNNING_STYLES } from '../trainee';
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
  let skills = $state.raw(new Map<number, SkillCatalogEntry>()),
    characters = $state.raw(new Map<number, CharacterCatalogEntry>());

  $effect(() => {
    if (!open) return;
    applyError = '';
    copied = '';
    void ensureSimulatorCatalog();
    void loadSkillCatalog()
      .then((value) => (skills = value))
      .catch(() => {});
    void loadCharacterCatalog()
      .then((value) => (characters = value))
      .catch(() => {});
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
    code?.courseId ? simulatorCatalog.courses.get(Number(code.courseId)) : undefined
  );
  const conditions = $derived(buildCodeConditions(code?.racedef));
  const goal = $derived(code ? buildCodeGoal(code) : {});
  const known = (id: number) => !skills.size || skills.has(id);
  const runners = $derived.by(() => {
    if (!code) return [];
    const list = [code.uma1, code.uma2].filter((runner) => !!runner);
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
  const dropped = $derived(runners.reduce((sum, runner) => sum + runner.dropped, 0));

  const label = (options: Array<{ value: string; label: string }>, value?: string) =>
    options.find((option) => option.value === value)?.label;
  const conditionText = $derived(
    [
      label(GROUND_OPTIONS, conditions.ground),
      label(WEATHER_OPTIONS, conditions.weather),
      label(SEASON_OPTIONS, conditions.season),
      label(TIME_OPTIONS, conditions.startTime)
    ]
      .filter(Boolean)
      .join(' · ')
  );
  const MOODS = ['Awful', 'Bad', 'Normal', 'Good', 'Great'];
  const MODES: Record<string, string> = {
    cm: 'Champions Meeting',
    tt_sprint: 'Team Trials · Sprint',
    tt_mile: 'Team Trials · Mile',
    tt_medium: 'Team Trials · Medium',
    tt_long: 'Team Trials · Long',
    tt_dirt: 'Team Trials · Dirt'
  };
  const STATS = [
    ['speed', 'speed'],
    ['stamina', 'stamina'],
    ['power', 'power'],
    ['guts', 'guts'],
    ['wisdom', 'wit']
  ] as const;
  const changes = $derived(
    target === 'race'
      ? (simulatorRoster.configured ? 'Adds ' : 'Replaces the example field with ') +
          (runners.length === 1 ? 'her' : 'both runners') +
          (simulatorRoster.configured ? ' to the race field' : '') +
          ' and sets the course.'
      : target === 'build'
        ? 'Replaces her build, the course, the goal and what she can buy.'
        : 'Replaces her build and the course.'
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
      <dl class="preview">
        <div>
          <dt>Course</dt>
          <dd>
            {#if course}
              <strong>{trackName(course.race_track_id)} · {describeCourse(course)}</strong>
              {#if conditionText}<span>{conditionText}</span>{/if}
            {:else if code.courseId}
              <span class="warn">
                Course {code.courseId} isn’t in the race data, so the course stays as it is.
              </span>
            {:else}
              <span>Not in the code; the course stays as it is.</span>
            {/if}
          </dd>
        </div>
        <div>
          <dt>{runners.length > 1 ? 'Runners' : 'Runner'}</dt>
          <dd class="runners">
            {#each runners as { uma } (uma.id)}
              {@const style = RUNNING_STYLES.indexOf(
                uma.trainee.runningStyle as (typeof RUNNING_STYLES)[number]
              )}
              <div class="runner">
                <SimulatorRunnerFace
                  cardId={uma.cardId}
                  size={36}
                />
                <div class="who">
                  <strong>{uma.name}</strong>
                  <span>
                    {[
                      runningStyleName(style + 1),
                      (MOODS[Number(uma.trainee.motivation) - 1] ?? 'Normal') + ' mood',
                      uma.fanCount !== undefined ? uma.fanCount.toLocaleString() + ' fans' : ''
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <ul
                  class="stats"
                  aria-label="Stats"
                >
                  {#each STATS as [key, icon]}
                    <li>
                      <img
                        src="/assets/images/icon/stats/{icon}.webp"
                        alt={key}
                        width="14"
                        height="14"
                      />
                      {uma.trainee[key]}
                    </li>
                  {/each}
                </ul>
                <ul
                  class="skills"
                  aria-label="{uma.skills.length} skills"
                >
                  {#each uma.skills as skill (skill.skillId)}
                    {@const entry = skills.get(skill.skillId)}
                    <li title={entry?.name ?? 'Skill ' + skill.skillId}>
                      {#if entry?.icon}<img
                          src={skillImage(entry.icon)}
                          alt={entry.name}
                          width="20"
                          height="20"
                        />{:else}<span>{skill.skillId}</span>{/if}
                    </li>
                  {:else}
                    <li class="none">No skills</li>
                  {/each}
                </ul>
              </div>
            {/each}
          </dd>
        </div>
        {#if target === 'build'}
          <div>
            <dt>To buy</dt>
            <dd>
              <strong>{offers.length} {offers.length === 1 ? 'skill' : 'skills'}</strong>
              <span>
                {[
                  offers.filter((offer) => offer.hint > 0).length + ' with a hint',
                  goal.sp !== undefined ? goal.sp.toLocaleString() + ' SP' : '',
                  goal.fastLearner ? 'Fast Learner' : ''
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </dd>
          </div>
          {#if goal.mode}
            <div>
              <dt>Goal</dt>
              <dd>
                <strong>{MODES[goal.mode]}</strong>
                {#if goal.mode !== 'cm' && goal.tracks}<span>
                    on {goal.tracks.length}
                    {goal.tracks.length === 1 ? 'track' : 'tracks'}
                  </span>{/if}
              </dd>
            </div>
          {/if}
        {/if}
      </dl>
      <p class="changes">
        {changes}
        {#if dropped}{dropped}
          {dropped === 1 ? 'skill isn’t' : 'skills aren’t'} in the skill data and
          {dropped === 1 ? 'is' : 'are'} left out.{/if}
      </p>
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
  .preview {
    display: grid;
    margin: 0;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md, 8px);
  }
  .preview > div {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 10px;
    align-items: baseline;
    padding: 8px 10px;
  }
  .preview > div + div {
    border-top: 1px solid var(--border-subtle);
  }
  dt {
    font-size: 12px;
    color: var(--text-secondary);
  }
  dd {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
    min-width: 0;
    margin: 0;
    font-size: 13px;
  }
  dd > span {
    font-size: 12px;
    color: var(--text-secondary);
  }
  dd .warn {
    color: var(--accent-warning);
  }
  .runners {
    display: grid;
    gap: 8px;
  }
  .runner {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    grid-template-areas:
      'face who'
      'face stats'
      'face skills';
    gap: 4px 10px;
    align-items: center;
  }
  .runner > :first-child {
    grid-area: face;
    align-self: start;
  }
  .who {
    grid-area: who;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 8px;
    min-width: 0;
    line-height: 1.3;
  }
  .who strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .who span {
    font-size: 12px;
    color: var(--text-secondary);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .stats {
    grid-area: stats;
    display: flex;
    gap: 8px;
    font-size: 12px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .stats li {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .stats img {
    width: 14px;
    height: 14px;
    object-fit: contain;
  }
  .skills {
    grid-area: skills;
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .skills img {
    display: block;
    width: 20px;
    height: 20px;
    object-fit: contain;
  }
  .skills span,
  .skills .none {
    font-size: 11px;
    color: var(--text-secondary);
  }
  .changes,
  .apply-error {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .apply-error {
    color: var(--accent-error);
  }
  @media (max-width: 560px) {
    .preview > div {
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
    }
  }
</style>
