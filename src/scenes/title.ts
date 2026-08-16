import { VIRTUAL_H, VIRTUAL_W } from '../config';
import type { Game } from '../core/game';
import type { Scene } from '../core/scene';
import type { Renderer } from '../render/renderer';
import { GameState } from '../state/gamestate';
import { formatPlayTime, listSaves, readSave } from '../state/savegame';
import { ListMenu, type MenuItem } from '../ui/menu';
import { drawWindow } from '../ui/window';
import { Fader } from './fader';
import { FieldScene } from './field';

/** Starting party and kit for a fresh game. */
function newGameState(): GameState {
  const state = new GameState();
  state.recruit('kairos', 1);
  state.recruit('melos', 1);
  state.recruit('threnos', 1);

  state.addItem('salve', 5);
  state.addItem('antidote', 2);
  state.addItem('aetherDraught', 2);
  state.addItem('phoenixLeaf', 1);
  state.gold = 150;

  // Everyone starts equipped so the equip screen has something to show.
  state.member('kairos')?.equip('bronzeBlade');
  state.member('melos')?.equip('reedLyre');
  state.member('threnos')?.equip('stoneMaul');
  for (const member of state.roster) {
    member.equip('travelCloak');
    member.healFull();
  }

  state.mapId = 'camp';
  return state;
}

export class TitleScene implements Scene {
  private menu!: ListMenu<string>;
  private readonly fader = new Fader();
  private time = 0;
  private starting = false;

  enter(game: Game): void {
    const saves = listSaves();
    const items: MenuItem<string>[] = [{ label: 'New Game', value: 'new' }];

    saves.forEach((save, index) => {
      if (!save) return;
      const leader = save.roster[0];
      items.push({
        label: `Continue — Slot ${index + 1}`,
        detail: leader ? `Lv ${leader.level}  ${formatPlayTime(save.playTime)}` : undefined,
        value: `load:${index}`,
      });
    });

    this.menu = new ListMenu(items, { visibleRows: 4, rowHeight: 14 });
    this.fader.startBlack(1.6);
    game.input.clear();
  }

  update(dt: number, game: Game): void {
    this.time += dt;
    this.fader.update(dt);
    if (this.starting || this.fader.busy) return;

    if (this.menu.update(dt, game.input) === 'confirm') {
      const choice = this.menu.selectedValue;
      if (!choice) return;

      this.starting = true;
      this.fader.fadeOut(() => {
        if (choice === 'new') {
          game.state = newGameState();
        } else {
          const slot = Number(choice.split(':')[1]);
          const save = readSave(slot);
          if (save) game.loadSave(save);
          else game.state = newGameState();
        }
        game.scenes.reset(new FieldScene());
      });
    }
  }

  render(r: Renderer, game: Game): void {
    // Deep night gradient behind the title.
    const ctx = r.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, VIRTUAL_H);
    gradient.addColorStop(0, '#0b0a18');
    gradient.addColorStop(0.6, '#1a1430');
    gradient.addColorStop(1, '#2a1c38');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);

    // Slow drifting stars.
    for (let i = 0; i < 60; i++) {
      const x = (i * 71 + Math.sin(this.time * 0.15 + i) * 4) % VIRTUAL_W;
      const y = (i * 37) % 120;
      const twinkle = 0.35 + 0.35 * Math.sin(this.time * 1.6 + i * 1.7);
      ctx.globalAlpha = twinkle;
      r.fillRect(x, y, 1, 1, '#e8e4ff');
    }
    ctx.globalAlpha = 1;

    const emblem = game.assets.tryImage('title.emblem');
    if (emblem) {
      const bob = Math.sin(this.time * 1.1) * 2;
      r.sprite(emblem, 0, 0, 64, 64, VIRTUAL_W / 2 - 32, 26 + bob);
    }

    game.font.drawCentered(r.ctx, 'S E I K I L O S', VIRTUAL_W / 2, 100, '#ffe9a8', '#2a1c38');
    game.fontSmall.drawCentered(r.ctx, 'while you live, shine', VIRTUAL_W / 2, 116, '#9a8fb8', '#1a1430');

    const width = 168;
    const x = (VIRTUAL_W - width) / 2;
    drawWindow(r, x, 136, width, 12 + this.menu.items.length * 14);
    this.menu.render(r, game.font, x + 8, 142, width - 12);

    game.fontSmall.drawCentered(
      r.ctx,
      'arrows move   Z confirm   X cancel   C menu   shift run',
      VIRTUAL_W / 2,
      VIRTUAL_H - 12,
      '#6b6482',
    );

    this.fader.render(r);
  }
}
