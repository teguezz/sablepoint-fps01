// SABLEPOINT — procedural audio. Every sound is synthesized with WebAudio:
// filtered noise for gunfire, short oscillators for beeps and jingles. No
// audio files, no network. The context is created on the first user gesture.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    // One shared white-noise buffer for every percussive sound.
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  _noise(dur, filterFreq, gain, type = 'lowpass', when = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  _tone(freq, dur, gain, type = 'sine', slideTo = null, when = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  shot(kind, dist = 0) {
    if (!this.ctx) return;
    const atten = 1 / (1 + dist * 0.06);
    switch (kind) {
      case 'pistol': this._noise(0.09, 1800, 0.5 * atten); this._tone(160, 0.07, 0.25 * atten, 'square', 70); break;
      case 'smg': this._noise(0.07, 2400, 0.42 * atten); this._tone(220, 0.05, 0.2 * atten, 'square', 90); break;
      case 'rifle': this._noise(0.12, 1400, 0.6 * atten); this._tone(130, 0.1, 0.3 * atten, 'square', 55); break;
      case 'sniper': this._noise(0.22, 900, 0.8 * atten); this._tone(90, 0.18, 0.4 * atten, 'sawtooth', 40); break;
      case 'shotgun': this._noise(0.18, 1000, 0.75 * atten); this._tone(110, 0.12, 0.35 * atten, 'square', 50); break;
      case 'lmg': this._noise(0.11, 1600, 0.55 * atten); this._tone(150, 0.08, 0.28 * atten, 'square', 65); break;
      default: this._noise(0.1, 1600, 0.5 * atten);
    }
  }

  dryFire() { this._tone(1200, 0.03, 0.12, 'square'); }
  reload() { this._tone(500, 0.05, 0.15, 'square'); this._tone(700, 0.05, 0.15, 'square', null, 0.18); }
  hit() { this._tone(1400, 0.05, 0.2, 'sine'); }
  kill() { this._tone(880, 0.08, 0.25, 'sine'); this._tone(1320, 0.1, 0.22, 'sine', null, 0.08); }
  hurt() { this._noise(0.12, 500, 0.3); this._tone(90, 0.12, 0.25, 'sawtooth', 50); }
  step() { this._noise(0.05, 700, 0.1); }
  click() { this._tone(900, 0.04, 0.15, 'square'); }
  buy() { this._tone(660, 0.07, 0.2, 'sine'); this._tone(990, 0.09, 0.2, 'sine', null, 0.07); }
  denied() { this._tone(220, 0.12, 0.2, 'square', 160); }
  plantBeep() { this._tone(1100, 0.07, 0.22, 'sine'); }
  chargeBeep() { this._tone(1500, 0.05, 0.15, 'sine'); }
  explosion() {
    this._noise(0.9, 300, 1.0);
    this._tone(60, 0.8, 0.6, 'sine', 30);
    this._noise(0.4, 2400, 0.5, 'highpass', 0.02);
  }
  roundWin() {
    this._tone(523, 0.12, 0.25, 'sine');
    this._tone(659, 0.12, 0.25, 'sine', null, 0.12);
    this._tone(784, 0.22, 0.28, 'sine', null, 0.24);
  }
  roundLose() {
    this._tone(392, 0.15, 0.25, 'sine');
    this._tone(330, 0.15, 0.25, 'sine', null, 0.15);
    this._tone(262, 0.3, 0.28, 'sine', null, 0.3);
  }
}
