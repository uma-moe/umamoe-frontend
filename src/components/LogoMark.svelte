<script lang="ts">
  interface Props { size?: number; label?: string; animated?: boolean; fluid?: boolean; }
  let { size = 36, label = 'uma.moe', animated = false, fluid = false }: Props = $props();
  let renderedWidth = $state(0);
  let motionAllowed = $state(false);
  let drawing: SVGSVGElement | undefined = $state();
  const id = $props.id();
  $effect(() => {
    if (!animated) return;
    const preference = window.matchMedia('(prefers-reduced-motion: no-preference)');
    const sync = () => { motionAllowed = preference.matches; };
    sync();
    preference.addEventListener('change', sync);
    return () => preference.removeEventListener('change', sync);
  });
  $effect(() => {
    if (!motionAllowed || !drawing) return;
    drawing.setCurrentTime(0);
  });
</script>

{#if animated}
  <span class="mark loading-mark" bind:clientWidth={renderedWidth} style:width={fluid?'100%':size+'px'} style:height={fluid?'100%':size+'px'} style:--logo-stroke={Math.max(4.5,509/(renderedWidth||size))} style:--logo-paint={'url(#'+id+'-paint)'} role={label?'img':undefined} aria-label={label||undefined} aria-hidden={label?undefined:true}>
    <svg class="art" bind:this={drawing} viewBox="-44.357 -40 581.714 512" aria-hidden="true">
      <defs>
      <linearGradient id={id+'-paint'} x1="0" y1="0" x2="493" y2="432" gradientUnits="userSpaceOnUse">
        <stop stop-color="#64b5f6"/>
        <stop offset=".55" stop-color="#81c784"/>
        <stop offset="1" stop-color="#ffd54f"/>
      </linearGradient>
      <path id={id+'-head'} pathLength="1" d="M15 115C14.9254 91.7339 15.3738 75.0309 19.3283 46.5C23.4988 45.3652 28.1096 44.5943 30 46.5C31.8904 48.4057 59 73 78.5 117.5C80.3352 117.803 81.4832 117.857 84 117.5V65.5L137.619 0.999999C140.535 0.627481 145.622 3.44913 145.619 5.5C145.618 6.06568 144.619 59 144.619 59C141.119 69.5 136.619 87 137.619 86.5C138.619 86 164.7 78.6519 179.619 76L180.119 81C95.119 120.5 98.119 257.5 216.619 269.5C216.619 269.5 202.619 295 144.119 286C140.634 294.433 139.008 299.315 137.119 308.5H133.619C130.196 299.882 129.052 296.512 120.119 277.5C117.608 276.416 112.204 278.354 112.119 278.5C112.035 278.643 106.597 290.759 106.619 293C106.645 295.614 110.185 304.136 110.119 306.5C110.66 309.846 110.669 313.757 110.119 324.5C105.683 329.45 104.281 330.914 100.619 331.5C93.7153 329.105 90.0415 324.083 84.119 301.5H80.619L80.5982 301.329C79.5523 292.784 78.9595 287.941 90.619 277.5C70.0372 272.572 61.2597 269.025 55.119 260C53.629 230.697 53.9957 217.273 61.119 209.5C69.9025 238.567 79.0673 251.949 103.119 270.5H117.119C88.0407 247.778 74.2186 231.807 68.619 178.5C48.619 204 40.119 241 50.119 274C60.119 307 59.9446 305.42 83.119 344.5L68.119 360.5C67.5262 365.031 67.6027 367.354 69.619 370.5C86.581 385.168 96.2371 393.479 117.119 410.5C143.198 386.495 158.108 371.139 185.119 341C192.267 349.919 198.956 353.053 216.119 355C225.496 351.533 231.99 348.178 244.619 341C257.149 331.456 264.526 324.527 280.619 299C290.39 281.023 293.484 267.517 296.619 240C296.912 218.09 294.619 209.5 283.619 191C268.119 167 249.619 158 242.119 153.5C242.119 153.5 221.119 140.5 182.619 136C179.416 135.626 147.091 136.727 144.5 135C142.5 133.667 142 127.5 144 123.5C146 119.5 166.5 90 186.619 90C200.5 90 225.5 101.5 239.119 111C254 121 264.051 131.356 278.619 150L279.13 150.736C287.891 163.362 292.219 169.599 303.119 195C307.029 211.174 309.557 222.701 310.619 240C310.033 261.337 309.663 269.5 304.619 303C302.586 316.5 291 337 278.619 353C266.238 369 221.84 410.072 220.119 411.5C218.398 412.928 213.619 413.661 212.619 413.5C211.619 413.339 209.694 413.237 209.119 411C209.783 404.418 210.024 400.474 206.619 386C204.603 380.956 202.196 378.7 198.119 376.5C195.411 375.563 193.994 375.602 191.619 376.5L190.622 377.535C164.793 404.349 145.174 424.717 134.119 430.5C130 432 124.5 431.5 121 429.5C117.5 427.5 51.5 359.938 49.619 355.5C47.7381 351.062 47.5 346.5 49.119 345.5C49.119 345.5 59.619 341 62.119 337C64.619 333 61.4376 325.604 58.119 321.5C33.619 321.5 -2.33219 280.5 0.119018 247C2.57023 213.5 21.3856 176.939 44.5 155.5C34.8702 141.415 27.1816 131.941 15 115Z"/>
      <path id={id+'-mane'} pathLength="1" d="M325.5 230C317.727 117.5 262 98 211 74.5C211 74.5 223 62.5001 283.5 59.5C344 56.5 389.679 85.639 392 140.5C394.321 195.361 394 267 394 295C394 323 409.5 353 493 383.5C493 383.5 491.629 387.346 489 389C396.5 384 333.273 342.5 325.5 230Z"/>
      {#if motionAllowed}
        <clipPath id={id+'-outline-clip'} clipPathUnits="userSpaceOnUse">
          <polygon points="83.62,-38.5 933.65,-38.5 424.65,470.5 -425.38,470.5">
            <animateTransform attributeName="transform" type="translate" values="0 0;0 0;850.03 0;850.03 0" keyTimes="0;.724;.9413;1" keySplines="0 0 1 1;.45 0 .25 1;0 0 1 1" calcMode="spline" dur="2.3s" repeatCount="indefinite"/>
          </polygon>
        </clipPath>
        <clipPath id={id+'-fill-clip'} clipPathUnits="userSpaceOnUse">
          <polygon points="83.62,-38.5 933.65,-38.5 424.65,470.5 -425.38,470.5">
            <animateTransform attributeName="transform" type="translate" values="-850.03 0;-850.03 0;0 0;0 0;850.03 0;850.03 0" keyTimes="0;.1435;.3913;.6957;.913;1" keySplines="0 0 1 1;.45 0 .25 1;0 0 1 1;.45 0 .25 1;0 0 1 1" calcMode="spline" dur="2.3s" repeatCount="indefinite"/>
          </polygon>
        </clipPath>
      {/if}
      </defs>
      <g class="base">
        <use href={'#'+id+'-head'}/>
        <use href={'#'+id+'-mane'}/>
      </g>
      {#if motionAllowed}
        <g class="outline" clip-path={'url(#'+id+'-outline-clip)'}>
          <animate attributeName="stroke-dashoffset" values="1;0;0" keyTimes="0;.326;1" keySplines=".45 0 .25 1;0 0 1 1" calcMode="spline" dur="2.3s" repeatCount="indefinite"/>
          <use href={'#'+id+'-head'}/>
          <use href={'#'+id+'-mane'}/>
          <g class="trace-white">
            <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.1435;.3913;1" keySplines="0 0 1 1;.45 0 .25 1;0 0 1 1" calcMode="spline" dur="2.3s" repeatCount="indefinite"/>
            <use href={'#'+id+'-head'}/>
            <use href={'#'+id+'-mane'}/>
          </g>
        </g>
        <g class="colour" clip-path={'url(#'+id+'-fill-clip)'}>
          <use href={'#'+id+'-head'}/>
          <use href={'#'+id+'-mane'}/>
        </g>
      {/if}
    </svg>
  </span>
{:else}
  <img class="mark" src="/logo.webp" alt={label} width={size} height={size} style:width={size+'px'} style:height={size+'px'}/>
{/if}

<style>
  .mark { display:block; flex:none; object-fit:contain; }
  .art { display:block; width:100%; height:100%; fill:var(--logo-paint); stroke:var(--logo-paint); stroke-width:var(--logo-stroke); stroke-linecap:round; stroke-linejoin:round; }
  .outline { fill:none; stroke-dasharray:1; }
  .trace-white { stroke:#fff; }
  @media(prefers-reduced-motion:no-preference) {
    .base { opacity:0; }
  }
</style>
