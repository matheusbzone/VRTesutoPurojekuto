import {type ProximityAudioState} from './portalMath';

/**
 * Procedural Web Audio synthesizer generating an otherworldly ambient space
 * drone, shimmering crystal overtones, and ethereal portal hum whose volume
 * and harmonic brightness swell as the user leans closer to the doorway.
 */
export class PortalAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private proximityGain: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private shimmerGain: GainNode | null = null;
  private panner: StereoPannerNode | null = null;
  private chimeTimer: number | null = null;
  private nodes: AudioNode[] = [];
  private oscillators: OscillatorNode[] = [];
  private started = false;
  private muted = false;
  private lastGain = 0.14;
  private lastFilterHz = 600;
  private lastProximity = 0;

  isMuted(): boolean {
    return this.muted;
  }

  isRunning(): boolean {
    return this.started && this.ctx?.state === 'running';
  }

  getLastGain(): number {
    return this.muted ? 0 : this.lastGain;
  }

  getLastProximity(): number {
    return this.lastProximity;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      const target = muted ? 0 : 0.65;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Unlocks and starts the procedural ambient soundscape. Safe to call
   * repeatedly from any user gesture (pointerdown, click, XR select).
   */
  unlockAndStart(): void {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as {webkitAudioContext?: typeof AudioContext})
        .webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.buildGraph(this.ctx);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {
        // Browser blocked until user gesture; next gesture will retry.
      });
    }
  }

  private buildGraph(ctx: AudioContext): void {
    if (this.started) return;
    this.started = true;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.65;

    this.proximityGain = ctx.createGain();
    this.proximityGain.gain.value = this.lastGain;

    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = this.lastFilterHz;
    this.lowpass.Q.value = 1.6;

    this.panner = ctx.createStereoPanner();
    this.panner.pan.value = 0;

    this.lowpass.connect(this.proximityGain);
    this.proximityGain.connect(this.panner);
    this.panner.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    // 1. Deep cosmic sub-drone (D2 + A2 + F#3 ethereal chord)
    const freqs = [
      {hz: 55.0, type: 'sine' as OscillatorType, gain: 0.38},
      {hz: 82.41, type: 'triangle' as OscillatorType, gain: 0.16},
      {hz: 110.0, type: 'sine' as OscillatorType, gain: 0.18},
      {hz: 164.81, type: 'sine' as OscillatorType, gain: 0.1},
      {hz: 246.94, type: 'sine' as OscillatorType, gain: 0.06},
    ];

    for (const spec of freqs) {
      const osc = ctx.createOscillator();
      osc.type = spec.type;
      osc.frequency.value = spec.hz;

      const oscGain = ctx.createGain();
      oscGain.gain.value = spec.gain;

      // Subtle slow detune LFO for organic living space pad
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.08 + Math.random() * 0.07;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = spec.hz * 0.004;
      lfo.connect(lfoDepth);
      lfoDepth.connect(osc.frequency);

      osc.connect(oscGain);
      oscGain.connect(this.lowpass);

      osc.start();
      lfo.start();
      this.oscillators.push(osc, lfo);
      this.nodes.push(oscGain, lfoDepth);
    }

    // 2. High crystalline shimmer layer (swells when leaning close)
    this.shimmerGain = ctx.createGain();
    this.shimmerGain.gain.value = 0.04;
    this.shimmerGain.connect(this.proximityGain);

    const shimmerFreqs = [440, 659.25, 880];
    for (let i = 0; i < shimmerFreqs.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = shimmerFreqs[i];
      const g = ctx.createGain();
      g.gain.value = 0.025 / (i + 1);
      osc.connect(g);
      g.connect(this.shimmerGain);
      osc.start();
      this.oscillators.push(osc);
      this.nodes.push(g);
    }

    // 3. Filtered pink-ish space wind noise
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.08;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 340;
    bandpass.Q.value = 2.4;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.22;

    noiseSource.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(this.lowpass);
    noiseSource.start();
    this.nodes.push(noiseSource, bandpass, noiseGain);

    // 4. Occasional gentle alien crystal resonance chimes
    this.scheduleChime();
  }

  private scheduleChime(): void {
    if (this.chimeTimer !== null) return;
    const delayMs = 2600 + Math.random() * 3200;
    this.chimeTimer = window.setTimeout(() => {
      this.chimeTimer = null;
      this.triggerChime();
      this.scheduleChime();
    }, delayMs);
  }

  private triggerChime(): void {
    if (!this.ctx || !this.proximityGain || this.muted || this.ctx.state !== 'running') {
      return;
    }
    const notes = [523.25, 659.25, 783.99, 987.77, 1174.66];
    const freq = notes[Math.floor(Math.random() * notes.length)];
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    const env = this.ctx.createGain();
    const peak = 0.025 + this.lastProximity * 0.055;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(peak, now + 0.12);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);

    osc.connect(env);
    env.connect(this.proximityGain);
    osc.start(now);
    osc.stop(now + 2.5);
  }

  /**
   * Smoothly updates spatial gain, filter brightness, and stereo pan based
   * on the user's proximity and lateral offset from the portal doorway.
   */
  updateProximity(state: ProximityAudioState, stereoPan = 0): void {
    this.lastGain = state.gain;
    this.lastFilterHz = state.filterHz;
    this.lastProximity = state.proximity;

    if (!this.ctx || !this.proximityGain || !this.lowpass) return;
    const now = this.ctx.currentTime;
    this.proximityGain.gain.setTargetAtTime(state.gain, now, 0.08);
    this.lowpass.frequency.setTargetAtTime(state.filterHz, now, 0.08);
    if (this.shimmerGain) {
      this.shimmerGain.gain.setTargetAtTime(0.02 + state.proximity * 0.24, now, 0.1);
    }
    if (this.panner) {
      const clampedPan = Math.max(-0.8, Math.min(0.8, stereoPan));
      this.panner.pan.setTargetAtTime(clampedPan, now, 0.08);
    }
  }

  /**
   * Synthesizes an energetic arcane projectile shot sound (laser/plasma chirp).
   */
  playShootSound(): void {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.16);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.value = 2.5;

    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain ?? this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  /**
   * Synthesizes an impact spark/flash resonance pop.
   */
  playImpactSound(): void {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.22);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain ?? this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.26);
  }

  /**
   * Synthesizes a telekinetic magnetic hum swell when grabbing an object.
   */
  playGrabSound(): void {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.18);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain ?? this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.38);
  }

  /**
   * Synthesizes a swoosh/whoosh sound when launching or releasing an object.
   */
  playReleaseSound(): void {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.22);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain ?? this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.26);
  }

  dispose(): void {
    if (this.chimeTimer !== null) {
      clearTimeout(this.chimeTimer);
      this.chimeTimer = null;
    }
    for (const osc of this.oscillators) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Ignore already stopped oscillators
      }
    }
    for (const node of this.nodes) {
      try {
        node.disconnect();
      } catch {
        // Ignore
      }
    }
    this.oscillators = [];
    this.nodes = [];
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.started = false;
  }
}
