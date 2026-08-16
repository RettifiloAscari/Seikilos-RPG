/**
 * Browser smoke test.
 *
 * Boots the game in a real browser, plays through title -> field -> menu ->
 * battle, saves a screenshot at each step, and fails if anything logged an
 * error. This is the only check that exercises rendering, input timing and the
 * scene stack together; it has already caught a dropped-input bug and a
 * first-frame crash that unit tests could not see.
 *
 *   npm run dev        # in one terminal
 *   npm run smoke      # in another
 *
 * Screenshots land in `shots/` (gitignored). Look at them — they are the
 * fastest way to spot a UI element that has drifted behind another.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const OUT = process.env.SMOKE_OUT ?? './shots';
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

mkdirSync(OUT, { recursive: true });

/**
 * Prefer an explicitly configured browser, then a pre-provisioned one (some CI
 * images ship Chromium outside Playwright's own cache), then let Playwright
 * resolve whatever `npx playwright install chromium` put in place.
 */
function findChromium() {
  const candidates = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium'];
  return candidates.find((path) => path && existsSync(path));
}

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage({ viewport: { width: 1152, height: 648 } });

const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ${name}`);
};
const key = async (code, times = 1, delay = 140) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(code);
    await wait(delay);
  }
};
const hold = async (code, ms) => {
  await page.keyboard.down(code);
  await wait(ms);
  await page.keyboard.up(code);
  await wait(120);
};

function reportErrors() {
  if (errors.length === 0) return;
  console.error(`\n${errors.length} console error(s):`);
  for (const error of errors.slice(0, 20)) console.error('  !', error);
  process.exit(1);
}

console.log('booting', URL);
await page.goto(URL, { waitUntil: 'networkidle' });
await wait(1200);
await shot('01-title');

/**
 * `window.dev` only exists in a dev build. Detecting it lets the same script
 * run against a production bundle or the standalone file:// build, where the
 * jump-straight-to-a-battle steps have to be skipped.
 */
const hasDev = await page.evaluate(() => typeof window.dev !== 'undefined');
if (!hasDev) console.log('(production build: skipping dev-only battle jumps)');

console.log('new game');
await key('Enter');
await wait(1600);
await shot('02-field');

console.log('walking');
await hold('ArrowUp', 700);
await hold('ArrowRight', 300);
await shot('03-field-walk');

console.log('pause menu');
await key('c');
await wait(400);
await shot('04-menu-root');
await key('ArrowDown', 2);
await key('Enter');
await wait(200);
await key('Enter');
await wait(300);
await shot('05-menu-status');
await key('x', 3, 200);
await wait(300);

if (!hasDev) {
  await browser.close();
  reportErrors();
  console.log('\nproduction smoke passed (title, field, menus)');
  process.exit(0);
}

console.log('battle');
await page.evaluate(() => window.dev.battle('ruins.line'));
await wait(1800);
await shot('06-battle-open');

await wait(3500);
await shot('07-battle-ready');
await key('ArrowDown');
await key('Enter');
await wait(400);
await shot('08-battle-techs');

await key('Enter');
await wait(400);
await shot('09-battle-target');
await key('Enter');
await wait(900);
await shot('10-battle-impact');

await wait(6000);
await shot('11-battle-midfight');

console.log('boss');
await page.evaluate(() => {
  window.dev.heal();
  window.dev.level(9);
});
await wait(400);
await page.evaluate(() => window.dev.battle('boss.choragos'));
await wait(4500);
await shot('12-boss');

/**
 * Win a fight and leave the victory screen.
 *
 * This exists because a soft-lock shipped: the results window drew a "press
 * confirm" prompt, but the branch reading that input never ran, so every won
 * battle trapped the player. Entering a battle was covered; *finishing* one
 * was not.
 *
 * Depth is compared against the stack before the fight rather than against 1,
 * because `dev.battle` pushes onto whatever is already open.
 */
console.log('win a battle and clear the results screen');
await page.evaluate(() => {
  window.dev.level(25); // overwhelming, so the fight ends quickly
  window.dev.heal();
});
await wait(300);

const depthBefore = await page.evaluate(() => window.game.scenes.depth);
await page.evaluate(() => window.dev.battle('ruins.wisps'));
await wait(2000);

// Mash confirm: picks Attack, picks a target, and finally clears the results
// window. If the victory screen ignores input, this never escapes.
let escaped = false;
for (let i = 0; i < 40; i++) {
  await page.keyboard.press('z');
  await wait(250);
  if (await page.evaluate((d) => window.game.scenes.depth <= d, depthBefore)) {
    escaped = true;
    break;
  }
}
await wait(600);
await shot('13-after-victory');

if (!escaped) {
  console.error('  FAIL: still stuck in the battle scene after winning');
  errors.push('victory screen did not dismiss — soft lock');
} else {
  console.log('  ok: victory screen dismissed and the battle scene closed');
}

await browser.close();
reportErrors();
console.log('\nno console errors');
