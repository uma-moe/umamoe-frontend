export interface CompletionTarget {
  selector: string;
  text?: string;
  count?: number;
  pathname?: string;
  attribute?: [string, string];
}

export interface CompletionMeasurement {
  label: string;
  ms: number;
  ready: CompletionTarget;
}

export interface StressMetrics {
  label?: string;
  paints?: { label: string; ms: number }[];
  events?: { label: string; duration: number; name: string; interaction?: number }[];
  tasks?: { label: string; duration: number }[];
  completions?: CompletionMeasurement[];
  pendingCompletion?: string;
}

export interface InteractionMetrics extends StressMetrics {
  label: string;
  paints: NonNullable<StressMetrics['paints']>;
  events: NonNullable<StressMetrics['events']>;
  tasks: NonNullable<StressMetrics['tasks']>;
}

declare global {
  interface Window {
    __stress: StressMetrics;
    __routeStart: number;
  }
}
