<script lang="ts">
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import {
    CLIP_CODECS,
    CLIP_QUALITIES,
    isClipCodec,
    isClipQuality,
    KEY_FRAME_INTERVALS
  } from './clip-format';
  import { MAX_CLIP_SIDE, MIN_CLIP_SIDE } from './clip-plan';
  import { isClipSizeChoice, type ReplayClip } from './replay-clip.svelte';

  let { clip }: { clip: ReplayClip } = $props();

  const speeds = ['0.5', '1', '2', '4'].map((value) => ({ value, label: value + '×' }));
  const frameRates = [
    { value: '30', label: '30 fps' },
    { value: '60', label: '60 fps' }
  ];
  const keyFrames = KEY_FRAME_INTERVALS.map((value) => ({ value, label: `Every ${value} s` }));

  const codecs = $derived(
    CLIP_CODECS.map((option) => ({
      ...option,
      disabled: clip.encodable !== undefined && !clip.encodable.includes(option.value)
    }))
  );

  // What the reader types stays in the field until it is a size the encoder takes.
  let widthDraft = $derived(String(clip.frame.width));
  let heightDraft = $derived(String(clip.frame.height));

  function typedSide(event: Event) {
    if (!(event.currentTarget instanceof HTMLInputElement)) return undefined;

    const value = Number(event.currentTarget.value);
    const fits = Number.isFinite(value) && value >= MIN_CLIP_SIDE && value <= MAX_CLIP_SIDE;

    return { text: event.currentTarget.value, value: fits ? value : undefined };
  }

  function typeWidth(event: Event) {
    const typed = typedSide(event);
    if (typed === undefined) return;

    widthDraft = typed.text;
    if (typed.value !== undefined) clip.customWidth = typed.value;
  }

  function typeHeight(event: Event) {
    const typed = typedSide(event);
    if (typed === undefined) return;

    heightDraft = typed.text;
    if (typed.value !== undefined) clip.setCustomHeight(typed.value);
  }

  /** A field left on a size the encoder cannot take shows the size the clip will have. */
  function settleSize() {
    widthDraft = String(clip.frame.width);
    heightDraft = String(clip.frame.height);
  }
</script>

<div class="clip-settings">
  <h3>Export settings</h3>
  <div class="settings-grid">
    <SelectField
      id="clip-speed"
      label="Speed"
      options={speeds}
      bind:value={clip.speed}
    />
    <SelectField
      id="clip-fps"
      label="Frame rate"
      options={frameRates}
      bind:value={clip.fps}
    />
    <SelectField
      id="clip-size"
      label="Size"
      options={clip.sizes}
      value={clip.size}
      onchange={(value) => {
        if (isClipSizeChoice(value)) clip.chooseSize(value);
      }}
    />
    <SelectField
      id="clip-codec"
      label="Format"
      options={codecs}
      value={clip.codec}
      onchange={(value) => {
        if (isClipCodec(value)) clip.codec = value;
      }}
    />
    {#if clip.size === 'custom'}
      <TextField
        id="clip-width"
        label="Width"
        type="number"
        inputmode="numeric"
        min={MIN_CLIP_SIDE}
        max={MAX_CLIP_SIDE}
        step={2}
        value={widthDraft}
        oninput={typeWidth}
        onblur={settleSize}
      />
      <TextField
        id="clip-height"
        label="Height"
        type="number"
        inputmode="numeric"
        min={MIN_CLIP_SIDE}
        max={MAX_CLIP_SIDE}
        step={2}
        value={heightDraft}
        oninput={typeHeight}
        onblur={settleSize}
      />
    {/if}
    <SelectField
      id="clip-quality"
      label="Quality"
      options={CLIP_QUALITIES}
      value={clip.quality}
      onchange={(value) => {
        if (isClipQuality(value)) clip.quality = value;
      }}
    />
    <SelectField
      id="clip-key-frames"
      label="Key frames"
      options={keyFrames}
      bind:value={clip.keyFrameInterval}
    />
  </div>
</div>

<style>
  .clip-settings {
    display: grid;
    gap: 10px;
  }
  h3 {
    margin: 0;
    padding-right: 32px;
    font-size: 14px;
    line-height: 24px;
  }
  .settings-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
</style>
