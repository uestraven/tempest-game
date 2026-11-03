import Phaser from 'phaser';

type Cue = 'pistol' | 'hit' | 'pickup' | 'alert' | 'takedown' | 'radio' | 'ui';

interface CueSpec {
  duration: number;
  /** Base frequency in Hz; 0 means noise only. */
  frequency: number;
  noise: number;
  volume: number;
  /** Multiplier applied to the frequency over the cue's life. */
  sweep: number;
}

const CUES: Record<Cue, CueSpec> = {
  pistol: { duration: 0.1, frequency: 180, noise: 0.7, volume: 0.35, sweep: 0.3 },
  hit: { duration: 0.08, frequency: 90, noise: 0.5, volume: 0.3, sweep: 0.5 },
  pickup: { duration: 0.12, frequency: 620, noise: 0.05, volume: 0.25, sweep: 1.7 },
  alert: { duration: 0.22, frequency: 330, noise: 0.1, volume: 0.3, sweep: 1.5 },
  takedown: { duration: 0.14, frequency: 140, noise: 0.6, volume: 0.28, sweep: 0.6 },
  radio: { duration: 0.35, frequency: 240, noise: 0.45, volume: 0.3, sweep: 1.1 },
  ui: { duration: 0.06, frequency: 480, noise: 0, volume: 0.2, sweep: 1 },
};

/**
 * Procedural SFX so the slice has audible feedback without binary assets.
 * Final authored audio lands in Phase D; the call sites stay the same.
 */
export class Audio {
  private readonly ctx: AudioContext | null;
  private readonly master: GainNode | null = null;

  constructor(scene: Phaser.Scene) {
    const sound = scene.sound as Phaser.Sound.WebAudioSoundManager;
    const ctx = sound?.context ?? null;
    this.ctx = ctx;
    if (ctx) {
      this.master = ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(ctx.destination);
    }
  }

  play(cue: Cue, volumeScale = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state === 'suspended') return;
    const spec = CUES[cue];
    const length = Math.max(1, Math.floor(ctx.sampleRate * spec.duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let phase = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const envelope = Math.pow(1 - t, 2.2);
      const freq = spec.frequency * (1 + (spec.sweep - 1) * t);
      phase += (2 * Math.PI * freq) / ctx.sampleRate;
      const tone = spec.frequency > 0 ? Math.sin(phase) : 0;
      // Deterministic pseudo-noise keeps repeated cues from sounding identical.
      const noise = Math.sin(i * 12.9898) * 43758.5453;
      const n = (noise - Math.floor(noise)) * 2 - 1;
      data[i] = (tone * (1 - spec.noise) + n * spec.noise) * envelope * spec.volume * volumeScale;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.master);
    source.start();
  }
}
