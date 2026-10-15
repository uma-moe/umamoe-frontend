<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';

  interface Props {
    open?: boolean;
    onjump: (date: Date) => void;
  }

  let { open = $bindable(false), onjump }: Props = $props();

  let selectedDate = $state(new Date().toISOString().slice(0, 10));

  const selectedDay = $derived(new Date(selectedDate + 'T00:00:00Z'));
  const validDate = $derived(
    /^\d{4}-\d{2}-\d{2}$/.test(selectedDate) &&
      Number.isFinite(selectedDay.getTime()) &&
      selectedDay.toISOString().slice(0, 10) === selectedDate
  );

  function jumpDate() {
    if (validDate) {
      open = false;
      onjump(selectedDay);
    }
  }
</script>

{#if open}
  <Dialog
    open
    title="Go to date"
    description="Jump to the nearest event on the timeline."
    maxWidth="360px"
    onclose={() => (open = false)}
  >
    <form
      onsubmit={(event) => {
        event.preventDefault();
        jumpDate();
      }}
    >
      <TextField
        id="timeline-jump-date"
        label="Date"
        type="date"
        bind:value={selectedDate}
      />
      <div class="date-actions">
        <Button
          variant="secondary"
          onclick={() => (open = false)}
        >
          Cancel
        </Button><Button
          type="submit"
          disabled={!validDate}
        >
          Go
        </Button>
      </div>
    </form>
  </Dialog>
{/if}

<style>
  .date-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }
</style>
