// Web Speech Synthesis wrapper with per-character voice profiles.
// Picks the best available system voices and maps them to characters.

const CHARACTER_PROFILES = {
  ralof:    { rate: 0.90, pitch: 0.50, voicePref: 'male' },
  lokir:    { rate: 1.05, pitch: 0.75, voicePref: 'male' },
  soldier:  { rate: 0.95, pitch: 0.42, voicePref: 'male' },
  tullius:  { rate: 0.85, pitch: 0.38, voicePref: 'male' },
  haming:   { rate: 1.00, pitch: 1.50, voicePref: 'any' },
  torolf:   { rate: 0.90, pitch: 0.58, voicePref: 'male' },
  captain:  { rate: 0.95, pitch: 1.10, voicePref: 'female' },
  narrator: { rate: 0.90, pitch: 0.60, voicePref: 'male' },
};

export class Voice {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voices = { male: null, female: null, any: null };
    this._ready = false;
    this._pickVoices();
    if (this.synth && this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this._pickVoices();
    }
  }

  _pickVoices() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    if (!voices.length) return;

    const maleHints = [
      'daniel', 'alex', 'fred', 'rishi', 'thomas', 'james', 'arthur',
      'oliver', 'george', 'guy', 'mark', 'david',
    ];
    const femaleHints = [
      'samantha', 'victoria', 'karen', 'moira', 'tessa', 'zira',
      'susan', 'fiona', 'allison', 'ava',
    ];

    const scoreVoice = (v, hints, penalize) => {
      const name = v.name.toLowerCase();
      let score = 0;
      for (const h of hints) if (name.includes(h)) score += 10;
      if (/google/i.test(name)) score += 3;
      if (/natural|enhanced|premium/i.test(name)) score += 4;
      for (const p of penalize) if (name.includes(p)) score -= 8;
      return { v, score };
    };

    const english = voices.filter((v) => /en(-|_)?/i.test(v.lang));

    const male = english
      .map((v) => scoreVoice(v, maleHints, femaleHints))
      .sort((a, b) => b.score - a.score);
    const female = english
      .map((v) => scoreVoice(v, femaleHints, maleHints))
      .sort((a, b) => b.score - a.score);

    this.voices.male = male.length ? male[0].v : voices[0];
    this.voices.female = female.length ? female[0].v : voices[0];
    this.voices.any = voices[0];
    this._ready = true;
  }

  // Speak as a character. Returns a Promise resolved on end.
  speakAs(character, text) {
    const profile = CHARACTER_PROFILES[character] || CHARACTER_PROFILES.narrator;
    const voice = this.voices[profile.voicePref] || this.voices.any;
    return this._speak(text, { rate: profile.rate, pitch: profile.pitch, voice });
  }

  // Generic speak with opts.
  speak(text, opts = {}) {
    return this._speak(text, {
      rate: opts.rate ?? 0.9,
      pitch: opts.pitch ?? 0.6,
      voice: opts.voice ?? this.voices.male,
    });
  }

  _speak(text, { rate, pitch, voice }) {
    return new Promise((resolve) => {
      if (!this.synth) { resolve(); return; }
      try {
        this.synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        if (voice) u.voice = voice;
        u.rate = rate;
        u.pitch = pitch;
        u.volume = 1.0;
        let resolved = false;
        const done = () => { if (!resolved) { resolved = true; resolve(); } };
        u.onend = done;
        u.onerror = done;
        this.synth.speak(u);
        // Fallback timeout: estimated duration + buffer.
        const estMs = text.length * 75 + 1200;
        setTimeout(done, estMs);
      } catch {
        resolve();
      }
    });
  }
}

export { CHARACTER_PROFILES };
