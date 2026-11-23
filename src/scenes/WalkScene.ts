import Phaser from 'phaser';
import { Sound } from '../audio/SoundEngine';
import { ROUTE, ROUTE_CFG, STR } from '../core/data';
import { game } from '../core/GameState';
import { backdrop } from '../ui/views';
import { ambientTint } from '../visual/scenery';
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
  private lantern!: Phaser.GameObjects.Image;

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
    this.layers = backdrop(this, this.dStart, groundY, { foreground: true, seed: 11 + game.node * 7 });
    // Плавное потемнение по ходу сегмента
    this.shade = this.add.rectangle(0, 0, W, H, 0x0a0614, 0).setOrigin(0).setScrollFactor(0);

    const node = game.current;
    const poiType = node.type === 'enemy' && game.enemy.boss ? 'boss' : node.type;
    const poi = ROUTE_CFG.poi[poiType];
    this.poiX = len - 70;
    const sprite = node.type === 'event' && node.id === 'tavern' ? 'poi-tavern' : poi.sprite;
    const poiImg = this.add.image(this.poiX, 352, sprite).setOrigin(0.5, 1).setScale(sprite === 'poi-tavern' ? 3 : 2);
    poiImg.setTint(ambientTint(this.dEnd));
    const poiGlow = this.add.image(this.poiX, 330, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(node.type === 'enemy' ? 0xff4040 : 0xffc060).setScale(2.4).setAlpha(0.5);
    this.tweens.add({ targets: poiGlow, alpha: 0.3, scale: 2.7, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    txt(this, this.poiX, 352 - poiImg.displayHeight - 12, node.type === 'enemy' ? game.enemy.name : poi.name, 11, '#fff4d0').setStroke('#000000', 3);

    this.coins = [];
    for (let i = 0; i < 3; i++) {
      const c = this.add.image(200 + i * 200 + Math.random() * 80, 338, 'icon-coin').setScale(1.5);
      this.tweens.add({ targets: c, y: 333, duration: 500, yoyo: true, repeat: -1, delay: i * 120 });
      this.coins.push(c);
    }

    this.lantern = this.add.image(60, 330, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffc060).setScale(1.6).setAlpha(0.35 + this.dStart * 0.4);
    this.tweens.add({ targets: this.lantern, scale: 1.75, duration: 160, yoyo: true, repeat: -1, repeatDelay: 90 });
    this.hero = this.add.image(60, 352, 'hero-0').setOrigin(0.5, 1).setScale(2).setTint(ambientTint(this.dStart));
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
