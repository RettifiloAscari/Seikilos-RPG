/**
 * Logical button input, abstracted away from physical keys.
 *
 * Game code never asks "is KeyZ down"; it asks "is `confirm` down". That keeps
 * rebinding and gamepad support in one place.
 */

import { BUTTONS, type Button } from './buttons';
import { GamepadReader, pollNavigatorGamepads, type DeviceReport } from './gamepad';

export { BUTTONS, type Button };

/** Physical key -> logical button. Multiple keys may map to one button. */
export const DEFAULT_KEYMAP: Readonly<Record<string, Button>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',

  KeyZ: 'confirm',
  Enter: 'confirm',
  Space: 'confirm',

  KeyX: 'cancel',
  Escape: 'cancel',
  Backspace: 'cancel',

  KeyC: 'menu',
  Tab: 'menu',

  ShiftLeft: 'run',
  ShiftRight: 'run',

  KeyP: 'start',
};

const REPEAT_DELAY = 0.26;
const REPEAT_INTERVAL = 0.07;

export class Input {
  private keymap: Record<string, Button> = { ...DEFAULT_KEYMAP };
  private held = new Set<Button>();
  /** Buttons currently held via gamepad, recomputed every tick. */
  private pad = new Set<Button>();
  private padPrev = new Set<Button>();

  /**
   * Presses and releases are buffered as they arrive from the DOM rather than
   * sampled once per tick. A key tapped and released inside a single 1/60s
   * frame would otherwise never be seen as held, and the input would vanish.
   */
  private pressBuffer = new Set<Button>();
  private releaseBuffer = new Set<Button>();
  private pressedNow = new Set<Button>();
  private releasedNow = new Set<Button>();

  private repeated = new Set<Button>();
  private repeatTimer = new Map<Button, number>();
  private detached: (() => void) | null = null;

  /** Owns which controllers are trusted and how their axes are read. */
  readonly gamepads = new GamepadReader();
  /** Last poll's per-device report, for the input diagnostics screen. */
  private deviceReports: DeviceReport[] = [];

  attach(target: HTMLElement | Window = window): void {
    const onKeyDown = (e: Event) => {
      const ev = e as KeyboardEvent;
      if (ev.repeat) return;
      const button = this.keymap[ev.code];
      if (!button) return;
      // Stop arrows/space/tab from scrolling or moving focus.
      ev.preventDefault();
      this.held.add(button);
      this.pressBuffer.add(button);
    };
    const onKeyUp = (e: Event) => {
      const ev = e as KeyboardEvent;
      const button = this.keymap[ev.code];
      if (!button) return;
      ev.preventDefault();
      this.held.delete(button);
      this.releaseBuffer.add(button);
    };
    // If the window loses focus we never get the keyup, so clear everything.
    const onBlur = () => this.held.clear();

    // Re-plugging a controller should recalibrate it from scratch rather than
    // inherit whatever the previous device at that index was doing.
    const onGamepadChange = (e: Event) => {
      const index = (e as GamepadEvent).gamepad?.index;
      this.gamepads.forget(index);
      this.pad.clear();
      this.padPrev.clear();
    };

    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('gamepadconnected', onGamepadChange);
    window.addEventListener('gamepaddisconnected', onGamepadChange);

    this.detached = () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('gamepadconnected', onGamepadChange);
      window.removeEventListener('gamepaddisconnected', onGamepadChange);
    };
  }

  /** Turn controller input off entirely. Keyboard is unaffected. */
  setGamepadEnabled(enabled: boolean): void {
    this.gamepads.enabled = enabled;
    this.pad.clear();
    this.padPrev.clear();
  }

  get gamepadEnabled(): boolean {
    return this.gamepads.enabled;
  }

  /** Every device seen on the last poll, accepted or not. */
  deviceDiagnostics(): readonly DeviceReport[] {
    return this.deviceReports;
  }

  detach(): void {
    this.detached?.();
    this.detached = null;
  }

  setKeymap(map: Record<string, Button>): void {
    this.keymap = { ...map };
  }

  /**
   * Called once at the start of every logic tick, before scenes update.
   * Computes edge-triggered state and key-repeat for menus.
   */
  tick(dt: number): void {
    this.pollGamepad();

    // Hand the buffered edges to this tick and start collecting the next lot.
    this.pressedNow = this.pressBuffer;
    this.releasedNow = this.releaseBuffer;
    this.pressBuffer = new Set<Button>();
    this.releaseBuffer = new Set<Button>();

    this.repeated.clear();
    for (const button of BUTTONS) {
      if (this.pressedNow.has(button)) {
        // Fresh press fires immediately, then waits out the initial delay.
        this.repeated.add(button);
        this.repeatTimer.set(button, REPEAT_DELAY);
        continue;
      }
      if (!this.isDown(button)) {
        this.repeatTimer.delete(button);
        continue;
      }
      const remaining = (this.repeatTimer.get(button) ?? REPEAT_DELAY) - dt;
      if (remaining <= 0) {
        this.repeated.add(button);
        this.repeatTimer.set(button, REPEAT_INTERVAL);
      } else {
        this.repeatTimer.set(button, remaining);
      }
    }
  }

  /** Called once at the end of every logic tick. */
  endTick(): void {
    this.pressedNow.clear();
    this.releasedNow.clear();
  }

  /** Held right now. */
  down(button: Button): boolean {
    return this.isDown(button);
  }

  /** Went down this tick. */
  pressed(button: Button): boolean {
    return this.pressedNow.has(button);
  }

  /** Came up this tick. */
  released(button: Button): boolean {
    return this.releasedNow.has(button);
  }

  /** Pressed this tick, or auto-repeating from being held. For menus. */
  repeat(button: Button): boolean {
    return this.repeated.has(button);
  }

  /** -1, 0 or 1 on each axis, from the d-pad/keys. */
  axis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.isDown('left')) x -= 1;
    if (this.isDown('right')) x += 1;
    if (this.isDown('up')) y -= 1;
    if (this.isDown('down')) y += 1;
    return { x, y };
  }

  /** Clears all state. Use when a scene transition should swallow input. */
  clear(): void {
    this.held.clear();
    this.pad.clear();
    this.padPrev.clear();
    this.pressBuffer.clear();
    this.releaseBuffer.clear();
    this.pressedNow.clear();
    this.releasedNow.clear();
    this.repeated.clear();
    this.repeatTimer.clear();
  }

  private isDown(button: Button): boolean {
    return this.held.has(button) || this.pad.has(button);
  }

  private pollGamepad(): void {
    const { buttons, devices } = this.gamepads.read(pollNavigatorGamepads());
    this.pad = buttons;
    this.deviceReports = devices;

    // The pad is polled, not event-driven, so derive its edges here and feed
    // them into the same buffers the keyboard uses.
    for (const button of this.pad) {
      if (!this.padPrev.has(button)) this.pressBuffer.add(button);
    }
    for (const button of this.padPrev) {
      if (!this.pad.has(button)) this.releaseBuffer.add(button);
    }
    this.padPrev = new Set(this.pad);
  }
}
