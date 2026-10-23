import {
  brass,
  createImpulseResponse,
  createWhiteNoise,
  drum,
  explosion,
  impact,
  interfaceSound,
  type InterfaceSound,
  laser,
  pad,
  ProceduralAmbience,
  pulse,
  studioSting,
  titleHit,
  type Voice,
  warpArrival,
  warpRise,
} from './synth';
import type { ScoreCue } from './score';

/** Perceptual curve so the slider's midpoint sounds like half volume. */
export function volumeToGain(volume: number): number {
  const clamped = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0;
  return clamped * clamped;
}

export type EffectName =
  | 'laser-raider'
  | 'laser-defender'
  | 'laser-hero'
  | 'impact'
  | 'explosion'
  | 'warp-rise'
  | 'warp-arrival';

export interface EffectOptions {
  /** Seconds from now. */
  readonly delay: number;
  /** -1 (left) to 1 (right). */
  readonly pan: number;
  /** 0–1 after distance attenuation. */
  readonly gain: number;
  /** Scene units from the camera, used to dull distant sounds. */
  readonly distance: number;
  readonly seed?: number;
}

/** What the opening scene needs from audio; keeps the scene independent of Web Audio. */
export interface SceneAudio {
  playEffect(name: EffectName, options: EffectOptions): void;
  playScore(cue: ScoreCue, delay: number): void;
  /** Continuous drive sound of the hero ship: 0 = silent. */
  setEngine(level: number, pan: number): void;
  /** Fades out everything belonging to the opening (after a skip). */
  stopIntro(): void;
}

type AudioContextConstructor = typeof AudioContext;

/** Minimum spacing for repeated small sounds, so a busy battle never turns to noise. */
const THROTTLE_SECONDS: Partial<Record<EffectName, number>> = {
  'laser-raider': 0.07,
  'laser-defender': 0.07,
  impact: 0.05,
};

/**
 * Browser audio with structured buses: music, effects, ambience and interface, each feeding a
 * master gain, a glue compressor and a shared synthetic reverb. Nothing is created until
 * `unlock()` runs inside a user gesture, as browsers require.
 */
export class AudioEngine implements SceneAudio {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private buses: Record<'music' | 'effects' | 'ambience' | 'interface', GainNode> | undefined;
  private reverb: ConvolverNode | undefined;
  private noise: AudioBuffer | undefined;
  private ambience: ProceduralAmbience | undefined;
  private engine:
    | { gain: GainNode; panner: StereoPannerNode; nodes: AudioScheduledSourceNode[] }
    | undefined;
  private readonly lastPlayed = new Map<EffectName, number>();
  private volumeValue: number;
  private disposed = false;
  /** Called when the browser starts, suspends or closes audio output. */
  public onStateChange: (() => void) | undefined;

  public constructor(volume: number) {
    this.volumeValue = volume;
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  public get supported(): boolean {
    return getAudioContextConstructor() !== undefined;
  }

  /** True once the browser has granted audio output. */
  public get running(): boolean {
    return this.context?.state === 'running';
  }

  public setVolume(volume: number): void {
    this.volumeValue = volume;
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(volumeToGain(volume), this.context.currentTime, 0.08);
    }
  }

  /** Call from a user gesture handler. Safe to call repeatedly. */
  public unlock(): void {
    if (this.disposed) return;
    if (!this.context) this.createGraph();
    const context = this.context;
    if (context?.state === 'suspended' && document.visibilityState === 'visible') {
      void context.resume().catch(() => undefined);
    }
  }

  public playEffect(name: EffectName, options: EffectOptions): void {
    const voice = this.voice('effects', options.delay, options.pan, options.gain);
    if (!voice) return;
    const throttle = THROTTLE_SECONDS[name];
    if (throttle !== undefined) {
      const last = this.lastPlayed.get(name) ?? -1;
      if (voice.when - last < throttle) return;
      this.lastPlayed.set(name, voice.when);
    }
    switch (name) {
      case 'laser-raider':
        return laser(voice, 'raider', options.distance);
      case 'laser-defender':
        return laser(voice, 'defender', options.distance);
      case 'laser-hero':
        return laser(voice, 'hero', options.distance);
      case 'impact':
        return impact(voice);
      case 'explosion':
        return explosion(voice, options.distance, options.seed ?? 0.5);
      case 'warp-rise':
        return warpRise(voice);
      case 'warp-arrival':
        return warpArrival(voice);
    }
  }

  public playScore(cue: ScoreCue, delay: number): void {
    if (cue.name === 'ambience') {
      this.startAmbience(delay);
      return;
    }
    const voice = this.voice('music', delay, 0, 1);
    if (!voice) return;
    switch (cue.name) {
      case 'studio-sting':
        return studioSting(voice);
      case 'title-hit':
        return titleHit(voice);
      case 'pad':
        return pad(voice, cue.notes, cue.length, cue.level);
      case 'pulse':
        return pulse(voice, cue.notes[0] ?? 55, cue.length, cue.level);
      case 'drum':
        return drum(voice, cue.level);
      case 'brass':
        return brass(voice, cue.notes, cue.length, cue.level);
    }
  }

  public playInterface(kind: InterfaceSound): void {
    const voice = this.voice('interface', 0, 0, 1);
    if (voice) interfaceSound(voice, kind);
  }

  public setEngine(level: number, pan: number): void {
    const context = this.context;
    if (!context || !this.buses) return;
    if (!this.engine && level > 0.001)
      this.engine = this.createEngineVoice(context, this.buses.effects);
    if (!this.engine) return;
    const now = context.currentTime;
    this.engine.gain.gain.setTargetAtTime(Math.min(1, level) * 0.32, now, 0.12);
    this.engine.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), now, 0.12);
  }

  public stopIntro(): void {
    const context = this.context;
    if (!context || !this.buses) return;
    const now = context.currentTime;
    for (const bus of [this.buses.music, this.buses.effects]) {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(0.0001, now, 0.12);
      // Restore shortly after, once the already-scheduled sounds have been silenced.
      bus.gain.setTargetAtTime(1, now + 1.2, 0.05);
    }
    this.setEngine(0, 0);
    this.startAmbience(0.4);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.ambience?.stop();
    for (const node of this.engine?.nodes ?? []) {
      try {
        node.stop();
      } catch {
        // Already stopped.
      }
    }
    this.context?.removeEventListener('statechange', this.handleStateChange);
    void this.context?.close().catch(() => undefined);
    this.context = undefined;
    this.master = undefined;
    this.buses = undefined;
  }

  private createGraph(): void {
    const Constructor = getAudioContextConstructor();
    if (!Constructor) return;
    let context: AudioContext;
    try {
      context = new Constructor({ latencyHint: 'interactive' });
    } catch (error) {
      console.warn('[VÉRTICE] Audio output is unavailable in this browser.', error);
      return;
    }
    this.context = context;
    context.addEventListener('statechange', this.handleStateChange);
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.22;
    compressor.connect(context.destination);
    this.master = context.createGain();
    this.master.gain.value = volumeToGain(this.volumeValue);
    this.master.connect(compressor);
    this.reverb = context.createConvolver();
    this.reverb.buffer = createImpulseResponse(context);
    const reverbReturn = context.createGain();
    reverbReturn.gain.value = 0.42;
    this.reverb.connect(reverbReturn).connect(this.master);
    const bus = (level: number): GainNode => {
      const gain = context.createGain();
      gain.gain.value = level;
      gain.connect(this.master!);
      return gain;
    };
    this.buses = { music: bus(1), effects: bus(1), ambience: bus(1), interface: bus(1) };
    this.noise = createWhiteNoise(context);
  }

  private voice(
    bus: 'music' | 'effects' | 'interface',
    delay: number,
    pan: number,
    gain: number,
  ): Voice | undefined {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.buses || !this.reverb || !this.noise)
      return undefined;
    if (gain <= 0.002) return undefined;
    const level = context.createGain();
    level.gain.value = Math.min(1.5, gain);
    const panner = context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    level.connect(panner).connect(this.buses[bus]);
    const send = context.createGain();
    send.gain.value = Math.min(1.5, gain);
    send.connect(this.reverb);
    return {
      context,
      output: level,
      send,
      noise: this.noise,
      when: context.currentTime + Math.max(0, delay),
    };
  }

  private startAmbience(delay: number): void {
    const context = this.context;
    if (!context || this.ambience || !this.buses || context.state !== 'running') return;
    this.ambience = new ProceduralAmbience(context, this.buses.ambience, delay);
  }

  private createEngineVoice(
    context: AudioContext,
    destination: AudioNode,
  ): { gain: GainNode; panner: StereoPannerNode; nodes: AudioScheduledSourceNode[] } {
    const gain = context.createGain();
    gain.gain.value = 0;
    const panner = context.createStereoPanner();
    const tone = context.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 320;
    const nodes: AudioScheduledSourceNode[] = [];
    for (const [frequency, type] of [
      [44, 'sawtooth'],
      [44.6, 'sawtooth'],
      [88.3, 'triangle'],
    ] as const) {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      oscillator.connect(tone);
      oscillator.start();
      nodes.push(oscillator);
    }
    if (this.noise) {
      const rumble = context.createBufferSource();
      rumble.buffer = this.noise;
      rumble.loop = true;
      const low = context.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 520;
      const level = context.createGain();
      level.gain.value = 0.5;
      rumble.connect(low).connect(level).connect(tone);
      rumble.start();
      nodes.push(rumble);
    }
    tone.connect(gain).connect(panner).connect(destination);
    return { gain, panner, nodes };
  }

  private readonly handleStateChange = (): void => this.onStateChange?.();

  private readonly handleVisibility = (): void => {
    if (!this.context) return;
    if (document.visibilityState === 'visible') void this.context.resume().catch(() => undefined);
    else void this.context.suspend().catch(() => undefined);
  };
}

function getAudioContextConstructor(): AudioContextConstructor | undefined {
  const scope = window as Window & { webkitAudioContext?: AudioContextConstructor };
  return window.AudioContext ?? scope.webkitAudioContext;
}
