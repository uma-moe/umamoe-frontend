<script lang="ts">
  import { untrack } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import FileDrop from '@/components/controls/FileDrop.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import { loadReleasedSkillIds, skillImage } from '@/lib/game-data/skills/skills';
  import DialogStatus from '../../shell/DialogStatus.svelte';
  import type { BuildCodeTab } from '../build/code/build-code';
  import { BuildCodeReview, type BuildCodeHandlers } from '../build/code/build-code-review.svelte';
  import BuildCodePreview from '../build/code/BuildCodePreview.svelte';
  import BuildCodeSummary from '../build/code/BuildCodeSummary.svelte';
  import { veteranCode } from '../json-import/runner-json';
  import { STAT_KEYS, type StatKey } from './screenshot-layout';
  import { ScreenshotQueue } from './screenshot-queue.svelte';
  import type { SkillChoice } from './screenshot-skills';
  import { screenshotVeteran, STAT_NAMES, unreadFields } from './screenshot-veteran';
  import ScreenshotStrip from './ScreenshotStrip.svelte';
  import { buildSkillNameIndex } from './skill-names';

  /** A runner read from screenshots of her details screen, previewed and loaded like a build code. */
  let {
    open = $bindable(false),
    target,
    onimport
  }: {
    open?: boolean;
    target: BuildCodeTab;
  } & Pick<BuildCodeHandlers, 'onimport'> = $props();

  const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const ACCEPT = IMAGE_TYPES.join(',');
  const LEAVE_OUT = '';

  const uid = $props.id();
  const review = new BuildCodeReview(() => ({ target, restorable: false }));
  const queue = new ScreenshotQueue();

  let released = $state.raw<ReadonlySet<number>>(new Set()),
    applyError = $state(''),
    /** The player's picks for lines the reader couldn't settle, by the line's candidates. */
    picks = $state<Record<string, string>>({}),
    /** Stats the player typed over what the screenshots read. */
    statEdits = $state<Partial<Record<StatKey, string>>>({});

  const skillNames = $derived(
    review.skills.size ? buildSkillNameIndex(review.skills, released) : undefined
  );
  const reading = $derived(queue.reading);

  const statInputs = $derived(
    Object.fromEntries(
      STAT_KEYS.map((key) => {
        const read = reading?.stats[key];
        return [key, statEdits[key] ?? (read === undefined ? '' : String(read))];
      })
    ) as Record<StatKey, string>
  );

  const stats = $derived.by(() => {
    const values = STAT_KEYS.map((key) => Number(statInputs[key]));
    if (!values.every((value) => Number.isInteger(value) && value > 0)) return undefined;

    return Object.fromEntries(STAT_KEYS.map((key, index) => [key, values[index]!])) as Record<
      StatKey,
      number
    >;
  });

  const pickedSkills = $derived(
    (reading?.choices ?? []).flatMap((choice) => {
      const skillId = pickFor(choice);
      return skillId ? [{ skillId: Number(skillId), level: choice.level }] : [];
    })
  );

  const veteran = $derived.by(() => {
    if (!reading || !stats) return undefined;

    return screenshotVeteran(
      { ...reading, stats, skills: [...reading.skills, ...pickedSkills] },
      review.characters
    );
  });

  const unread = $derived(reading ? unreadFields(reading) : []);
  const failures = $derived(
    queue.screenshots.flatMap((screenshot, index) =>
      screenshot.state.status === 'failed'
        ? [{ id: screenshot.id, text: `Screenshot ${index + 1}: ${screenshot.state.error}` }]
        : []
    )
  );
  const progressText = $derived.by(() => {
    if (!queue.progress) return '';
    if (!skillNames) return 'Loading skill data…';

    const { current, total } = queue.progress;
    return total === 1 ? 'Reading the screenshot…' : `Reading screenshot ${current} of ${total}…`;
  });

  $effect(() => {
    review.code = veteran ? veteranCode(veteran) : undefined;
  });

  $effect(() => {
    if (!open) {
      // Stopping touches the queue, which this effect must not come to depend on.
      untrack(() => void queue.stop());
      return;
    }

    applyError = '';
    return review.loadGameData();
  });

  $effect(() => {
    if (open && skillNames && queue.waiting) void queue.read(skillNames);
  });

  $effect(() => {
    if (!open) return;

    let active = true;
    loadReleasedSkillIds()
      .then((value) => {
        if (active) released = value;
      })
      .catch(() => {
        // Without the release list every named skill is a candidate, which only widens the choices.
      });
    return () => {
      active = false;
    };
  });

  $effect(
    () => () =>
      untrack(() => {
        queue.clear();
        void queue.stop();
      })
  );

  function choiceKey(choice: SkillChoice): string {
    return choice.candidates.join();
  }

  function pickFor(choice: SkillChoice): string {
    return picks[choiceKey(choice)] ?? String(choice.candidates[0] ?? LEAVE_OUT);
  }

  function addScreenshots(files: File[]) {
    applyError = '';
    queue.add(files);
  }

  /** An image pasted anywhere while the dialog is open, such as a snip from the clipboard, is added like a chosen one. */
  function paste(event: ClipboardEvent) {
    if (!open) return;

    const images = [...(event.clipboardData?.files ?? [])].filter((file) =>
      IMAGE_TYPES.includes(file.type)
    );
    if (!images.length) return;

    event.preventDefault();
    addScreenshots(images);
  }

  function apply() {
    const message = review.apply({ onimport });
    if (message) {
      applyError = message;
      return;
    }

    queue.clear();
    picks = {};
    statEdits = {};
    open = false;
  }

  function choiceOptions(candidates: number[]) {
    return [
      ...candidates.map((skillId) => {
        const skill = review.skills.get(skillId);
        return {
          value: String(skillId),
          label: skill?.name ?? 'Skill ' + skillId,
          image: skillImage(skill?.icon)
        };
      }),
      { value: LEAVE_OUT, label: 'Leave out' }
    ];
  }
</script>

<svelte:window onpaste={paste} />

<Dialog
  bind:open
  title="Screenshot"
  description="Read a runner from her details screen."
  icon="image"
  maxWidth="640px"
  maxHeight="88dvh"
  mobileMaxHeight="96dvh"
  compact
>
  <div class="import">
    {#if review.gameDataError}
      <div role="alert">
        <Banner
          title="Game data unavailable"
          tone="warning"
        >
          <p>{review.gameDataError}</p>
        </Banner>
      </div>
    {/if}
    {#if queue.screenshots.length}
      <ScreenshotStrip
        screenshots={queue.screenshots}
        accept={ACCEPT}
        onadd={addScreenshots}
        onremove={(id) => queue.remove(id)}
      />
    {:else}
      <FileDrop
        id="{uid}-file"
        label="Drop or paste screenshots here"
        description="PNG or JPEG of her details screen; add more to cover a long skill list"
        actionLabel="Choose screenshots"
        accept={ACCEPT}
        multiple
        onfiles={(list) => addScreenshots([...list])}
      />
    {/if}
    {#each failures as failure (failure.id)}
      <p
        class="file-error"
        role="alert"
      >
        {failure.text}
      </p>
    {/each}
    {#if reading}
      {#if unread.length || (veteran && veteran.card_id === null)}
        <Banner
          title="Check after loading"
          tone="warning"
        >
          {#if veteran && veteran.card_id === null}
            <p>Her character wasn’t recognised. Pick her in the runner editor.</p>
          {/if}
          {#if unread.length}
            <p>Not read: {unread.join(', ')}.</p>
          {/if}
        </Banner>
      {/if}
      <fieldset class="stats">
        <legend>Stats</legend>
        {#each STAT_KEYS as key (key)}
          <TextField
            id="{uid}-{key}"
            label={STAT_NAMES[key]}
            inputmode="numeric"
            placeholder="–"
            maxlength={4}
            bind:value={() => statInputs[key], (value) => (statEdits[key] = value)}
          />
        {/each}
      </fieldset>
      {#if reading.choices.length}
        <section
          class="choices"
          aria-labelledby="{uid}-choices"
        >
          <strong id="{uid}-choices">Which skill is this?</strong>
          {#each reading.choices as choice, index (choiceKey(choice))}
            <div class="choice">
              {#if choice.image}
                <img
                  src={choice.image}
                  alt={choice.text}
                />
              {:else}
                <span class="choice-text">{choice.text}</span>
              {/if}
              <SelectField
                id="{uid}-choice-{index}"
                label="Skill read as “{choice.text}”"
                hideLabel
                options={choiceOptions(choice.candidates)}
                value={pickFor(choice)}
                onchange={(value) => (picks[choiceKey(choice)] = value)}
              />
            </div>
          {/each}
        </section>
      {/if}
    {/if}
    {#if review.code && review.ready}
      <BuildCodePreview
        code={review.code}
        {target}
        course={review.course}
        conditions={review.conditions}
        runners={review.runners}
        offers={review.offers}
        goal={review.goal}
        skills={review.skills}
      />
    {:else if !reading && !queue.progress}
      <div class="holds">
        <strong>Her details screen</strong>
        <ul>
          <li>Open a Veteran’s details in the game and take a screenshot</li>
          <li>Her stats, aptitudes and skills are read on this device; nothing is uploaded</li>
          <li>Add a second screenshot when her skill list scrolls</li>
        </ul>
      </div>
    {/if}
  </div>
  {#snippet actions()}
    <DialogStatus>
      {#if applyError}
        <span class="bad">{applyError}</span>
      {:else if progressText}
        <span>{progressText}</span>
      {:else if review.ready}
        <BuildCodeSummary {review} />
      {:else if reading && !stats}
        <span class="blocked">Fill in her stats to load her.</span>
      {:else if failures.length && !reading}
        <span class="blocked">These screenshots can’t be loaded.</span>
      {:else if !skillNames && !review.gameDataError}
        <span>Loading skill data…</span>
      {:else}
        <span>Open screenshots to see what they load.</span>
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
      disabled={!review.ready || Boolean(queue.progress)}
      onclick={apply}
    >
      Load
    </Button>
  {/snippet}
</Dialog>

<style>
  @import '../build/code/build-import.css';
  @import './screenshot-import.css';
</style>
