/**
 * Frame loop (TECH_SPEC §6.11, §14.4): measures frameDt (clamped to 0.1 s) and pauses while
 * the tab is hidden. The fixed-step sim accumulator lives in physics/sim.ts step().
 */

export interface RafLoop {
  start(): void;
  stop(): void;
}

export function createRafLoop(onFrame: (frameDt: number, now: number) => void): RafLoop {
  let handle = 0;
  let last = -1;
  let running = false;

  const tick = (now: number): void => {
    handle = requestAnimationFrame(tick);
    const dt = last < 0 ? 1 / 60 : Math.min((now - last) / 1000, 0.1);
    last = now;
    onFrame(dt, now / 1000);
  };

  const onVisibility = (): void => {
    if (!running) return;
    if (document.hidden) {
      cancelAnimationFrame(handle);
      handle = 0;
    } else if (!handle) {
      last = -1;
      handle = requestAnimationFrame(tick);
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      document.addEventListener('visibilitychange', onVisibility);
      last = -1;
      handle = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(handle);
      handle = 0;
    },
  };
}
