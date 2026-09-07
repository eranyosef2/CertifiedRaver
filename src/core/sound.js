// Alert tones, synthesised so the extension ships no audio files.
//
// The previous version drove bare oscillators with an instant attack and a
// square wave, which is exactly what made it sound cheap: a zero-length attack
// on a hard waveform is a click, and a lone sine is a phone beep. This builds
// struck-bell voices instead — inharmonic partials, a short but non-zero
// attack, per-partial decay, and a generated reverb tail — and plays them as
// musical phrases rather than repeated beeps.

CR.sound = {
  _ctx: null,
  _bus: null,

  // One context for the page. Creating one per alert hits the browser's
  // per-page AudioContext cap after a handful of rains.
  ctx() {
    if (!this._ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this._ctx = new AC();
    }
    if (this._ctx.state === "suspended") this._ctx.resume().catch(() => {});
    return this._ctx;
  },

  // master -> tone shaping -> (dry + reverb) -> out
  bus() {
    if (this._bus) return this._bus;
    const ctx = this.ctx();

    const master = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 5200;
    tone.Q.value = 0.6;

    const dry = ctx.createGain();
    dry.gain.value = 0.82;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;

    const verb = ctx.createConvolver();
    verb.buffer = this._impulse(ctx, 1.7, 3.2);

    master.connect(tone);
    tone.connect(dry).connect(ctx.destination);
    tone.connect(verb).connect(wet).connect(ctx.destination);

    this._bus = { master, tone, wet };
    return this._bus;
  },

  // Exponentially decaying stereo noise. Cheap, and it gives every voice a
  // tail, which is most of what separates "expensive" from "beep".
  _impulse(ctx, seconds, curve) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, curve);
      }
    }
    return buf;
  },

  // Partial ratios are deliberately not whole numbers: a real struck bar is
  // inharmonic, and that is what stops it reading as a synth tone.
  VOICES: {
    bell: {
      ratios: [1, 2.00, 2.98, 4.07, 5.43],
      gains:  [1, 0.42, 0.26, 0.14, 0.08],
      decay:  [1, 0.80, 0.62, 0.48, 0.36],
      attack: 0.008,
      detune: 4,
    },
    wood: {
      ratios: [1, 2.01, 3.04],
      gains:  [1, 0.26, 0.10],
      decay:  [1, 0.55, 0.40],
      attack: 0.016,
      detune: 3,
    },
    bright: {
      ratios: [1, 2.01, 3.00, 4.16, 5.42, 6.79],
      gains:  [1, 0.50, 0.34, 0.22, 0.13, 0.08],
      decay:  [1, 0.78, 0.60, 0.45, 0.33, 0.25],
      attack: 0.005,
      detune: 5,
    },
  },

  // Phrases are arpeggios, so playing more or fewer notes still sounds musical.
  // A bigger rain simply plays further up the run.
  PATTERNS: {
    chime: {
      label: "Chime",
      voice: "bell",
      notes: [698.46, 880.00, 1046.50, 1318.51, 1567.98],  // F major pentatonic
      spacing: 0.15,
      decay: 2.2,
      cutoff: 5200,
      wet: 0.30,
    },
    soft: {
      label: "Soft",
      voice: "wood",
      notes: [349.23, 523.25, 698.46, 880.00, 1046.50],    // an octave lower
      spacing: 0.22,
      decay: 1.7,
      cutoff: 2600,
      wet: 0.24,
    },
    alert: {
      label: "Alert",
      voice: "bright",
      notes: [880.00, 1108.73, 1318.51, 1760.00, 2093.00],
      spacing: 0.095,
      decay: 1.15,
      cutoff: 7800,
      wet: 0.20,
    },
  },

  // Older installs stored the pre-rewrite pattern names.
  LEGACY: { classic: "chime", urgent: "alert" },

  resolve(name) {
    return this.PATTERNS[name] ? name : (this.LEGACY[name] || "chime");
  },

  strike(freq, at, { voice, decay, gain }) {
    const ctx = this.ctx();
    const { master } = this.bus();
    const v = this.VOICES[voice] || this.VOICES.bell;

    v.ratios.forEach((ratio, i) => {
      const life = decay * v.decay[i];
      const peak = gain * v.gains[i];

      // Two oscillators a few cents apart on each partial: the slow beating
      // between them is what reads as warmth rather than a pure tone.
      for (const cents of [-v.detune, v.detune]) {
        const osc = ctx.createOscillator();
        const amp = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq * ratio;
        osc.detune.value = cents;

        amp.gain.setValueAtTime(0.0001, at);
        amp.gain.linearRampToValueAtTime(peak / 2, at + v.attack);
        amp.gain.exponentialRampToValueAtTime(0.0001, at + v.attack + life);

        osc.connect(amp).connect(master);
        osc.start(at);
        osc.stop(at + v.attack + life + 0.05);
      }
    });
  },

  play(patternName, { volume = 0.5, beeps = 3 } = {}) {
    const p = this.PATTERNS[this.resolve(patternName)];
    try {
      const ctx = this.ctx();
      const bus = this.bus();
      bus.master.gain.value = Math.max(volume, 0.0001) * 0.5;
      bus.tone.frequency.value = p.cutoff;
      bus.wet.gain.value = p.wet;

      const count = Math.max(1, Math.min(beeps, p.notes.length));
      const start = ctx.currentTime + 0.03;

      for (let i = 0; i < count; i++) {
        this.strike(p.notes[i], start + i * p.spacing, {
          voice: p.voice,
          decay: p.decay,
          // Later notes ease off so the phrase settles instead of piling up.
          gain: 0.9 - i * 0.09,
        });
      }
    } catch (e) {
      CR.log.error("audio failed:", e);
    }
  },
};
