import type { Renderer } from '../render/renderer';

export type FadeState = 'idle' | 'out' | 'held' | 'in';

/**
 * Screen fade used for map changes and battle transitions.
 *
 * Call `fadeOut` with a callback; the callback runs at full black, then the
 * fade comes back in. That keeps "change the world, then reveal it" in one
 * place instead of scattered timers.
 */
export class Fader {
  private state: FadeState = 'idle';
  private progress = 0;
  private speed = 2.6;
  private onBlack: (() => void) | null = null;
  color = '#000000';

  get busy(): boolean {
    return this.state !== 'idle';
  }

  /** Current opacity, 0..1. */
  get alpha(): number {
    return this.progress;
  }

  fadeOut(onBlack: () => void, speed = 2.6): void {
    if (this.state !== 'idle') return;
    this.state = 'out';
    this.speed = speed;
    this.onBlack = onBlack;
  }

  /** Start fully black and fade in, e.g. when a scene first appears. */
  startBlack(speed = 2.6): void {
    this.state = 'in';
    this.progress = 1;
    this.speed = speed;
    this.onBlack = null;
  }

  update(dt: number): void {
    switch (this.state) {
      case 'out':
        this.progress += this.speed * dt;
        if (this.progress >= 1) {
          this.progress = 1;
          this.state = 'held';
        }
        return;
      case 'held':
        this.onBlack?.();
        this.onBlack = null;
        this.state = 'in';
        return;
      case 'in':
        this.progress -= this.speed * dt;
        if (this.progress <= 0) {
          this.progress = 0;
          this.state = 'idle';
        }
        return;
      case 'idle':
        return;
    }
  }

  render(r: Renderer): void {
    if (this.progress > 0) r.overlay(this.color, this.progress);
  }
}
