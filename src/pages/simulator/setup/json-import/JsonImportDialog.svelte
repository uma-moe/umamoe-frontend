<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import FileDrop from '@/components/controls/FileDrop.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Icon from '@/components/Icon.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import DialogStatus from '../../shell/DialogStatus.svelte';
  import type { SimulatorUma } from '../../simulator-uma';
  import { ownRunners } from '../../simulator-roster.svelte';
  import type { BuildCodeTab } from '../build/code/build-code';
  import { BuildCodeReview, type BuildCodeHandlers } from '../build/code/build-code-review.svelte';
  import BuildCodePreview from '../build/code/BuildCodePreview.svelte';
  import BuildCodeSummary from '../build/code/BuildCodeSummary.svelte';
  import SimulatorVeteranPicker from '../veterans/SimulatorVeteranPicker.svelte';
  import { veteranEntries } from '../veterans/veteran-entries';
  import { readRunnerJson, type RunnerJson } from './runner-json';

  /**
   * A runner from a JSON file, from umadump or the game API: a career's final turn, or Veterans (a list or one trained
   * Uma). A single build previews and loads like a build code; a list of several Veterans opens the Veterans picker on
   * that file.
   */
  let {
    open = $bindable(false),
    target,
    onimport
  }: {
    open?: boolean;
    /** What the page takes: the race field takes several runners, Build search also what she can buy. */
    target: BuildCodeTab;
  } & Pick<BuildCodeHandlers, 'onimport'> = $props();

  const UMADUMP_URL = 'https://werseter.github.io/umadump/';

  const KIND_LABELS: Record<Exclude<RunnerJson['kind'], 'veterans'>, string> = {
    'career-turn': 'A career’s final turn',
    veteran: 'A Veteran'
  };

  const uid = $props.id();
  // A JSON file holds runners, never a whole tab copied from the page.
  const review = new BuildCodeReview(() => ({ target, restorable: false }));

  let file = $state.raw<{ name: string; text: string }>(),
    result = $state.raw<RunnerJson>(),
    readError = $state(''),
    openError = $state(''),
    applyError = $state(''),
    pickerOpen = $state(false);

  let fileInput = $state<HTMLInputElement>();

  $effect(() => {
    if (!open) return;
    applyError = '';
    return review.loadGameData();
  });

  // A final turn is read again once the skills load, since its hints name skill groups; a later file wins over a slower
  // earlier read.
  let reading = 0;
  $effect(() => {
    const opened = file,
      skillLookup = review.skills,
      attempt = ++reading;

    result = undefined;
    review.code = undefined;
    readError = '';
    if (!opened) return;
    readRunnerJson(opened.text, skillLookup)
      .then((value) => {
        if (attempt !== reading) return;
        result = value;
        if (value.kind !== 'veterans') review.code = value.code;
      })
      .catch((reason: unknown) => {
        if (attempt === reading)
          readError = reason instanceof Error ? reason.message : 'Couldn’t read this file.';
      });
  });

  const error = $derived(openError || readError);

  const fileVeterans = $derived.by(() => {
    if (result?.kind !== 'veterans' || !file) return undefined;

    const { entries, missing } = veteranEntries(result.veterans, {
      characters: review.characters,
      skills: review.skills
    });
    return { name: file.name, entries, missing: missing + result.unraceable };
  });

  const kindLabel = $derived.by(() => {
    if (!result) return '';
    if (result.kind === 'veterans') return result.veterans.length + ' Veterans';
    return KIND_LABELS[result.kind];
  });

  async function openFile(files: FileList | null) {
    const chosen = files?.[0];
    if (!chosen) return;

    applyError = '';
    openError = '';
    try {
      file = { name: chosen.name, text: await chosen.text() };
    } catch {
      openError = 'This file can’t be read. Save it again or choose another.';
    }
  }

  function clear() {
    file = undefined;
    applyError = '';
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

  function chooseVeterans() {
    open = false;
    pickerOpen = true;
  }

  /** Veterans picked from the file join the page as runners alone: the course stays and nothing is on offer. */
  function addVeterans(umas: SimulatorUma[]) {
    const message = onimport({ umas, offers: [], goal: {} });
    if (message) {
      applyError = message;
      open = true;
      return;
    }

    clear();
  }
</script>

<Dialog
  bind:open
  title="JSON file"
  description="Load a career’s final turn or Veterans."
  icon="folder-open"
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
    {#if file}
      <div class="file-row">
        <Icon
          name="folder-open"
          size={16}
        />
        <span class="file">
          <strong title={file.name}>{file.name}</strong>
          {#if kindLabel}
            <span>{kindLabel}</span>
          {/if}
        </span>
        <Button
          variant="secondary"
          size="sm"
          icon="folder-open"
          onclick={() => fileInput?.click()}
        >
          Choose another
        </Button>
      </div>
    {:else}
      <FileDrop
        id="{uid}-file"
        label="Drop a JSON file here"
        description=".json from umadump or the game API"
        actionLabel="Choose JSON file"
        accept=".json,application/json"
        onfiles={openFile}
      />
    {/if}
    {#if error}
      <p
        class="file-error"
        role="alert"
      >
        {error}
      </p>
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
    {:else if !file || error}
      <div class="holds">
        <strong>A career’s final turn</strong>
        <ul>
          <li>
            The JSON umadump saves in career_data on the last turn of a career, or the game API’s
            response on that turn
          </li>
          <li>Her stats, style, mood, aptitudes, skills and fans</li>
          {#if target === 'build'}
            <li>Her skill points and every hinted skill at its hint level</li>
          {/if}
        </ul>
        <strong>Veterans</strong>
        <ul>
          <li>
            umadump’s trained_chara_data.json or veteran.json, or the game API’s list of trained Uma
          </li>
          <li>
            {target === 'race'
              ? 'Choose any of them for the field'
              : 'Choose one when the file holds several'}
          </li>
        </ul>
        <span class="tool">
          <Button
            href={UMADUMP_URL}
            target="_blank"
            rel="noreferrer"
            variant="secondary"
            size="sm"
            icon="download"
          >
            Get umadump
          </Button>
        </span>
      </div>
    {/if}
  </div>
  <input
    bind:this={fileInput}
    class="sr-only"
    type="file"
    accept=".json,application/json"
    tabindex="-1"
    aria-hidden="true"
    onchange={(event) => {
      void openFile(event.currentTarget.files);
      event.currentTarget.value = '';
    }}
  />
  {#snippet actions()}
    <DialogStatus>
      {#if applyError}
        <span class="bad">{applyError}</span>
      {:else if fileVeterans}
        <span>
          {target === 'race'
            ? 'Choose which of them join the field.'
            : 'Choose one to load her build.'}
        </span>
      {:else if review.ready}
        <BuildCodeSummary {review} />
      {:else if error}
        <span class="blocked">This file can’t be loaded.</span>
      {:else if file}
        <span>Reading the file…</span>
      {:else}
        <span>Open a JSON file to see what it loads.</span>
      {/if}
    </DialogStatus>
    <Button
      variant="secondary"
      onclick={() => (open = false)}
    >
      Cancel
    </Button>
    {#if fileVeterans}
      <Button
        icon="veterans"
        onclick={chooseVeterans}
      >
        {target === 'race' ? 'Choose Veterans' : 'Choose a Veteran'}
      </Button>
    {:else}
      <Button
        icon="download"
        disabled={!review.ready}
        onclick={apply}
      >
        Load
      </Button>
    {/if}
  {/snippet}
</Dialog>

<!-- The race field takes several at once; the other tabs take one runner. -->
<SimulatorVeteranPicker
  bind:open={pickerOpen}
  fromFile={fileVeterans}
  onselect={target === 'race' ? undefined : (uma) => addVeterans([uma])}
  onselectMany={target === 'race' ? addVeterans : undefined}
  room={18 - ownRunners().length}
  placed={target === 'race' ? ownRunners() : []}
/>

<style>
  @import '../build/code/build-import.css';
  @import '../import-file.css';

  .tool {
    display: flex;
    margin-top: 4px;
  }
</style>
