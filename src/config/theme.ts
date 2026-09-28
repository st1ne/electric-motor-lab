/**
 * Theme colors for three.js, mirroring the CSS tokens in src/ui/styles.css (TECH_SPEC §3.2, §4).
 * The phase colors are used everywhere: coils, scope traces, inverter legs, labels.
 */
export const THEME = {
  bg: '#0a0d18',
  text: '#e8ecf5',
  textMuted: '#8b93a7',
  phaseA: '#ff6b6b',
  phaseB: '#ffd166',
  phaseC: '#4cc9ff',
  field: '#b794ff',
  power: '#ffb547',
  regen: '#5be49b',
  heat: '#ff7a3d',
  alarm: '#ff4d5e',
} as const;

export const PHASE_COLORS = [THEME.phaseA, THEME.phaseB, THEME.phaseC] as const;

/** Scene palette (§4.2–4.3). */
export const PALETTE = {
  keyLight: '#ffd9a8',
  fillSky: '#6f8cff',
  fillGround: '#15110d',
  rimLight: '#b794ff',
  aluminium: '#b8bec7',
  lamination: '#4a515c',
  laminationLine: '#6b7482',
  copper: '#d9824b',
  magnet: '#cfd6de',
  steel: '#8d96a3',
  darkSteel: '#3a414c',
  rubber: '#16181c',
  rim: '#a9b1bc',
  hvOrange: '#ff7a1a',
  pcb: '#1f6b3a',
  gold: '#d4a84a',
  sic: '#23262d',
  capacitor: '#2c3e63',
  cell: '#39414f',
  benchTop: '#2a2f3a',
  benchEdge: '#3a4150',
  benchLeg: '#1b1f28',
  room: '#10131c',
  roomFloor: '#0c0e15',
  lightStrip: '#cfe4ff',
  brass: '#c9a45c',
  ledBg: '#140c02',
  dynoFrame: '#2b313d',
  roller: '#7f8894',
  flywheel: '#4b525e',
  indexMark: '#e0332f',
  screenBg: '#070a12',
  plant: '#3f8a4f',
  pot: '#8a5a3c',
  coolant: '#48d1a8',
  toolRed: '#c2412d',
} as const;
