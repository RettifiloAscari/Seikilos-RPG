import { VIRTUAL_H, VIRTUAL_W } from '../config';
import type { Game } from '../core/game';
import type { Scene } from '../core/scene';
import type { Renderer } from '../render/renderer';
import { listSaves, readSave } from '../state/savegame';
import { ListMenu, type MenuItem } from '../ui/menu';
import { drawWindow } from '../ui/window';
import { Fader } from './fader';
import { FieldScene } from './field';
import { TitleScene } from './title';

export class GameOverScene implements Scene {
  private menu!: ListMenu<string>;
  private readonly fader = new Fader();
  private time = 0;
  private leaving = false;

  enter(game: Game): void {
    const items: MenuItem<string>[] = [];

    listSaves().forEach((save, index) => {
      if (!save) return;
      items.push({ label: `Load Slot ${index + 1}`, value: `load:${index}` });
    });
    items.push({ label: 'Title Screen', value: 'title' });

    this.menu = new ListMenu(items, { visibleRows: 4, rowHeight: 14 });
    this.fader.startBlack(1.2);
    game.input.clear();
  }

  update(dt: number, game: Game): void {
    this.time += dt;
    this.fader.update(dt);
    if (this.leaving || this.fader.busy) return;

    // A short beat before the menu accepts input, so the player reads the line.
    if (this.time < 1.2) return;

    if (this.menu.update(dt, game.input) === 'confirm') {
      const choice = this.menu.selectedValue;
      if (!choice) return;

      this.leaving = true;
      this.fader.fadeOut(() => {
        if (choice === 'title') {
          game.scenes.reset(new TitleScene());
          return;
        }
        const slot = Number(choice.split(':')[1]);
        const save = readSave(slot);
        if (save) {
          game.loadSave(save);
          game.scenes.reset(new FieldScene());
        } else {
          game.scenes.reset(new TitleScene());
        }
      });
    }
  }

  render(r: Renderer, game: Game): void {
    r.clear('#08070e');

    game.font.drawCentered(r.ctx, 'The song ends here.', VIRTUAL_W / 2, 62, '#c8b8d8');

    if (this.time > 1.2) {
      const width = 150;
      const x = (VIRTUAL_W - width) / 2;
      const height = 12 + this.menu.items.length * 14;
      drawWindow(r, x, 108, width, height);
      this.menu.render(r, game.font, x + 8, 114, width - 12);
    }

    game.fontSmall.drawCentered(r.ctx, 'but only for now', VIRTUAL_W / 2, VIRTUAL_H - 20, '#4a4458');

    this.fader.render(r);
  }
}
