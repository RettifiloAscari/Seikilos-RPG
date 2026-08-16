/**
 * Fold a production build into one self-contained HTML file.
 *
 * The point is a build you can hand to somebody who does not have Node: they
 * download `seikilos.html`, double-click it, and the game runs. That rules out
 * ES modules (browsers refuse to load them over `file://`) and any sibling
 * file the page would have to fetch, so the script is emitted as a classic
 * IIFE and every asset is embedded as a data URI.
 *
 *   npm run build:single
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const BUILD_DIR = 'dist-single';
const OUT_DIR = 'dist-release';
const OUT_FILE = join(OUT_DIR, 'seikilos.html');

/** Files that get embedded as data URIs rather than left on disk. */
const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
};

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

function dataUri(path) {
  const mime = MIME_TYPES[extname(path).toLowerCase()];
  if (!mime) return null;
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

/** `</script>` inside a string literal would close the tag we are writing. */
function escapeForScript(text) {
  return text.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

/**
 * The failure this guards against is silent: the page loads, shows the boot
 * text forever, and the only clue is a console error nobody opened the console
 * to see. Cheap to assert, so assert it.
 */
function assertScriptRunsAfterCanvas(html) {
  const canvasAt = html.indexOf('<canvas');
  const scriptAt = html.lastIndexOf('<script>');

  if (canvasAt === -1) {
    console.error('No <canvas> in the output; the game has nothing to draw to.');
    process.exit(1);
  }
  if (scriptAt < canvasAt) {
    console.error(
      'The inlined script comes before the canvas, so it will run before the\n' +
        'element exists and the game will never start.',
    );
    process.exit(1);
  }
}

/**
 * Run the Vite build ourselves rather than chaining it in an npm script, so
 * setting SINGLE_FILE works the same on Windows as it does on a shell that
 * understands `VAR=1 command`.
 */
function runViteBuild() {
  rmSync(BUILD_DIR, { recursive: true, force: true });
  execFileSync('npx', ['vite', 'build', '--outDir', BUILD_DIR], {
    stdio: 'inherit',
    env: { ...process.env, SINGLE_FILE: '1' },
    shell: process.platform === 'win32',
  });
}

function main() {
  if (!process.argv.includes('--no-build')) runViteBuild();

  if (!existsSync(BUILD_DIR)) {
    console.error(`Missing ${BUILD_DIR}/ after the build.`);
    process.exit(1);
  }

  let html = readFileSync(join(BUILD_DIR, 'index.html'), 'utf8');

  // Collect every embeddable asset, keyed by the path the manifest uses
  // ("assets/tileset-ruins.png"), so the runtime lookup finds it.
  const inlineAssets = {};
  for (const path of walk(BUILD_DIR)) {
    const uri = dataUri(path);
    if (!uri) continue;
    inlineAssets[relative(BUILD_DIR, path).split('\\').join('/')] = uri;
  }

  // Inline stylesheets.
  html = html.replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi, (tag) => {
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) return tag;
    const cssPath = join(BUILD_DIR, href.replace(/^\.?\//, ''));
    if (!existsSync(cssPath)) return tag;
    return `<style>\n${readFileSync(cssPath, 'utf8')}\n</style>`;
  });

  // Pull the bundle out of wherever Vite put it. It cannot simply be inlined
  // in place: Vite emits it in <head> as a module, and modules are deferred
  // until the document is parsed. An inlined *classic* script has no such
  // wait, so left in <head> it would run before <body> exists and fail to
  // find the canvas. It gets re-inserted at the end of <body> below.
  let code = null;
  html = html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi, (tag, src) => {
    const jsPath = join(BUILD_DIR, src.replace(/^\.?\//, ''));
    if (!existsSync(jsPath)) return tag;
    code = readFileSync(jsPath, 'utf8');
    return '';
  });

  if (code === null) {
    console.error('No <script src> found in the built index.html; nothing was inlined.');
    process.exit(1);
  }

  if (/^\s*(import|export)\s/m.test(code)) {
    console.error(
      'The bundle still contains import/export statements, so it will not run from file://.\n' +
        'Build with SINGLE_FILE=1 so rollup emits an IIFE.',
    );
    process.exit(1);
  }

  const preamble = Object.keys(inlineAssets).length
    ? `<script>window.__SEIKILOS_INLINE_ASSETS__=${escapeForScript(JSON.stringify(inlineAssets))};</script>\n`
    : '';
  const block = `${preamble}<script>\n${escapeForScript(code)}\n</script>\n`;

  if (!html.includes('</body>')) {
    console.error('Built index.html has no </body> to append the script to.');
    process.exit(1);
  }
  html = html.replace('</body>', `${block}</body>`);

  assertScriptRunsAfterCanvas(html);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, html);

  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  const assetCount = Object.keys(inlineAssets).length;
  console.log(`${OUT_FILE} — ${kb} KB, ${assetCount} embedded asset(s)`);
  console.log('Open it directly in a browser; no server needed.');
}

main();
