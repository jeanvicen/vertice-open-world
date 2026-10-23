/** Perceptual curve so the slider's midpoint sounds like half volume. */
export function volumeToGain(volume: number): number {
  const clamped = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0;
  return clamped * clamped;
}

type AudioContextConstructor = typeof AudioContext;

/**
 * Browser audio output with one master gain. Browsers only allow sound after a user gesture,
 * so nothing is created or played until `unlock()` runs inside one. The only sound in this
 * milestone is a synthesized ambient bed; future cues connect to `output`.
 */
export class AudioEngine {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private ambience: ProceduralAmbience | undefined;
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

  /** True once the browser has granted audio and the ambience is playing. */
  public get running(): boolean {
    return this.context?.state === 'running';
  }

  public get output(): AudioNode | undefined {
    return this.master;
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
    if (!this.context) {
      const Constructor = getAudioContextConstructor();
      if (!Constructor) return;
      try {
        this.context = new Constructor({ latencyHint: 'playback' });
      } catch (error) {
        console.warn('[VÉRTICE] Audio output is unavailable in this browser.', error);
        return;
      }
      this.context.addEventListener('statechange', this.handleStateChange);
      this.master = this.context.createGain();
      this.master.gain.value = volumeToGain(this.volumeValue);
      this.master.connect(this.context.destination);
      this.ambience = new ProceduralAmbience(this.context, this.master);
    }
    if (this.context.state === 'suspended' && document.visibilityState === 'visible') {
      void this.context.resume().catch(() => undefined);
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.ambience?.stop();
    this.context?.removeEventListener('statechange', this.handleStateChange);
    void this.context?.close().catch(() => undefined);
    this.context = undefined;
    this.master = undefined;
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

/**
 * A quiet, slowly evolving bed: an open fifth voiced through a low-pass filter plus filtered
 * noise that breathes over tens of seconds. Synthesized at runtime; no audio files.
 */
class ProceduralAmbience {
  private readonly sources: AudioScheduledSourceNode[] = [];

  public constructor(context: AudioContext, destination: AudioNode) {
    const now = context.currentTime;
    const bed = context.createGain();
    bed.gain.setValueAtTime(0, now);
    bed.gain.linearRampToValueAtTime(0.5, now + 6);
    bed.connect(destination);

    const tone = context.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 820;
    tone.Q.value = 0.4;
    tone.connect(bed);
    const voices: Array<[number, number, OscillatorType]> = [
      [55, 0.16, 'sine'],
      [110.2, 0.06, 'triangle'],
      [164.6, 0.035, 'triangle'],
      [246.5, 0.016, 'sine'],
    ];
    voices.forEach(([frequency, level, type], index) => {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.value = level;
      // Each voice swells on its own slow cycle so the chord never sits still.
      const swell = context.createOscillator();
      swell.frequency.value = 0.021 + index * 0.013;
      const swellDepth = context.createGain();
      swellDepth.gain.value = level * 0.6;
      swell.connect(swellDepth).connect(gain.gain);
      oscillator.connect(gain).connect(tone);
      oscillator.start(now);
      swell.start(now);
      this.sources.push(oscillator, swell);
    });

    const noise = context.createBufferSource();
    noise.buffer = createBrownNoise(context, 6);
    noise.loop = true;
    const air = context.createBiquadFilter();
    air.type = 'bandpass';
    air.frequency.value = 420;
    air.Q.value = 0.7;
    const airLevel = context.createGain();
    airLevel.gain.value = 0.22;
    const sweep = context.createOscillator();
    sweep.frequency.value = 0.017;
    const sweepDepth = context.createGain();
    sweepDepth.gain.value = 220;
    sweep.connect(sweepDepth).connect(air.frequency);
    noise.connect(air).connect(airLevel).connect(bed);
    noise.start(now);
    sweep.start(now);
    this.sources.push(noise, sweep);
  }

  public stop(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.sources.length = 0;
  }
}

function createBrownNoise(context: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const fade = Math.floor(context.sampleRate * 0.25);
  const source = new Float32Array(length + fade);
  let last = 0;
  for (let index = 0; index < source.length; index += 1) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    source[index] = last * 3.2;
  }
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  data.set(source.subarray(0, length));
  // The opening blends from the material that follows the last sample: a seamless loop.
  for (let index = 0; index < fade; index += 1) {
    const t = index / fade;
    data[index] = source[index]! * t + source[length + index]! * (1 - t);
  }
  return buffer;
}
