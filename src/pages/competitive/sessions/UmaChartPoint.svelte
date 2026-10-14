<script lang="ts">
  let {
    x,
    y,
    r,
    image,
    color,
    label,
    selected = false,
    onselect,
    onhover
  }: {
    x: number;
    y: number;
    r: number;
    image?: string;
    color: string;
    label: string;
    selected?: boolean;
    onselect: () => void;
    onhover?: (hovered: boolean) => void;
  } = $props();
</script>

<g
  role="button"
  tabindex="0"
  aria-pressed={selected}
  aria-label={label}
  onpointerenter={(event) => {
    if (event.pointerType === 'mouse') onhover?.(true);
  }}
  onpointerleave={() => onhover?.(false)}
  onfocus={() => onhover?.(true)}
  onblur={() => onhover?.(false)}
  onclick={onselect}
  onkeydown={(event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onselect();
    }
  }}
>
  <circle
    cx={x}
    cy={y}
    {r}
    fill={color}
    fill-opacity=".15"
    stroke={color}
    stroke-width="2"
  />
  {#if image}
    <image
      href={image}
      x={x - r * 0.85}
      y={y - r * 0.85}
      width={r * 1.7}
      height={r * 1.7}
    />
  {/if}
  <title>{label}</title>
</g>

<style>
  g {
    cursor: pointer;
    outline: none;
  }
  image {
    pointer-events: none;
  }
  g:hover circle,
  g:focus-visible circle,
  g[aria-pressed='true'] circle {
    stroke-width: 4;
    fill-opacity: 0.35;
  }
  g:focus-visible circle {
    stroke: var(--text-primary);
  }
</style>
