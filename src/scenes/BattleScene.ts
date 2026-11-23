import Phaser from 'phaser';
import { Sound } from '../audio/SoundEngine';
import { RARITIES, RULES, STR } from '../core/data';
import { BattleDeck } from '../core/deck';
import { EnemyState, pickCurseTargets, type EnemyEvent, type PhaseEvent } from '../core/enemyAI';
import { fmt } from '../core/format';
import { game } from '../core/GameState';
import { scorePlay, type ScoreResult, type Track } from '../core/scoring';
import type { Card, EnemyActionType } from '../core/types';
import { openCombosOverlay } from '../ui/combosOverlay';
import { type Plaque, ScoreRow, scoreTier } from '../ui/scoreBoard';
import { backdrop, cardTable, cardView, spellView, type CardView, type SpellView } from '../ui/views';
import { type Button, H, W, button, fadeTo, floatText, panel, topBar, txt } from '../ui/widgets';
import { uiPalette } from '../visual/palette';
import { addVignette, ambientTint, type Scenery } from '../visual/scenery';
import { CARD_H, CARD_W } from '../visual/textures';

const TABLE_TOP = 232;
const HAND_Y = 300;
const ATK_COLOR = '#ff7a5a';
const DEF_COLOR = '#7ab8ff';
const CURSE_COLOR = '#d080ff';
const ENEMY_X = 540;
const BAR_W = 100;
const INTENT_COLOR: Record<EnemyActionType, string> = {
  attack: '#ffb0a0', heavy: '#ff4a3a', multi: '#ffb0a0', steal: '#ffd860',
  block: DEF_COLOR, curse: CURSE_COLOR, buff: '#ffb030', heal: '#70e080',
};

/** Карточный бой: Атака = Сила × Множ., Щит = Сила × Множ. Враг бьёт после каждого розыгрыша. */
export class BattleScene extends Phaser.Scene {
  private deck!: BattleDeck;
  private hand: CardView[] = [];
  private slots: SpellView[] = [];
  private foe!: EnemyState;
  private shield = 0;
  private discards = 0;
  /** uid проклятых рун в руке (Сила 0 в подсчёте до конца следующего розыгрыша). */
  private cursed = new Set<number>();
  private pendingCurse = 0;
  private curseMarks = new Map<CardView, Phaser.GameObjects.GameObject[]>();
  private busy = false;

  private hero!: Phaser.GameObjects.Image;
  private enemy!: Phaser.GameObjects.Image;
  private enemyBar!: Phaser.GameObjects.Rectangle;
  private enemyHpText!: Phaser.GameObjects.Text;
  private intentBox!: Phaser.GameObjects.Container;
  private intentIcon!: Phaser.GameObjects.Image;
  private intentText!: Phaser.GameObjects.Text;
  private intentHint!: Phaser.GameObjects.Text;
  private rageText!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private enemyShieldBg!: Phaser.GameObjects.Rectangle;
  private enemyShieldBar!: Phaser.GameObjects.Rectangle;
  private enemyShieldText!: Phaser.GameObjects.Text;
  private shieldText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private atkRow!: ScoreRow;
  private defRow!: ScoreRow;
  private scoreHeads: Phaser.GameObjects.Text[] = [];
  private hintText!: Phaser.GameObjects.Text;
  private deckText!: Phaser.GameObjects.Text;
  private playBtn!: Button;
  private discardBtn!: Button;
  private refreshBar!: () => void;
  private scenery!: Scenery;
  private lantern!: Phaser.GameObjects.Image;

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
    this.cursed = new Set();
    this.curseMarks = new Map();
    this.pendingCurse = 0;
    this.tweens.timeScale = 1; // на случай рестарта сцены посреди хит-стопа
    this.foe = new EnemyState(e);
    this.shield = 0;
    this.discards = RULES.discardsPerBattle;
    this.deck = new BattleDeck(game.deck);

    this.scenery = backdrop(this, d, 200, { bottom: TABLE_TOP, seed: 5 + game.node * 13, vignette: false });
    addVignette(this, d, 5).setDisplaySize(W, TABLE_TOP + 6);
    cardTable(this, d, TABLE_TOP);
    this.refreshBar = topBar(this, `${e.boss ? '☠ ' : ''}${e.name}`);

    // Слоты заклинаний
    txt(this, W / 2, 78, STR.spells, 9, '#fff4d0').setStroke('#000000', 3);
    for (let i = 0; i < RULES.maxSpellSlots; i++) {
      this.slots.push(spellView(this, W / 2 - 84 + i * 42, 52, game.spells[i] ?? null));
    }

    // Герой и враг
    this.lantern = this.add.image(112, 206, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffc060).setScale(1.5).setAlpha(0.35 + d * 0.4);
    this.tweens.add({ targets: this.lantern, scale: 1.65, duration: 160, yoyo: true, repeat: -1, repeatDelay: 90 });
    this.hero = this.add.image(100, 222, 'hero-0').setOrigin(0.5, 1).setScale(2).setTint(ambientTint(d));
    this.shieldText = txt(this, 100, 160, '', 12, DEF_COLOR).setStroke('#000000', 3);
    const aura = this.add.image(540, 200, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(e.boss ? 0xb040ff : 0xff5050).setScale(2.6).setAlpha(0.18 + d * 0.3);
    this.tweens.add({ targets: aura, alpha: aura.alpha * 0.6, duration: 1200, yoyo: true, repeat: -1 });
    this.enemy = this.add.image(540, 222, `enemy-${e.sprite}`).setOrigin(0.5, 1).setScale(3).setTint(ambientTint(d * 0.6));
    this.tweens.add({ targets: this.enemy, scaleY: this.enemy.scaleY * 1.04, duration: 700, yoyo: true, repeat: -1 });
    // Над врагом: намерение (иконка + число + подсказка), ярость, HP, Щит врага
    this.intentBox = this.add.container(ENEMY_X, 40);
    this.intentIcon = this.add.image(-4, 0, 'icon-intent-attack').setScale(2).setOrigin(1, 0.5);
    this.intentText = txt(this, -2, 0, '', 15, INTENT_COLOR.attack, [0, 0.5]).setStroke('#000000', 3);
    this.intentBox.add([this.intentIcon, this.intentText]);
    this.intentHint = txt(this, ENEMY_X, 60, '', 8, '#ffe8d0').setStroke('#000000', 3).setWordWrapWidth(176);
    this.rageText = txt(this, ENEMY_X, 78, '', 8, '#ff6a4a').setStroke('#000000', 3);
    this.add.rectangle(ENEMY_X, 94, BAR_W + 4, 10, 0x120a0e, 0.85).setStrokeStyle(1, 0x5a3a3a);
    this.enemyBar = this.add.rectangle(ENEMY_X - BAR_W / 2, 94, BAR_W, 6, 0xd03a4a).setOrigin(0, 0.5);
    this.enemyHpText = txt(this, ENEMY_X, 94, '', 8, '#ffffff').setStroke('#000000', 3);
    this.enemyShieldBg = this.add.rectangle(ENEMY_X, 105, BAR_W + 4, 8, 0x0a0e1a, 0.85).setStrokeStyle(1, 0x2a4a7a);
    this.enemyShieldBar = this.add.rectangle(ENEMY_X - BAR_W / 2, 105, BAR_W, 4, 0x5a9ae0).setOrigin(0, 0.5);
    this.enemyShieldText = txt(this, ENEMY_X, 105, '', 8, '#d8ecff').setStroke('#000000', 3);
    this.phaseText = txt(this, ENEMY_X, 118, '', 8, CURSE_COLOR).setStroke('#000000', 3);

    // Панель подсчёта
    panel(this, W / 2, 148, 230, 74, 0.9);
    const ui = uiPalette(d);
    this.comboText = txt(this, W / 2, 122, STR.selectHint, 13, ui.text);
    // Плашки-счётчики: «⚔ [Сила] × [Множ.] = ИТОГ» и «⛨ [Сила] × [Множ.] = ИТОГ»
    this.scoreHeads = [
      txt(this, W / 2 - 56, 135, STR.power, 8, ui.textDim),
      txt(this, W / 2 + 4, 135, STR.mult, 8, ui.textDim),
    ];
    this.atkRow = new ScoreRow(this, W / 2, 150, '⚔', ATK_COLOR);
    this.defRow = new ScoreRow(this, W / 2, 171, '⛨', DEF_COLOR);

    // Колода и кнопки
    this.add.image(36, HAND_Y, 'card-back').setScale(0.8);
    this.deckText = txt(this, 36, HAND_Y + 36, '', 10, '#fff4d0').setStroke('#000000', 3);
    this.discardBtn = button(this, 200, 378, 110, 26, '', () => this.discardSelected());
    this.playBtn = button(this, 440, 378, 120, 26, STR.play, () => void this.playSelected());
    this.hintText = txt(this, W / 2, 196, '', 9, '#fff4d0').setStroke('#000000', 3).setWordWrapWidth(300);
    this.turnText = txt(this, 36, 252, '', 9, '#fff4d0').setStroke('#000000', 3);
    // Справочник комбинаций (≥ 28px, левый верхний угол — там пусто)
    button(this, 26, 46, 30, 30, STR.combosButton, () => openCombosOverlay(this));

    this.updateEnemyUi();
    this.updateIntent(false);
    this.drawUp();
    this.updatePreview();
  }

  update(time: number): void {
    this.scenery.update(0, time);
    this.lantern.x = this.hero.x + 12;
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
      // во время подсчёта рука уезжает вниз и тускнеет, чтобы не мешать сыгранным рунам
      const y = this.busy ? HAND_Y + 48 : HAND_Y - (this.isSelected(v) ? 14 : 0);
      v.setDepth(10 + i);
      this.tweens.add({ targets: v, x, y, alpha: this.busy ? 0.55 : 1, duration: 180, ease: 'Back.easeOut' });
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
      this.comboText.setText(STR.selectHint).setScale(1);
      this.setRowsVisible(false);
      this.hintText.setText('');
      return;
    }
    const r = scorePlay(cards, this.hand.length - cards.length, game.spells, this.cursed);
    this.showScore(r.combo.name, r.atk, r.def);
    // Подсветка: созвучие учитывает все выбранные руны → золотое свечение; без созвучия — тусклое.
    const lone = r.combo.requirement.type === 'any';
    for (const v of this.selected) v.glow.setTint(lone ? 0x8a8a9a : 0xffe070).setAlpha(lone ? 0.6 : 1);
    this.hintText.setText(lone ? STR.noHarmony : r.combo.desc);
  }

  private showScore(name: string, atk: Track, def: Track): void {
    this.comboText.setText(name);
    this.setRowsVisible(true);
    this.atkRow.set(atk);
    this.defRow.set(def);
  }

  private setRowsVisible(on: boolean): void {
    this.atkRow.setVisible(on);
    this.defRow.setVisible(on);
    this.scoreHeads.forEach((t) => t.setVisible(on));
  }

  private discardSelected(): void {
    if (this.busy || this.discards <= 0 || this.selected.size === 0) return;
    this.discards--;
    const gone = this.hand.filter((v) => this.selected.has(v));
    for (const v of gone) this.cursed.delete(v.card.uid);
    this.deck.discard(gone.map((v) => v.card));
    this.removeViews(gone);
    this.drawUp();
    this.updatePreview();
  }

  private removeViews(views: CardView[]): void {
    for (const v of views) {
      this.selected.delete(v);
      this.curseMarks.delete(v);
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
    const result = scorePlay(views.map((v) => v.card), this.hand.length - views.length, game.spells, this.cursed);

    // Сыгранные руны выезжают в центр стола
    views.forEach((v, i) => {
      v.glow.setVisible(false);
      this.tweens.add({ targets: v, x: W / 2 - (views.length - 1) * 29 + i * 58, y: 250, duration: 220, ease: 'Cubic.easeOut' });
      v.setDepth(60 + i);
    });
    this.hand = this.hand.filter((v) => !views.includes(v));
    this.selected.clear();
    this.layoutHand();
    await this.wait(260);
    await this.animateScore(result, views);

    // Применение
    if (result.hpLoss > 0) {
      game.heal(-result.hpLoss);
      floatText(this, this.hero.x, this.hero.y - 56, `−${result.hpLoss}`, '#d080ff');
      this.refreshBar();
    }
    this.shield = result.shield;
    this.shieldText.setText(this.shield > 0 ? `⛨ ${this.shield}` : '');
    if (this.shield > 0) Sound.block();
    if (result.attack > 0) await this.heroStrike(result.attack);

    this.deck.discard(views.map((v) => v.card));
    this.removeViews(views);
    this.clearCurses(); // проклятие действует ровно один розыгрыш
    await this.wait(200);

    if (this.foe.isDead) return this.victory();
    if (game.hp <= 0) return this.defeat();
    await this.enemyTurn();
    if (game.hp <= 0) return this.defeat();

    this.drawUp();
    if (this.pendingCurse > 0) {
      await this.wait(260);
      this.applyCurse(this.pendingCurse);
      this.pendingCurse = 0;
    }
    const phase = this.foe.endTurn();
    if (phase) await this.phaseBanner(phase);
    this.updateEnemyUi();
    this.updateIntent(true);
    this.busy = false;
    this.layoutHand();
    this.updatePreview();
  }

  /**
   * «Сок» подсчёта: плашки Сила/Множ. тикают и подпрыгивают, искры летят от рун и слотов к счётчикам,
   * финал «Сила × Множ. = ИТОГ» бьёт крупным числом. Общая длительность ≲ 3 с при любом числе шагов.
   */
  private async animateScore(r: ScoreResult, views: CardView[]): Promise<void> {
    const steps = r.steps;
    const total = steps.length;
    const weight = (k: string) => (k === 'spell' ? 1.4 : k === 'base' ? 1.2 : 1);
    const sumW = steps.reduce((acc, st) => acc + weight(st.kind), 0);
    const unit = Phaser.Math.Clamp(1700 / sumW, 85, 230);
    const zero: Track = { power: 0, mult: 0 };

    this.comboText.setText(r.combo.name);
    this.setRowsVisible(true);
    this.atkRow.set(zero);
    this.defRow.set(zero);
    this.atkRow.total.setText('…');
    this.defRow.total.setText('…');
    let prevAtk: Track = zero;
    let prevDef: Track = zero;

    for (let i = 0; i < total; i++) {
      const step = steps[i];
      const dt = unit * weight(step.kind);
      const travel = Math.round(dt * 0.45);
      Sound.scoreRiser(i, total);
      // какие плашки изменились на этом шаге
      const changed: { plaque: Plaque; value: number }[] = [];
      if (step.atk.power !== prevAtk.power) changed.push({ plaque: this.atkRow.power, value: step.atk.power });
      if (step.atk.mult !== prevAtk.mult) changed.push({ plaque: this.atkRow.mult, value: step.atk.mult });
      if (step.def.power !== prevDef.power) changed.push({ plaque: this.defRow.power, value: step.def.power });
      if (step.def.mult !== prevDef.mult) changed.push({ plaque: this.defRow.mult, value: step.def.mult });
      prevAtk = step.atk;
      prevDef = step.def;

      if (step.kind === 'base') {
        this.comboText.setScale(1.5);
        this.tweens.add({ targets: this.comboText, scale: 1, duration: 200, ease: 'Back.easeOut' });
        changed.forEach((c) => c.plaque.tickTo(c.value, dt * 0.6));
      } else if (step.kind === 'card') {
        const v = views.find((x) => x.card === step.card);
        const row = step.toAtk ? this.atkRow : this.defRow;
        if (v) this.tweens.add({ targets: v, y: v.y - 10, duration: 90, yoyo: true });
        if (step.cursed) {
          if (v) this.extinguish(v, step.card.power);
          row.power.bump(0xa040e0, false);
        } else if (v) {
          floatText(this, v.x, v.y - 44, `+${step.power}`, step.toAtk ? ATK_COLOR : DEF_COLOR, 13);
          const col = step.toAtk ? 0xff7a5a : 0x7ab8ff;
          this.sparks({ x: v.x, y: v.y - 30 }, row.power.anchor, col, 5, travel);
          this.time.delayedCall(travel, () => changed.forEach((c) => c.plaque.tickTo(c.value, dt * 0.5)));
        } else changed.forEach((c) => c.plaque.tickTo(c.value, dt * 0.5));
      } else {
        const slot = this.slots[step.slot];
        const rc = Phaser.Display.Color.HexStringToColor(RARITIES[step.spell.rarity].color).color;
        this.slotFlash(slot, rc);
        floatText(this, slot.x, slot.y + 26, step.text, '#ffe070', 10);
        Sound.cast(step.slot);
        if (changed.length === 0) this.burst(slot.x, slot.y, rc, 8);
        for (const c of changed) this.sparks({ x: slot.x, y: slot.y }, c.plaque.anchor, rc, 8, travel);
        this.time.delayedCall(travel, () => changed.forEach((c) => c.plaque.tickTo(c.value, dt * 0.5, rc)));
      }
      await this.wait(dt);
    }

    // Финал: «Сила × Множ. = ИТОГ»
    const main = Math.max(r.attack, r.shield);
    const tier = scoreTier(main);
    const mainRow = r.attack >= r.shield ? this.atkRow : this.defRow;
    const sideRow = mainRow === this.atkRow ? this.defRow : this.atkRow;
    Sound.scoreImpact(main);
    if (main > 0) await this.bigTotal(main, mainRow, tier);
    mainRow.slam(mainRow === this.atkRow ? r.atk : r.def, tier);
    sideRow.slam(sideRow === this.atkRow ? r.atk : r.def, 0, 70);
    await this.wait(200 + tier * 60);
  }

  /** Крупное число итога на месте «= ИТОГ»: удар, выдержка (длиннее на больших итогах), оседание в ряд. */
  private async bigTotal(v: number, row: ScoreRow, tier: 0 | 1 | 2): Promise<void> {
    const cx = row.total.x + 6;
    const cy = row.total.y;
    const col = Phaser.Display.Color.HexStringToColor(row.color).color;
    const glow = this.add.image(cx, cy, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(col).setDepth(79).setScale(0.5).setAlpha(0.9);
    this.tweens.add({ targets: glow, scale: 2 + tier * 1.2, alpha: 0, duration: 380 + tier * 120, onComplete: () => glow.destroy() });
    const size = [22, 30, 38][tier];
    const t = txt(this, cx, cy, String(v), size, tier === 2 ? '#fff4d0' : row.color).setStroke('#000000', 4).setDepth(80);
    if (tier === 2) t.setTint(0xffe070, 0xffe070, 0xff7a5a, 0xff7a5a);
    t.setScale(0.3);
    this.burst(cx, cy, col, 8 + tier * 10, 40 + tier * 30);
    this.cameras.main.shake(120 + tier * 80, 0.002 + tier * 0.003);
    if (tier === 2) this.cameras.main.flash(120, 255, 230, 160, false);
    await this.tweenP({ targets: t, scale: 1, duration: 140, ease: 'Back.easeOut' });
    if (tier > 0) this.tweens.add({ targets: t, angle: { from: -3, to: 3 }, duration: 50, yoyo: true, repeat: tier * 2 });
    await this.wait(100 + tier * 130);
    await this.tweenP({ targets: t, x: row.total.x, y: row.total.y, scale: 0.4, alpha: 0.2, duration: 120, ease: 'Cubic.easeIn' });
    t.destroy();
  }

  /** Проклятая руна: её Сила вспыхивает фиолетовым и «гаснет» в 0, вверх уходит дымок. */
  private extinguish(v: CardView, power: number): void {
    const x = v.x;
    const y = v.y - 44;
    const t = txt(this, x, y, `+${power}`, 13, CURSE_COLOR).setStroke('#000000', 3).setDepth(100);
    this.tweens.add({
      targets: t, alpha: 0.2, duration: 45, yoyo: true, repeat: 2,
      onComplete: () => {
        this.tweens.add({ targets: t, scaleX: 1.6, scaleY: 0.1, alpha: 0, duration: 120, onComplete: () => t.destroy() });
        const z = txt(this, x, y, '0', 15, CURSE_COLOR).setStroke('#000000', 3).setDepth(100).setScale(1.8);
        this.tweens.add({ targets: z, scale: 1, duration: 140, ease: 'Back.easeOut' });
        this.tweens.add({ targets: z, y: y - 18, alpha: 0, delay: 360, duration: 400, onComplete: () => z.destroy() });
      },
    });
    for (let i = 0; i < 6; i++) {
      const p = this.add.rectangle(x + Phaser.Math.Between(-14, 14), v.y - 10, 2, 2, i % 2 ? 0x5a1a7a : 0xa040e0).setDepth(99);
      this.tweens.add({ targets: p, y: p.y - Phaser.Math.Between(20, 36), x: p.x + Phaser.Math.Between(-6, 6), alpha: 0, delay: i * 25, duration: 420, onComplete: () => p.destroy() });
    }
  }

  /** Вспышка рамки слота цветом редкости. */
  private slotFlash(slot: SpellView, color: number): void {
    this.tweens.killTweensOf(slot);
    slot.setScale(1.3).setAngle(6);
    this.tweens.add({ targets: slot, scale: 1, angle: 0, duration: 200, ease: 'Back.easeOut' });
    const frame = this.add.rectangle(slot.x, slot.y, 36, 36).setStrokeStyle(2, color).setDepth(55);
    const glow = this.add.image(slot.x, slot.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(color).setDepth(54).setScale(0.6);
    this.tweens.add({ targets: frame, scale: 1.6, alpha: 0, duration: 280, ease: 'Cubic.easeOut', onComplete: () => frame.destroy() });
    this.tweens.add({ targets: glow, scale: 1.5, alpha: 0, duration: 320, onComplete: () => glow.destroy() });
  }

  /** Искры по дуге (квадратичная Безье) из точки к счётчику. */
  private sparks(from: { x: number; y: number }, to: { x: number; y: number }, color: number, n: number, ms: number): void {
    for (let i = 0; i < n; i++) {
      const sz = i % 3 === 0 ? 3 : 2;
      const sx = from.x + Phaser.Math.Between(-8, 8);
      const sy = from.y + Phaser.Math.Between(-6, 6);
      const mx = (sx + to.x) / 2 + Phaser.Math.Between(-50, 50);
      const my = Math.min(sy, to.y) - Phaser.Math.Between(10, 40);
      const p = this.add.rectangle(sx, sy, sz, sz, i % 2 ? 0xffffff : color).setDepth(60);
      const k = { t: 0 };
      this.tweens.add({
        targets: k, t: 1, delay: i * 10, duration: Math.max(60, ms - i * 10), ease: 'Sine.easeIn',
        onUpdate: () => {
          const u = 1 - k.t;
          p.setPosition(Math.round(u * u * sx + 2 * u * k.t * mx + k.t * k.t * to.x), Math.round(u * u * sy + 2 * u * k.t * my + k.t * k.t * to.y));
        },
        onComplete: () => p.destroy(),
      });
    }
  }

  /** Радиальный разлёт искр. */
  private burst(x: number, y: number, color: number, n: number, radius = 30): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const d = radius * (0.6 + Math.random() * 0.6);
      const sz = i % 3 === 0 ? 3 : 2;
      const p = this.add.rectangle(x, y, sz, sz, i % 2 ? 0xffffff : color).setDepth(81);
      this.tweens.add({
        targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7, alpha: 0,
        duration: 260 + Math.random() * 200, ease: 'Cubic.easeOut', onComplete: () => p.destroy(),
      });
    }
  }

  /** Удар героя: тряска, хит-стоп и вспышка пропорционально итогу; крупное число урона. */
  private async heroStrike(attack: number): Promise<void> {
    const tier = scoreTier(attack);
    const w = Phaser.Math.Clamp((Math.log10(Math.max(1, attack)) - 1) / 2, 0, 1); // 10→0, 50→0.35, 300→0.74, 1000→1
    await this.tweenP({ targets: this.hero, x: 170, duration: 140, ease: 'Cubic.easeIn' });
    const r = this.foe.takeAttack(attack);
    if (r.absorbed > 0) floatText(this, this.enemy.x + 34, this.enemy.y - 110, `⛨ −${r.absorbed}`, DEF_COLOR, 12);
    if (r.broke) {
      Sound.shieldBreak();
      floatText(this, this.enemy.x, this.enemy.y - 126, STR.shieldBroken, '#d8ecff', 12);
    }
    if (r.damage > 0) {
      Sound.hit(Math.min(2, 1 + r.damage / 300));
      this.enemy.setTintFill(0xffffff);
      this.cameras.main.shake(140 + 220 * w, 0.004 + 0.014 * w);
      if (attack >= 300) this.cameras.main.flash(80 + 60 * tier, 255, 240, 220, false);
      const dmg = this.damageNumber(r.damage, tier);
      this.burst(this.enemy.x, this.enemy.y - 40, 0xff7a5a, 6 + tier * 8, 30 + tier * 20);
      // Хит-стоп: все твины почти замирают, камера продолжает трястись
      this.tweens.timeScale = 0.02;
      await this.wait(Math.round(60 + 60 * w));
      this.tweens.timeScale = 1;
      dmg();
      this.time.delayedCall(60 + tier * 30, () => this.enemy.clearTint());
      this.tweens.add({ targets: this.enemy, x: ENEMY_X + 4 + tier * 4, duration: 60, yoyo: true, ease: 'Cubic.easeOut' });
    } else Sound.block();
    this.updateEnemyUi();
    await this.tweenP({ targets: this.hero, x: 100, duration: 200, ease: 'Cubic.easeOut' });
  }

  /** Число урона над врагом: появляется крупным во время хит-стопа, после — оседает и уплывает. */
  private damageNumber(dmg: number, tier: 0 | 1 | 2): () => void {
    const size = [20, 28, 36][tier];
    const y = this.enemy.y - 96;
    const t = txt(this, this.enemy.x, y, `−${dmg}`, size, tier === 2 ? '#ffe070' : ATK_COLOR).setStroke('#000000', 4).setDepth(100).setScale(1.6);
    return () => {
      this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
      this.tweens.add({ targets: t, y: y - 26, alpha: 0, delay: 450 + tier * 200, duration: 500, ease: 'Cubic.easeIn', onComplete: () => t.destroy() });
    };
  }

  /** Действие врага: события из core/enemyAI проигрываются по очереди. */
  private async enemyTurn(): Promise<void> {
    const res = this.foe.act(this.shield, game.gold);
    Sound.enemyIntent(res.action.type);
    let shieldLeft = this.shield;
    for (const ev of res.events) {
      await this.playEnemyEvent(ev, res.events, () => shieldLeft, (v) => (shieldLeft = v));
      if (game.hp <= 0) break;
    }
    this.pendingCurse = res.curse;
    this.shield = 0;
    this.shieldText.setText('');
    this.updateEnemyUi();
  }

  private async playEnemyEvent(ev: EnemyEvent, all: EnemyEvent[], getShield: () => number, setShield: (v: number) => void): Promise<void> {
    const ex = this.enemy.x;
    const ey = this.enemy.y;
    switch (ev.kind) {
      case 'shieldExpired':
        this.updateEnemyUi();
        break;
      case 'rage':
        floatText(this, ex, ey - 130, `${STR.rage} +${ev.added}`, '#ff6a4a', 11);
        this.updateRage();
        await this.wait(160);
        break;
      case 'hit': {
        const multi = all.filter((e) => e.kind === 'hit').length > 1;
        await this.tweenP({ targets: this.enemy, x: ENEMY_X - 70, duration: multi ? 100 : 160, ease: 'Cubic.easeIn' });
        if (ev.blocked > 0) {
          setShield(getShield() - ev.blocked);
          floatText(this, this.hero.x + 30, this.hero.y - 70, `⛨ ${ev.blocked}`, DEF_COLOR, 12);
          this.shieldText.setText(getShield() > 0 ? `⛨ ${getShield()}` : '');
        }
        if (ev.taken > 0) {
          game.heal(-ev.taken);
          Sound.hurt();
          this.hero.setTintFill(0xff4040);
          this.cameras.main.shake(140, 0.008);
          floatText(this, this.hero.x - 8 + ev.index * 14, this.hero.y - 56 - ev.index * 8, `−${ev.taken}`, '#ff5050', 18);
          this.time.delayedCall(120, () => this.hero.clearTint());
        } else Sound.block();
        this.refreshBar();
        await this.tweenP({ targets: this.enemy, x: ENEMY_X, duration: multi ? 140 : 220, ease: 'Cubic.easeOut' });
        break;
      }
      case 'block':
        floatText(this, ex, ey - 110, `⛨ ${ev.shield}`, DEF_COLOR, 14);
        this.tweens.add({ targets: this.enemy, scaleX: this.enemy.scaleX * 1.08, duration: 120, yoyo: true });
        this.updateEnemyUi();
        await this.wait(380);
        break;
      case 'buff':
        floatText(this, ex, ey - 110, `+${ev.value}`, INTENT_COLOR.buff, 14);
        this.enemy.setTintFill(0xffb030);
        this.time.delayedCall(140, () => this.enemy.clearTint());
        await this.wait(380);
        break;
      case 'heal':
        floatText(this, ex, ey - 110, fmt(STR.enemyHealed, { v: ev.amount }), INTENT_COLOR.heal, 14);
        this.enemy.setTintFill(0x70e080);
        this.time.delayedCall(140, () => this.enemy.clearTint());
        this.updateEnemyUi();
        await this.wait(380);
        break;
      case 'steal':
        if (ev.gold > 0) {
          game.gold = Math.max(0, game.gold - ev.gold);
          Sound.stealGold();
          floatText(this, this.hero.x, this.hero.y - 84, fmt(STR.goldStolen, { g: ev.gold }), '#ffd860', 13);
          this.refreshBar();
          await this.wait(300);
        }
        break;
      case 'stealFailed':
        floatText(this, this.hero.x + 20, this.hero.y - 84, STR.stealFailed, '#ffd860', 12);
        await this.wait(300);
        break;
      case 'curse':
        break; // проклятие применяется после добора (applyCurse)
    }
  }

  // ---------------- проклятие рун ----------------

  private applyCurse(count: number): void {
    const uids = pickCurseTargets(this.hand.map((v) => v.card.uid), this.cursed, count);
    if (uids.length === 0) return;
    Sound.curseRune();
    for (const v of this.hand) {
      if (!uids.includes(v.card.uid)) continue;
      this.cursed.add(v.card.uid);
      this.markCursed(v);
    }
    floatText(this, W / 2, HAND_Y - 60, STR.cursedRune, CURSE_COLOR, 12);
    this.updatePreview();
  }

  private markCursed(v: CardView): void {
    const veil = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x1a0628, 0.55);
    const skull = this.add.image(CARD_W / 2 - 9, -CARD_H / 2 + 9, 'icon-skull');
    const zero = txt(this, 0, CARD_H / 2 - 24, '0', 12, CURSE_COLOR).setStroke('#000000', 3);
    v.add([veil, skull, zero]);
    v.powerText.setColor(CURSE_COLOR);
    this.curseMarks.set(v, [veil, skull, zero]);
    veil.setAlpha(0);
    this.tweens.add({ targets: veil, alpha: 1, duration: 300 });
    this.tweens.add({ targets: v, angle: { from: -4, to: 0 }, duration: 260, ease: 'Back.easeOut' });
  }

  private clearCurses(): void {
    for (const [v, marks] of this.curseMarks) {
      marks.forEach((m) => m.destroy());
      if (v.active) v.powerText.setColor('#fff4d0');
    }
    this.curseMarks.clear();
    this.cursed.clear();
  }

  // ---------------- UI врага ----------------

  private updateIntent(announce: boolean): void {
    const it = this.foe.describeIntent();
    this.intentIcon.setTexture(`icon-intent-${it.type}`);
    this.intentText.setText(it.label).setColor(INTENT_COLOR[it.type]);
    this.intentHint.setText(it.hint);
    // центрируем пару «иконка + число»
    this.intentIcon.x = -4;
    this.intentText.x = -2;
    this.intentBox.x = Math.round(ENEMY_X - (this.intentText.width - this.intentIcon.displayWidth - 6) / 2);
    this.intentBox.setScale(1);
    if (announce) this.tweens.add({ targets: this.intentBox, scale: 1.25, duration: 120, yoyo: true });
    if (it.type === 'heavy') {
      // Телеграф тяжёлого удара: тряска значка и лёгкая тряска камеры
      this.tweens.add({ targets: this.intentBox, angle: { from: -8, to: 8 }, duration: 60, yoyo: true, repeat: 3, onComplete: () => this.intentBox.setAngle(0) });
      if (announce) this.cameras.main.shake(160, 0.004);
    }
    this.updateRage();
  }

  private updateRage(): void {
    const r = this.foe.projectedRage;
    this.turnText.setText(`${STR.turn} ${this.foe.turn + 1}`);
    if (r > 0) this.rageText.setText(`${STR.rage} +${r}`).setColor('#ff6a4a').setFontSize(9);
    else this.rageText.setText(fmt(STR.rageHint, { t: this.foe.rageFrom, v: this.foe.rageStep })).setColor('#c8b8a8').setFontSize(8);
  }

  private updateEnemyUi(): void {
    const f = this.foe;
    this.enemyBar.width = Math.max(0, BAR_W * (f.hp / f.maxHp));
    this.enemyHpText.setText(`${f.hp}/${f.maxHp}`);
    const sh = f.shield;
    this.enemyShieldBg.setVisible(sh > 0);
    this.enemyShieldBar.setVisible(sh > 0).width = Math.max(4, BAR_W * Math.min(1, sh / f.maxHp));
    this.enemyShieldText.setText(sh > 0 ? `⛨ ${sh}` : '');
    this.phaseText.setText(f.phaseTitle ?? '');
  }

  private async phaseBanner(p: PhaseEvent): Promise<void> {
    Sound.enemyIntent('curse');
    const strip = this.add.rectangle(W / 2, 196, W, 44, 0x12061c, 0.85).setDepth(150).setAlpha(0);
    const t1 = txt(this, W / 2, 186, STR.phaseChange, 9, '#c8b8d8').setDepth(151).setAlpha(0);
    const t2 = txt(this, W / 2, 202, p.title, 17, CURSE_COLOR).setStroke('#000000', 3).setDepth(151).setAlpha(0);
    this.cameras.main.flash(200, 120, 40, 160, false);
    await this.tweenP({ targets: [strip, t1, t2], alpha: 1, duration: 220 });
    this.updateEnemyUi();
    for (const ev of p.events) await this.playEnemyEvent(ev, p.events, () => 0, () => undefined);
    await this.wait(900);
    await this.tweenP({ targets: [strip, t1, t2], alpha: 0, duration: 260 });
    [strip, t1, t2].forEach((o) => o.destroy());
  }

  // ---------------- итоги ----------------

  private victory(): void {
    Sound.victory();
    this.tweens.add({ targets: this.enemy, alpha: 0, scaleY: 0.1, duration: 500 });
    const final = game.isLastNode;
    const reward = game.applyVictory();
    this.refreshBar();
    this.resultPanel(final ? STR.runWon : STR.victory, fmt(STR.rewardGold, { g: reward.gold }) + (reward.heal ? fmt(STR.rewardHeal, { h: reward.heal }) : ''), final ? STR.newRun : STR.toShop, () => {
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
    this.resultPanel(STR.defeat, fmt(STR.nodesPassed, { n: game.node }), STR.newRun, () => {
      game.reset();
      fadeTo(this, 'Title');
    });
  }

  private resultPanel(title: string, sub: string, btn: string, onClick: () => void): void {
    this.busy = true;
    const ui = uiPalette(game.darkness);
    this.add.rectangle(0, 0, W, H, 0x000000, 0.55).setOrigin(0).setDepth(200).setInteractive();
    panel(this, W / 2, H / 2, 360, 140).setDepth(201);
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
