import type { WeaponId } from "../shared/types";
import { WEAPON_ORDER } from "../shared/weapons";

const SAMPLE_RATE = 11025;

function encodeWav(samples: Float32Array): string {
  const buffer = new ArrayBuffer(44 + samples.length);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + samples.length, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeAscii(36, "data");
  view.setUint32(40, samples.length, true);

  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setUint8(44 + i, Math.round(sample * 127 + 128));
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return `data:audio/wav;base64,${btoa(binary)}`;
}

interface GunshotTone {
  duration: number;
  bodyFrequency: number;
  bodyDrop: number;
  bodyDecay: number;
  bodyLevel: number;
  crackFrequency: number;
  crackDrop: number;
  crackDecay: number;
  crackLevel: number;
  noiseDecay: number;
  noiseLevel: number;
  tailFrequency: number;
  tailLevel: number;
  seed: number;
}

function synthGunshot(tone: GunshotTone): Float32Array {
  const length = Math.round(SAMPLE_RATE * tone.duration);
  const samples = new Float32Array(length);
  let noise = 0;
  let lastWhite = 0;
  let seed = tone.seed;

  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const progress = t / tone.duration;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const white = (seed / 0x7fffffff) * 2 - 1;
    noise = noise * 0.56 + white * 0.44;
    const bright = white - lastWhite;
    lastWhite = white;

    const body =
      Math.sin(
        2 * Math.PI * (tone.bodyFrequency - tone.bodyDrop * progress) * t,
      ) * Math.exp(-tone.bodyDecay * t);
    const crack =
      Math.sin(
        2 * Math.PI * (tone.crackFrequency - tone.crackDrop * progress) * t,
      ) * Math.exp(-tone.crackDecay * t);
    const tailTime = Math.max(0, t - 0.08);
    const tail =
      t > 0.08
        ? Math.sin(2 * Math.PI * tone.tailFrequency * tailTime) *
          Math.exp(-5.5 * tailTime) *
          tone.tailLevel
        : 0;

    samples[i] =
      body * tone.bodyLevel +
      crack * tone.crackLevel +
      bright * tone.crackLevel * 0.32 +
      noise * Math.exp(-tone.noiseDecay * t) * tone.noiseLevel +
      tail;
  }

  return samples;
}

const SHOT_TONES: Record<Exclude<WeaponId, "sniper">, GunshotTone> = {
  smg: {
    duration: 0.1,
    bodyFrequency: 195,
    bodyDrop: 95,
    bodyDecay: 32,
    bodyLevel: 0.42,
    crackFrequency: 2150,
    crackDrop: 1250,
    crackDecay: 55,
    crackLevel: 0.62,
    noiseDecay: 40,
    noiseLevel: 0.52,
    tailFrequency: 120,
    tailLevel: 0.04,
    seed: 0x1a2b3c4d,
  },
  rifle: {
    duration: 0.16,
    bodyFrequency: 125,
    bodyDrop: 65,
    bodyDecay: 20,
    bodyLevel: 0.68,
    crackFrequency: 1850,
    crackDrop: 1150,
    crackDecay: 38,
    crackLevel: 0.48,
    noiseDecay: 27,
    noiseLevel: 0.62,
    tailFrequency: 94,
    tailLevel: 0.12,
    seed: 0x1f2e3d4c,
  },
  shotgun: {
    duration: 0.34,
    bodyFrequency: 86,
    bodyDrop: 42,
    bodyDecay: 10,
    bodyLevel: 1.05,
    crackFrequency: 1450,
    crackDrop: 950,
    crackDecay: 24,
    crackLevel: 0.42,
    noiseDecay: 13,
    noiseLevel: 0.78,
    tailFrequency: 58,
    tailLevel: 0.26,
    seed: 0x2c4e6a8b,
  },
  dmr: {
    duration: 0.24,
    bodyFrequency: 112,
    bodyDrop: 58,
    bodyDecay: 14,
    bodyLevel: 0.84,
    crackFrequency: 2050,
    crackDrop: 1350,
    crackDecay: 33,
    crackLevel: 0.58,
    noiseDecay: 19,
    noiseLevel: 0.62,
    tailFrequency: 82,
    tailLevel: 0.18,
    seed: 0x3d5f7a9c,
  },
  lmg: {
    duration: 0.22,
    bodyFrequency: 96,
    bodyDrop: 48,
    bodyDecay: 14,
    bodyLevel: 0.86,
    crackFrequency: 1580,
    crackDrop: 980,
    crackDecay: 30,
    crackLevel: 0.44,
    noiseDecay: 20,
    noiseLevel: 0.7,
    tailFrequency: 67,
    tailLevel: 0.2,
    seed: 0x4e6a8c9d,
  },
  pistol: {
    duration: 0.13,
    bodyFrequency: 185,
    bodyDrop: 95,
    bodyDecay: 27,
    bodyLevel: 0.54,
    crackFrequency: 2250,
    crackDrop: 1450,
    crackDecay: 48,
    crackLevel: 0.66,
    noiseDecay: 33,
    noiseLevel: 0.5,
    tailFrequency: 135,
    tailLevel: 0.06,
    seed: 0x5a7b9c1d,
  },
  revolver: {
    duration: 0.25,
    bodyFrequency: 108,
    bodyDrop: 56,
    bodyDecay: 14,
    bodyLevel: 0.92,
    crackFrequency: 1950,
    crackDrop: 1250,
    crackDecay: 31,
    crackLevel: 0.6,
    noiseDecay: 18,
    noiseLevel: 0.58,
    tailFrequency: 75,
    tailLevel: 0.2,
    seed: 0x6b8c1d2e,
  },
};

function synthSniperShot(): Float32Array {
  const duration = 0.62;
  const length = Math.round(SAMPLE_RATE * duration);
  const samples = new Float32Array(length);
  let noise = 0;
  let seed = 0x6b5f4d3c;

  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const white = (seed / 0x7fffffff) * 2 - 1;
    noise = noise * 0.67 + white * 0.33;
    const crack = white * Math.exp(-58 * t) * 0.82;
    const snap =
      Math.sin(2 * Math.PI * (2350 - 1550 * (t / duration)) * t) *
      Math.exp(-34 * t) *
      0.5;
    const boom =
      Math.sin(2 * Math.PI * (108 - 56 * (t / duration)) * t) *
      Math.exp(-7.5 * t) *
      0.95;
    const body = noise * Math.exp(-12 * t) * 0.55;
    const tailTime = Math.max(0, t - 0.105);
    const tail =
      Math.sin(2 * Math.PI * 72 * tailTime) *
      Math.exp(-6.2 * tailTime) *
      (t > 0.105 ? 0.32 : 0);
    samples[i] = crack + snap + boom + body + tail;
  }

  return samples;
}

function synthClick(frequency: number, duration: number): Float32Array {
  const length = Math.round(SAMPLE_RATE * duration);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    samples[i] =
      Math.sin(2 * Math.PI * frequency * t) * Math.exp(-70 * t);
  }
  return samples;
}

function synthHit(): Float32Array {
  const duration = 0.075;
  const length = Math.round(SAMPLE_RATE * duration);
  const samples = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const envelope = Math.exp(-48 * t);
    samples[i] =
      (Math.sin(2 * Math.PI * 1250 * t) * 0.6 +
        Math.sin(2 * Math.PI * 1875 * t) * 0.4) *
      envelope;
  }

  return samples;
}

function synthDeath(): Float32Array {
  const duration = 0.45;
  const length = Math.round(SAMPLE_RATE * duration);
  const samples = new Float32Array(length);
  let phase = 0;
  let seed = 0x2a3b4c5d;

  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const frequency = 300 * Math.exp(-3.2 * t) + 55;
    phase += (2 * Math.PI * frequency) / SAMPLE_RATE;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const noise = (seed / 0x7fffffff) * 2 - 1;
    samples[i] =
      (Math.sin(phase) * 0.7 + noise * 0.12) * Math.exp(-3.2 * t);
  }

  return samples;
}

function synthExplosion(): Float32Array {
  const duration = 0.55;
  const length = Math.round(SAMPLE_RATE * duration);
  const samples = new Float32Array(length);
  let noise = 0;
  let seed = 0x5a617282;

  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const white = (seed / 0x7fffffff) * 2 - 1;
    noise = noise * 0.82 + white * 0.18;
    const thump = Math.sin(2 * Math.PI * (70 - 42 * (t / duration)) * t);
    samples[i] =
      (noise * 0.9 + thump * 0.45) * Math.exp(-5.4 * t);
  }

  return samples;
}

function synthPickup(): Float32Array {
  const duration = 0.16;
  const length = Math.round(SAMPLE_RATE * duration);
  const samples = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const envelope = Math.exp(-18 * t);
    samples[i] =
      (Math.sin(2 * Math.PI * 620 * t) * 0.55 +
        Math.sin(2 * Math.PI * 930 * t) * 0.35) *
      envelope;
  }

  return samples;
}

function createAudio(url: string, volume: number): HTMLAudioElement {
  const audio = new Audio(url);
  audio.preload = "auto";
  audio.volume = volume;
  return audio;
}

const SHOT_VOLUME: Record<WeaponId, number> = {
  rifle: 0.46,
  smg: 0.34,
  shotgun: 0.56,
  sniper: 0.6,
  dmr: 0.48,
  lmg: 0.45,
  pistol: 0.38,
  revolver: 0.52,
};

export class GameAudio {
  private readonly localShots = new Map<WeaponId, HTMLAudioElement>();
  private readonly remoteShots = new Map<WeaponId, HTMLAudioElement>();
  private readonly hit: HTMLAudioElement;
  private readonly headshot: HTMLAudioElement;
  private readonly death: HTMLAudioElement;
  private readonly reload: HTMLAudioElement;
  private readonly empty: HTMLAudioElement;
  private readonly spawn: HTMLAudioElement;
  private readonly grenadeThrow: HTMLAudioElement;
  private readonly explosion: HTMLAudioElement;
  private readonly pickup: HTMLAudioElement;

  constructor() {
    for (const weapon of WEAPON_ORDER) {
      const samples =
        weapon === "sniper"
          ? synthSniperShot()
          : synthGunshot(SHOT_TONES[weapon]);
      const url = encodeWav(samples);
      const volume = SHOT_VOLUME[weapon];
      this.localShots.set(weapon, createAudio(url, volume));
      this.remoteShots.set(weapon, createAudio(url, volume * 0.56));
    }
    this.hit = createAudio(encodeWav(synthHit()), 0.25);
    this.headshot = createAudio(encodeWav(synthHit()), 0.3);
    this.headshot.playbackRate = 1.3;
    this.death = createAudio(encodeWav(synthDeath()), 0.24);
    this.reload = createAudio(encodeWav(synthClick(260, 0.08)), 0.2);
    this.empty = createAudio(encodeWav(synthClick(120, 0.05)), 0.16);
    this.spawn = createAudio(encodeWav(synthClick(640, 0.12)), 0.14);
    this.spawn.playbackRate = 0.8;
    this.grenadeThrow = createAudio(encodeWav(synthClick(210, 0.07)), 0.16);
    this.explosion = createAudio(encodeWav(synthExplosion()), 0.5);
    this.pickup = createAudio(encodeWav(synthPickup()), 0.2);
  }

  playShoot(weapon: WeaponId): void {
    const shot = this.localShots.get(weapon);
    if (!shot) {
      return;
    }
    shot.playbackRate = 0.96 + Math.random() * 0.08;
    this.play(shot);
  }

  playRemoteShoot(weapon: WeaponId): void {
    const shot = this.remoteShots.get(weapon);
    if (!shot) {
      return;
    }
    shot.playbackRate = 0.95 + Math.random() * 0.1;
    this.play(shot);
  }

  playHit(headshot = false): void {
    this.play(headshot ? this.headshot : this.hit);
  }

  playDeath(): void {
    this.play(this.death);
  }

  playReload(): void {
    this.play(this.reload);
  }

  playEmpty(): void {
    this.play(this.empty);
  }

  playSpawn(): void {
    this.play(this.spawn);
  }

  playGrenadeThrow(): void {
    this.play(this.grenadeThrow);
  }

  playExplosion(): void {
    this.play(this.explosion);
  }

  playPickup(): void {
    this.play(this.pickup);
  }

  private play(audio: HTMLAudioElement): void {
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }
}
