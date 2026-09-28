/** Helpers for CanvasTexture-based props (ruler, plate, LED display, screens). */
import { CanvasTexture, SRGBColorSpace } from 'three';

export interface CanvasTex {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: CanvasTexture;
}

export function createCanvasTexture(width: number, height: number, srgb = true): CanvasTex {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const texture = new CanvasTexture(canvas);
  if (srgb) texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, ctx, texture };
}

export const MONO_FONT = '"JetBrains Mono", ui-monospace, monospace';
export const UI_FONT = 'Inter, system-ui, sans-serif';
