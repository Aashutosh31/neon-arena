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
  const duration = 0.1;
  const length = Math.round(SAMPLE_RATE * duration);
  const samples = new Float32Array(length);
  let noise = 0;
  let seed = 0x1f2e3d4c;

  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const white = (seed / 0x7fffffff) * 2 - 1;
    noise = noise * 0.55 + white * 0.45;
    const sweep = Math.sin(2 * Math.PI * (500 - 380 * (t / duration)) * t);
    samples[i] = (noise * 0.8 + sweep * 0.5) * Math.exp(-32 * t);
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

function createAudio(url: string, volume: number): HTMLAudioElement {
  const audio = new Audio(url);
  audio.preload = "auto";
  audio.volume = volume;
  return audio;
}

export class GameAudio {
  private readonly shoot: HTMLAudioElement;
  private readonly remoteShoot: HTMLAudioElement;
  private readonly hit: HTMLAudioElement;
  private readonly death: HTMLAudioElement;

  constructor() {
    const shootUrl = encodeWav(synthShoot());
    this.shoot = createAudio(shootUrl, 0.22);
    this.remoteShoot = createAudio(shootUrl, 0.09);
    this.hit = createAudio(encodeWav(synthHit()), 0.25);
    this.death = createAudio(encodeWav(synthDeath()), 0.24);
  }

  playShoot(): void {
    this.play(this.shoot);
  }

  playRemoteShoot(): void {
    this.play(this.remoteShoot);
  }

  playHit(): void {
    this.play(this.hit);
  }

  playDeath(): void {
    this.play(this.death);
  }

  private play(audio: HTMLAudioElement): void {
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }
}
