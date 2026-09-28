/** Shared input for the chart views (TECH_SPEC §3.6). */
import type { DisplayAngles, SimSnapshot } from '@/physics/types';
import type { UiState } from '@/state/uiState';
import type { ChartCanvas } from '@/ui/charts/chartBase';

export interface ChartInput {
  readonly s: SimSnapshot;
  readonly angles: DisplayAngles;
  readonly ui: Readonly<UiState>;
  /** real time, s (trails fade in real time, even when frozen) */
  readonly nowS: number;
}

export interface ChartView {
  /** short text for the canvas's aria-label */
  describe(input: ChartInput): string;
  draw(c: ChartCanvas, input: ChartInput): void;
  /** called every frame, visible or not (histories, trails) */
  sample?(input: ChartInput, dt: number): void;
}

/** chart palette, mirroring the CSS tokens */
export const CHART_COLORS = {
  text: '#e8ecf5',
  muted: '#8b93a7',
  dim: '#5d6479',
  field: '#b794ff',
  power: '#ffb547',
  regen: '#5be49b',
  heat: '#ff7a3d',
  alarm: '#ff4d5e',
} as const;
