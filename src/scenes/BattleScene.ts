import Phaser from 'phaser';
import { Sound } from '../audio/SoundEngine';
import { RULES, STR } from '../core/data';
import { BattleDeck } from '../core/deck';
import { game } from '../core/GameState';
import { scorePlay, type ScoreResult } from '../core/scoring';
import type { Card } from '../core/types';
import { backdrop, cardTable, cardView, spellView, type CardView, type SpellView } from '../ui/views';
import { type Button, H, W, button, fadeTo, floatText, panel, topBar, txt } from '../ui/widgets';
import { uiPalette } from '../visual/palette';

const TABLE_TOP = 232;
const HAND_Y = 300;
const ATK_COLOR = '#ff7a5a';
const DEF_COLOR = '#7ab8ff';

/** Карточный бой: Атака = Сила × Множ., Щит = Сила × Множ. Враг бьёт после каждого розыгрыша. */
export class BattleScene extends Phaser.Scene {
  private deck!: BattleDeck;
  private hand: CardView[] = [];
  private slots: SpellView[] = [];
  private enemyHp = 0;
  private shield = 0;
  private intent = 0;
  private discards = 0;
  private busy = false;

  private hero!: Phaser.GameObjects.Image;
  private enemy!: Phaser.GameObjects.Image;
  private enemyBar!: Phaser.GameObjects.Rectangle;
  private enemyHpText!: Phaser.GameObjects.Text;
  private intentText!: Phaser.GameObjects.Text;
  private shieldText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private atkText!: Phaser.GameObjects.Text;
  private defText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private deckText!: Phaser.GameObjects.Text;
  private playBtn!: Button;
  private discardBtn!: Button;
  private refreshBar!: () => void;

  constructor() {
    super('Battle');
  }

  create(): void {
    this.cameras.main.fadeIn(300);
    const e = game.enemy;
    const d = game.darkness;
    Sound.startMusic(d);
    this.hand = [];
    this.slots = [];
    this.busy = false;
    this.selected.clear();
    this.enemyHp = e.hp;
    this.shield = 0;
    this.discards = RULES.discardsPerBattle;
    this.deck = new BattleDeck(game.deck);

    backdrop(this, d, 196, { fixed: true, height: 18 });
    cardTable(this, d, TABLE_TOP);
    this.refreshBar = topBar(this, `${e.boss ? '☠ ' : ''}${e.name}`);

    // Слоты заклинаний
    txt(this, W / 2, 78, STR.spells, 9, '#fff4d0').setStroke('#000000', 3);
    for (let i = 0; i < RULES.maxSpellSlots; i++) {
      this.slots.push(spellView(this, W / 2 - 84 + i * 42, 52, game.spells[i] ?? null));
    }

    // Герой и враг
    this.hero = this.add.image(100, 228, 'hero-0').setOrigin(0.5, 1).setScale(3);
    this.shieldText = txt(this, 140, 200, '', 12, DEF_COLOR).setStroke('#000000', 3);
    this.enemy = this.add.image(540, 228, `enemy-${e.sprite}`).setOrigin(0.5, 1).setScale(e.boss ? 5 : 4);
    this.tweens.add({ targets: this.enemy, scaleY: this.enemy.scaleY * 1.04, duration: 700, yoyo: true, repeat: -1 });
    this.add.rectangle(540, 140, 104, 10, 0x000000, 0.7);
    this.enemyBar = this.add.rectangle(489, 140, 100, 6, 0xe0485a).setOrigin(0, 0.5);
    this.enemyHpText = txt(this, 540, 128, '', 10, '#ffffff').setStroke('#000000', 3);
    this.intentText = txt(this, 540, 112, '', 11, '#ffb0a0').setStroke('#000000', 3);

    // Панель подсчёта
    panel(this, W / 2, 148, 230, 74, 0.9);
    const ui = uiPalette(d);
    this.comboText = txt(this, W / 2, 124, STR.selectHint, 13, ui.text);
    this.atkText = txt(this, W / 2, 146, '', 12, ATK_COLOR).setStroke('#000000', 2);
    this.defText = txt(this, W / 2, 166, '', 12, DEF_COLOR).setStroke('#000000', 2);

    // Колода и кнопки
    this.add.image(36, HAND_Y, 'card-back').setScale(0.8);
    this.deckText = txt(this, 36, HAND_Y + 36, '', 10, '#fff4d0').setStroke('#000000', 3);
    this.discardBtn = button(this, 200, 378, 110, 26, '', () => this.discardSelected());
    this.playBtn = button(this, 440, 378, 120, 26, STR.play, () => void this.playSelected());
    this.hintText = txt(this, W / 2, 378, '', 9, '#fff4d0').setStroke('#000000', 3);

    this.rollIntent();
    this.updateEnemyUi();
    this.drawUp();
    this.updatePreview();
  }

  // ---------------- рука ----------------

  private drawUp(): void {
    const need = game.handSize - this.hand.length;
    const cards = this.deck.draw(need);
    cards.forEach((c, i) => {
      const v = cardView(this, 36, HAND_Y, c);
      v.setInteractive();
      v.on('pointerup', () => this.toggle(v));
      this.hand.push(v);
      Sound.cardDeal(i);
    });
    this.layoutHand();
  }

  private layoutHand(): void {
    const n = this.hand.length;
    const spacing = Math.min(58, 470 / Math.max(1, n));
    this.hand.forEach((v, i) => {
      const x = W / 2 + 20 + (i - (n - 1) / 2) * spacing;
      const y = HAND_Y - (this.isSelected(v) ? 14 : 0);
      v.setDepth(10 + i);
      this.tweens.add({ targets: v, x, y, duration: 180, ease: 'Back.easeOut' });
    });
    this.deckText.setText(String(this.deck.remaining));
  }

  private selected = new Set<CardView>();
  private isSelected(v: CardView): boolean {
    return this.selected.has(v);
  }

  private toggle(v: CardView): void {
    if (this.busy) return;
    if (this.selected.has(v)) this.selected.delete(v);
    else if (this.selected.size < RULES.maxPlay) this.selected.add(v);
    else return;
    const up = this.selected.has(v);
    v.glow.setVisible(up);
    Sound.cardSelect(up);
    this.layoutHand();
    this.updatePreview();
  }

  private selectedCards(): Card[] {
    return this.hand.filter((v) => this.selected.has(v)).map((v) => v.card);
  }

  private updatePreview(): void {
    const cards = this.selectedCards();
    this.playBtn.setEnabled(cards.length > 0 && !this.busy);
    this.discardBtn.setLabel(`${STR.discard} (${this.discards})`).setEnabled(cards.length > 0 && this.discards > 0 && !this.busy);
    if (cards.length === 0) {
      this.comboText.setText(STR.selectHint);
      this.atkText.setText('');
      this.defText.setText('');
      this.hintText.setText('');
      return;
    }
    const r = scorePlay(cards, this.hand.length - cards.length, game.spells);
    this.showScore(r.combo.name, r.atk, r.def);
    this.hintText.setText(r.combo.desc);
  }

  private showScore(name: string, atk: { power: number; mult: number }, def: { power: number; mult: number }): void {
    this.comboText.setText(name);
    this.atkText.setText(`⚔ ${STR.attack}: ${atk.power} × ${atk.mult} = ${Math.round(atk.power * atk.mult)}`);
    this.defText.setText(`⛨ ${STR.shield}: ${def.power} × ${def.mult} = ${Math.round(def.power * def.mult)}`);
  }

  private discardSelected(): void {
    if (this.busy || this.discards <= 0 || this.selected.size === 0) return;
    this.discards--;
    const gone = this.hand.filter((v) => this.selected.has(v));
    this.deck.discard(gone.map((v) => v.card));
    this.removeViews(gone);
    this.drawUp();
    this.updatePreview();
  }

  private removeViews(views: CardView[]): void {
    for (const v of views) {
      this.selected.delete(v);
      this.tweens.add({ targets: v, y: H + 60, alpha: 0, duration: 220, onComplete: () => v.destroy() });
    }
    this.hand = this.hand.filter((v) => !views.includes(v));
  }

  // ---------------- розыгрыш ----------------

  private async playSelected(): Promise<void> {
    if (this.busy || this.selected.size === 0) return;
    this.busy = true;
    this.updatePreview();
    const views = this.hand.filter((v) => this.selected.has(v));
    const result = scorePlay(views.map((v) => v.card), this.hand.length - views.length, game.spells);

    // Сыгранные руны выезжают в центр стола
    views.forEach((v, i) => {
      v.glow.setVisible(false);
      this.tweens.add({ targets: v, x: W / 2 - (views.length - 1) * 29 + i * 58, y: 250, duration: 220, ease: 'Cubic.easeOut' });
    });
    this.hand = this.hand.filter((v) => !views.includes(v));
    this.selected.clear();
    this.layoutHand();
    await this.wait(260);
    await this.animateScore(result, views);

    // Применение
    if (result.hpLoss > 0) {
      game.heal(-result.hpLoss);
      floatText(this, this.hero.x, this.hero.y - 60, `−${result.hpLoss}`, '#d080ff');
      this.refreshBar();
    }
    this.shield = result.shield;
    this.shieldText.setText(this.shield > 0 ? `⛨ ${this.shield}` : '');
    if (this.shield > 0) Sound.block();
    if (result.attack > 0) await this.heroStrike(result.attack);

    this.deck.discard(views.map((v) => v.card));
    this.removeViews(views);
    await this.wait(200);

    if (this.enemyHp <= 0) return this.victory();
    if (game.hp <= 0) return this.defeat();
    await this.enemyTurn();
    if (game.hp <= 0) return this.defeat();

    this.drawUp();
    this.busy = false;
    this.updatePreview();
  }

  private async animateScore(r: ScoreResult, views: CardView[]): Promise<void> {
    let tick = 0;
    for (const step of r.steps) {
      if (step.kind === 'base') {
        this.showScore(r.combo.name, step.atk, step.def);
        this.tweens.add({ targets: this.comboText, scale: 1.25, duration: 120, yoyo: true });
      } else if (step.kind === 'card') {
        const v = views.find((x) => x.card === step.card);
        if (v) {
          this.tweens.add({ targets: v, y: v.y - 10, duration: 90, yoyo: true });
          floatText(this, v.x, v.y - 44, `+${step.card.power}`, step.toAtk ? ATK_COLOR : DEF_COLOR, 13);
        }
        this.showScore(r.combo.name, step.atk, step.def);
      } else {
        const slot = this.slots[step.slot];
        this.tweens.add({ targets: slot, scale: 1.35, angle: 8, duration: 110, yoyo: true });
        this.cameras.main.flash(80, 255, 230, 150, false);
        floatText(this, slot.x, slot.y + 26, step.text, '#ffe070', 10);
        Sound.cast(step.slot);
        this.showScore(r.combo.name, step.atk, step.def);
      }
      Sound.comboTick(tick++);
      await this.wait(step.kind === 'spell' ? 320 : 200);
    }
    this.tweens.add({ targets: [this.atkText, this.defText], scale: 1.2, duration: 140, yoyo: true });
    await this.wait(250);
  }

  private async heroStrike(dmg: number): Promise<void> {
    await this.tweenP({ targets: this.hero, x: 160, duration: 140, ease: 'Cubic.easeIn' });
    Sound.hit(Math.min(2, 1 + dmg / 300));
    this.enemy.setTintFill(0xffffff);
    this.cameras.main.shake(120, Math.min(0.02, 0.004 + dmg / 20000));
    this.enemyHp = Math.max(0, this.enemyHp - dmg);
    floatText(this, this.enemy.x, this.enemy.y - 90, `−${dmg}`, ATK_COLOR, 20);
    this.updateEnemyUi();
    this.time.delayedCall(100, () => this.enemy.clearTint());
    await this.tweenP({ targets: this.hero, x: 100, duration: 200, ease: 'Cubic.easeOut' });
  }

  private async enemyTurn(): Promise<void> {
    await this.tweenP({ targets: this.enemy, x: 470, duration: 160, ease: 'Cubic.easeIn' });
    const blocked = Math.min(this.shield, this.intent);
    const dmg = this.intent - blocked;
    if (blocked > 0) floatText(this, this.hero.x + 30, this.hero.y - 70, `⛨ ${blocked}`, DEF_COLOR, 12);
    if (dmg > 0) {
      game.heal(-dmg);
      Sound.hurt();
      this.hero.setTintFill(0xff4040);
      this.cameras.main.shake(140, 0.008);
      floatText(this, this.hero.x, this.hero.y - 56, `−${dmg}`, '#ff5050', 18);
      this.time.delayedCall(120, () => this.hero.clearTint());
    } else {
      Sound.block();
    }
    this.refreshBar();
    await this.tweenP({ targets: this.enemy, x: 540, duration: 220, ease: 'Cubic.easeOut' });
    this.shield = 0;
    this.shieldText.setText('');
    this.rollIntent();
  }

  private rollIntent(): void {
    const [lo, hi] = game.enemy.attack;
    this.intent = Phaser.Math.Between(lo, hi);
    this.intentText.setText(`⚔ ${STR.intent}: ${this.intent}`);
  }

  private updateEnemyUi(): void {
    const e = game.enemy;
    this.enemyBar.width = Math.max(0, 100 * (this.enemyHp / e.hp));
    this.enemyHpText.setText(`${this.enemyHp}/${e.hp}`);
  }

  // ---------------- итоги ----------------

  private victory(): void {
    Sound.victory();
    this.tweens.add({ targets: this.enemy, alpha: 0, scaleY: 0.1, duration: 500 });
    const final = game.isLastNode;
    const reward = game.applyVictory();
    this.refreshBar();
    this.resultPanel(final ? STR.runWon : STR.victory, `+${reward.gold} золота${reward.heal ? `, +${reward.heal} HP` : ''}`, final ? STR.newRun : STR.toShop, () => {
      if (final) {
        game.reset();
        fadeTo(this, 'Title');
      } else fadeTo(this, 'Shop');
    });
  }

  private defeat(): void {
    Sound.defeat();
    Sound.stopMusic();
    this.tweens.add({ targets: this.hero, angle: -90, alpha: 0.5, duration: 600 });
    this.resultPanel(STR.defeat, `Пройдено точек: ${game.node}`, STR.newRun, () => {
      game.reset();
      fadeTo(this, 'Title');
    });
  }

  private resultPanel(title: string, sub: string, btn: string, onClick: () => void): void {
    this.busy = true;
    const ui = uiPalette(game.darkness);
    this.add.rectangle(0, 0, W, H, 0x000000, 0.55).setOrigin(0).setDepth(200).setInteractive();
    panel(this, W / 2, H / 2, 300, 140).setDepth(201);
    txt(this, W / 2, H / 2 - 36, title, 18, ui.text).setDepth(202);
    txt(this, W / 2, H / 2 - 6, sub, 12, ui.textDim).setDepth(202);
    button(this, W / 2, H / 2 + 38, 160, 30, btn, onClick).setDepth(202);
  }

  // ---------------- утилиты ----------------

  private wait(ms: number): Promise<void> {
    return new Promise((res) => this.time.delayedCall(ms, () => res()));
  }

  private tweenP(cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((res) => this.tweens.add({ ...cfg, onComplete: () => res() }));
  }
}
