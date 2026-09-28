/**
 * Units (TECH_SPEC §5). The drive unit, wheels, dyno and battery are built in full-scale metres
 * inside a rig group scaled by MODEL_SCALE (1 : 3). This is the only place that converts.
 */
import { MODEL_SCALE } from '@/config/motor';

export function toModel(fullScaleM: number): number {
  return fullScaleM * MODEL_SCALE;
}

export function toFullScale(modelM: number): number {
  return modelM / MODEL_SCALE;
}

/** Model length in centimetres (the bench ruler shows real cm on the bench). */
export function modelCm(fullScaleM: number): number {
  return toModel(fullScaleM) * 100;
}
