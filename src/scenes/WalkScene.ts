import Phaser from 'phaser';
import { Sound } from '../audio/SoundEngine';
import { ROUTE_CFG, STR, eventById } from '../core/data';
import { fmt } from '../core/enemyAI';
import { game } from '../core/GameState';
import type { RouteNode } from '../core/types';
import { backdrop } from '../ui/views';
import { ambientTint } from '../visual/scenery';
import { H, W, fadeTo, floatText, panel, topBar, txt } from '../ui/widgets';

/** Сколько мира после развилки до выбранной точки (≈ 3 с ходьбы). */
const AFTER_FORK = 300;
const HERO_SPEED = 0.1; // px/мс
const FORK_CARD_W = 150;
const FORK_CARD_H = 124;

type PoiKind = keyof typeof ROUTE_CFG.poi;

/**
 * Прогулка по тропе с параллаксом. Удержание пальца в правой половине экрана — идти вперёд,
 * в левой — назад. Если впереди развилка — в конце сегмента выбор из 2–3 точек (касанием),
 * затем короткий отрезок к выбранной точке.
 */
export class WalkScene extends Phaser.Scene {
  private hero!: Phaser.GameObjects.Image;
  private layers!: ReturnType<typeof backdrop>;
  private shade!: Phaser.GameObjects.Rectangle;
  private poiX = 0;
  private stopX = 0;
  private forkX = -1;
  private walkTime = 0;
  private arrived = false;
  private forkOpen = false;
  private coins: Phaser.GameObjects.Image[] = [];
  private refreshBar!: () => void;
  private dStart = 0;
  private dEnd = 0;
  private progressFill!: Phaser.GameObjects.Rectangle;
  private lantern!: Phaser.GameObjects.Image;

  constructor() {
    super('Walk');
  }

  create(): void {
    this.arrived = false;
    this.forkOpen = false;
    this.walkTime = 0;
    this.cameras.main.fadeIn(300);
    this.dStart = game.darknessAt(game.node - 1);
    this.dEnd = game.darkness;
    Sound.startMusic(this.dStart);

    const fork = game.needsChoice;
    if (!fork && game.choice < 0) game.choose(game.options[0]);
    const len = ROUTE_CFG.segmentLength;
    this.forkX = fork ? len - 70 : -1;
    this.poiX = fork ? this.forkX + AFTER_FORK : len - 70;
    this.stopX = fork ? this.forkX : this.poiX;
    const worldW = this.poiX + 70;

    const groundY = 300;
    this.layers = backdrop(this, this.dStart, groundY, { foreground: true, seed: 11 + game.node * 7 });
    // Плавное потемнение по ходу сегмента
    this.shade = this.add.rectangle(0, 0, W, H, 0x0a0614, 0).setOrigin(0).setScrollFactor(0);

    if (fork) {
      // Указатель развилки на обочине
      const sign = this.add.image(this.forkX + 44, 352, 'poi-sign').setOrigin(0.5, 1).setScale(2).setTint(ambientTint(this.dEnd));
      txt(this, sign.x, 352 - sign.displayHeight - 12, STR.forkTitle, 11, '#fff4d0').setStroke('#000000', 3);
    } else this.buildPoi(game.current);

    this.coins = [];
    for (let i = 0; i < 3; i++) {
      const x = 180 + i * ((this.stopX - 220) / 3) + Math.random() * 60;
      const c = this.add.image(x, 338, 'icon-coin').setScale(1.5);
      this.tweens.add({ targets: c, y: 333, duration: 500, yoyo: true, repeat: -1, delay: i * 120 });
      this.coins.push(c);
    }

    this.lantern = this.add.image(60, 330, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffc060).setScale(1.6).setAlpha(0.35 + this.dStart * 0.4);
    this.tweens.add({ targets: this.lantern, scale: 1.75, duration: 160, yoyo: true, repeat: -1, repeatDelay: 90 });
    this.hero = this.add.image(60, 352, 'hero-0').setOrigin(0.5, 1).setScale(2).setTint(ambientTint(this.dStart));
    this.cameras.main.setBounds(0, 0, worldW, H);
    this.cameras.main.startFollow(this.hero, true, 0.15, 0.15, -80, 0);

    const depth = fmt(STR.routeDepth, { n: game.node + 1, t: game.routeLength });
    this.refreshBar = topBar(this, `${depth} · ${fork ? STR.forkTitle : this.nodeName(game.current)}`);
    const hint = txt(this, W / 2, 40, STR.walkHint, 11, '#fff4d0').setStroke('#000000', 3).setScrollFactor(0);
    this.tweens.add({ targets: hint, alpha: 0, delay: 3500, duration: 800 });

    // Прогресс-бар сегмента
    this.add.rectangle(W / 2, 62, 300, 6, 0x000000, 0.5).setScrollFactor(0);
    this.progressFill = this.add.rectangle(W / 2 - 149, 62, 1, 4, 0xffd860).setOrigin(0, 0.5).setScrollFactor(0);
  }

  private poiKind(n: RouteNode): PoiKind {
    return n.type === 'enemy' && game.enemyOf(n).boss ? 'boss' : n.type;
  }

  private nodeName(n: RouteNode): string {
    if (n.type === 'enemy') return game.enemyOf(n).name;
    if (n.type === 'event') return eventById(n.id).title;
    return ROUTE_CFG.poi.campfire.name;
  }

  private poiSprite(n: RouteNode): string {
    return n.type === 'event' && n.id === 'tavern' ? 'poi-tavern' : ROUTE_CFG.poi[this.poiKind(n)].sprite;
  }

  /** Точка интереса в конце пути. */
  private buildPoi(node: RouteNode): void {
    const sprite = this.poiSprite(node);
    const poiImg = this.add.image(this.poiX, 352, sprite).setOrigin(0.5, 1).setScale(sprite === 'poi-tavern' ? 3 : 2);
    poiImg.setTint(ambientTint(this.dEnd));
    const poiGlow = this.add.image(this.poiX, 330, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(node.type === 'enemy' ? 0xff4040 : 0xffc060).setScale(2.4).setAlpha(0.5);
    this.tweens.add({ targets: poiGlow, alpha: 0.3, scale: 2.7, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const name = node.type === 'event' ? ROUTE_CFG.poi.event.name : this.nodeName(node);
    txt(this, this.poiX, 352 - poiImg.displayHeight - 12, name, 11, '#fff4d0').setStroke('#000000', 3);
  }

  update(_t: number, dt: number): void {
    if (this.arrived) return;
    const p = this.input.activePointer;
    let dir = 0;
    if (p.isDown && !this.forkOpen) dir = p.x > W / 2 ? 1 : -1;
    if (dir !== 0) {
      this.hero.x = Phaser.Math.Clamp(this.hero.x + dir * HERO_SPEED * dt, 30, this.stopX);
      this.hero.setFlipX(dir < 0);
      this.walkTime += dt;
      const frame = Math.floor(this.walkTime / 160) % 2;
      if (this.hero.texture.key !== `hero-${frame}`) {
        this.hero.setTexture(`hero-${frame}`);
        this.hero.y = frame === 0 ? 351 : 352;
        if (frame === 0) Sound.footstep();
      }
    } else if (this.hero.texture.key !== 'hero-0') {
      this.hero.setTexture('hero-0');
      this.hero.y = 352;
    }

    this.layers.update(this.cameras.main.scrollX, this.time.now);
    this.lantern.setPosition(this.hero.x + (this.hero.flipX ? -14 : 14), this.hero.y - 16);
    const frac = this.hero.x / this.poiX;
    this.progressFill.width = Math.max(1, 298 * frac);
    this.shade.fillAlpha = Math.max(0, (this.dEnd - this.dStart) * 0.5 * frac);

    for (const c of this.coins) {
      if (c.active && Math.abs(c.x - this.hero.x) < 14) {
        game.gold += 1;
        Sound.coin();
        floatText(this, c.x, c.y - 10, '+1', '#ffd860', 12);
        c.destroy();
        this.refreshBar();
      }
    }

    if (this.hero.x >= this.stopX - 1) {
      if (this.stopX === this.forkX && !this.forkOpen) this.openFork();
      else if (this.stopX === this.poiX) this.arrive();
    }
  }

  /** Развилка: 2–3 таблички следующих точек, выбор касанием (pointerdown → pointerup на той же). */
  private openFork(): void {
    this.forkOpen = true;
    this.hero.setTexture('hero-0').setFlipX(false);
    this.hero.y = 352;
    const opts = game.options;
    const layer = this.add.container(0, 0).setScrollFactor(0).setDepth(500);
    layer.add(this.add.rectangle(0, 0, W, H, 0x000000, 0.35).setOrigin(0).setInteractive());
    layer.add(txt(this, W / 2, 86, STR.forkTitle, 16, '#fff4d0').setStroke('#000000', 3));
    layer.add(txt(this, W / 2, 106, STR.forkHint, 10, '#e8dcc8').setStroke('#000000', 3));
    const gap = 18;
    const total = opts.length * FORK_CARD_W + (opts.length - 1) * gap;
    opts.forEach((idx, k) => {
      const node = game.optionNode(idx);
      const x = W / 2 - total / 2 + FORK_CARD_W / 2 + k * (FORK_CARD_W + gap);
      const y = 190;
      const card = this.add.container(x, y);
      card.add(panel(this, 0, 0, FORK_CARD_W, FORK_CARD_H, 0.95));
      const kind = this.poiKind(node);
      const glowTint = node.type === 'enemy' ? 0xff4040 : node.type === 'campfire' ? 0xffb050 : 0xffe0a0;
      card.add(this.add.image(0, -14, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(glowTint).setScale(1.4).setAlpha(0.35));
      const sprite = node.type === 'enemy' ? `enemy-${game.enemyOf(node).sprite}` : this.poiSprite(node);
      const img = this.add.image(0, 8, sprite).setOrigin(0.5, 1);
      img.setScale(Math.min(2.5, 54 / img.width, 50 / img.height));
      card.add(img);
      card.add(txt(this, 0, -FORK_CARD_H / 2 + 12, ROUTE_CFG.poi[kind].name, 9, node.type === 'enemy' ? '#ff9a8a' : '#ffe0a0').setStroke('#000000', 2));
      card.add(txt(this, 0, 32, this.nodeName(node), 10, '#fff4d0').setStroke('#000000', 3).setWordWrapWidth(FORK_CARD_W - 14));
      card.setSize(FORK_CARD_W, FORK_CARD_H).setInteractive({ useHandCursor: true });
      let armed = false;
      card.on('pointerdown', () => {
        armed = true;
        card.setScale(0.96);
      });
      card.on('pointerout', () => {
        armed = false;
        card.setScale(1);
      });
      card.on('pointerup', () => {
        if (!armed || !this.forkOpen) return;
        armed = false;
        this.pickFork(idx, layer);
      });
      layer.add(card);
      card.setAlpha(0);
      this.tweens.add({ targets: card, alpha: 1, y: { from: y + 12, to: y }, duration: 220, delay: k * 80 });
    });
    layer.setScrollFactor(0, 0, true); // и детям — чтобы касания попадали при прокрученной камере
  }

  private pickFork(idx: number, layer: Phaser.GameObjects.Container): void {
    Sound.click();
    game.choose(idx);
    layer.destroy();
    this.buildPoi(game.current);
    this.stopX = this.poiX;
    this.forkOpen = false; // дальше — короткий отрезок пути к выбранной точке
  }

  private arrive(): void {
    this.arrived = true;
    Sound.startMusic(this.dEnd);
    const node = game.current;
    this.time.delayedCall(250, () => {
      if (node.type === 'enemy') fadeTo(this, 'Battle');
      else fadeTo(this, 'Encounter');
    });
  }
}
