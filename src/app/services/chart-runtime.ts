let runtimePromise: Promise<typeof import('chart.js')> | null = null;

/** Register Chart.js once, only after a chart is actually rendered. */
export function loadChartRuntime(): Promise<typeof import('chart.js')> {
  if (!runtimePromise) {
    runtimePromise = Promise.all([
      import('chart.js'),
      import('chartjs-adapter-date-fns'),
    ]).then(([chartRuntime]) => {
      chartRuntime.Chart.register(...chartRuntime.registerables);
      return chartRuntime;
    }).catch(error => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}
