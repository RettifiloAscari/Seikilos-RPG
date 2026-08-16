import type { Button } from './buttons';

/**
 * Reading game controllers safely.
 *
 * The Gamepad API hands you every HID device the browser decided looks like a
 * game controller, which in practice includes flight sticks, throttle
 * quadrants, rudder pedals, racing wheels and button boxes. Those are not
 * gamepads, and treating them like one produces input that is not merely wrong
 * but *stuck*:
 *
 *  - A throttle axis rests at -1.0, not 0. Read as a thumbstick, that is a
 *    direction held down forever — the player walks into a wall until they
 *    unplug the hardware.
 *  - Button indices only mean "A", "B", "d-pad up" when `mapping` is
 *    `'standard'`. On anything else index 12 is whatever the manufacturer
 *    wired twelfth, so ordinary button presses fire menu commands.
 *
 * So this layer is deliberately opt-in: a device has to look like a real
 * gamepad before any of its input is believed, and even then an axis that sits
 * outside the deadzone from the moment it appears is treated as stuck until it
 * proves otherwise by moving.
 */

/** The parts of a `Gamepad` this module reads. Narrowed so tests can fake it. */
export interface GamepadSnapshot {
  index: number;
  id: string;
  /** `'standard'` means the button/axis indices below follow the spec layout. */
  mapping: string;
  connected: boolean;
  axes: readonly number[];
  buttons: readonly { pressed: boolean }[];
}

export type RejectReason =
  | 'gamepad-input-disabled'
  | 'disconnected'
  | 'not-a-standard-gamepad'
  | 'too-few-controls';

export interface DeviceReport {
  index: number;
  id: string;
  mapping: string;
  accepted: boolean;
  reason?: RejectReason;
  /** Live axis values, for the diagnostics overlay. */
  axes: number[];
  /** Indices of currently pressed buttons. */
  pressed: number[];
  /** Axes currently being ignored because they have never moved. */
  stuckAxes: number[];
}

export interface GamepadReadResult {
  buttons: Set<Button>;
  devices: DeviceReport[];
}

/**
 * Standard-mapping button index -> logical button.
 * Only ever applied to devices reporting `mapping === 'standard'`.
 */
export const STANDARD_BUTTON_MAP: Readonly<Record<number, Button>> = {
  0: 'confirm', // A / cross
  1: 'cancel', // B / circle
  2: 'menu', // X / square
  3: 'run', // Y / triangle
  8: 'cancel', // select / back
  9: 'start',
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right',
};

/** A standard gamepad has 4 axes and 17 buttons; allow a little slack. */
const MIN_STANDARD_AXES = 4;
const MIN_STANDARD_BUTTONS = 16;

/** Radial deadzone for the left stick. Generous: this is a d-pad substitute. */
export const DEFAULT_DEADZONE = 0.5;

/** How far an axis must travel from its first reading to count as "moved". */
const MOVEMENT_EPSILON = 0.15;

/**
 * Reads to wait before deciding a standard device's pinned axis is stuck
 * rather than held. About 1.5s at 60Hz.
 *
 * Standard mapping is a contract that axis 0/1 are the left stick centred at
 * zero, so a device honouring it gets the benefit of the doubt: a player
 * holding the stick as the page loads keeps working. A device we have no
 * contract with gets no grace at all — its resting position is unknowable, and
 * guessing wrong is what made the player walk into a wall.
 */
const STUCK_AFTER_READS = 90;

interface AxisMemory {
  first: number[];
  moved: boolean[];
  /** Whether every reading so far has been bit-identical to the first. */
  constant: boolean[];
  reads: number;
}

export interface GamepadReaderOptions {
  enabled?: boolean;
  deadzone?: number;
  /**
   * Accept devices that do not report standard mapping. Off by default, and
   * the only reason to turn it on is to debug a specific controller.
   */
  allowNonStandard?: boolean;
}

export class GamepadReader {
  enabled: boolean;
  deadzone: number;
  allowNonStandard: boolean;

  /** Per-device axis history, keyed by gamepad index. */
  private memory = new Map<number, AxisMemory>();

  constructor(options: GamepadReaderOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.deadzone = options.deadzone ?? DEFAULT_DEADZONE;
    this.allowNonStandard = options.allowNonStandard ?? false;
  }

  /** Forget calibration for one device, or all of them. */
  forget(index?: number): void {
    if (index === undefined) this.memory.clear();
    else this.memory.delete(index);
  }

  read(snapshots: readonly (GamepadSnapshot | null)[]): GamepadReadResult {
    const buttons = new Set<Button>();
    const devices: DeviceReport[] = [];

    for (const pad of snapshots) {
      if (!pad) continue;

      const axes = [...pad.axes];
      const pressed = pad.buttons.flatMap((button, index) => (button.pressed ? [index] : []));
      const report: DeviceReport = {
        index: pad.index,
        id: pad.id,
        mapping: pad.mapping || '(none)',
        accepted: false,
        axes,
        pressed,
        stuckAxes: [],
      };

      const reason = this.rejectionFor(pad);
      if (reason) {
        report.reason = reason;
        devices.push(report);
        // A rejected device keeps no calibration state.
        this.memory.delete(pad.index);
        continue;
      }

      report.accepted = true;
      report.stuckAxes = this.updateAxisMemory(pad);

      this.readButtons(pad, buttons);
      this.readStick(pad, report.stuckAxes, buttons);

      devices.push(report);
    }

    // Devices that went away should not keep stale calibration.
    const live = new Set(snapshots.filter((pad): pad is GamepadSnapshot => pad !== null).map((pad) => pad.index));
    for (const index of [...this.memory.keys()]) {
      if (!live.has(index)) this.memory.delete(index);
    }

    return { buttons, devices };
  }

  private rejectionFor(pad: GamepadSnapshot): RejectReason | undefined {
    if (!this.enabled) return 'gamepad-input-disabled';
    if (pad.connected === false) return 'disconnected';

    if (!this.allowNonStandard && pad.mapping !== 'standard') return 'not-a-standard-gamepad';

    // A device claiming standard mapping but missing half the controls is not
    // one; believing it would put us right back to reading a throttle as a
    // thumbstick.
    if (pad.axes.length < MIN_STANDARD_AXES || pad.buttons.length < MIN_STANDARD_BUTTONS) {
      return 'too-few-controls';
    }
    return undefined;
  }

  /**
   * Decide which axes are parked hardware rather than player input.
   *
   * Two signals have to agree before an axis is disbelieved:
   *
   *  1. It has never travelled meaningfully from where it started.
   *  2. Every single reading has been *bit-identical* to the first.
   *
   * The second is what separates a throttle at rest from a stick being held.
   * A human holding an analogue stick jitters by at least a bit or two over a
   * second; a parked axis reports the same float forever. This matters because
   * browsers often only reveal a gamepad at the moment it is first used, so
   * "deflected on the very first reading" is a completely normal thing for a
   * real stick to be.
   *
   * Once an axis moves it is trusted permanently, so a wrong guess costs the
   * player only the time until they let go.
   *
   * @returns the axis indices currently considered stuck
   */
  private updateAxisMemory(pad: GamepadSnapshot): number[] {
    let memory = this.memory.get(pad.index);
    if (!memory) {
      memory = {
        first: [...pad.axes],
        moved: pad.axes.map(() => false),
        constant: pad.axes.map(() => true),
        reads: 0,
      };
      this.memory.set(pad.index, memory);
    }
    memory.reads += 1;

    // A device whose axis semantics we do not know gets no benefit of the
    // doubt: its resting position is unknowable, so it is suspect immediately.
    const grace = pad.mapping === 'standard' ? STUCK_AFTER_READS : 0;
    const stuck: number[] = [];

    pad.axes.forEach((value, axis) => {
      const first = memory.first[axis] ?? 0;

      if (value !== first) memory.constant[axis] = false;
      if (!memory.moved[axis] && Math.abs(value - first) > MOVEMENT_EPSILON) {
        memory.moved[axis] = true;
      }

      if (memory.moved[axis]) return;
      if (Math.abs(first) <= this.deadzone) return;
      if (grace > 0 && !memory.constant[axis]) return;
      if (memory.reads > grace) stuck.push(axis);
    });
    return stuck;
  }

  private readButtons(pad: GamepadSnapshot, out: Set<Button>): void {
    pad.buttons.forEach((button, index) => {
      if (!button.pressed) return;
      const mapped = STANDARD_BUTTON_MAP[index];
      if (mapped) out.add(mapped);
    });
  }

  /**
   * Left stick as a d-pad, using a radial deadzone.
   *
   * Radial rather than per-axis: with independent thresholds a stick pushed
   * diagonally registers before one pushed straight, and small drift on both
   * axes can register as a diagonal while neither axis alone would count.
   */
  private readStick(pad: GamepadSnapshot, stuckAxes: number[], out: Set<Button>): void {
    if (stuckAxes.includes(0) || stuckAxes.includes(1)) return;

    const x = pad.axes[0] ?? 0;
    const y = pad.axes[1] ?? 0;
    if (Math.hypot(x, y) < this.deadzone) return;

    // Only commit to an axis that carries a real share of the deflection, so a
    // straight push does not also register the perpendicular direction.
    const threshold = this.deadzone * 0.5;
    if (x <= -threshold) out.add('left');
    if (x >= threshold) out.add('right');
    if (y <= -threshold) out.add('up');
    if (y >= threshold) out.add('down');
  }
}

/** Read the browser's gamepad list into plain snapshots. */
export function pollNavigatorGamepads(): (GamepadSnapshot | null)[] {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return [];

  return [...navigator.getGamepads()].map((pad) =>
    pad
      ? {
          index: pad.index,
          id: pad.id,
          mapping: pad.mapping,
          connected: pad.connected,
          axes: pad.axes,
          buttons: pad.buttons.map((button) => ({ pressed: button.pressed })),
        }
      : null,
  );
}

/** Human-readable explanation for the diagnostics overlay. */
export function explainRejection(reason: RejectReason): string {
  switch (reason) {
    case 'gamepad-input-disabled':
      return 'gamepad input is turned off';
    case 'disconnected':
      return 'disconnected';
    case 'not-a-standard-gamepad':
      return 'not a standard gamepad';
    case 'too-few-controls':
      return 'standard mapping, but too few controls';
  }
}
