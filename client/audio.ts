import type { WeaponId } from "../shared/types";

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

function synthShoot(): Float32Array {
  const duration = 0.14;
  const length = Math.round(SAMPLE_RATE * duration);
  const samples = new Float32Array(length);
  let noise = 0;
  let seed = 0x1f2e3d4c;

  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const white = (seed / 0x7fffffff) * 2 - 1;
    noise = noise * 0.52 + white * 0.48;
    const sweep = Math.sin(2 * Math.PI * (540 - 410 * (t / duration)) * t);
    const thump = Math.sin(2 * Math.PI * (105 - 45 * (t / duration)) * t);
    samples[i] =
      (noise * 0.9 + sweep * 0.58 + thump * 0.5) * Math.exp(-24 * t);
  }

  return samples;
}

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

const SHOT_RATE: Record<WeaponId, number> = {
  rifle: 1,
  smg: 1.18,
  shotgun: 0.72,
  sniper: 0.54,
  dmr: 0.78,
  lmg: 0.92,
  pistol: 1.08,
  revolver: 0.68,
};

const SHOT_VOLUME: Record<WeaponId, number> = {
  rifle: 0.4,
  smg: 0.32,
  shotgun: 0.5,
  sniper: 0.52,
  dmr: 0.44,
  lmg: 0.42,
  pistol: 0.36,
  revolver: 0.48,
};

export class GameAudio {
  private readonly shoot: HTMLAudioElement;
  private readonly sniperShoot: HTMLAudioElement;
  private readonly remoteShoot: HTMLAudioElement;
  private readonly remoteSniperShoot: HTMLAudioElement;
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
    const shootUrl = encodeWav(synthShoot());
    this.shoot = createAudio(shootUrl, 0.22);
    this.sniperShoot = createAudio(encodeWav(synthSniperShot()), 0.68);
    this.remoteShoot = createAudio(shootUrl, 0.18);
    this.remoteSniperShoot = createAudio(
      encodeWav(synthSniperShot()),
      0.36,
    );
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
    if (weapon === "sniper") {
      this.play(this.sniperShoot);
      return;
    }
    this.shoot.volume = SHOT_VOLUME[weapon];
    this.shoot.playbackRate = SHOT_RATE[weapon];
    this.play(this.shoot);
  }

  playRemoteShoot(weapon: WeaponId): void {
    if (weapon === "sniper") {
      this.play(this.remoteSniperShoot);
      return;
    }
    this.remoteShoot.playbackRate = SHOT_RATE[weapon];
    this.play(this.remoteShoot);
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
