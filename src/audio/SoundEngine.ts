/**
 * Процедурный чиптюн-синтезатор на чистом Web Audio API.
 * Внешних аудиофайлов нет: все SFX и музыка генерируются в реальном времени.
 *
 * Музыка смешивает два слоя по «тьме» этапа (0..1):
 *  - менестрельская лютня (щипковые арпеджио, мажор → дорийский → минор);
 *  - мрачный эмбиент (расстроенный дрон + колокола), громкость растёт с тьмой.
 */

const NOTE = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// Лады (ступени в полутонах) — выбираются по тьме
const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};
// Прогрессии в ступенях лада (0 = I)
const PROG_LIGHT = [0, 4, 5, 3];
const PROG_DARK = [0, 5, 3, 4];
const ARP = [0, 1, 2, 1, 3, 2, 1, 2];

class SoundEngineImpl {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private luteBus!: GainNode;
  private droneBus!: GainNode;
  private droneFilter!: BiquadFilterNode;
  private droneOscs: OscillatorNode[] = [];
  private noiseBuf!: AudioBuffer;

  private darkness = 0;
  private musicOn = false;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private readonly tempo = 92;
  muted = false;

  /** Вызывать из обработчика жеста пользователя (требование автоплея браузеров). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.build();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private build(): void {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.55;
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.32;
    this.musicBus.connect(this.master);

    this.luteBus = ctx.createGain();
    this.luteBus.connect(this.musicBus);

    // Простая «реверберация»: две линии задержки с обратной связью
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.29;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.luteBus.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(this.musicBus);

    this.droneBus = ctx.createGain();
    this.droneBus.gain.value = 0;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 320;
    this.droneFilter.Q.value = 4;
    this.droneFilter.connect(this.droneBus).connect(this.musicBus);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(this.droneFilter.frequency);
    lfo.start();
    for (const [midi, det] of [[33, -9], [33, 8], [40, 3], [45, -4]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = NOTE(midi);
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = 0.18;
      o.connect(g).connect(this.droneFilter);
      o.start();
      this.droneOscs.push(o);
    }

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  // ---------------- базовые голоса ----------------

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number, bus?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filterFreq: number, when = 0, type: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** Щипок «лютни»: два осциллятора через фильтр с быстро закрывающейся частотой. */
  private pluck(freq: number, t: number, vol: number, dur = 0.9): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq * 8, t);
    f.frequency.exponentialRampToValueAtTime(freq * 1.2, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [type, mul, v] of [['triangle', 1, 1], ['sawtooth', 1.003, 0.35]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mul;
      const og = ctx.createGain();
      og.gain.value = v;
      o.connect(og).connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    f.connect(g).connect(this.luteBus);
  }

  private bell(freq: number, t: number, vol: number): void {
    const ctx = this.ctx!;
    for (const [mul, v, d] of [[1, 1, 3], [2.76, 0.4, 1.6], [5.4, 0.2, 0.8]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * v, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(this.luteBus);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  }

  // ---------------- SFX ----------------

  click(): void { this.tone(880, 0.05, 'square', 0.15); }

  cardSelect(up: boolean): void {
    this.noise(0.06, 0.25, up ? 3200 : 2200);
    this.tone(up ? 660 : 440, 0.05, 'triangle', 0.12);
  }

  cardDeal(i = 0): void { this.noise(0.05, 0.18, 2600 + i * 120, i * 0.04, 'highpass'); }

  coin(): void {
    this.tone(1318, 0.08, 'square', 0.13);
    this.tone(1976, 0.22, 'square', 0.13, 0.07);
  }

  footstep(): void { this.noise(0.04, 0.08, 500, 0, 'lowpass'); }

  /** Тик подсчёта: питч растёт с номером шага (нарастающее комбо). */
  comboTick(i: number): void {
    const semis = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
    const f = NOTE(72 + semis[Math.min(i, semis.length - 1)]);
    this.tone(f, 0.09, 'square', 0.12);
    this.tone(f * 2, 0.06, 'triangle', 0.06, 0.02);
  }

  /** Каст заклинания: свип вверх + мерцание. Питч растёт с номером слота. */
  cast(slot: number): void {
    const base = 330 * Math.pow(2, slot / 6);
    this.tone(base, 0.25, 'sawtooth', 0.08, 0, base * 4);
    for (let k = 0; k < 4; k++) this.tone(base * 4 * (1 + k * 0.25), 0.08, 'square', 0.05, 0.08 + k * 0.04);
  }

  hit(strength = 1): void {
    this.noise(0.18, 0.5, 900, 0, 'lowpass');
    this.tone(160, 0.2, 'square', 0.18 * strength, 0, 50);
  }

  block(): void {
    this.tone(520, 0.12, 'square', 0.12);
    this.tone(780, 0.3, 'triangle', 0.1, 0.03);
    this.noise(0.1, 0.2, 4000, 0, 'highpass');
  }

  hurt(): void {
    this.tone(220, 0.25, 'sawtooth', 0.15, 0, 90);
    this.noise(0.2, 0.3, 600, 0, 'lowpass');
  }

  victory(): void {
    [72, 76, 79, 84].forEach((m, i) => this.tone(NOTE(m), 0.3, 'square', 0.12, i * 0.12));
    this.tone(NOTE(88), 0.8, 'triangle', 0.12, 0.5);
  }

  defeat(): void {
    [60, 58, 55, 51].forEach((m, i) => this.tone(NOTE(m), 0.45, 'triangle', 0.14, i * 0.25));
  }

  // ---------------- Музыка ----------------

  startMusic(darkness: number): void {
    this.darkness = darkness;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.luteBus.gain.setTargetAtTime(Math.max(0.15, 1 - darkness * 0.85), t, 1.5);
    this.droneBus.gain.setTargetAtTime(darkness * 0.5, t, 2);
    if (this.musicOn) return;
    this.musicOn = true;
    this.nextTime = t + 0.1;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic(): void {
    this.musicOn = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.ctx) {
      this.luteBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      this.droneBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    }
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicOn) return;
    const eighth = 60 / this.tempo / 2;
    while (this.nextTime < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += eighth * (this.step % 2 === 0 ? 1.08 : 0.92); // лёгкий свинг
      this.step++;
    }
  }

  private playStep(step: number, t: number): void {
    const d = this.darkness;
    const mode = d < 0.25 ? MODES.ionian : d < 0.5 ? MODES.dorian : d < 0.8 ? MODES.aeolian : MODES.phrygian;
    const prog = d < 0.5 ? PROG_LIGHT : PROG_DARK;
    const root = 62 - Math.round(d * 5); // D → A по мере потемнения
    const bar = Math.floor(step / 8);
    const inBar = step % 8;
    const degree = prog[bar % prog.length];
    const chordTone = (k: number) => {
      const idx = degree + k * 2;
      return root + mode[idx % 7] + 12 * Math.floor(idx / 7);
    };

    // Лютня: арпеджио; на тёмных этапах реже и тише
    const density = 1 - d * 0.55;
    const pseudo = Math.abs(Math.sin(step * 12.9898) * 43758.5453) % 1;
    if (pseudo < density) {
      const k = ARP[inBar];
      this.pluck(NOTE(chordTone(k)), t, 0.16);
    }
    // Бас на первую и пятую восьмую
    if (inBar === 0 || inBar === 4) this.pluck(NOTE(chordTone(0) - 24), t, 0.2, 1.4);
    // Мелодические украшения в светлых этапах
    if (d < 0.5 && inBar === 6 && bar % 2 === 1) this.pluck(NOTE(chordTone(2) + 12), t, 0.1, 0.5);
    // Колокола и смена тембра дрона на тёмных этапах
    if (d > 0.4 && inBar === 0 && bar % 2 === 0) this.bell(NOTE(chordTone(0) + 12), t, 0.06 * d);
    if (inBar === 0 && this.droneOscs.length) {
      const base = NOTE(chordTone(0) - 36);
      this.droneOscs[0].frequency.setTargetAtTime(base, t, 0.8);
      this.droneOscs[1].frequency.setTargetAtTime(base, t, 0.8);
    }
  }
}

export const Sound = new SoundEngineImpl();
