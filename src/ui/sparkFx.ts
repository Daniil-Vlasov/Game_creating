import Phaser from 'phaser';

type Ease = (v: number) => number;
const sineIn: Ease = (v) => 1 - Math.cos((v * Math.PI) / 2);
const cubicOut: Ease = (v) => 1 - (1 - v) ** 3;
const linear: Ease = (v) => v;

/** Траектория одной искры: квадратичная Безье s → c → e, задержка старта, кривая, гашение. */
interface Path {
  sx: number; sy: number; cx: number; cy: number; ex: number; ey: number;
  delay: number; dur: number; ease: Ease; fade: boolean; round: boolean;
}
type SparkParticle = Phaser.GameObjects.Particles.Particle & { path?: Path };

/** Двигает частицы по их Безье-траектории (скорость эмиттера = 0, позицию задаёт процессор). */
class PathProcessor extends Phaser.GameObjects.Particles.ParticleProcessor {
  update(particle: Phaser.GameObjects.Particles.Particle, _delta: number, _step: number, t: number): void {
    const p = (particle as SparkParticle).path;
    if (!p) return;
    const ms = t * (p.delay + p.dur);
    const k = p.ease(Phaser.Math.Clamp((ms - p.delay) / p.dur, 0, 1));
    const u = 1 - k;
    const x = u * u * p.sx + 2 * u * k * p.cx + k * k * p.ex;
    const y = u * u * p.sy + 2 * u * k * p.cy + k * k * p.ey;
    particle.x = p.round ? Math.round(x) : x;
    particle.y = p.round ? Math.round(y) : y;
    if (p.fade) particle.alpha = 1 - k;
  }
}

/**
 * Все искры сцены подсчёта — один ParticleEmitter (текстура 'px' 2×2) вместо сотен Rectangle + отдельных твинов.
 * timeScale эмиттера синхронизируется со сценой (ускорение касанием, хит-стоп) через setTimeScale().
 */
export class SparkFx {
  readonly emitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene, depth = 99) {
    this.emitter = scene.add.particles(0, 0, 'px', { emitting: false, speed: 0, lifespan: 1000 }).setDepth(depth);
    this.emitter.addParticleProcessor(new PathProcessor());
  }

  setTimeScale(s: number): void {
    this.emitter.timeScale = s;
  }

  private spawn(path: Path, color: number, size: number): void {
    const p = this.emitter.emitParticleAt(path.sx, path.sy, 1) as SparkParticle | undefined;
    if (!p) return;
    p.path = path;
    p.life = p.lifeCurrent = path.delay + path.dur;
    p.tint = color;
    p.alpha = 1;
    p.scaleX = p.scaleY = size / 2;
  }

  /** Искры по дуге из точки к счётчику. */
  arc(from: { x: number; y: number }, to: { x: number; y: number }, color: number, n: number, ms: number): void {
    for (let i = 0; i < n; i++) {
      const sx = from.x + Phaser.Math.Between(-8, 8);
      const sy = from.y + Phaser.Math.Between(-6, 6);
      const cx = (sx + to.x) / 2 + Phaser.Math.Between(-50, 50);
      const cy = Math.min(sy, to.y) - Phaser.Math.Between(10, 40);
      this.spawn(
        { sx, sy, cx, cy, ex: to.x, ey: to.y, delay: i * 10, dur: Math.max(60, ms - i * 10), ease: sineIn, fade: false, round: true },
        i % 2 ? 0xffffff : color, i % 3 === 0 ? 3 : 2,
      );
    }
  }

  /** Радиальный разлёт искр. */
  burst(x: number, y: number, color: number, n: number, radius = 30): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const d = radius * (0.6 + Math.random() * 0.6);
      const ex = x + Math.cos(a) * d;
      const ey = y + Math.sin(a) * d * 0.7;
      this.spawn(
        { sx: x, sy: y, cx: (x + ex) / 2, cy: (y + ey) / 2, ex, ey, delay: 0, dur: 260 + Math.random() * 200, ease: cubicOut, fade: true, round: false },
        i % 2 ? 0xffffff : color, i % 3 === 0 ? 3 : 2,
      );
    }
  }

  /** Дымок вверх (гашение проклятой руны). */
  smoke(x: number, y: number, colors: [number, number], n = 6): void {
    for (let i = 0; i < n; i++) {
      const sx = x + Phaser.Math.Between(-14, 14);
      const ex = sx + Phaser.Math.Between(-6, 6);
      const ey = y - Phaser.Math.Between(20, 36);
      this.spawn(
        { sx, sy: y, cx: (sx + ex) / 2, cy: (y + ey) / 2, ex, ey, delay: i * 25, dur: 420, ease: linear, fade: true, round: false },
        colors[i % 2], 2,
      );
    }
  }
}
