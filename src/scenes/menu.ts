import { VIRTUAL_H, VIRTUAL_W } from '../config';
import type { Game } from '../core/game';
import type { Scene } from '../core/scene';
import { getItem } from '../data/items';
import { getTech } from '../data/techs';
import { STAT_KEYS, type EquipSlot, type StatKey } from '../data/types';
import type { Renderer } from '../render/renderer';
import type { PartyMember } from '../state/party';
import { formatPlayTime, writeSave, listSaves, SAVE_SLOTS } from '../state/savegame';
import { ListMenu, type MenuItem } from '../ui/menu';
import { drawGauge, drawWindow, PANEL_STYLE } from '../ui/window';

type Page =
  | { kind: 'root' }
  | { kind: 'items' }
  | { kind: 'itemTarget'; itemId: string }
  | { kind: 'techs'; memberIndex: number }
  | { kind: 'status'; memberIndex: number }
  | { kind: 'equipMember' }
  | { kind: 'equipSlot'; member: PartyMember }
  | { kind: 'equipChoose'; member: PartyMember; slot: EquipSlot }
  | { kind: 'save' }
  | { kind: 'memberPick'; next: 'techs' | 'status' };

const PANEL_X = 4;
const PANEL_W = 116;

/**
 * The pause menu: items, techs, status, equipment and saving.
 *
 * Drawn over the field (`transparent`), so the world stays visible behind it
 * the way it does in most 16-bit RPGs.
 */
export class PauseMenuScene implements Scene {
  readonly transparent = true;

  private page: Page = { kind: 'root' };
  private menu!: ListMenu<string>;
  private notice = '';
  private noticeTimer = 0;
  private time = 0;

  enter(game: Game): void {
    this.openRoot();
    game.input.clear();
  }

  update(dt: number, game: Game): void {
    this.time += dt;
    game.state.playTime += dt;
    if (this.noticeTimer > 0) this.noticeTimer -= dt;

    const result = this.menu.update(dt, game.input);
    if (result === 'cancel') {
      this.goBack(game);
      return;
    }
    if (result === 'confirm') this.confirm(game);
  }

  // ------------------------------------------------------------ navigation

  private goBack(game: Game): void {
    switch (this.page.kind) {
      case 'root':
        game.scenes.pop();
        return;
      case 'itemTarget':
        this.openItems(game);
        return;
      case 'equipSlot':
        this.openEquipMember(game);
        return;
      case 'equipChoose':
        this.openEquipSlot(game, this.page.member);
        return;
      default:
        this.openRoot();
        return;
    }
  }

  private confirm(game: Game): void {
    switch (this.page.kind) {
      case 'root':
        this.confirmRoot(game);
        return;
      case 'items':
        this.confirmItem(game);
        return;
      case 'itemTarget':
        this.confirmItemTarget(game);
        return;
      case 'memberPick':
        this.confirmMemberPick(game);
        return;
      case 'equipMember':
        this.confirmEquipMember(game);
        return;
      case 'equipSlot':
        this.confirmEquipSlot(game);
        return;
      case 'equipChoose':
        this.confirmEquipChoose(game);
        return;
      case 'save':
        this.confirmSave(game);
        return;
      default:
        return;
    }
  }

  // ------------------------------------------------------------------ root

  private openRoot(): void {
    this.page = { kind: 'root' };
    this.menu = new ListMenu<string>(
      [
        { label: 'Items', value: 'items' },
        { label: 'Techs', value: 'techs' },
        { label: 'Status', value: 'status' },
        { label: 'Equip', value: 'equip' },
        { label: 'Save', value: 'save' },
        { label: 'Close', value: 'close' },
      ],
      { visibleRows: 6, rowHeight: 14 },
    );
  }

  private confirmRoot(game: Game): void {
    switch (this.menu.selectedValue) {
      case 'items':
        this.openItems(game);
        return;
      case 'techs':
        this.openMemberPick(game, 'techs');
        return;
      case 'status':
        this.openMemberPick(game, 'status');
        return;
      case 'equip':
        this.openEquipMember(game);
        return;
      case 'save':
        this.openSave();
        return;
      case 'close':
        game.scenes.pop();
        return;
    }
  }

  // ----------------------------------------------------------------- items

  private openItems(game: Game): void {
    this.page = { kind: 'items' };
    const items: MenuItem<string>[] = game.state.inventory.map((entry) => {
      const def = getItem(entry.id);
      return {
        label: def.name,
        detail: `x${entry.count}`,
        disabled: def.usableInField !== true,
        value: entry.id,
      };
    });
    if (items.length === 0) items.push({ label: 'Nothing carried', disabled: true });

    this.menu = new ListMenu(items, { visibleRows: 9, rowHeight: 13 });
  }

  private confirmItem(game: Game): void {
    const itemId = this.menu.selectedValue;
    if (!itemId) return;
    this.page = { kind: 'itemTarget', itemId };

    const def = getItem(itemId);
    const items: MenuItem<string>[] = game.state.roster.map((member) => ({
      label: member.name,
      detail: `${member.hp}/${member.maxHp}`,
      // Revival items only make sense on the fallen, and vice versa.
      disabled: def.effect?.revive !== undefined ? member.alive : !member.alive,
      value: member.id,
    }));

    this.menu = new ListMenu(items, { visibleRows: 4, rowHeight: 14 });
  }

  private confirmItemTarget(game: Game): void {
    if (this.page.kind !== 'itemTarget') return;
    const memberId = this.menu.selectedValue;
    const member = memberId ? game.state.member(memberId) : undefined;
    if (!member) return;

    const def = getItem(this.page.itemId);
    const effect = def.effect;
    if (!effect) return;

    let used = false;

    if (effect.revive !== undefined && !member.alive) {
      member.hp = Math.max(1, Math.round(member.maxHp * effect.revive));
      used = true;
    }
    if (effect.hp !== undefined && member.alive && member.hp < member.maxHp) {
      member.hp = Math.min(member.maxHp, member.hp + effect.hp);
      used = true;
    }
    if (effect.mp !== undefined && member.alive && member.mp < member.maxMp) {
      member.mp = Math.min(member.maxMp, member.mp + effect.mp);
      used = true;
    }
    if (effect.cures && member.alive) {
      // Statuses do not persist outside battle yet, so curatives are a no-op
      // here; using one anyway would just waste it.
      used = used || false;
    }

    if (!used) {
      this.showNotice('It would have no effect.');
      return;
    }

    game.state.removeItem(this.page.itemId, 1);
    this.showNotice(`${member.name} used ${def.name}.`);
    this.openItems(game);
  }

  // ------------------------------------------------------- member selection

  private openMemberPick(game: Game, next: 'techs' | 'status'): void {
    this.page = { kind: 'memberPick', next };
    this.menu = new ListMenu(
      game.state.roster.map((member) => ({
        label: member.name,
        detail: `Lv ${member.level}`,
        value: member.id,
      })),
      { visibleRows: 4, rowHeight: 14 },
    );
  }

  private confirmMemberPick(game: Game): void {
    if (this.page.kind !== 'memberPick') return;
    const memberId = this.menu.selectedValue;
    const index = game.state.roster.findIndex((m) => m.id === memberId);
    if (index < 0) return;

    if (this.page.next === 'techs') {
      const member = game.state.roster[index]!;
      this.page = { kind: 'techs', memberIndex: index };
      this.menu = new ListMenu(
        member.knownTechs().map((techId) => {
          const tech = getTech(techId);
          return { label: tech.name, detail: `${tech.mpCost} MP`, value: techId };
        }),
        { visibleRows: 8, rowHeight: 13 },
      );
    } else {
      this.page = { kind: 'status', memberIndex: index };
      this.menu = new ListMenu([{ label: 'Back', value: 'back' }], { visibleRows: 1, rowHeight: 14 });
    }
  }

  // ------------------------------------------------------------- equipment

  private openEquipMember(game: Game): void {
    this.page = { kind: 'equipMember' };
    this.menu = new ListMenu(
      game.state.roster.map((member) => ({
        label: member.name,
        detail: `Lv ${member.level}`,
        value: member.id,
      })),
      { visibleRows: 4, rowHeight: 14 },
    );
  }

  private confirmEquipMember(game: Game): void {
    const member = game.state.member(this.menu.selectedValue ?? '');
    if (member) this.openEquipSlot(game, member);
  }

  private openEquipSlot(game: Game, member: PartyMember): void {
    void game;
    this.page = { kind: 'equipSlot', member };
    this.menu = new ListMenu(
      member.def.equipSlots.map((slot) => {
        const equipped = member.equipment[slot];
        return {
          label: capitalise(slot),
          detail: equipped ? getItem(equipped).name : '—',
          value: slot,
        };
      }),
      { visibleRows: 3, rowHeight: 14 },
    );
  }

  private confirmEquipSlot(game: Game): void {
    if (this.page.kind !== 'equipSlot') return;
    const slot = this.menu.selectedValue as EquipSlot | undefined;
    if (!slot) return;

    const member = this.page.member;
    const options: MenuItem<string>[] = game.state.inventory
      .filter((entry) => {
        const def = getItem(entry.id);
        return def.equip?.slot === slot && member.canEquip(entry.id);
      })
      .map((entry) => ({
        label: getItem(entry.id).name,
        detail: `x${entry.count}`,
        value: entry.id,
      }));

    options.unshift({ label: 'Remove', value: '' });
    this.page = { kind: 'equipChoose', member, slot };
    this.menu = new ListMenu(options, { visibleRows: 8, rowHeight: 13 });
  }

  private confirmEquipChoose(game: Game): void {
    if (this.page.kind !== 'equipChoose') return;
    const { member, slot } = this.page;
    const itemId = this.menu.selectedValue;

    if (!itemId) {
      const removed = member.unequip(slot);
      if (removed) game.state.addItem(removed);
      this.showNotice(`${member.name} unequipped ${slot}.`);
    } else {
      if (!game.state.removeItem(itemId, 1)) return;
      const displaced = member.equip(itemId);
      if (displaced) game.state.addItem(displaced);
      this.showNotice(`${member.name} equipped ${getItem(itemId).name}.`);
    }

    this.openEquipSlot(game, member);
  }

  // ------------------------------------------------------------------ save

  private openSave(): void {
    this.page = { kind: 'save' };
    const saves = listSaves();
    this.menu = new ListMenu(
      Array.from({ length: SAVE_SLOTS }, (_, index) => {
        const save = saves[index];
        return {
          label: `Slot ${index + 1}`,
          detail: save ? `Lv ${save.roster[0]?.level ?? 1}  ${formatPlayTime(save.playTime)}` : 'empty',
          value: String(index),
        };
      }),
      { visibleRows: SAVE_SLOTS, rowHeight: 14 },
    );
  }

  private confirmSave(game: Game): void {
    const slot = Number(this.menu.selectedValue ?? '0');
    const ok = writeSave(slot, game.state.toSave());
    this.showNotice(ok ? `Saved to slot ${slot + 1}.` : 'Could not save (storage blocked).');
    this.openSave();
  }

  private showNotice(text: string): void {
    this.notice = text;
    this.noticeTimer = 2.4;
  }

  // ---------------------------------------------------------------- render

  render(r: Renderer, game: Game): void {
    r.overlay('#080610', 0.55);

    this.renderPartyPanel(r, game);
    this.renderPage(r, game);

    if (this.noticeTimer > 0 && this.notice) {
      const width = game.font.measure(this.notice) + 16;
      const x = (VIRTUAL_W - width) / 2;
      drawWindow(r, x, VIRTUAL_H - 26, width, 18, PANEL_STYLE);
      game.font.drawCentered(r.ctx, this.notice, VIRTUAL_W / 2, VIRTUAL_H - 22, '#ffe9a8');
    }
  }

  /** Always-visible party summary down the left. */
  private renderPartyPanel(r: Renderer, game: Game): void {
    const party = game.state.roster;
    const height = 16 + party.length * 34;
    drawWindow(r, PANEL_X, 4, PANEL_W, height);

    party.forEach((member, index) => {
      const y = 10 + index * 34;
      const inActive = game.state.activeIds.includes(member.id);

      game.font.drawShadowed(
        r.ctx,
        member.name,
        PANEL_X + 8,
        y,
        member.alive ? member.def.color : '#8a8698',
      );
      game.fontSmall.drawRight(r.ctx, `Lv ${member.level}`, PANEL_X + PANEL_W - 8, y + 1, '#b9c4e8');

      game.fontSmall.draw(r.ctx, `${member.hp}/${member.maxHp}`, PANEL_X + 8, y + 12, '#ffffff');
      drawGauge(r, PANEL_X + 56, y + 14, 46, 4, member.hp / member.maxHp, '#5cc86a');

      game.fontSmall.draw(r.ctx, `${member.mp}/${member.maxMp}`, PANEL_X + 8, y + 22, '#9fd0ff');
      drawGauge(r, PANEL_X + 56, y + 24, 46, 4, member.maxMp > 0 ? member.mp / member.maxMp : 0, '#3d7fd8');

      if (!inActive) game.fontSmall.draw(r.ctx, 'reserve', PANEL_X + 8, y + 30, '#6b6482');
    });

    const footerY = 4 + height + 4;
    drawWindow(r, PANEL_X, footerY, PANEL_W, 30);
    game.fontSmall.draw(r.ctx, `${game.state.gold} drachma`, PANEL_X + 8, footerY + 6, '#ffe066');
    game.fontSmall.draw(r.ctx, formatPlayTime(game.state.playTime), PANEL_X + 8, footerY + 16, '#b9c4e8');
  }

  private renderPage(r: Renderer, game: Game): void {
    const x = PANEL_X + PANEL_W + 6;
    const width = VIRTUAL_W - x - 4;

    switch (this.page.kind) {
      case 'status': {
        const member = game.state.roster[this.page.memberIndex];
        if (member) this.renderStatus(r, game, member, x, 4, width);
        return;
      }

      case 'techs': {
        const member = game.state.roster[this.page.memberIndex];
        drawWindow(r, x, 4, width, 150);
        if (member) {
          game.font.drawShadowed(r.ctx, `${member.name} — Techs`, x + 8, 10, member.def.color);
        }
        this.menu.render(r, game.font, x + 8, 28, width - 16);

        const techId = this.menu.selectedValue;
        if (techId) this.renderFooterText(r, game, getTech(techId).desc, x, 158, width);
        return;
      }

      case 'items': {
        drawWindow(r, x, 4, width, 150);
        game.font.drawShadowed(r.ctx, 'Items', x + 8, 10, '#ffe9a8');
        this.menu.render(r, game.font, x + 8, 28, width - 16);

        const itemId = this.menu.selectedValue;
        if (itemId) this.renderFooterText(r, game, getItem(itemId).desc, x, 158, width);
        return;
      }

      default: {
        const title = this.pageTitle();
        const height = Math.min(150, 32 + this.menu.items.length * this.menu.rowHeight);
        drawWindow(r, x, 4, width, height);
        game.font.drawShadowed(r.ctx, title, x + 8, 10, '#ffe9a8');
        this.menu.render(r, game.font, x + 8, 28, width - 16);

        if (this.page.kind === 'equipChoose') {
          const itemId = this.menu.selectedValue;
          if (itemId) this.renderEquipPreview(r, game, this.page.member, itemId, x, 4 + height + 4, width);
        }
        return;
      }
    }
  }

  private pageTitle(): string {
    switch (this.page.kind) {
      case 'root':
        return 'Menu';
      case 'itemTarget':
        return 'Use on whom?';
      case 'memberPick':
        return 'Who?';
      case 'equipMember':
        return 'Equip — who?';
      case 'equipSlot':
        return `Equip — ${this.page.member.name}`;
      case 'equipChoose':
        return `${capitalise(this.page.slot)}`;
      case 'save':
        return 'Save';
      default:
        return '';
    }
  }

  private renderStatus(r: Renderer, game: Game, member: PartyMember, x: number, y: number, width: number): void {
    drawWindow(r, x, y, width, 170);

    game.font.drawShadowed(r.ctx, member.name, x + 10, y + 8, member.def.color);
    game.fontSmall.draw(r.ctx, member.def.title, x + 10, y + 22, '#9a94b0');

    const stats = member.stats;
    const rows: [string, string][] = [
      ['Level', String(member.level)],
      ['EXP', `${member.exp} / ${member.expToNext}`],
      ['HP', `${member.hp} / ${stats.hp}`],
      ['MP', `${member.mp} / ${stats.mp}`],
    ];

    rows.forEach(([label, value], index) => {
      const rowY = y + 38 + index * 12;
      game.fontSmall.draw(r.ctx, label, x + 10, rowY, '#b9c4e8');
      game.fontSmall.drawRight(r.ctx, value, x + width / 2 - 6, rowY, '#ffffff');
    });

    // Combat stats in a second column.
    const combatKeys: StatKey[] = ['atk', 'def', 'mag', 'res', 'spd', 'hit', 'eva'];
    combatKeys.forEach((key, index) => {
      const rowY = y + 38 + index * 12;
      game.fontSmall.draw(r.ctx, key.toUpperCase(), x + width / 2 + 8, rowY, '#b9c4e8');
      game.fontSmall.drawRight(r.ctx, String(stats[key]), x + width - 12, rowY, '#ffffff');
    });

    game.fontSmall.draw(r.ctx, 'crit', x + 10, y + 92, '#b9c4e8');
    game.fontSmall.drawRight(r.ctx, `${Math.round(stats.crit * 100)}%`, x + width / 2 - 6, y + 92, '#ffffff');

    // Equipment list.
    let equipY = y + 116;
    game.fontSmall.draw(r.ctx, 'EQUIPPED', x + 10, equipY, '#8f88a8');
    equipY += 12;
    for (const slot of member.def.equipSlots) {
      const equipped = member.equipment[slot];
      game.fontSmall.draw(r.ctx, capitalise(slot), x + 10, equipY, '#b9c4e8');
      game.fontSmall.draw(r.ctx, equipped ? getItem(equipped).name : '—', x + 70, equipY, '#ffffff');
      equipY += 11;
    }

    this.menu.render(r, game.font, x + width - 58, y + 150, 50);
  }

  /** Shows how a candidate piece of equipment would change the wearer's stats. */
  private renderEquipPreview(
    r: Renderer,
    game: Game,
    member: PartyMember,
    itemId: string,
    x: number,
    y: number,
    width: number,
  ): void {
    const def = getItem(itemId);
    if (!def.equip) return;

    const current = member.stats;
    const currentlyEquipped = member.equipment[def.equip.slot];

    // Compute the candidate line by temporarily swapping the item in.
    if (currentlyEquipped) member.unequip(def.equip.slot);
    member.equipment[def.equip.slot] = itemId;
    const next = member.stats;
    delete member.equipment[def.equip.slot];
    if (currentlyEquipped) member.equipment[def.equip.slot] = currentlyEquipped;
    member.clampVitals();

    const changed = STAT_KEYS.filter((key) => next[key] !== current[key]);
    const height = 22 + Math.max(1, changed.length) * 11;
    drawWindow(r, x, y, width, height, PANEL_STYLE);
    game.fontSmall.draw(r.ctx, def.desc, x + 8, y + 6, '#d6ddf2');

    changed.forEach((key, index) => {
      const delta = next[key] - current[key];
      const rowY = y + 20 + index * 11;
      const text = key === 'crit' ? `${(delta * 100).toFixed(1)}%` : String(Math.round(delta));
      game.fontSmall.draw(r.ctx, key.toUpperCase(), x + 8, rowY, '#b9c4e8');
      game.fontSmall.draw(
        r.ctx,
        `${delta > 0 ? '+' : ''}${text}`,
        x + 48,
        rowY,
        delta > 0 ? '#7ee08a' : '#e08080',
      );
    });

    if (changed.length === 0) {
      game.fontSmall.draw(r.ctx, 'no change', x + 8, y + 20, '#8f88a8');
    }
  }

  private renderFooterText(r: Renderer, game: Game, text: string, x: number, y: number, width: number): void {
    const lines = game.font.wrap(text, width - 16).slice(0, 2);
    drawWindow(r, x, y, width, 12 + lines.length * game.font.lineHeight, PANEL_STYLE);
    lines.forEach((line, index) => {
      game.font.draw(r.ctx, line, x + 8, y + 6 + index * game.font.lineHeight, '#d6ddf2');
    });
  }
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
