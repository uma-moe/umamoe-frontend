<script lang="ts">
  import Badge from '@/components/Badge.svelte';
  import Icon from '@/components/Icon.svelte';
  import LogoMark from '@/components/LogoMark.svelte';
  import type { GachaDrawResult, GachaKind } from '@/lib/gacha-simulator/gacha-draw';
  import {
    gachaCardFrame,
    gachaCharacterGate,
    supportRarityIcon
  } from '@/lib/game-assets/art-links';
  import { isLit, isOpen, isScanning, type RevealPhase } from './gacha-reveal';
  import type { GachaItemDisplay } from './gacha-display';

  export type GachaResultItem = GachaDrawResult & GachaItemDisplay;

  interface Props {
    result: GachaResultItem;
    kind: GachaKind;
    position: number;
    /** True for a live pull: the card deals face-down and earns its rarity flourish. */
    pull?: boolean;
    /** Where the reveal has got to; a card dealt outside a pull is already settled. */
    phase?: RevealPhase;
    /** The rarity flourish, which waits until the card has finished turning. */
    flourish?: boolean;
    /** A quick pull: no deal, no turn, straight to the faces. */
    instant?: boolean;
    /** The rarity the gate is showing right now: the waves colour it before the doors part. */
    gateRarity?: number;
  }

  let {
    result,
    kind,
    position,
    pull = false,
    phase = 'settled',
    flourish = true,
    instant = false,
    gateRarity
  }: Props = $props();
  let useFallback = $state(false);
  let failed = $state(false);

  /** The card has stopped waiting face-down and its gate or turn is under way. */
  const open = $derived(isOpen(phase));
  /** The flourish is due: the card has landed and its light may start. */
  const lit = $derived(isLit(phase));
  /** The wave is reading the gates, so a gate that upgrades now earns its flash of light. */
  const scanning = $derived(isScanning(phase));
  /** The game's own rarity emblems exist for support cards only; a trainee's rarity is stars. */
  const supportRarity = $derived(
    kind === 'support' ? ({ 1: 'R', 2: 'SR', 3: 'SSR' } as const)[result.rarity] : undefined
  );
  const rarityLabel = $derived(supportRarity ?? `${result.rarity}★`);
  /** Every card wears the game's rarity frame: silver for the lowest, then gold, then the holo. */
  const frameArt = $derived(gachaCardFrame(result.rarity));
  /** What the gate is wearing, which its waves change long before the card's own rarity is read. */
  const gate = $derived(gateRarity ?? result.rarity);
  /**
   * The gate sprite holds four leaves: a holo pair, then one gold leaf and one silver leaf. The gold
   * leaf hinges on its left edge and the silver one on its right, so each rarity mirrors whichever
   * door needs it to put both posts on the outside.
   */
  const gateLeft = $derived(gate === 3 ? '0%' : gate === 2 ? '66.6666%' : '100%');
  const gateRight = $derived(gate === 3 ? '33.3333%' : gate === 2 ? '66.6666%' : '100%');
  const gateFlipLeft = $derived(gate === 1 ? '-1' : '1');
  const gateFlipRight = $derived(gate === 2 ? '-1' : '1');
  const imageSource = $derived(useFallback ? result.thumbImage : result.image);

  function imageFailed() {
    if (useFallback) failed = true;
    else useFallback = true;
  }

  $effect(() => {
    result.image;
    failed = false;
    useFallback = false;
  });
</script>

{#snippet face()}
  <div class="result-art">
    <div
      class="result-image"
      class:character={kind === 'character'}
    >
      {#if !failed}
        <img
          src={imageSource}
          alt={result.name}
          loading="lazy"
          decoding="async"
          onerror={imageFailed}
        />
      {:else}
        <span class="fallback">
          <Icon
            name={kind === 'support' ? 'cards' : 'user'}
            size={30}
          />
        </span>
      {/if}
      <span class="position">#{position}</span>
      {#if supportRarity}
        <span class="rarity rarity-art">
          <img
            src={supportRarityIcon(supportRarity)}
            alt={supportRarity}
            loading="lazy"
          />
        </span>
      {:else}
        <span class="rarity">{rarityLabel}</span>
      {/if}
      {#if result.typeIcon}
        <span class="type-icon">
          <img
            src={result.typeIcon}
            alt={result.typeLabel}
            loading="lazy"
          />
        </span>
      {/if}
    </div>
  </div>
  <div class="result-copy">
    {#if result.subName}
      <span class="sub-name">[{result.subName}]</span>
    {/if}
    <strong title={result.name}>{result.ownerName ?? result.name}</strong>
    <span class="type">{result.typeLabel}</span>
    {#if result.featured || result.guaranteed}
      <div class="flags">
        {#if result.featured}
          <Badge tone="accent">Featured</Badge>
        {/if}
        {#if result.guaranteed}
          <Badge>10th · SR+</Badge>
        {/if}
      </div>
    {/if}
  </div>
  <!-- The frame is drawn last, over the art, so nothing the card shows can spill onto its band. -->
  {#if kind === 'support'}
    <span
      class="card-frame"
      aria-hidden="true"
    ></span>
  {/if}
{/snippet}

<article
  class="result"
  class:instant
  class:framed={kind === 'support'}
  class:flipping={pull && kind === 'support'}
  class:gate-bloom={pull && kind === 'character' && gate === 3 && !open}
  class:scanning={pull && kind === 'character' && scanning}
  class:celebrate-mid={pull && flourish && lit && result.rarity === 2}
  class:celebrate-top={pull && flourish && lit && result.rarity === 3}
  style:--card-frame="url({frameArt})"
  style:--gate-left={gateLeft}
  style:--gate-right={gateRight}
  style:--gate-flip-left={gateFlipLeft}
  style:--gate-flip-right={gateFlipRight}
  style:--gate-art="url({gachaCharacterGate()})"
>
  {#if pull && kind === 'support'}
    <!-- A support pull is a real card: two faces a half turn apart, dealt back up. -->
    <div
      class="card-scene"
      class:open
    >
      <div
        class="card-flip"
        class:open
      >
        <div class="card-face">{@render face()}</div>
        <div
          class="card-back"
          class:glow={result.rarity === 3}
          aria-hidden="true"
        >
          <span class="card-back-surface"><LogoMark size={48} /></span>
          <span class="card-frame"></span>
        </div>
      </div>
    </div>
  {:else}
    {@render face()}
    {#if pull}
      <!-- A trainee waits behind the starting gate, which parts on the beat and lets the light through. -->
      <span
        class="veil"
        class:lit={open}
        aria-hidden="true"
      ></span>
      <div
        class="gate"
        class:open
        class:upgraded={gate > 1}
        class:glow={gate === 3}
        aria-hidden="true"
      >
        <span class="gate-door left">
          <span class="gate-base"></span>
          <span class="gate-leaf"></span>
        </span>
        <span class="gate-door right">
          <span class="gate-base"></span>
          <span class="gate-leaf"></span>
        </span>
      </div>
    {/if}
  {/if}
  <!-- The reveal's light is clipped to the card, so a band that ends up off the card cannot show. -->
  <span
    class="card-effects"
    aria-hidden="true"
  ></span>
</article>

<style>
  .result {
    min-width: 0;
    height: 100%;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    isolation: isolate;
    padding: 3px;
    border: 1px solid var(--card-surface-border);
    border-radius: var(--radius-md);
    background: var(--card-surface-bg);
  }
  /* A framed card is the game's own card, so its art sits inside the frame's band instead. The radius
     is the frame art's own outer corner (72px on its 648px width), so the card clips exactly where the
     frame does and no art can peek past it. */
  .result.framed {
    --card-radius: 11.1% / 8.3%;
    padding: 4.5%;
    border: 0;
    border-radius: var(--card-radius);
  }
  /* Holds the reveal's light, clipped to the card's own rounded box: the sheen finishes a full card
     width to the right, and without this clip it would show there and widen the dialog's scroll area. */
  .card-effects {
    position: absolute;
    inset: 0;
    z-index: 3;
    overflow: hidden;
    border-radius: var(--card-radius, var(--radius-md));
    pointer-events: none;
  }
  /* The rarity frame, painted over the card so the art can never cross its band. */
  .card-frame {
    position: absolute;
    inset: 0;
    z-index: 6;
    border-radius: inherit;
    background-image: var(--card-frame);
    background-size: 100% 100%;
    background-repeat: no-repeat;
    pointer-events: none;
  }

  /* The support pull's card: one scene, two faces half a turn apart, dealt back up. The face stays in
     flow so the card keeps its content height, with the back laid over it. */
  .card-scene {
    height: 100%;
    perspective: 900px;
  }
  .card-flip {
    position: relative;
    height: 100%;
    transform-style: preserve-3d;
    transform: rotateY(180deg);
  }
  .card-flip.open {
    /* A near-linear middle: a steeper curve blurs the card through edge-on, so it reads as a card
       that vanishes and comes back already half turned. */
    animation: card-turn var(--turn, 560ms) cubic-bezier(0.4, 0, 0.6, 1) both
      calc(var(--reveal-index, 0) * var(--stagger, 45ms) + var(--lead-in, 100ms));
  }
  /* The lift rides on the scene, so the turn keeps one continuous speed instead of stalling halfway.
     The face is held back until the card is past edge-on, which stops it bleeding through the back. */
  .card-scene.open {
    animation: card-lift var(--turn, 560ms) ease-in-out both
      calc(var(--reveal-index, 0) * var(--stagger, 45ms) + var(--lead-in, 100ms));
  }
  .card-flip.open .card-face {
    animation: card-face-shown var(--turn, 560ms) linear both
      calc(var(--reveal-index, 0) * var(--stagger, 45ms) + var(--lead-in, 100ms));
  }
  @keyframes card-lift {
    0% {
      transform: scale(1);
    }
    45% {
      transform: scale(1.07);
    }
    100% {
      transform: scale(1);
    }
  }
  @keyframes card-face-shown {
    /* The face comes up over the last third of the turn instead of snapping on at edge-on. */
    0%,
    50% {
      opacity: 0;
    }
    78%,
    100% {
      opacity: 1;
    }
  }
  @keyframes card-turn {
    0% {
      transform: rotateY(180deg);
    }
    100% {
      transform: rotateY(0deg);
    }
  }
  /* A quick pull skips the whole deal. */
  .instant .card-flip.open,
  .instant .card-flip.open .card-face,
  .instant .card-scene.open {
    animation: none;
  }
  .card-face,
  .card-back {
    border-radius: var(--card-radius, calc(var(--radius-md) - 1px));
    backface-visibility: hidden;
  }
  .card-face {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* The frame turns with the card, so the face keeps the same band the card shows when flat. */
    padding: 4.5%;
    background: var(--card-surface-bg);
  }
  .card-back {
    position: absolute;
    inset: 0;
    display: grid;
    padding: 4.5%;
    overflow: hidden;
    background: var(--card-surface-bg);
    transform: rotateY(180deg);
  }
  /* A holo card waits face-down with a hint of its light, so the deal reads before the turn. */
  .card-back.glow {
    box-shadow:
      0 0 18px 2px rgb(184 155 255 / 0.32),
      0 0 28px 6px rgb(111 216 255 / 0.2),
      0 0 38px 10px rgb(255 135 195 / 0.14);
  }
  /* The back carries the same rarity band as the face, so the colour reads before the turn. */
  .card-back-surface {
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: calc(var(--radius-md) - 4px);
    background:
      linear-gradient(160deg, rgb(255 255 255 / 0.05), transparent 55%),
      repeating-linear-gradient(45deg, rgb(255 255 255 / 0.03) 0 6px, transparent 6px 12px),
      var(--surface-2);
  }
  .card-back :global(.mark) {
    opacity: 0.7;
  }

  /* The starting gate a trainee pull waits behind. The sprite's panels are single door leaves, so the
     gate is a mirrored pair of the one panel that answers to this card's rarity, meeting in the middle
     and parting on the beat. */
  .gate {
    position: absolute;
    inset: 0;
    z-index: 4;
    overflow: hidden;
    pointer-events: none;
  }
  .gate-door {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 50.5%;
    /* The panel is transparent above the door, so the door carries the card's surface with it: the
       backdrop leaves when the doors do, which is what uncovers the art. */
    background-color: var(--card-surface-bg);
    transition: transform var(--gate, 460ms) var(--easing-standard)
      calc(var(--reveal-index, 0) * var(--stagger, 45ms) + var(--lead-in, 100ms));
  }
  .gate-door.left {
    left: 0;
  }
  .gate-door.right {
    right: 0;
  }
  /* One leaf of the gate sprite, filling its half of the door. */
  .gate-base,
  .gate-leaf {
    position: absolute;
    inset: 0;
    background-image: var(--gate-art);
    background-repeat: no-repeat;
    /* Each panel is one leaf; scaling past the box and pinning to the bottom fills the card without
       squeezing the door's own proportions. */
    background-size: 400% 126%;
  }
  /* Every gate is dealt as the plainest leaf. The hinge posts have to end up on the outside, which
     takes a mirror on whichever door is showing the leaf's hinged side inwards. */
  .gate-base {
    background-position: 100% 100%;
  }
  .gate-door.left .gate-base {
    transform: scaleX(-1);
  }
  /* The leaf the card actually drew, laid over the plain one and lit once the wave reaches it. */
  .gate-leaf {
    opacity: 0;
    transition: opacity var(--flip, 260ms) var(--easing-standard);
  }
  .gate-door.left .gate-leaf {
    background-position: var(--gate-left, 0%) 100%;
    transform: scaleX(var(--gate-flip-left, 1));
  }
  .gate-door.right .gate-leaf {
    background-position: var(--gate-right, 33.3333%) 100%;
    transform: scaleX(var(--gate-flip-right, 1));
  }
  .gate.upgraded .gate-leaf {
    opacity: 1;
  }
  /* A quick pull skips the wave, so the leaf is simply there. */
  .instant .gate-leaf {
    transition: none;
  }
  /* Every gate that changes pops as its wave lands, and the holo ones pop again — bigger — when the
     second wave takes them rainbow. A skipped pull never runs either. */
  .result.scanning .gate.upgraded {
    animation: gate-jump var(--flash, 380ms) var(--easing-standard) both;
  }
  .result.scanning .gate.upgraded .gate-base,
  .result.scanning .gate.upgraded .gate-leaf {
    animation: gate-flash var(--flash, 380ms) var(--easing-standard) both;
  }
  .result.scanning .gate.glow {
    animation: gate-jump-rainbow var(--flash, 380ms) var(--easing-standard) both;
  }
  .result.scanning .gate.glow .gate-base,
  .result.scanning .gate.glow .gate-leaf {
    animation: gate-flash-rainbow var(--flash, 380ms) var(--easing-standard) both;
  }
  @keyframes gate-jump {
    from {
      transform: scale(1);
    }
    32% {
      transform: scale(1.08);
    }
    64% {
      transform: scale(0.985);
    }
    to {
      transform: scale(1);
    }
  }
  @keyframes gate-jump-rainbow {
    from {
      transform: scale(1);
    }
    28% {
      transform: scale(1.12);
    }
    62% {
      transform: scale(0.98);
    }
    to {
      transform: scale(1);
    }
  }
  @keyframes gate-flash {
    from {
      filter: brightness(1.7) saturate(1.2);
    }
    to {
      filter: brightness(1);
    }
  }
  @keyframes gate-flash-rainbow {
    from {
      filter: brightness(2.1) saturate(1.5) hue-rotate(-24deg);
    }
    to {
      filter: brightness(1);
    }
  }
  /* The doors fall away down and out rather than sliding straight sideways, which reads as weight
     and keeps the parting leaves from looking like a pair of shutters. */
  .gate.open .gate-door.left {
    transform: translate(-100%, 24%);
  }
  .gate.open .gate-door.right {
    transform: translate(100%, 24%);
  }
  /* Only the holo gets a glow: a drop shadow painted from a second copy of the leaf, which follows
     the alpha the sprite is drawn with, so the light traces the door's own silhouette — the crest, the
     lattice — instead of the card's rectangle, and spills past its edge. */
  .gate.glow {
    --gate-light-1: rgb(255 135 195 / 0.5);
    --gate-light-2: rgb(111 216 255 / 0.38);
    --gate-light-3: rgb(184 155 255 / 0.32);
  }
  .gate.glow .gate-leaf::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: var(--gate-art);
    background-repeat: no-repeat;
    background-size: 400% 126%;
    background-position: inherit;
    filter: drop-shadow(0 0 5px var(--gate-light-1)) drop-shadow(0 0 11px var(--gate-light-2))
      drop-shadow(0 0 18px var(--gate-light-3));
    /* The light belongs behind the doors, not to them: it goes out as they part instead of travelling
       off the card with the leaf, and the reveal's own bloom takes over from there. */
    transition: opacity calc(var(--gate, 460ms) * 0.35) var(--easing-standard)
      calc(var(--reveal-index, 0) * var(--stagger, 45ms) + var(--lead-in, 100ms));
  }
  .gate.open.glow .gate-leaf::before {
    opacity: 0;
  }
  /* The holo's other sign: glints of light drifting over the leaves, twinkling before anything moves.
     Each one is a hard little core inside a wide coloured bloom, because over a leaf this bright a soft
     glow on its own is nothing the eye can find. The glints ride the doors, so they leave with them
     instead of needing a fade of their own. */
  .gate.glow .gate-leaf::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    /* The field is larger than the door, so drifting it slides glints in and out of the crop rather
       than shifting the whole pattern in lockstep. */
    background-size: 150% 150%;
    background-repeat: no-repeat;
    background-image:
      radial-gradient(circle 4px at 55% 30%, #fff, rgb(255 255 255 / 0.35) 55%, transparent 70%),
      radial-gradient(circle 20px at 55% 30%, rgb(160 235 255 / 0.7), transparent 70%),
      radial-gradient(circle 3.5px at 28% 62%, #fff, rgb(255 255 255 / 0.35) 55%, transparent 70%),
      radial-gradient(circle 18px at 28% 62%, rgb(255 170 210 / 0.65), transparent 70%),
      radial-gradient(circle 4px at 62% 48%, #fff, rgb(255 255 255 / 0.35) 55%, transparent 70%),
      radial-gradient(circle 18px at 62% 48%, rgb(255 220 140 / 0.7), transparent 70%),
      radial-gradient(circle 3px at 38% 82%, #fff, rgb(255 255 255 / 0.35) 55%, transparent 70%),
      radial-gradient(circle 16px at 38% 82%, rgb(200 180 255 / 0.7), transparent 70%);
    mix-blend-mode: screen;
    animation:
      gate-drift 10s ease-in-out infinite alternate -2s,
      gate-twinkle 1700ms ease-in-out infinite alternate -400ms;
  }
  /* The two leaves drift and flicker out of step, or the card reads as one blinking panel. */
  .gate.glow .gate-door.right .gate-leaf::after {
    animation-delay:
      -6s,
      -1000ms;
  }
  @keyframes gate-drift {
    from {
      background-position: 8% 18%;
    }
    to {
      background-position: 58% 72%;
    }
  }
  @keyframes gate-twinkle {
    from {
      opacity: 0.5;
    }
    to {
      opacity: 1;
    }
  }
  /* While the doors are shut the card lets its own clip go, so a leaf's light can leave the card
     instead of stopping in a straight line at its edge. */
  .result.gate-bloom,
  .gate-bloom .gate {
    overflow: visible;
  }
  .gate-bloom .veil {
    border-radius: inherit;
  }
  /* The gate's swing, which the shade below and the glow's fade both keep time with. */
  .result:not(.framed) {
    --gate: 460ms;
  }
  /* The shade is a veil over the card rather than a filter on the art, so the doors uncover it as they
     part. It is black to start: nothing of the trainee shows through the lattice until her gate is out
     of the way, and then the art comes up as the shade lifts. */
  .veil {
    position: absolute;
    inset: 0;
    z-index: 3;
    background: #000;
    pointer-events: none;
    transition: opacity calc(var(--gate, 460ms) / 2) var(--easing-standard)
      calc(
        var(--lead-in, 100ms) + var(--reveal-index, 0) * var(--stagger, 45ms) + var(--gate, 460ms) /
          2
      );
  }
  .veil.lit {
    opacity: 0;
  }
  .result.framed.flipping {
    /* The faces carry the frame, so the card itself only supplies the scene, and the scene is allowed
       to grow past it while the card turns. */
    padding: 0;
    overflow: visible;
  }
  .result-art {
    position: relative;
  }
  .result-image {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: var(--radius-xs);
    background: var(--surface-2);
  }
  /* The art runs under the band, so its own square corners never show past the frame's rounded one. */
  .framed .result-image {
    margin: -4.5% -4.5% 0;
    border-radius: 0;
  }
  .result-image.character {
    aspect-ratio: 4 / 5;
  }
  img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    object-position: top center;
  }
  .fallback {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    color: var(--text-muted);
  }
  .position,
  .rarity {
    position: absolute;
    padding: 2px 5px;
    border-radius: var(--radius-xs);
    background: rgb(0 0 0 / 0.76);
    color: white;
    font-size: 10px;
    font-weight: 800;
    line-height: 1.2;
  }
  .position {
    bottom: 4px;
    left: 4px;
  }
  /* A trainee keeps its rarity in the corner; a support card wears the game's emblem up top. */
  .rarity {
    bottom: 4px;
    right: 4px;
  }

  /* The game's rarity emblem carries its own colour and lettering, so it needs no pill. */
  .rarity-art {
    width: 20%;
    padding: 0;
    background: none;
    border-radius: 0;
  }
  .rarity-art img {
    width: 100%;
    height: auto;
    display: block;
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.6));
  }
  /* The game's own icon for what the card trains, in the corner the game puts it. */
  .type-icon {
    position: absolute;
    top: 0;
    right: 0;
    width: 20%;
  }
  /* A support card wears both corner badges along its top edge: rarity left, type right. */
  .result.framed .rarity-art {
    top: 0;
    left: 8px;
    z-index: 20;
  }
  .result.framed .type-icon {
    top: 0;
    right: 0px;
    z-index: 20;
  }
  .type-icon img {
    width: 100%;
    height: auto;
    display: block;
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.6));
  }
  .result-copy {
    min-width: 0;
    flex: 1;
    display: grid;
    align-content: start;
    gap: 3px;
    padding: 7px;
  }
  strong,
  .type,
  .sub-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub-name {
    color: var(--text-muted);
    font-size: 10px;
    line-height: 1.25;
  }
  strong {
    font-size: 11px;
    line-height: 1.3;
  }
  .type {
    color: var(--text-muted);
    font-size: 10px;
  }
  .flags {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-top: 2px;
  }
  .flags :global(.badge) {
    min-height: 18px;
    padding: 2px 5px;
    font-size: 8px;
  }
  @media (max-width: 767px) {
    .result-copy {
      padding: 6px;
    }
  }

  /* The pull's peak. SR passes one band of light; SSR blooms a rainbow halo behind the card and
     lets a field of rainbow sparks cross it. Each keyframe starts at the card's resting state, so
     reduced motion leaves nothing mid-effect. */
  .result.celebrate-mid .card-effects::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 3;
    pointer-events: none;
    background: linear-gradient(
      100deg,
      transparent 34%,
      rgb(255 255 255 / 0.2) 46%,
      rgb(255 255 255 / 0.48) 52%,
      transparent 66%
    );
    transform: translateX(-115%);
    animation: card-sheen 1000ms var(--easing-standard)
      calc(var(--reveal-index, 0) * var(--stagger, 45ms) + 40ms) both;
  }
  .result.celebrate-top .card-effects::before,
  .result.celebrate-top .card-effects::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 3;
    pointer-events: none;
    opacity: 0;
    background-repeat: no-repeat;
    mix-blend-mode: screen;
  }
  /* Two spark fields, so the light keeps moving after the first wave has gone. */
  .result.celebrate-top .card-effects::before {
    background-image:
      radial-gradient(circle 1.8px at 13% 17%, rgb(255 255 255 / 0.95), transparent),
      radial-gradient(circle 1.6px at 29% 8%, rgb(255 135 195 / 0.95), transparent),
      radial-gradient(circle 1.7px at 44% 25%, rgb(255 207 107 / 0.95), transparent),
      radial-gradient(circle 1.5px at 62% 11%, rgb(111 216 255 / 0.95), transparent),
      radial-gradient(circle 1.8px at 79% 27%, rgb(184 155 255 / 0.95), transparent),
      radial-gradient(circle 1.6px at 90% 48%, rgb(255 135 195 / 0.9), transparent),
      radial-gradient(circle 1.5px at 21% 40%, rgb(255 207 107 / 0.85), transparent);
    animation: card-sparkle 1200ms var(--easing-standard)
      calc(var(--reveal-index, 0) * var(--stagger, 45ms) + 20ms) both;
  }
  .result.celebrate-top .card-effects::after {
    background-image:
      radial-gradient(circle 1.6px at 11% 55%, rgb(111 216 255 / 0.9), transparent),
      radial-gradient(circle 1.7px at 34% 74%, rgb(184 155 255 / 0.95), transparent),
      radial-gradient(circle 1.5px at 52% 45%, rgb(255 255 255 / 0.9), transparent),
      radial-gradient(circle 1.8px at 67% 68%, rgb(255 135 195 / 0.95), transparent),
      radial-gradient(circle 1.6px at 84% 80%, rgb(255 207 107 / 0.9), transparent),
      radial-gradient(circle 1.5px at 45% 89%, rgb(111 216 255 / 0.85), transparent),
      radial-gradient(circle 1.6px at 73% 33%, rgb(255 255 255 / 0.85), transparent);
    animation: card-sparkle 1500ms var(--easing-standard)
      calc(var(--reveal-index, 0) * var(--stagger, 45ms) + 150ms) both;
  }
  .result.celebrate-top {
    /* The reveal blooms, then the halo keeps breathing for as long as the pull is on screen. */
    animation:
      card-bloom 1150ms var(--easing-standard)
        calc(var(--reveal-index, 0) * var(--stagger, 45ms) + 40ms) both,
      card-glow 3600ms ease-in-out calc(var(--reveal-index, 0) * var(--stagger, 45ms) + 1190ms)
        infinite alternate;
  }
  /* A card that turns carries its halo with it, so the light is the face's shadow rather than the
     card's, and the card's own bloom would only be a second halo left standing behind the turn. */
  .result.celebrate-top.framed.flipping {
    animation: none;
  }
  .result.celebrate-top .card-flip.open .card-face {
    animation:
      card-face-shown var(--turn, 560ms) linear both
        calc(var(--reveal-index, 0) * var(--stagger, 45ms) + var(--lead-in, 100ms)),
      card-halo 1150ms var(--easing-standard)
        calc(var(--reveal-index, 0) * var(--stagger, 45ms) + 40ms) both,
      card-glow 3600ms ease-in-out calc(var(--reveal-index, 0) * var(--stagger, 45ms) + 1190ms)
        infinite alternate;
  }
  /* The flash runs on the art itself: a filter on .result-art would make it a stacking context and
     drop the corner badges behind the frame band, which is only thick enough to notice on the holo. */
  /* The holo flash on a support card's art; a trainee's light-up carries its own pop. */
  .result.celebrate-top.framed .result-image img {
    animation: frame-flash 900ms var(--easing-standard)
      calc(var(--reveal-index, 0) * var(--stagger, 45ms) + 40ms) both;
  }
  @keyframes card-sparkle {
    from {
      opacity: 0;
      transform: translateY(5px) scale(0.92);
    }
    22% {
      opacity: 1;
    }
    68% {
      opacity: 0.9;
    }
    to {
      opacity: 0;
      transform: translateY(-9px) scale(1.06);
    }
  }
  /* The halo is a stack of coloured shadows, shifting hue as it swells and settles. */
  /* The same bloom without the pop, for the halo that rides on a card mid-turn. */
  @keyframes card-halo {
    from {
      box-shadow:
        0 0 0 0 rgb(255 135 195 / 0),
        0 0 0 0 rgb(255 207 107 / 0),
        0 0 0 0 rgb(111 216 255 / 0),
        0 0 0 0 rgb(184 155 255 / 0);
    }
    28% {
      box-shadow:
        0 0 16px 2px rgb(255 135 195 / 0.75),
        0 0 24px 6px rgb(255 207 107 / 0.6),
        0 0 32px 10px rgb(111 216 255 / 0.55),
        0 0 44px 14px rgb(184 155 255 / 0.5);
    }
    62% {
      box-shadow:
        0 0 18px 3px rgb(184 155 255 / 0.7),
        0 0 26px 7px rgb(111 216 255 / 0.6),
        0 0 34px 11px rgb(255 207 107 / 0.5),
        0 0 46px 15px rgb(255 135 195 / 0.45);
    }
    to {
      box-shadow:
        0 0 16px 2px rgb(255 135 195 / 0.55),
        0 0 24px 6px rgb(255 207 107 / 0.45),
        0 0 32px 10px rgb(111 216 255 / 0.4),
        0 0 44px 14px rgb(184 155 255 / 0.35);
    }
  }
  @keyframes card-bloom {
    from {
      scale: 1;
      box-shadow:
        0 0 0 0 rgb(255 135 195 / 0),
        0 0 0 0 rgb(255 207 107 / 0),
        0 0 0 0 rgb(111 216 255 / 0),
        0 0 0 0 rgb(184 155 255 / 0);
    }
    28% {
      scale: 1.035;
      box-shadow:
        0 0 16px 2px rgb(255 135 195 / 0.75),
        0 0 24px 6px rgb(255 207 107 / 0.6),
        0 0 32px 10px rgb(111 216 255 / 0.55),
        0 0 44px 14px rgb(184 155 255 / 0.5);
    }
    62% {
      scale: 1.02;
      box-shadow:
        0 0 18px 3px rgb(184 155 255 / 0.7),
        0 0 26px 7px rgb(111 216 255 / 0.6),
        0 0 34px 11px rgb(255 207 107 / 0.5),
        0 0 46px 15px rgb(255 135 195 / 0.45);
    }
    to {
      scale: 1;
      box-shadow:
        0 0 16px 2px rgb(255 135 195 / 0.55),
        0 0 24px 6px rgb(255 207 107 / 0.45),
        0 0 32px 10px rgb(111 216 255 / 0.4),
        0 0 44px 14px rgb(184 155 255 / 0.35);
    }
  }
  /* The resting halo the reveal settles into; the loop alternates between these two. */
  @keyframes card-glow {
    from {
      box-shadow:
        0 0 16px 2px rgb(255 135 195 / 0.55),
        0 0 24px 6px rgb(255 207 107 / 0.45),
        0 0 32px 10px rgb(111 216 255 / 0.4),
        0 0 44px 14px rgb(184 155 255 / 0.35);
    }
    to {
      box-shadow:
        0 0 20px 4px rgb(184 155 255 / 0.7),
        0 0 30px 9px rgb(111 216 255 / 0.55),
        0 0 40px 13px rgb(255 207 107 / 0.45),
        0 0 54px 18px rgb(255 135 195 / 0.4);
    }
  }
  @keyframes card-sheen {
    from {
      transform: translateX(-115%);
    }
    to {
      transform: translateX(115%);
    }
  }
  @keyframes frame-flash {
    from {
      filter: brightness(1);
    }
    38% {
      filter: brightness(1.5) saturate(1.25);
    }
    to {
      filter: brightness(1);
    }
  }
</style>
