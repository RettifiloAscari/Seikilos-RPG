import { describe, expect, it } from 'vitest';
import { GamepadReader, type GamepadSnapshot } from './gamepad';

/**
 * These exist because of a real bug report: with a HOTAS (flight stick plus
 * throttle) plugged in, the player character ran up-and-left continuously and
 * unrelated button presses triggered menu commands.
 *
 * Both came from treating every device the Gamepad API reports as a gamepad.
 * The cases below encode that hardware's shape so the behaviour cannot come
 * back unnoticed.
 */

function pad(overrides: Partial<GamepadSnapshot> = {}): GamepadSnapshot {
  return {
    index: 0,
    id: 'Test Device',
    mapping: 'standard',
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
    ...overrides,
  };
}

/** An Xbox-style controller: what the button and axis indices actually mean. */
function standardPad(overrides: Partial<GamepadSnapshot> = {}): GamepadSnapshot {
  return pad({ id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', ...overrides });
}

/**
 * A flight stick. Non-standard mapping, lots of buttons, and — the crux —
 * a throttle axis that idles at -1.0 rather than 0.
 */
function flightStick(overrides: Partial<GamepadSnapshot> = {}): GamepadSnapshot {
  return pad({
    index: 1,
    id: 'T.16000M FCS (Vendor: 044f Product: b10a)',
    mapping: '',
    axes: [-1, -1, 0, -1, 0, 0, 0, 0],
    buttons: Array.from({ length: 24 }, () => ({ pressed: false })),
    ...overrides,
  });
}

function press(snapshot: GamepadSnapshot, ...indices: number[]): GamepadSnapshot {
  const buttons = snapshot.buttons.map((button, index) => ({
    pressed: button.pressed || indices.includes(index),
  }));
  return { ...snapshot, buttons };
}

describe('a HOTAS must not drive the game', () => {
  it('does not walk the player anywhere when a flight stick idles at -1', () => {
    const reader = new GamepadReader();
    const { buttons } = reader.read([flightStick()]);

    expect([...buttons]).toEqual([]);
  });

  it('reports why the device was ignored rather than silently dropping it', () => {
    const reader = new GamepadReader();
    const { devices } = reader.read([flightStick()]);

    expect(devices).toHaveLength(1);
    expect(devices[0]!.accepted).toBe(false);
    expect(devices[0]!.reason).toBe('not-a-standard-gamepad');
    expect(devices[0]!.id).toContain('T.16000M');
  });

  it('ignores its buttons, which do not mean what standard indices mean', () => {
    const reader = new GamepadReader();
    // 12-15 are the d-pad on a real gamepad; on a stick they are thumb buttons.
    const { buttons } = reader.read([press(flightStick(), 0, 1, 12, 13, 14, 15)]);

    expect([...buttons]).toEqual([]);
  });

  it('keeps working with a real gamepad while a HOTAS is also plugged in', () => {
    const reader = new GamepadReader();
    const { buttons, devices } = reader.read([
      press(standardPad(), 0), // A pressed
      flightStick(),
      // Rudder pedals: a second non-standard device, also resting off-centre.
      pad({ index: 2, id: 'Rudder Pedals', mapping: '', axes: [-1, 1], buttons: [] }),
    ]);

    expect(buttons.has('confirm')).toBe(true);
    expect(buttons.has('up')).toBe(false);
    expect(buttons.has('left')).toBe(false);
    expect(devices.filter((device) => device.accepted)).toHaveLength(1);
  });

  it('ignores a device that claims standard mapping but has too few controls', () => {
    const reader = new GamepadReader();
    const { buttons, devices } = reader.read([
      pad({ id: 'Button Box', mapping: 'standard', axes: [-1, -1], buttons: [{ pressed: true }] }),
    ]);

    expect([...buttons]).toEqual([]);
    expect(devices[0]!.reason).toBe('too-few-controls');
  });
});

describe('stuck axes', () => {
  /** Long enough to outlast the grace period a standard device is given. */
  function readRepeatedly(reader: GamepadReader, snapshot: GamepadSnapshot, times = 120) {
    let last = reader.read([snapshot]);
    for (let i = 1; i < times; i++) last = reader.read([snapshot]);
    return last;
  }

  /**
   * Defence in depth: a device can report standard mapping and still have an
   * axis pinned at rest. Holding a stick is indistinguishable from a parked
   * throttle in a single frame, so the difference is time — nobody holds a
   * direction perfectly still from the instant the page loads and never once
   * moves it.
   */
  it('eventually ignores a standard device axis that never moves', () => {
    const reader = new GamepadReader();
    const pinned = standardPad({ axes: [-1, -1, 0, 0] });

    // Believed at first: this is what a player holding up-left looks like.
    expect(reader.read([pinned]).buttons.has('up')).toBe(true);

    const settled = readRepeatedly(reader, pinned);
    expect([...settled.buttons]).toEqual([]);
    expect(settled.devices[0]!.stuckAxes).toEqual([0, 1]);
  });

  it('gives a non-standard device no grace at all', () => {
    const reader = new GamepadReader({ allowNonStandard: true });
    const { buttons, devices } = reader.read([flightStick()]);

    expect([...buttons]).toEqual([]);
    expect(devices[0]!.stuckAxes).toContain(0);
  });

  it('starts trusting an axis once it actually moves', () => {
    const reader = new GamepadReader();

    readRepeatedly(reader, standardPad({ axes: [-1, -1, 0, 0] }));
    // Player lets go: axes return to centre, proving they are real.
    reader.read([standardPad({ axes: [0, 0, 0, 0] })]);
    const { buttons } = reader.read([standardPad({ axes: [-1, 0, 0, 0] })]);

    expect(buttons.has('left')).toBe(true);
  });

  it('forgets calibration when a device is unplugged', () => {
    const reader = new GamepadReader();
    readRepeatedly(reader, standardPad({ axes: [-1, -1, 0, 0] }));
    reader.read([]); // unplugged

    // Replugged: the grace period starts over rather than staying stuck.
    expect(reader.read([standardPad({ axes: [0, -1, 0, 0] })]).buttons.has('up')).toBe(true);
  });
});

describe('a standard gamepad still works', () => {
  it('maps face buttons and the d-pad', () => {
    const reader = new GamepadReader();

    expect(reader.read([press(standardPad(), 0)]).buttons.has('confirm')).toBe(true);
    expect(reader.read([press(standardPad(), 1)]).buttons.has('cancel')).toBe(true);
    expect(reader.read([press(standardPad(), 2)]).buttons.has('menu')).toBe(true);
    expect(reader.read([press(standardPad(), 3)]).buttons.has('run')).toBe(true);
    expect(reader.read([press(standardPad(), 9)]).buttons.has('start')).toBe(true);
    expect(reader.read([press(standardPad(), 12)]).buttons.has('up')).toBe(true);
    expect(reader.read([press(standardPad(), 15)]).buttons.has('right')).toBe(true);
  });

  it('reads the left stick as a direction', () => {
    const reader = new GamepadReader();

    expect(reader.read([standardPad({ axes: [0, -1, 0, 0] })]).buttons.has('up')).toBe(true);
    expect(reader.read([standardPad({ axes: [1, 0, 0, 0] })]).buttons.has('right')).toBe(true);
  });

  it('reads diagonals', () => {
    const reader = new GamepadReader();
    const { buttons } = reader.read([standardPad({ axes: [0.8, 0.8, 0, 0] })]);

    expect(buttons.has('right')).toBe(true);
    expect(buttons.has('down')).toBe(true);
  });

  /** Small drift must not creep the player across the map while idle. */
  it('ignores stick drift inside the deadzone', () => {
    const reader = new GamepadReader();
    const { buttons } = reader.read([standardPad({ axes: [0.18, -0.12, 0, 0] })]);

    expect([...buttons]).toEqual([]);
  });

  it('does not register a perpendicular direction on a straight push', () => {
    const reader = new GamepadReader();
    // Pushed hard right with a little vertical slop.
    const { buttons } = reader.read([standardPad({ axes: [1, 0.2, 0, 0] })]);

    expect(buttons.has('right')).toBe(true);
    expect(buttons.has('down')).toBe(false);
    expect(buttons.has('up')).toBe(false);
  });

  it('ignores a disconnected entry', () => {
    const reader = new GamepadReader();
    const { buttons, devices } = reader.read([press(standardPad({ connected: false }), 0)]);

    expect([...buttons]).toEqual([]);
    expect(devices[0]!.reason).toBe('disconnected');
  });
});

describe('the escape hatches', () => {
  it('produces nothing at all when gamepad input is disabled', () => {
    const reader = new GamepadReader({ enabled: false });
    const { buttons, devices } = reader.read([press(standardPad(), 0)]);

    expect([...buttons]).toEqual([]);
    expect(devices[0]!.reason).toBe('gamepad-input-disabled');
  });

  it('can be told to trust non-standard devices, for debugging one', () => {
    const reader = new GamepadReader({ allowNonStandard: true });
    const { devices } = reader.read([press(flightStick(), 0)]);

    expect(devices[0]!.accepted).toBe(true);
  });

  it('still guards a trusted non-standard device against its resting axes', () => {
    const reader = new GamepadReader({ allowNonStandard: true });
    const { buttons } = reader.read([flightStick()]);

    // Accepted, but the throttle at -1 is immediately recognised as at rest.
    expect(buttons.has('left')).toBe(false);
    expect(buttons.has('up')).toBe(false);
  });

  it('handles an empty list and null entries without throwing', () => {
    const reader = new GamepadReader();
    expect(() => reader.read([])).not.toThrow();
    expect([...reader.read([null, null]).buttons]).toEqual([]);
  });
});
