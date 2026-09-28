/**
 * Battery pack (TECH_SPEC §6.1, §6.8).
 *   OCV(SoC) = 96 · (3.6 + 0.55 · SoC)          (linear per cell)
 *   V_dc = OCV − R_pack I_dc,  P_dc = V_dc I_dc  →  R I² − OCV I + P = 0 (physical root)
 * Source: reference ocv(), battery_current().
 */
import { BATTERY } from '@/config/battery';

export function ocvV(soc: number): number {
  return (
    BATTERY.cellsSeries * (BATTERY.ocvMinCellV + (BATTERY.ocvMaxCellV - BATTERY.ocvMinCellV) * soc)
  );
}

/** DC current and terminal voltage for a DC power (positive = discharging). */
export function batteryCurrent(pDcW: number, soc: number): { iDcA: number; vDcV: number } {
  const e = ocvV(soc);
  const r = BATTERY.rPackOhm;
  // beyond the maximum transferable power OCV² / 4R the discriminant clamps at 0
  const disc = Math.max(e * e - 4 * r * pDcW, 0);
  const i = (e - Math.sqrt(disc)) / (2 * r);
  return { iDcA: i, vDcV: e - r * i };
}

export function socStep(soc: number, pDcW: number, dt: number): number {
  return soc - (pDcW * dt) / (BATTERY.energyKwh * 3.6e6);
}
