import type { EChartsCoreOption } from 'echarts/core';

export type ChartRendererId = 'echarts';

export interface ChartRenderModel {
  id: string;
  label: string;
  description: string;
  renderer: ChartRendererId;
  option: EChartsCoreOption;
}
