/**
 * DPR-aware 2D canvas chart (TECH_SPEC §3.6): a plot rectangle with data ranges, grid, mono
 * tick labels and small drawing helpers. The same base draws the UI chart card and the wall
 * screens (scene/environment/scopeScreens.ts), so it takes any canvas.
 */

export interface ChartTheme {
  readonly background: string | null;
  readonly grid: string;
  readonly axis: string;
  readonly tick: string;
  readonly font: string;
  /** space around the plot rectangle, css px */
  readonly pad: {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
  };
  /** default line width multiplier (the wall screens are drawn at texture resolution) */
  readonly lineScale: number;
}

export const UI_THEME: ChartTheme = {
  background: null,
  grid: 'rgba(255,255,255,0.06)',
  axis: 'rgba(255,255,255,0.18)',
  tick: '#7a8196',
  font: '9px "JetBrains Mono", ui-monospace, monospace',
  pad: { left: 30, right: 8, top: 14, bottom: 20 },
  lineScale: 1,
};

/** Wall screens: drawn at texture resolution (768 × 450 at dpr 1), opaque background. */
export const SCREEN_THEME: ChartTheme = {
  background: '#070a12',
  grid: 'rgba(120,140,180,0.16)',
  axis: 'rgba(160,180,220,0.35)',
  tick: '#8b93a7',
  font: '500 18px "JetBrains Mono", ui-monospace, monospace',
  pad: { left: 70, right: 24, top: 40, bottom: 40 },
  lineScale: 2.4,
};

export interface Range {
  readonly min: number;
  readonly max: number;
}

export interface Axes {
  readonly x: Range;
  readonly y: Range;
  readonly xTicks: readonly number[];
  readonly yTicks: readonly number[];
  readonly xFormat: (v: number) => string;
  readonly yFormat: (v: number) => string;
  readonly xTitle: string;
  readonly yTitle: string;
}

export interface LineStyle {
  readonly color: string;
  readonly width?: number;
  readonly dash?: readonly number[];
  readonly alpha?: number;
}

export interface ChartCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** css-pixel size */
  readonly width: number;
  readonly height: number;
  readonly theme: ChartTheme;
  /** plot rectangle in css px */
  readonly plot: { readonly l: number; readonly r: number; readonly t: number; readonly b: number };
  resize(width: number, height: number, dpr: number): void;
  /** clear, set the axes and draw grid, ticks and titles */
  begin(axes: Axes): void;
  X(v: number): number;
  Y(v: number): number;
  /** run `draw` clipped to the plot rectangle */
  clipped(draw: () => void): void;
  polyline(xs: ArrayLike<number>, ys: ArrayLike<number>, style: LineStyle): void;
  /** vertical band between data x0 and x1, optional caption along its bottom */
  band(x0: number, x1: number, fill: string, caption?: string, captionColor?: string): void;
  /** horizontal band between data y0 and y1 */
  hband(y0: number, y1: number, fill: string): void;
  dot(x: number, y: number, color: string, radius?: number, alpha?: number): void;
  ring(x: number, y: number, radius: number, color: string, alpha: number, width?: number): void;
  label(text: string, x: number, y: number, color: string, align?: CanvasTextAlign): void;
}

export function createChartCanvas(
  canvas: HTMLCanvasElement,
  theme: ChartTheme = UI_THEME,
): ChartCanvas {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  let width = 0;
  let height = 0;
  let axes: Axes | null = null;
  const plot = { l: 0, r: 0, t: 0, b: 0 };

  const X = (v: number): number => {
    const a = axes as Axes;
    return plot.l + ((v - a.x.min) / (a.x.max - a.x.min)) * (plot.r - plot.l);
  };
  const Y = (v: number): number => {
    const a = axes as Axes;
    return plot.b - ((v - a.y.min) / (a.y.max - a.y.min)) * (plot.b - plot.t);
  };

  return {
    canvas,
    ctx,
    theme,
    plot,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    resize(w, h, dpr) {
      width = w;
      height = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      plot.l = theme.pad.left;
      plot.r = w - theme.pad.right;
      plot.t = theme.pad.top;
      plot.b = h - theme.pad.bottom;
    },
    begin(a) {
      axes = a;
      ctx.clearRect(0, 0, width, height);
      if (theme.background) {
        ctx.fillStyle = theme.background;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.font = theme.font;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeStyle = theme.grid;
      ctx.fillStyle = theme.tick;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      for (const t of a.yTicks) {
        const y = Math.round(Y(t)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(plot.l, y);
        ctx.lineTo(plot.r, y);
        ctx.stroke();
        ctx.fillText(a.yFormat(t), plot.l - 4, y);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const t of a.xTicks) {
        const x = Math.round(X(t)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, plot.t);
        ctx.lineTo(x, plot.b);
        ctx.stroke();
        ctx.fillText(a.xFormat(t), x, plot.b + 4);
      }
      ctx.strokeStyle = theme.axis;
      ctx.beginPath();
      ctx.moveTo(plot.l + 0.5, plot.t);
      ctx.lineTo(plot.l + 0.5, plot.b + 0.5);
      ctx.lineTo(plot.r, plot.b + 0.5);
      ctx.stroke();
      // titles: y in the top-left corner, x in the top-right corner (the tick row is full)
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(a.yTitle, 2, 1);
      ctx.textAlign = 'right';
      ctx.fillText(a.xTitle, plot.r, 1);
    },
    X,
    Y,
    clipped(draw) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(plot.l, plot.t - 1, plot.r - plot.l, plot.b - plot.t + 2);
      ctx.clip();
      draw();
      ctx.restore();
    },
    polyline(xs, ys, style) {
      const n = Math.min(xs.length, ys.length);
      if (n < 2) return;
      ctx.save();
      ctx.globalAlpha = style.alpha ?? 1;
      ctx.strokeStyle = style.color;
      ctx.lineWidth = (style.width ?? 1.5) * theme.lineScale;
      ctx.lineJoin = 'round';
      ctx.setLineDash(style.dash ? style.dash.map((d) => d * theme.lineScale) : []);
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < n; i++) {
        const x = xs[i] as number;
        const y = ys[i] as number;
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(X(x), Y(y));
        else ctx.moveTo(X(x), Y(y));
        pen = true;
      }
      ctx.stroke();
      ctx.restore();
    },
    band(x0, x1, fill, caption, captionColor) {
      const a = X(x0);
      const b = X(Math.min(x1, (axes as Axes).x.max));
      ctx.fillStyle = fill;
      ctx.fillRect(a, plot.t, b - a, plot.b - plot.t);
      if (caption) {
        ctx.font = theme.font;
        ctx.fillStyle = captionColor ?? theme.tick;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(caption, (a + b) / 2, plot.b - 2);
      }
    },
    hband(y0, y1, fill) {
      const a = Y(y1);
      const b = Y(y0);
      ctx.fillStyle = fill;
      ctx.fillRect(plot.l, a, plot.r - plot.l, b - a);
    },
    dot(x, y, color, radius = 3.5, alpha = 1) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), radius * theme.lineScale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
    ring(x, y, radius, color, alpha, lineWidth = 1.5) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth * theme.lineScale;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(X(x), Y(y), radius * theme.lineScale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },
    label(text, x, y, color, align = 'left') {
      ctx.font = theme.font;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = 'bottom';
      ctx.fillText(text, X(x), Y(y) - 3);
    },
  };
}

/** n evenly spaced samples of [min, max]. */
export function linspace(min: number, max: number, n: number): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = min + ((max - min) * i) / (n - 1);
  return out;
}
