import Phaser from 'phaser';
import { Sound } from '../audio/SoundEngine';
import { ROUTE_CFG, STR, eventById } from '../core/data';
import { game } from '../core/GameState';
import type { EventOption } from '../core/types';
import { openDeckPicker } from '../ui/deckPicker';
import { backdrop } from '../ui/views';
import { W, button, fadeTo, panel, topBar, txt } from '../ui/widgets';
import { uiPalette } from '../visual/palette';
import { ambientTint, type Scenery } from '../visual/scenery';

/** Точки интереса без боя: случайные события (таверна, алтарь…) и костёр. */
export class EncounterScene extends Phaser.Scene {
  private layer!: Phaser.GameObjects.Container;
  private refreshBar!: () => void;
  private scenery!: Scenery;

  constructor() {
    super('Encounter');
  }

  create(): void {
    this.cameras.main.fadeIn(300);
    const d = game.darkness;
    this.scenery = backdrop(this, d, 300, { seed: 3 + game.node * 5 });
    const node = game.current;
    const sprite = node.type === 'campfire' ? 'poi-fire' : node.id === 'tavern' ? 'poi-tavern' : 'poi-sign';
    const scale = sprite === 'poi-tavern' ? 4 : 3;
    const glow = this.add.image(W / 2 + 205, 320, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffb050).setScale(3.2).setAlpha(0.45);
    this.tweens.add({ targets: glow, scale: 3.5, alpha: 0.35, duration: 180, yoyo: true, repeat: -1, repeatDelay: 80 });
    const poi = this.add.image(W / 2 + 205, 352, sprite).setOrigin(0.5, 1).setScale(scale).setTint(ambientTint(d * 0.5));
    if (node.type === 'campfire') this.tweens.add({ targets: poi, scaleY: scale * 1.06, duration: 300, yoyo: true, repeat: -1 });
    this.add.image(W / 2 - 230, 352, 'hero-0').setOrigin(0.5, 1).setScale(2).setTint(ambientTint(d));
    this.refreshBar = topBar(this, node.type === 'campfire' ? STR.campfireTitle : eventById((node as { id: string }).id).title);
    this.layer = this.add.container(0, 0);

    if (node.type === 'campfire') this.showCampfire();
    else if (node.type === 'event') this.showEvent(node.id);
  }

  update(time: number): void {
    this.scenery.update(0, time);
  }

  private frame(title: string, text: string): number {
    this.layer.removeAll(true);
    const ui = uiPalette(game.darkness);
    this.layer.add(panel(this, W / 2, 170, 360, 230));
    this.layer.add(txt(this, W / 2, 74, title, 16, ui.text));
    this.layer.add(txt(this, W / 2, 108, text, 11, ui.textDim).setWordWrapWidth(320));
    return 150;
  }

  private showEvent(id: string): void {
    const ev = eventById(id);
    let y = this.frame(ev.title, ev.text);
    for (const opt of ev.options) {
      const b = button(this, W / 2, y, 300, 28, opt.label, () => this.choose(opt));
      if (opt.cost && game.gold < opt.cost) b.setEnabled(false);
      this.layer.add(b);
      y += 36;
    }
  }

  private choose(opt: EventOption): void {
    if (opt.cost) game.gold -= opt.cost;
    const success = opt.chance === undefined || Math.random() < opt.chance;
    const res = success ? opt.result : opt.fail ?? {};
    const text = success ? opt.outcome : opt.failOutcome ?? '';
    const log = game.applyOutcome(res);
    if (res.spell) Sound.cast(3);
    else if ((res.gold ?? 0) > 0) Sound.coin();
    else if ((res.hp ?? 0) < 0) Sound.hurt();
    this.done(text, log);
  }

  private showCampfire(): void {
    const heal = Math.round((game.maxHp * ROUTE_CFG.campfire.healPercent) / 100);
    this.frame(STR.campfireTitle, STR.campfireText);
    this.layer.add(button(this, W / 2, 160, 260, 30, `${STR.rest} (+${heal} HP)`, () => {
      const d = game.heal(heal);
      Sound.block();
      this.done(STR.rest, [`+${d} HP`]);
    }));
    this.layer.add(button(this, W / 2, 200, 260, 30, `${STR.temper} (+${ROUTE_CFG.campfire.upgradeAmount})`, () => {
      openDeckPicker(this, `${STR.temper}: +${ROUTE_CFG.campfire.upgradeAmount} ${STR.power}`, (c) => {
        game.upgradeCard(c.uid, ROUTE_CFG.campfire.upgradeAmount);
        Sound.cast(4);
        this.done(STR.temper, [`Руна усилена до ${c.power}`]);
      });
    }));
  }

  private done(title: string, log: string[]): void {
    this.refreshBar();
    this.frame(title, log.join('\n') || '…');
    if (game.hp <= 0) {
      Sound.defeat();
      this.layer.add(button(this, W / 2, 230, 180, 30, STR.newRun, () => {
        game.reset();
        fadeTo(this, 'Title');
      }));
      return;
    }
    this.layer.add(button(this, W / 2, 230, 180, 30, STR.ok, () => {
      game.advance();
      fadeTo(this, 'Walk');
    }));
  }
}


