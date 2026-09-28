/**
 * Two-node thermal model with a fixed oil temperature (TECH_SPEC §6.10).
 * Deviation from the starting values: the winding capacity (6 kJ/K → 4 kJ/K) and the
 * winding-to-oil resistance (0.012 → 0.025 K/W) were tuned in Phase 1 so that a single launch
 * stays cool but about seven back-to-back launch + regen cycles trigger the derate (§7.3).
 */
export const THERMAL = {
  cWJPerK: 4000,
  cRJPerK: 4000,
  tOilC: 70,
  rWOilKPerW: 0.025,
  rROilKPerW: 0.035,
  tWindingLimitC: 150,
  tMagnetLimitC: 140,
  /** torque limit falls linearly to 50 % over this span above the limit */
  derateSpanK: 20,
  tStartC: 40,
} as const;
