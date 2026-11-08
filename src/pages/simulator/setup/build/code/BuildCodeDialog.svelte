<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import DialogStatus from '../../../shell/DialogStatus.svelte';
  import {
    decodeBuildCode,
    encodeBuildCode,
    looksLikeBuildCode,
    type BuildCode,
    type BuildCodeTab
  } from './build-code';
  import { BuildCodeReview, type BuildCodeHandlers } from './build-code-review.svelte';
  import BuildCodePreview from './BuildCodePreview.svelte';
  import BuildCodeSummary from './BuildCodeSummary.svelte';

  /**
   * Build codes in and out. Pasting one loads the runner (stats, style, mood, aptitudes, skills, fans), the course and
   * its conditions, and for Build search her skill points, Fast Learner, the goal and the skills on offer with their
   * hints. Copying writes the whole tab as a code; a code copied from this tab restores all of it here. A code pasted
   * anywhere on the page opens this with it.
   */
  let {
    open = $bindable(false),
    text = $bindable(''),
    target,
    current,
    onimport,
    onrestore
  }: {
    open?: boolean;
    /** The code in the field; a page can hand one in, such as a code from its link. */
    text?: string;
    /** What the page takes: the race field takes both runners, Build search also what she can buy. */
    target: BuildCodeTab;
    /** The page's setup as a code, for copying. */
    current?: () => BuildCode | undefined;
  } & BuildCodeHandlers = $props();

  const uid = $props.id();
  const review = new BuildCodeReview(() => ({ target, restorable: onrestore !== undefined }));

  let error = $state(''),
    applyError = $state(''),
    pasteError = $state(''),
    copied = $state('');

  $effect(() => {
    if (!open) return;
    applyError = '';
    copied = '';
    return review.loadGameData();
  });

  // Read the code as it is typed or pasted; a later edit wins over a slower earlier read.
  let reading = 0;
  $effect(() => {
    const value = text,
      attempt = ++reading;

    review.code = undefined;
    error = '';
    pasteError = '';
    if (!value.trim()) return;
    decodeBuildCode(value)
      .then((result) => {
        if (attempt === reading) review.code = result;
      })
      .catch((reason: unknown) => {
        if (attempt === reading)
          error = reason instanceof Error ? reason.message : 'Couldn’t read this code.';
      });
  });

  function apply() {
    const message = review.apply({ onimport, onrestore });
    if (message) {
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
  description="Load a code, or copy this setup as one."
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
    <div class="code-row">
      <div class="code-field">
        <TextField
          id="{uid}-code"
          label="Build code"
          placeholder="H4sI…"
          autocomplete="off"
          bind:value={text}
          error={error || review.field?.error || pasteError || ''}
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
        whole={review.page !== undefined}
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
      {:else if review.ready}
        <BuildCodeSummary {review} />
      {:else if error || review.field?.error}
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
      disabled={!review.ready}
      onclick={apply}
    >
      Load
    </Button>
  {/snippet}
</Dialog>

<style>
  @import './build-import.css';

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
  @media (max-width: 767px) {
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
  }
</style>
