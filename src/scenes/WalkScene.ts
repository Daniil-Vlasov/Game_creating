import Phaser from 'phaser';
import { Sound } from '../audio/SoundEngine';
import { ROUTE, ROUTE_CFG, STR } from '../core/data';
import { game } from '../core/GameState';
import { backdrop } from '../ui/views';
import { H, W, fadeTo, floatText, topBar, txt } from '../ui/widgets';

/**
 * Линейная прогулка по тропе с параллаксом. Удержание пальца в правой половине экрана —
 * идти вперёд, в левой — назад. В конце сегмента — точка интереса.
 */
export class WalkScene extends Phaser.Scene {
  private hero!: Phaser.GameObjects.Image;
  private layers!: ReturnType<typeof backdrop>;
  private shade!: Phaser.GameObjects.Rectangle;
  private poiX = 0;
  private walkTime = 0;
  private arrived = false;
  private coins: Phaser.GameObjects.Image[] = [];
  private refreshBar!: () => void;
  private dStart = 0;
  private dEnd = 0;
  private progressFill!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('Walk');
  }

  create(): void {
    this.arrived = false;
    this.walkTime = 0;
    this.cameras.main.fadeIn(300);
    const len = ROUTE_CFG.segmentLength;
    this.dStart = game.darknessAt(game.node - 1);
    this.dEnd = game.darkness;
    Sound.startMusic(this.dStart);

    const groundY = 300;
    this.layers = backdrop(this, this.dStart, groundY);
    // Плавное потемнение по ходу сегмента
    this.shade = this.add.rectangle(0, 0, W, H, 0x0a0614, 0).setOrigin(0).setScrollFactor(0);

    const node = game.current;
    const poiType = node.type === 'enemy' && game.enemy.boss ? 'boss' : node.type;
    const poi = ROUTE_CFG.poi[poiType];
    this.poiX = len - 70;
    const poiImg = this.add.image(this.poiX, 362, poi.sprite).setOrigin(0.5, 1).setScale(3);
    this.tweens.add({ targets: poiImg, y: 358, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    txt(this, this.poiX, 300, node.type === 'enemy' ? game.enemy.name : poi.name, 11, '#fff4d0').setStroke('#000000', 3);

    this.coins = [];
    for (let i = 0; i < 3; i++) {
      const c = this.add.image(200 + i * 200 + Math.random() * 80, 340, 'icon-coin').setScale(2);
      this.tweens.add({ targets: c, y: 334, duration: 500, yoyo: true, repeat: -1, delay: i * 120 });
      this.coins.push(c);
    }

    this.hero = this.add.image(60, 364, 'hero-0').setOrigin(0.5, 1).setScale(3);
    this.cameras.main.setBounds(0, 0, len, H);
    this.cameras.main.startFollow(this.hero, true, 0.15, 0.15, -80, 0);

    this.refreshBar = topBar(this, `${game.node + 1}/${ROUTE.length} · ${poi.name}`);
    const hint = txt(this, W / 2, 40, STR.walkHint, 11, '#fff4d0').setStroke('#000000', 3).setScrollFactor(0);
    this.tweens.add({ targets: hint, alpha: 0, delay: 3500, duration: 800 });

    // Прогресс-бар сегмента
    this.add.rectangle(W / 2, 62, 300, 6, 0x000000, 0.5).setScrollFactor(0);
    this.progressFill = this.add.rectangle(W / 2 - 149, 62, 1, 4, 0xffd860).setOrigin(0, 0.5).setScrollFactor(0);
  }

  update(_t: number, dt: number): void {
    if (this.arrived) return;
    const p = this.input.activePointer;
    let dir = 0;
    if (p.isDown) dir = p.x > W / 2 ? 1 : -1;
    if (dir !== 0) {
      this.hero.x = Phaser.Math.Clamp(this.hero.x + dir * 0.1 * dt, 30, this.poiX);
      this.hero.setFlipX(dir < 0);
      this.walkTime += dt;
      const frame = Math.floor(this.walkTime / 160) % 2;
      if (this.hero.texture.key !== `hero-${frame}`) {
        this.hero.setTexture(`hero-${frame}`);
        if (frame === 0) Sound.footstep();
      }
    } else if (this.hero.texture.key !== 'hero-0') {
      this.hero.setTexture('hero-0');
    }

    const sx = this.cameras.main.scrollX;
    this.layers.mountains.tilePositionX = sx * 0.15;
    this.layers.trees.tilePositionX = sx * 0.45;
    this.layers.ground.tilePositionX = sx / 2; // tileSprite масштабирован ×2
    const frac = this.hero.x / this.poiX;
    this.progressFill.width = Math.max(1, 298 * frac);
    this.shade.fillAlpha = Math.max(0, (this.dEnd - this.dStart) * 0.55 * frac);

    for (const c of this.coins) {
      if (c.active && Math.abs(c.x - this.hero.x) < 14) {
        game.gold += 1;
        Sound.coin();
        floatText(this, c.x, c.y - 10, '+1', '#ffd860', 12);
        c.destroy();
        this.refreshBar();
      }
    }

    if (this.hero.x >= this.poiX - 1) this.arrive();
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
