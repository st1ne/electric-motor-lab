/**
 * Number formatting for the UI (TECH_SPEC §3.3, §17): en-US grouping, a real minus sign,
 * fixed decimals so tabular digits never re-layout.
 */
const MINUS = '−';

export function fmt(x: number, decimals = 0): string {
  if (!Number.isFinite(x)) return '–';
  const s = Math.abs(x).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const rounded = Number(Math.abs(x).toFixed(decimals));
  return x < 0 && rounded !== 0 ? MINUS + s : s;
}

export function fmtSigned(x: number, decimals = 0): string {
  const s = fmt(x, decimals);
  return x > 0 && Number(x.toFixed(decimals)) !== 0 ? `+${s}` : s;
}

export const fmtRpm = (rpm: number): string => `${fmt(rpm)} rpm`;
export const fmtKmh = (kmh: number): string => `${fmt(kmh)} km/h`;
export const fmtNm = (t: number): string => `${fmt(t)} N·m`;
export const fmtKw = (w: number, decimals = 0): string => `${fmt(w / 1e3, decimals)} kW`;
export const fmtW = (w: number): string => `${fmt(w)} W`;
export const fmtApk = (a: number): string => `${fmtSigned(a)} A`;
export const fmtV = (v: number): string => `${fmt(v)} V`;
export const fmtC = (c: number): string => `${fmt(c)} °C`;
export const fmtPct = (x: number, decimals = 1): string => `${fmt(100 * x, decimals)} %`;
export const fmtDeg = (rad: number): string => `${fmt((rad * 180) / Math.PI)}°`;
export const fmtHz = (hz: number): string => `${fmt(hz)} Hz`;

/** Slow-mo factor label: ×1,000 */
export function fmtSlowMo(s: number): string {
  return s <= 1 ? 'Real' : `×${fmt(s)}`;
}
