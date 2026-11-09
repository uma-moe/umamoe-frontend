<script lang="ts">
  import { onDestroy } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import FileDrop from '@/components/controls/FileDrop.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Icon from '@/components/Icon.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import { loadReleasedSkillIds, skillImage } from '@/lib/game-data/skills/skills';
  import DialogStatus from '../../shell/DialogStatus.svelte';
  import type { BuildCodeTab } from '../build/code/build-code';
  import { BuildCodeReview, type BuildCodeHandlers } from '../build/code/build-code-review.svelte';
  import BuildCodePreview from '../build/code/BuildCodePreview.svelte';
  import BuildCodeSummary from '../build/code/BuildCodeSummary.svelte';
  import { veteranCode } from '../json-import/runner-json';
  import { STAT_KEYS, type StatKey } from './screenshot-layout';
  import type { ScreenshotReader } from './screenshot-reader';
  import {
    mergeReadings,
    screenshotVeteran,
    STAT_NAMES,
    unreadFields,
    type ScreenshotReading
  } from './screenshot-veteran';
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

  const IMAGE_TYPES = 'image/png,image/jpeg,image/webp';
  const LEAVE_OUT = '';

  const uid = $props.id();
  const review = new BuildCodeReview(() => ({ target, restorable: false }));

  let released = $state.raw<ReadonlySet<number>>(new Set()),
    reading = $state.raw<ScreenshotReading>(),
    screenshotCount = $state(0),
    progress = $state(''),
    readError = $state(''),
    skippedNotice = $state(''),
    applyError = $state(''),
    picks = $state<string[]>([]),
    statInputs = $state<Record<StatKey, string>>(emptyStats());

  let fileInput = $state<HTMLInputElement>();
  let reader: ScreenshotReader | undefined;
  let scan = 0;

  const skillNames = $derived(
    review.skills.size ? buildSkillNameIndex(review.skills, released) : undefined
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
    (reading?.choices ?? []).flatMap((choice, index) => {
      const skillId = picks[index];
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
  const statsUnread = $derived(
    reading ? STAT_KEYS.some((key) => reading?.stats[key] === undefined) : false
  );

  $effect(() => {
    review.code = veteran ? veteranCode(veteran) : undefined;
  });

  $effect(() => {
    if (!open) {
      void stopReader();
      return;
    }

    applyError = '';
    return review.loadGameData();
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

  onDestroy(() => void stopReader());

  function emptyStats(): Record<StatKey, string> {
    return { speed: '', stamina: '', power: '', guts: '', wiz: '' };
  }

  function errorText(reason: unknown): string {
    return reason instanceof Error ? reason.message : 'This screenshot couldn’t be read.';
  }

  async function stopReader() {
    const running = reader;
    reader = undefined;
    scan++;
    progress = '';
    await running?.stop();
  }

  async function openFiles(list: FileList | null) {
    const files = [...(list ?? [])];
    if (!files.length || !skillNames) return;

    const attempt = ++scan;
    const names = skillNames;
    reading = undefined;
    readError = '';
    skippedNotice = '';
    applyError = '';
    screenshotCount = files.length;
    progress = 'Loading the text reader…';

    const readings: ScreenshotReading[] = [];
    const failures: string[] = [];
    try {
      reader ??= new (await import('./screenshot-reader')).ScreenshotReader();
      for (const [index, file] of files.entries()) {
        progress = `Reading screenshot ${index + 1} of ${files.length}…`;
        try {
          readings.push(await reader.read(file, names));
        } catch (reason) {
          failures.push(errorText(reason));
        }
        if (attempt !== scan) return;
      }
    } catch (reason) {
      failures.push(errorText(reason));
    }

    if (attempt !== scan) return;

    progress = '';
    if (!readings.length) {
      readError = failures[0] ?? 'These screenshots couldn’t be read.';
      return;
    }

    if (failures.length)
      skippedNotice = `${failures.length} of ${files.length} screenshots couldn’t be read and were left out.`;

    const merged = mergeReadings(readings);
    picks = merged.choices.map((choice) => String(choice.candidates[0] ?? LEAVE_OUT));
    statInputs = Object.fromEntries(
      STAT_KEYS.map((key) => [
        key,
        merged.stats[key] === undefined ? '' : String(merged.stats[key])
      ])
    ) as Record<StatKey, string>;
    reading = merged;
  }

  function clear() {
    scan++;
    reading = undefined;
    screenshotCount = 0;
    progress = '';
    readError = '';
    skippedNotice = '';
    picks = [];
    statInputs = emptyStats();
  }

  function apply() {
    const message = review.apply({ onimport });
    if (message) {
      applyError = message;
      return;
    }

    clear();
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
    {#if screenshotCount}
      <div class="file-row">
        <Icon
          name="image"
          size={16}
        />
        <span class="file">
          <strong>
            {screenshotCount === 1 ? 'One screenshot' : screenshotCount + ' screenshots'}
          </strong>
          {#if progress}
            <span>{progress}</span>
          {/if}
        </span>
        <Button
          variant="secondary"
          size="sm"
          icon="image"
          disabled={Boolean(progress)}
          onclick={() => fileInput?.click()}
        >
          Choose others
        </Button>
      </div>
    {:else}
      <FileDrop
        id="{uid}-file"
        label="Drop screenshots here"
        description="PNG or JPEG of her details screen; add more to cover a long skill list"
        actionLabel="Choose screenshots"
        accept={IMAGE_TYPES}
        multiple
        disabled={!skillNames}
        onfiles={openFiles}
      />
    {/if}
    {#if readError}
      <p
        class="file-error"
        role="alert"
      >
        {readError}
      </p>
    {/if}
    {#if reading}
      {#if skippedNotice || unread.length || (veteran && veteran.card_id === null)}
        <Banner
          title="Check after loading"
          tone="warning"
        >
          {#if skippedNotice}
            <p>{skippedNotice}</p>
          {/if}
          {#if veteran && veteran.card_id === null}
            <p>Her character wasn’t recognised. Pick her in the runner editor.</p>
          {/if}
          {#if unread.length}
            <p>Not read: {unread.join(', ')}.</p>
          {/if}
        </Banner>
      {/if}
      {#if statsUnread}
        <fieldset class="stats">
          <legend>Stats</legend>
          {#each STAT_KEYS as key (key)}
            <TextField
              id="{uid}-{key}"
              label={STAT_NAMES[key]}
              inputmode="numeric"
              placeholder="–"
              maxlength={4}
              bind:value={statInputs[key]}
            />
          {/each}
        </fieldset>
      {/if}
      {#if reading.choices.length}
        <section
          class="choices"
          aria-labelledby="{uid}-choices"
        >
          <strong id="{uid}-choices">Which skill is this?</strong>
          {#each reading.choices as choice, index (index)}
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
                value={picks[index]}
                onchange={(value) => (picks[index] = value)}
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
    {:else if !screenshotCount || readError}
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
  <input
    bind:this={fileInput}
    class="sr-only"
    type="file"
    accept={IMAGE_TYPES}
    multiple
    tabindex="-1"
    aria-hidden="true"
    onchange={(event) => {
      void openFiles(event.currentTarget.files);
      event.currentTarget.value = '';
    }}
  />
  {#snippet actions()}
    <DialogStatus>
      {#if applyError}
        <span class="bad">{applyError}</span>
      {:else if progress}
        <span>{progress}</span>
      {:else if review.ready}
        <BuildCodeSummary {review} />
      {:else if reading && !stats}
        <span class="blocked">Fill in her stats to load her.</span>
      {:else if readError}
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
      disabled={!review.ready || Boolean(progress)}
      onclick={apply}
    >
      Load
    </Button>
  {/snippet}
</Dialog>

<style>
  @import '../build/code/build-import.css';
  @import '../import-file.css';
  @import './screenshot-import.css';
</style>
