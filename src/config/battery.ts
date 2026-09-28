/** Battery pack (TECH_SPEC §6.1): 96s, linear OCV in SoC, series resistance, 60 kWh. */
export const BATTERY = {
  cellsSeries: 96,
  ocvMinCellV: 3.6,
  ocvMaxCellV: 4.15,
  rPackOhm: 0.08,
  energyKwh: 60,
  /** regen is limited to this DC charge power (§6.5) */
  chargeLimitW: 150e3,
  socDefault: 0.8,
} as const;
