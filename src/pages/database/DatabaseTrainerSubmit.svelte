<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import type { Toast } from '@/components/feedback/ToastRegion.svelte';
  import { HttpError } from '@/services/http/http-client';
  import { inheritanceRepository } from './inheritance-repository';

  interface Props {
    open: boolean;
    notify: (title: string, tone?: Toast['tone']) => void;
  }

  let { open = $bindable(), notify }: Props = $props();

  let trainerSubmission = $state('');
  let submissionBusy = $state(false);
  let submissionTouched = $state(false);

  const trainerDigits = $derived(trainerSubmission.replace(/\D/g, '').slice(0, 12));

  async function submitTrainer(): Promise<void> {
    submissionTouched = true;
    if (trainerDigits.length !== 12 || submissionBusy) return;
    submissionBusy = true;
    try {
      await inheritanceRepository.submitTrainer(trainerDigits);
      notify('Trainer ID submitted successfully!', 'success');
      open = false;
      trainerSubmission = '';
      submissionTouched = false;
    } catch (reason) {
      const status = reason instanceof HttpError ? reason.status : 0;
      notify(
        status === 409
          ? 'This Trainer ID has already been submitted.'
          : status === 400
            ? 'Invalid Trainer ID format. Please check your input.'
            : 'Failed to submit Trainer ID. Please try again.',
        status === 409 ? 'warning' : 'danger'
      );
    } finally {
      submissionBusy = false;
    }
  }
</script>

<Dialog
  id="trainer-submit"
  bind:open
  title="Add Trainer ID"
  icon="id-card"
  maxWidth="440px"
  mobileInset="24px"
  onclose={() => {
    submissionTouched = false;
  }}
>
  <form
    class="trainer-submit"
    onsubmit={(event) => {
      event.preventDefault();
      void submitTrainer();
    }}
  >
    <p>Add your inheritance team to the database.</p>
    <div class="submission-field">
      <span
        class="submission-count"
        class:complete={trainerDigits.length === 12}
        aria-hidden="true"
      >
        {trainerDigits.length} / 12
      </span>
      <TextField
        id="trainer-submission"
        label="Trainer ID"
        placeholder="123 456 789 012"
        value={trainerSubmission}
        inputmode="numeric"
        autocomplete="off"
        maxlength={15}
        help="Find your 12-digit ID in your in-game profile."
        error={submissionTouched && trainerDigits.length !== 12
          ? 'Please enter a valid 12-digit trainer ID'
          : undefined}
        oninput={(event) => {
          const digits = (event.currentTarget as HTMLInputElement).value
            .replace(/\D/g, '')
            .slice(0, 12);
          trainerSubmission = digits.match(/.{1,3}/g)?.join(' ') ?? '';
        }}
      />
    </div>
  </form>
  {#snippet actions()}
    <Button
      variant="secondary"
      size="sm"
      disabled={submissionBusy}
      onclick={() => (open = false)}
    >
      Cancel
    </Button><Button
      variant="secondary"
      size="sm"
      icon="add"
      loading={submissionBusy}
      disabled={trainerDigits.length !== 12}
      onclick={() => void submitTrainer()}
    >
      Add trainer
    </Button>
  {/snippet}
</Dialog>

<style>
  .trainer-submit {
    display: grid;
    gap: 16px;
  }
  .trainer-submit p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.4;
  }
  .submission-field {
    position: relative;
  }
  .submission-count {
    position: absolute;
    top: 0;
    right: 0;
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
  }
  .submission-count.complete {
    color: var(--accent-success);
  }
  .trainer-submit :global(.field-label) {
    padding-right: 52px;
  }
  .trainer-submit :global(input) {
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.5px;
  }
  .trainer-submit :global(.field-message) {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .trainer-submit :global(.field-error) {
    color: var(--color-danger);
  }
</style>
