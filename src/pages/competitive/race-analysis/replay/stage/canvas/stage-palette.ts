/** The page's colour tokens as the replay stage resolves them, in a form canvas drawing accepts. */
export interface StagePalette {
  dark: boolean;
  fontFamily: string;
  trackSurface: string;
  trackStripe: string;
  trackInfield: string;
  trackRail: string;
  trackPole: string;
  trackMarking: string;
  trackInk: string;
  surface1: string;
  surface2: string;
  surface3: string;
  textPrimary: string;
  textSecondary: string;
  accentPrimary: string;
  accentWarning: string;
  accentError: string;
  accentSuccess: string;
  borderPrimary: string;
  borderSubtle: string;
  artBorder: string;
  triggeredGlow: string;
  telemetryBackground: string;
  modeCalloutBorder: string;
  modeCalloutBackground: string;
  minimapBackground: string;
  fieldRowBackground: string;
  fieldRowChosenBackground: string;
  fieldRowChosenBorder: string;
  fieldControlBackground: string;
  fieldControlBorder: string;
}

type PaletteColor = Exclude<keyof StagePalette, 'dark' | 'fontFamily'>;

// Mixes are written as the stylesheets write them, so the browser resolves them the same way.
const COLOR_SOURCES: Record<PaletteColor, string> = {
  trackSurface: 'var(--track-surface)',
  trackStripe: 'var(--track-stripe)',
  trackInfield: 'var(--track-infield)',
  trackRail: 'var(--track-rail)',
  trackPole: 'var(--track-pole)',
  trackMarking: 'var(--track-marking)',
  trackInk: 'var(--track-ink)',
  surface1: 'var(--surface-1)',
  surface2: 'var(--surface-2)',
  surface3: 'var(--surface-3)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  accentPrimary: 'var(--accent-primary)',
  accentWarning: 'var(--accent-warning)',
  accentError: 'var(--accent-error)',
  accentSuccess: 'var(--accent-success)',
  borderPrimary: 'var(--border-primary)',
  borderSubtle: 'var(--border-subtle)',
  artBorder: 'var(--color-border)',
  triggeredGlow: 'color-mix(in srgb, var(--accent-warning) 70%, transparent)',
  telemetryBackground: 'color-mix(in srgb, var(--surface-1) 84%, transparent)',
  modeCalloutBorder: 'color-mix(in srgb, #69b7ee 55%, transparent)',
  modeCalloutBackground: 'color-mix(in srgb, var(--surface-1) 82%, #69b7ee)',
  minimapBackground: 'color-mix(in srgb, var(--surface-1) 88%, transparent)',
  fieldRowBackground: 'color-mix(in srgb, var(--factor-field-bg) 82%, transparent)',
  fieldRowChosenBackground: 'color-mix(in srgb, var(--accent-primary) 22%, var(--factor-field-bg))',
  fieldRowChosenBorder: 'color-mix(in srgb, var(--accent-primary) 50%, transparent)',
  fieldControlBackground: 'var(--factor-field-bg)',
  fieldControlBorder: 'var(--factor-field-border)'
};

/**
 * Resolves the tokens inside `element`, so the theme and track surface it sits in apply. A pixel drawn
 * and read back turns every colour syntax the page uses into plain rgba.
 */
export function readStagePalette(element: HTMLElement, dark: boolean): StagePalette {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  element.append(probe);

  const swatch = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const toRgba = (source: string) => {
    probe.style.color = source;
    const computed = getComputedStyle(probe).color;
    if (!swatch) return computed;

    swatch.clearRect(0, 0, 1, 1);
    swatch.fillStyle = computed;
    swatch.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = swatch.getImageData(0, 0, 1, 1).data;

    return `rgba(${red}, ${green}, ${blue}, ${((alpha ?? 255) / 255).toFixed(3)})`;
  };

  try {
    const colors = Object.fromEntries(
      Object.entries(COLOR_SOURCES).map(([name, source]) => [name, toRgba(source)])
    ) as Record<PaletteColor, string>;

    return {
      ...colors,
      dark,
      fontFamily: getComputedStyle(element).fontFamily
    };
  } finally {
    probe.remove();
  }
}
