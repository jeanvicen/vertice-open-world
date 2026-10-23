/**
 * Synthesis recipes for VÉRTICE. Every sound is generated with Web Audio nodes at the moment it
 * plays; there are no audio files. Each recipe receives the start time, its output node and
 * (for the reverb) a send node.
 */

export interface Voice {
  readonly context: AudioContext;
  /** Dry output (already panned / attenuated). */
  readonly output: AudioNode;
  /** Reverb send. */
  readonly send: AudioNode;
  readonly noise: AudioBuffer;
  readonly when: number;
}

type Shape = OscillatorType;

function oscillator(voice: Voice, type: Shape, frequency: number): OscillatorNode {
  const node = voice.context.createOscillator();
  node.type = type;
  node.frequency.setValueAtTime(frequency, voice.when);
  return node;
}

/** Gain with a fast attack and an exponential decay to silence. */
function envelope(voice: Voice, peak: number, attack: number, decay: number): GainNode {
  const gain = voice.context.createGain();
  const { when } = voice;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(peak, when + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  return gain;
}

function noiseSource(voice: Voice, offset = 0): AudioBufferSourceNode {
  const source = voice.context.createBufferSource();
  source.buffer = voice.noise;
  source.loop = true;
  source.loopStart = offset % voice.noise.duration;
  return source;
}

function filter(
  voice: Voice,
  type: BiquadFilterType,
  frequency: number,
  q = 0.7,
): BiquadFilterNode {
  const node = voice.context.createBiquadFilter();
  node.type = type;
  node.frequency.setValueAtTime(frequency, voice.when);
  node.Q.value = q;
  return node;
}

function route(node: AudioNode, voice: Voice, send: number): void {
  node.connect(voice.output);
  if (send > 0) {
    const amount = voice.context.createGain();
    amount.gain.value = send;
    node.connect(amount).connect(voice.send);
  }
}

function play(source: AudioScheduledSourceNode, voice: Voice, duration: number): void {
  source.start(voice.when);
  source.stop(voice.when + duration);
}

/** "Klipza Studio apresenta": a soft, wide bell chord over a slow sub swell. */
export function studioSting(voice: Voice): void {
  const partials: Array<[number, number]> = [
    [196, 0.16],
    [293.7, 0.11],
    [392, 0.09],
    [587.3, 0.06],
    [880, 0.035],
    [1174.7, 0.02],
  ];
  for (const [frequency, level] of partials) {
    for (const detune of [-4, 4]) {
      const tone = oscillator(voice, 'sine', frequency);
      tone.detune.value = detune;
      const gain = envelope(voice, level, 0.02, 4.6);
      tone.connect(gain);
      route(gain, voice, 0.9);
      play(tone, voice, 5);
    }
  }
  const sub = oscillator(voice, 'sine', 49);
  const swell = voice.context.createGain();
  swell.gain.setValueAtTime(0.0001, voice.when);
  swell.gain.exponentialRampToValueAtTime(0.32, voice.when + 1.4);
  swell.gain.exponentialRampToValueAtTime(0.0001, voice.when + 4.8);
  sub.connect(swell);
  route(swell, voice, 0.2);
  play(sub, voice, 5);
}

/** The title hit: a filtered brass-like "braam", a sub drop and a long cymbal-like wash. */
export function titleHit(voice: Voice): void {
  const sweep = filter(voice, 'lowpass', 160, 5);
  sweep.frequency.exponentialRampToValueAtTime(1500, voice.when + 0.35);
  sweep.frequency.exponentialRampToValueAtTime(200, voice.when + 4);
  const body = envelope(voice, 0.42, 0.05, 5);
  for (const [frequency, detune] of [
    [55, -7],
    [55, 7],
    [82.4, 0],
    [110, 5],
  ] as const) {
    const saw = oscillator(voice, 'sawtooth', frequency);
    saw.detune.value = detune;
    saw.connect(sweep);
    play(saw, voice, 5.2);
  }
  sweep.connect(body);
  route(body, voice, 0.7);

  const sub = oscillator(voice, 'sine', 70);
  sub.frequency.exponentialRampToValueAtTime(30, voice.when + 0.7);
  const subGain = envelope(voice, 0.9, 0.01, 1.6);
  sub.connect(subGain);
  route(subGain, voice, 0.1);
  play(sub, voice, 1.8);

  const wash = noiseSource(voice);
  const high = filter(voice, 'highpass', 2600);
  const washGain = envelope(voice, 0.09, 0.01, 3.2);
  wash.connect(high).connect(washGain);
  route(washGain, voice, 0.9);
  play(wash, voice, 3.4);
}

export type LaserKind = 'raider' | 'defender' | 'hero';

const LASER: Readonly<
  Record<LaserKind, { from: number; to: number; length: number; shape: Shape; level: number }>
> = {
  raider: { from: 1500, to: 150, length: 0.2, shape: 'sawtooth', level: 0.16 },
  defender: { from: 2300, to: 300, length: 0.15, shape: 'square', level: 0.1 },
  hero: { from: 2600, to: 210, length: 0.24, shape: 'sawtooth', level: 0.22 },
};

/** Energy weapon: a fast downward pitch sweep; the hero's cannons add weight and a click. */
export function laser(voice: Voice, kind: LaserKind, distance: number): void {
  const style = LASER[kind];
  const tone = filter(voice, 'lowpass', Math.max(1200, 9000 - distance * 18), 1.2);
  const gain = envelope(voice, style.level, 0.004, style.length);
  for (const detune of kind === 'hero' ? [-12, 12] : [0]) {
    const zap = oscillator(voice, style.shape, style.from);
    zap.detune.value = detune;
    zap.frequency.exponentialRampToValueAtTime(style.to, voice.when + style.length);
    zap.connect(tone);
    play(zap, voice, style.length + 0.05);
  }
  tone.connect(gain);
  route(gain, voice, 0.25);
  if (kind === 'hero') {
    const thump = oscillator(voice, 'sine', 140);
    thump.frequency.exponentialRampToValueAtTime(48, voice.when + 0.12);
    const thumpGain = envelope(voice, 0.35, 0.002, 0.16);
    thump.connect(thumpGain);
    route(thumpGain, voice, 0);
    play(thump, voice, 0.2);
  }
}

/** A bolt striking a hull: a metallic tick and a short burst of grit. */
export function impact(voice: Voice): void {
  const ping = oscillator(voice, 'triangle', 1900);
  ping.frequency.exponentialRampToValueAtTime(700, voice.when + 0.12);
  const pingGain = envelope(voice, 0.08, 0.002, 0.14);
  ping.connect(pingGain);
  route(pingGain, voice, 0.3);
  play(ping, voice, 0.18);
  const grit = noiseSource(voice, 0.4);
  const band = filter(voice, 'bandpass', 2400, 1.4);
  const gritGain = envelope(voice, 0.12, 0.002, 0.09);
  grit.connect(band).connect(gritGain);
  route(gritGain, voice, 0.2);
  play(grit, voice, 0.12);
}

/** Explosion: a closing noise roar, a sub punch and a few crackles, with a long reverb tail. */
export function explosion(voice: Voice, distance: number, seed: number): void {
  const roar = noiseSource(voice, seed * 3);
  const close = filter(voice, 'lowpass', Math.max(1400, 5200 - distance * 6), 0.8);
  close.frequency.exponentialRampToValueAtTime(140, voice.when + 1.9);
  const roarGain = envelope(voice, 0.75, 0.006, 2.4);
  roar.connect(close).connect(roarGain);
  route(roarGain, voice, 0.75);
  play(roar, voice, 2.6);

  const punch = oscillator(voice, 'sine', 78);
  punch.frequency.exponentialRampToValueAtTime(26, voice.when + 0.9);
  const punchGain = envelope(voice, 1, 0.004, 1.1);
  punch.connect(punchGain);
  route(punchGain, voice, 0.15);
  play(punch, voice, 1.3);

  for (let crackle = 0; crackle < 4; crackle += 1) {
    const offset = 0.08 + crackle * (0.07 + seed * 0.05);
    const shard: Voice = { ...voice, when: voice.when + offset };
    const burst = noiseSource(shard, seed + crackle);
    const high = filter(shard, 'highpass', 1800 + crackle * 400);
    const burstGain = envelope(shard, 0.14 / (crackle + 1), 0.002, 0.07);
    burst.connect(high).connect(burstGain);
    route(burstGain, shard, 0.4);
    play(burst, shard, 0.1);
  }
}

/** Hyperspace approach: rising filtered noise and a climbing tone. */
export function warpRise(voice: Voice): void {
  const air = noiseSource(voice, 1.3);
  const band = filter(voice, 'bandpass', 160, 3.5);
  band.frequency.exponentialRampToValueAtTime(4200, voice.when + 1.1);
  const gain = voice.context.createGain();
  gain.gain.setValueAtTime(0.0001, voice.when);
  gain.gain.exponentialRampToValueAtTime(0.5, voice.when + 1.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, voice.when + 1.2);
  air.connect(band).connect(gain);
  route(gain, voice, 0.4);
  play(air, voice, 1.25);
  const climb = oscillator(voice, 'sawtooth', 70);
  climb.frequency.exponentialRampToValueAtTime(1100, voice.when + 1.1);
  const climbFilter = filter(voice, 'lowpass', 2200);
  const climbGain = voice.context.createGain();
  climbGain.gain.setValueAtTime(0.0001, voice.when);
  climbGain.gain.exponentialRampToValueAtTime(0.09, voice.when + 1.05);
  climbGain.gain.exponentialRampToValueAtTime(0.0001, voice.when + 1.15);
  climb.connect(climbFilter).connect(climbGain);
  route(climbGain, voice, 0.3);
  play(climb, voice, 1.2);
}

/** Dropping out of warp: a deep boom with a bright shimmer on top. */
export function warpArrival(voice: Voice): void {
  const boom = oscillator(voice, 'sine', 62);
  boom.frequency.exponentialRampToValueAtTime(24, voice.when + 1.6);
  const boomGain = envelope(voice, 1.1, 0.005, 2.2);
  boom.connect(boomGain);
  route(boomGain, voice, 0.3);
  play(boom, voice, 2.4);
  const crash = noiseSource(voice, 2.2);
  const close = filter(voice, 'lowpass', 7000);
  close.frequency.exponentialRampToValueAtTime(260, voice.when + 2.2);
  const crashGain = envelope(voice, 0.5, 0.004, 2.4);
  crash.connect(close).connect(crashGain);
  route(crashGain, voice, 0.8);
  play(crash, voice, 2.6);
  for (const frequency of [1318.5, 1760, 2637]) {
    const shimmer = oscillator(voice, 'sine', frequency);
    const gain = envelope(voice, 0.035, 0.01, 1.8);
    shimmer.connect(gain);
    route(gain, voice, 1);
    play(shimmer, voice, 2);
  }
}

/** Sustained string/synth pad: detuned saws through a slowly opening filter. */
export function pad(voice: Voice, notes: readonly number[], length: number, level: number): void {
  const tone = filter(voice, 'lowpass', 500, 0.6);
  tone.frequency.linearRampToValueAtTime(900 + level * 900, voice.when + length * 0.6);
  const gain = voice.context.createGain();
  gain.gain.setValueAtTime(0.0001, voice.when);
  gain.gain.linearRampToValueAtTime(0.05 * level, voice.when + Math.min(1.2, length * 0.4));
  gain.gain.setValueAtTime(0.05 * level, voice.when + length * 0.8);
  gain.gain.linearRampToValueAtTime(0.0001, voice.when + length + 0.9);
  for (const frequency of notes) {
    for (const detune of [-9, 0, 9]) {
      const saw = oscillator(voice, 'sawtooth', frequency);
      saw.detune.value = detune;
      saw.connect(tone);
      play(saw, voice, length + 1);
    }
  }
  tone.connect(gain);
  route(gain, voice, 0.6);
}

/** Driving bass ostinato note with a plucked filter envelope. */
export function pulse(voice: Voice, frequency: number, length: number, level: number): void {
  const saw = oscillator(voice, 'sawtooth', frequency);
  const pluck = filter(voice, 'lowpass', 1300, 4);
  pluck.frequency.exponentialRampToValueAtTime(180, voice.when + length * 0.8);
  const gain = envelope(voice, 0.13 * level, 0.004, length * 0.95);
  saw.connect(pluck).connect(gain);
  route(gain, voice, 0.15);
  play(saw, voice, length + 0.05);
}

/** Cinematic low drum: a pitched body and a short skin noise. */
export function drum(voice: Voice, level: number): void {
  const body = oscillator(voice, 'sine', 96);
  body.frequency.exponentialRampToValueAtTime(44, voice.when + 0.3);
  const bodyGain = envelope(voice, 0.75 * level, 0.003, 0.7);
  body.connect(bodyGain);
  route(bodyGain, voice, 0.45);
  play(body, voice, 0.8);
  const skin = noiseSource(voice, 0.7);
  const low = filter(voice, 'lowpass', 900);
  const skinGain = envelope(voice, 0.22 * level, 0.002, 0.16);
  skin.connect(low).connect(skinGain);
  route(skinGain, voice, 0.4);
  play(skin, voice, 0.2);
}

/** Brass-like lead for the hero's motif: saws with a filter that blooms on each note. */
export function brass(voice: Voice, notes: readonly number[], length: number, level: number): void {
  const bloom = filter(voice, 'lowpass', 400, 2);
  bloom.frequency.linearRampToValueAtTime(2400, voice.when + 0.12);
  bloom.frequency.linearRampToValueAtTime(1100, voice.when + length);
  const gain = voice.context.createGain();
  gain.gain.setValueAtTime(0.0001, voice.when);
  gain.gain.linearRampToValueAtTime(0.07 * level, voice.when + 0.06);
  gain.gain.setValueAtTime(0.06 * level, voice.when + length * 0.7);
  gain.gain.linearRampToValueAtTime(0.0001, voice.when + length + 0.25);
  for (const frequency of notes) {
    for (const detune of [-6, 6]) {
      const saw = oscillator(voice, 'sawtooth', frequency);
      saw.detune.value = detune;
      saw.connect(bloom);
      play(saw, voice, length + 0.3);
    }
  }
  bloom.connect(gain);
  route(gain, voice, 0.55);
}

export type InterfaceSound = 'hover' | 'select' | 'back';

/** Quiet interface feedback: a tick on hover, a rising pair on select, a falling pair on back. */
export function interfaceSound(voice: Voice, kind: InterfaceSound): void {
  const steps: Array<[number, number]> =
    kind === 'hover'
      ? [[2200, 0]]
      : kind === 'select'
        ? [
            [880, 0],
            [1320, 0.06],
          ]
        : [
            [1320, 0],
            [880, 0.06],
          ];
  for (const [frequency, offset] of steps) {
    const shifted: Voice = { ...voice, when: voice.when + offset };
    const tone = oscillator(shifted, 'sine', frequency);
    const gain = envelope(
      shifted,
      kind === 'hover' ? 0.025 : 0.05,
      0.003,
      kind === 'hover' ? 0.05 : 0.16,
    );
    tone.connect(gain);
    route(gain, shifted, 0.25);
    play(tone, shifted, 0.25);
  }
}

/** Long decaying stereo noise: a synthetic hall for the reverb send. */
export function createImpulseResponse(context: AudioContext, seconds = 3.2): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const t = index / length;
      data[index] = (Math.random() * 2 - 1) * (1 - t) ** 3.2 * (index < 400 ? index / 400 : 1);
    }
  }
  return buffer;
}

export function createWhiteNoise(context: AudioContext, seconds = 2): AudioBuffer {
  const buffer = context.createBuffer(
    1,
    Math.floor(context.sampleRate * seconds),
    context.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * A quiet, slowly evolving bed: an open fifth voiced through a low-pass filter plus filtered
 * noise that breathes over tens of seconds. Synthesized at runtime; no audio files.
 */
export class ProceduralAmbience {
  private readonly sources: AudioScheduledSourceNode[] = [];

  public constructor(context: AudioContext, destination: AudioNode, delay = 0) {
    const now = context.currentTime + delay;
    const bed = context.createGain();
    bed.gain.setValueAtTime(0, now);
    bed.gain.linearRampToValueAtTime(0.42, now + 8);
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

export function createBrownNoise(context: AudioContext, seconds: number): AudioBuffer {
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
