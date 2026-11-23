import Phaser from 'phaser';
import { Sound } from '../audio/SoundEngine';
import { RARITIES, RULES, SHOP, STR } from '../core/data';
import { game } from '../core/GameState';
import type { SpellDef } from '../core/types';
import { openDeckPicker } from '../ui/deckPicker';
import { cardTable, spellView } from '../ui/views';
import { H, W, button, fadeTo, floatText, panel, topBar, txt } from '../ui/widgets';
import { uiPalette } from '../visual/palette';

/** Лавка после победы: покупка заклинаний, реролл, улучшение и удаление рун, продажа заклинаний. */
export class ShopScene extends Phaser.Scene {
  private offers: (SpellDef | null)[] = [];
  private offerLayer!: Phaser.GameObjects.Container;
  private ownedLayer!: Phaser.GameObjects.Container;
  private refreshBar!: () => void;
  private rerollBtn!: ReturnType<typeof button>;
  private sellArmed: number | null = null;

  constructor() {
    super('Shop');
  }

  create(): void {
    this.cameras.main.fadeIn(300);
    Sound.startMusic(Math.max(0, game.darkness - 0.25)); // в лавке чуть уютнее
    cardTable(this, game.darkness, 22, H);
    this.refreshBar = topBar(this, STR.shopTitle);
    this.offers = game.rollShop();
    this.sellArmed = null;
    this.offerLayer = this.add.container(0, 0);
    this.ownedLayer = this.add.container(0, 0);

    this.rerollBtn = button(this, 95, 350, 130, 28, '', () => this.reroll());
    button(this, 245, 350, 150, 28, `${STR.upgrade} (${SHOP.upgradeCost})`, () => this.upgrade());
    button(this, 405, 350, 150, 28, `${STR.remove} (${SHOP.removeCost})`, () => this.remove());
    button(this, 560, 350, 110, 28, STR.continue, () => {
      game.advance();
      fadeTo(this, 'Walk');
    }, uiPalette(game.darkness).good);
    this.renderAll();
  }

  private renderAll(): void {
    this.renderOffers();
    this.renderOwned();
    this.rerollBtn.setLabel(`${STR.reroll} (${game.rerollCost})`);
    this.refreshBar();
  }

  private renderOffers(): void {
    this.offerLayer.removeAll(true);
    const ui = uiPalette(game.darkness);
    this.offers.forEach((s, i) => {
      const x = 130 + i * 190;
      const y = 130;
      const items: Phaser.GameObjects.GameObject[] = [panel(this, x, y, 170, 170)];
      if (s) {
        const rar = RARITIES[s.rarity];
        items.push(
          this.add.rectangle(x, y - 78, 166, 10, Phaser.Display.Color.HexStringToColor(rar.color).color),
          txt(this, x, y - 78, rar.name, 8, '#1a1018'),
          spellView(this, x, y - 44, s),
          txt(this, x, y - 12, s.name, 12, ui.text),
          txt(this, x, y + 20, s.desc, 9, s.penalty ? '#b03ad0' : ui.textDim).setWordWrapWidth(150),
          button(this, x, y + 64, 120, 24, `${s.price} зол.`, () => this.buy(i)),
        );
      } else {
        items.push(txt(this, x, y, STR.sold, 14, ui.textDim));
      }
      this.offerLayer.add(items);
    });
  }

  private renderOwned(): void {
    this.ownedLayer.removeAll(true);
    const ui = uiPalette(game.darkness);
    this.ownedLayer.add(panel(this, W / 2, 268, 300, 66));
    this.ownedLayer.add(txt(this, W / 2, 246, STR.sellHint, 9, ui.textDim));
    for (let i = 0; i < RULES.maxSpellSlots; i++) {
      const s = game.spells[i] ?? null;
      const v = spellView(this, W / 2 - 84 + i * 42, 276, s);
      if (s) {
        v.setInteractive();
        v.on('pointerup', () => this.sell(i));
        if (this.sellArmed === i) {
          this.ownedLayer.add(txt(this, v.x, v.y + 26, `+${game.sellPrice(s)}?`, 10, '#ffd860').setStroke('#000000', 3));
          v.setScale(1.15);
        }
      }
      this.ownedLayer.add(v);
    }
    this.ownedLayer.add(txt(this, W / 2, 312, `${STR.deck}: ${game.deck.length}`, 10, '#fff4d0').setStroke('#000000', 3));
  }

  private pay(cost: number): boolean {
    if (game.gold < cost) {
      floatText(this, W / 2, 200, STR.noGold, '#ff8080', 14);
      Sound.hurt();
      return false;
    }
    game.gold -= cost;
    Sound.coin();
    return true;
  }

  private buy(i: number): void {
    const s = this.offers[i];
    if (!s) return;
    if (game.spells.length >= RULES.maxSpellSlots) {
      floatText(this, W / 2, 200, STR.slotsFull, '#ff8080', 14);
      return;
    }
    if (!this.pay(s.price)) return;
    game.spells.push(s);
    Sound.cast(game.spells.length - 1);
    this.offers[i] = null;
    this.renderAll();
  }

  /** Продажа в два касания: первое — показать цену, второе — подтвердить. */
  private sell(i: number): void {
    const s = game.spells[i];
    if (!s) return;
    if (this.sellArmed !== i) {
      this.sellArmed = i;
      this.renderOwned();
      return;
    }
    this.sellArmed = null;
    game.gold += game.sellPrice(s);
    game.spells.splice(i, 1);
    Sound.coin();
    this.renderAll();
  }

  private reroll(): void {
    if (!this.pay(game.rerollCost)) return;
    game.rerolls++;
    this.offers = game.rollShop();
    this.renderAll();
  }

  private upgrade(): void {
    if (game.gold < SHOP.upgradeCost) return void this.pay(SHOP.upgradeCost);
    openDeckPicker(this, `${STR.upgrade}: +${SHOP.upgradeAmount} ${STR.power}`, (c) => {
      if (!this.pay(SHOP.upgradeCost)) return;
      game.upgradeCard(c.uid, SHOP.upgradeAmount);
      Sound.cast(2);
      this.renderAll();
    });
  }

  private remove(): void {
    if (game.gold < SHOP.removeCost) return void this.pay(SHOP.removeCost);
    if (game.deck.length <= RULES.handSize) return;
    openDeckPicker(this, STR.remove, (c) => {
      if (!this.pay(SHOP.removeCost)) return;
      game.removeCard(c.uid);
      this.renderAll();
    });
  }
}
