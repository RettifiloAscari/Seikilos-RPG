import { MAX_FRAME_TIME, TICK_DT } from '../config';
import { BitmapFont } from '../render/font';
import { Renderer } from '../render/renderer';
import { Assets } from './assets';
import { Input } from './input';
import { Rng } from './rng';
import { SceneStack, type Scene } from './scene';
import type { SaveData } from '../state/savegame';
import { GameState } from '../state/gamestate';
import { loadSettings, saveSettings, type Settings } from '../state/settings';

/**
 * Owns the render target, input, assets and the scene stack, and drives the
 * fixed-timestep loop.
 *
 * Logic always advances in whole 1/60s ticks regardless of display refresh
 * rate, so a 144Hz monitor does not make ATB gauges fill faster.
 */
export class Game {
  readonly renderer: Renderer;
  readonly input = new Input();
  readonly assets = new Assets();
  readonly rng = new Rng();
  readonly scenes: SceneStack;

  /** Party, inventory, story flags: everything that belongs in a save file. */
  state = new GameState();

  /** Player preferences, persisted separately from saves. */
  settings: Settings = loadSettings();

  /** Main UI font. Assigned during `boot`. */
  font!: BitmapFont;
  /** Smaller font for damage numbers and dense stat readouts. */
  fontSmall!: BitmapFont;

  /** Seconds of unsimulated time carried between frames. */
  private accumulator = 0;
  private lastTime = 0;
  private rafHandle = 0;
  private running = false;

  /** Total elapsed game time in seconds; handy for idle animations. */
  elapsed = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.scenes = new SceneStack(this);
  }

  /** Build fonts and attach input. Call once, before `start`. */
  boot(): void {
    this.font = BitmapFont.generate({ size: 11 });
    this.fontSmall = BitmapFont.generate({ size: 9, bold: true });
    this.input.attach(window);
    this.applySettings();
  }

  /** Push the current settings into the systems that read them. */
  applySettings(): void {
    this.input.setGamepadEnabled(this.settings.gamepadEnabled);
    this.input.gamepads.allowNonStandard = this.settings.allowNonStandardGamepads;
  }

  updateSettings(changes: Partial<Settings>): void {
    this.settings = { ...this.settings, ...changes };
    this.applySettings();
    saveSettings(this.settings);
  }

  start(initial: Scene): void {
    if (this.running) return;
    this.running = true;
    this.scenes.reset(initial);
    this.lastTime = performance.now();
    this.rafHandle = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafHandle);
    this.input.detach();
  }

  loadSave(data: SaveData): void {
    this.state = GameState.fromSave(data);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.rafHandle = requestAnimationFrame(this.frame);

    // Clamp so a backgrounded tab doesn't try to catch up on minutes of ticks.
    const frameTime = Math.min((now - this.lastTime) / 1000, MAX_FRAME_TIME);
    this.lastTime = now;
    this.accumulator += frameTime;

    while (this.accumulator >= TICK_DT) {
      this.accumulator -= TICK_DT;
      this.elapsed += TICK_DT;
      this.input.tick(TICK_DT);
      this.scenes.update(TICK_DT);
      this.input.endTick();
    }

    this.renderer.clear('#000000');
    this.scenes.render(this.renderer);
    this.renderer.present();
  };
}
