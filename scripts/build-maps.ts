/**
 * Build-time maps (TECH_SPEC §6.5): writes src/physics/maps.generated.json for both motors,
 * then prints the envelope at a few speeds next to the Python reference (reference/vectors.json).
 * Run: npm run maps
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { MAP_GRID, T_REF_C, V_DC_NOM, voltageMaxV, type MotorKind } from '../src/config/motor';
import { buildMotorMap, packMotorMap, type MapsFile } from '../src/physics/maps';

const root = (p: string): string => fileURLToPath(new URL(`../${p}`, import.meta.url));

const vMax = voltageMaxV(V_DC_NOM);
const t0 = performance.now();
const motors = {} as MapsFile['motors'];
for (const kind of ['pm', 'im'] as MotorKind[]) {
  motors[kind] = packMotorMap(buildMotorMap(kind, vMax));
}
const file: MapsFile = { grid: MAP_GRID, vDcNom: V_DC_NOM, vMax, tRefC: T_REF_C, motors };
const json = JSON.stringify(file);
writeFileSync(root('src/physics/maps.generated.json'), json);
const gz = gzipSync(json).length;
console.log(
  `maps.generated.json: ${(json.length / 1024).toFixed(0)} KB, ${(gz / 1024).toFixed(0)} KB gzip, ` +
    `built in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
);

interface RefEnvelopes {
  envelopes: Record<MotorKind, { rpm: number[]; t_max: number[]; t_min: number[] }>;
}
const ref = JSON.parse(readFileSync(root('reference/vectors.json'), 'utf8')) as RefEnvelopes;
let worst = 0;
for (const kind of ['pm', 'im'] as MotorKind[]) {
  const e = ref.envelopes[kind];
  for (let i = 0; i < e.rpm.length; i++) {
    worst = Math.max(
      worst,
      Math.abs((motors[kind].tMax[i] ?? 0) - (e.t_max[i] ?? 0)),
      Math.abs((motors[kind].tMin[i] ?? 0) - (e.t_min[i] ?? 0)),
    );
  }
  const row = [0, 16, 36, 60].map(
    (i) => `${e.rpm[i]} rpm: ${motors[kind].tMax[i]?.toFixed(1)} / py ${e.t_max[i]?.toFixed(1)}`,
  );
  console.log(`${kind} T_max  ${row.join('   ')}`);
}
console.log(`largest envelope difference vs Python: ${worst.toFixed(3)} N·m`);
