// Synthesized ambient soundscape via Web Audio API: cold wind layered with a
// low drone, plus optional forge clinks. No audio files needed.
export class Ambient {
  constructor() {
    this.ctx = null;
    this.nodes = [];
    this.started = false;
  }

  _ensureCtx() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
  }

  async start() {
    this._ensureCtx();
    if (!this.ctx || this.started) return;
    this.started = true;
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch {}
    }
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // --- Wind: filtered noise modulated by a slow LFO. ---
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuf;
    wind.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 480;
    windFilter.Q.value = 0.7;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.06;

    // LFO modulates wind gain for gusts.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.045;
    lfo.connect(lfoGain).connect(windGain.gain);

    wind.connect(windFilter).connect(windGain).connect(ctx.destination);
    wind.start(now);
    lfo.start(now);

    // --- Low drone: two detuned oscillators for cold atmosphere. ---
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.022;
    droneGain.connect(ctx.destination);
    const freqs = [55, 55.4, 82.5];
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.connect(droneGain);
      osc.start(now);
    }

    this.nodes.push(wind, lfo);
    this.windGain = windGain;
    this.master = ctx.createGain();
    this.master.gain.value = 1;
  }

  setVolume(v) {
    if (this.windGain) this.windGain.gain.value = 0.06 * v;
  }
}
