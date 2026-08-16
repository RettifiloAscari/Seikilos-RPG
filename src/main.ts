import { loadArt } from './art';
import { Game } from './core/game';
import { TitleScene } from './scenes/title';

async function boot(): Promise<void> {
  const canvas = document.getElementById('screen');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('main: #screen canvas is missing from index.html');
  }

  const game = new Game(canvas);
  game.boot();
  await loadArt(game.assets);

  // Clicking the canvas gives it focus, which browsers require before audio
  // will play and keeps key events flowing after the player clicks away.
  canvas.addEventListener('pointerdown', () => canvas.focus());
  canvas.focus();

  document.getElementById('boot')?.remove();
  game.start(new TitleScene());

  if (import.meta.env.DEV) {
    const { installDevTools } = await import('./dev');
    installDevTools(game);
  }
}

boot().catch((error: unknown) => {
  console.error(error);
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = `Failed to start: ${String(error)}`;
});
