/**
 * Regression check for the HOTAS drift bug, run in a real browser.
 *
 * A bug report said that with a flight stick and throttle plugged in, the
 * player character walked up-and-left continuously without any input. The
 * cause was reading every HID device the Gamepad API reports as if it were a
 * gamepad: a throttle idles at -1.0 on its axis, which looks exactly like a
 * thumbstick held hard over.
 *
 * Unit tests cover the reader in isolation (src/core/gamepad.test.ts). This
 * covers the whole path — browser, poll loop, input buffers, movement — by
 * faking `navigator.getGamepads` before the game boots.
 *
 *   npm run dev            # in one terminal
 *   npm run check:gamepad  # in another
 *
 * Needs the dev server specifically, because it reads the player's position
 * through the dev console helpers.
 */

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';
/** How long to sit still and watch for drift. */
const IDLE_MS = 2000;
/** Movement below this is sub-pixel noise, not drift. */
const TOLERANCE_PX = 0.5;

function findChromium() {
  return [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium'].find((p) => p && existsSync(p));
}

/**
 * Installs a fake gamepad list before any page script runs.
 * Shapes mirror what these devices really report.
 */
function fakeGamepads(kind) {
  const devices = {
    // Flight stick + throttle. Non-standard mapping, and axes 0/1/3 park at
    // -1.0 — the throttle and rudder at rest.
    hotas: [
      {
        index: 0,
        id: 'T.16000M FCS (Vendor: 044f Product: b10a)',
        mapping: '',
        connected: true,
        axes: [-1, -1, 0, -1, 0, 0],
        buttons: Array.from({ length: 24 }, () => ({ pressed: false, value: 0 })),
      },
      {
        index: 1,
        id: 'Rudder Pedals (Vendor: 044f Product: b679)',
        mapping: '',
        connected: true,
        axes: [-1, 1, -1],
        buttons: [],
      },
    ],
    // A real controller, resting. The test pushes its stick partway through,
    // which is what a player actually does and proves this harness can detect
    // gamepad-driven movement at all.
    gamepad: [
      {
        index: 0,
        id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)',
        mapping: 'standard',
        connected: true,
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
      },
    ],
  };

  return devices[kind];
}

/**
 * Boots the game with a faked gamepad list, runs `duringIdle` (if given) and
 * measures how far the player moved while nobody touched the keyboard.
 */
async function measureDrift(browser, kind, duringIdle) {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });

  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // Installed before any page script, and mutable so a test can "push" a stick
  // mid-run rather than starting deflected.
  await page.addInitScript((pads) => {
    window.__fakePads = pads;
    window.__setAxis = (device, axis, value) => {
      window.__fakePads[device].axes[axis] = value;
    };
    navigator.getGamepads = () => window.__fakePads;
  }, fakeGamepads(kind));

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // Title -> new game.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);

  if (duringIdle) await duringIdle(page);

  const read = () =>
    page.evaluate(() => ({ x: window.game.state.playerX, y: window.game.state.playerY }));

  const before = await read();
  await page.waitForTimeout(IDLE_MS);
  const after = await read();

  const devices = await page.evaluate(() =>
    window.game.input.deviceDiagnostics().map((d) => ({
      id: d.id,
      accepted: d.accepted,
      reason: d.reason ?? null,
      stuckAxes: d.stuckAxes,
    })),
  );

  await page.close();
  return { dx: after.x - before.x, dy: after.y - before.y, devices, errors };
}

const browser = await chromium.launch({ executablePath: findChromium() });
let failed = false;

// 1. The bug: a HOTAS must not move the player at all.
console.log('HOTAS plugged in, no input:');
const hotas = await measureDrift(browser, 'hotas');
for (const device of hotas.devices) {
  console.log(`  ${device.accepted ? 'USED   ' : 'IGNORED'} ${device.id} ${device.reason ?? ''}`);
}
console.log(`  drift over ${IDLE_MS}ms: dx=${hotas.dx.toFixed(2)} dy=${hotas.dy.toFixed(2)}`);

if (Math.abs(hotas.dx) > TOLERANCE_PX || Math.abs(hotas.dy) > TOLERANCE_PX) {
  console.error('  FAIL: the player drifted with only a flight stick connected');
  failed = true;
} else if (hotas.devices.some((device) => device.accepted)) {
  console.error('  FAIL: a non-standard device was accepted as a gamepad');
  failed = true;
} else {
  console.log('  ok: stationary, both devices ignored');
}

// 2. The control: a real gamepad still moves the player. Without this, the
//    check above would also pass if gamepads were broken entirely.
console.log('\nStandard gamepad, stick pushed left:');
const stick = await measureDrift(browser, 'gamepad', async (page) => {
  await page.evaluate(() => window.__setAxis(0, 0, -1));
  await page.waitForTimeout(120);
});
console.log(`  movement over ${IDLE_MS}ms: dx=${stick.dx.toFixed(2)} dy=${stick.dy.toFixed(2)}`);

if (stick.dx >= -TOLERANCE_PX) {
  console.error('  FAIL: a standard gamepad no longer moves the player');
  failed = true;
} else {
  console.log('  ok: moved left, so this harness can detect movement');
}

// 3. Holding a direction has to keep working well past the stuck-axis grace
//    period. Real analogue sticks jitter; the guard keys off that.
console.log('\nStandard gamepad, stick held left for several seconds:');
const held = await measureDrift(browser, 'gamepad', async (page) => {
  await page.evaluate(() => {
    // Deflected with the faint jitter a real potentiometer produces.
    let tick = 0;
    setInterval(() => {
      tick += 1;
      window.__setAxis(0, 0, -1 + (tick % 3) * 0.001);
    }, 16);
  });
  // Sit well past STUCK_AFTER_READS (90 reads, ~1.5s) before measuring.
  await page.waitForTimeout(2500);
});
console.log(`  movement over ${IDLE_MS}ms: dx=${held.dx.toFixed(2)} dy=${held.dy.toFixed(2)}`);
console.log(`  stuck axes: ${JSON.stringify(held.devices[0]?.stuckAxes ?? [])}`);

if (held.dx >= -TOLERANCE_PX) {
  console.error('  FAIL: holding a direction stopped working after the grace period');
  failed = true;
} else {
  console.log('  ok: still moving');
}

const allErrors = [...hotas.errors, ...stick.errors, ...held.errors];
if (allErrors.length > 0) {
  console.error('\npage errors:');
  for (const error of allErrors) console.error('  !', error);
  failed = true;
}

await browser.close();
console.log(failed ? '\nFAILED' : '\nPASSED');
process.exit(failed ? 1 : 0);
