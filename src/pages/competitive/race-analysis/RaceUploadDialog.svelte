<script lang="ts">
  import FileDrop from '@/components/controls/FileDrop.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';

  let {
    open = $bindable(),
    loading,
    busy,
    onfiles,
    onexample
  }: {
    open: boolean;
    loading: boolean;
    busy: boolean;
    onfiles: (files: FileList) => void;
    onexample: (count: number) => void;
  } = $props();
</script>

<Dialog
  bind:open
  title="Add race files"
  maxWidth="640px"
>
  <FileDrop
    id="race-upload"
    label="Drop one or multiple race files"
    description="HorseACT or game API captures (.json or .json.gz)"
    actionLabel={loading ? 'Reading captures…' : 'Choose race files'}
    accept=".json,.gz"
    multiple
    disabled={loading || busy}
    {onfiles}
  />
  <div class="demo-actions">
    <span>Try it with demo data</span>
    <Button
      size="sm"
      variant="secondary"
      disabled={loading || busy}
      onclick={() => onexample(1)}
    >
      Try one demo race
    </Button><Button
      size="sm"
      variant="secondary"
      disabled={loading || busy}
      onclick={() => onexample(24)}
    >
      Try 24 demo races
    </Button>
  </div>
  <div class="capture-help">
    <Button
      size="sm"
      variant="secondary"
      icon="external"
      href="https://github.com/ayaliz/horseACT#installation"
      target="_blank"
      rel="noreferrer"
    >
      How to capture races
    </Button>
  </div>
</Dialog>

<style>
  .demo-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 12px;
  }
  .demo-actions > span {
    font-size: 11px;
    color: var(--text-secondary);
    margin-right: 4px;
  }
  .capture-help {
    margin-top: 12px;
  }
  @media (max-width: 767px) {
    .demo-actions > span {
      flex-basis: 100%;
    }
  }
</style>
