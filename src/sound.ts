// Sound effects are short synthesized tones: no audio files to load.
// `from` and `to` are the pitch at the start and end of the tone in hertz,
// `time` its length in seconds, `loud` its level relative to the others.
type Tone = { wave: OscillatorType; from: number; to: number; time: number; loud: number }

export const cues = {
  shot: { wave: 'triangle', from: 880, to: 520, time: 0.06, loud: 0.25 },
  kill: { wave: 'square', from: 300, to: 110, time: 0.09, loud: 0.3 },
  pickup: { wave: 'sine', from: 660, to: 990, time: 0.07, loud: 0.35 },
  level: { wave: 'triangle', from: 520, to: 1040, time: 0.35, loud: 0.6 },
  pick: { wave: 'sine', from: 780, to: 1170, time: 0.12, loud: 0.5 },
  heal: { wave: 'sine', from: 440, to: 880, time: 0.25, loud: 0.5 },
  chest: { wave: 'triangle', from: 392, to: 784, time: 0.4, loud: 0.6 },
  hurt: { wave: 'sawtooth', from: 220, to: 70, time: 0.25, loud: 0.8 },
  warn: { wave: 'square', from: 180, to: 240, time: 0.18, loud: 0.45 },
  slash: { wave: 'sawtooth', from: 900, to: 300, time: 0.08, loud: 0.3 },
  toll: { wave: 'sine', from: 196, to: 185, time: 0.5, loud: 0.7 },
  burst: { wave: 'square', from: 160, to: 60, time: 0.18, loud: 0.5 },
  arrow: { wave: 'triangle', from: 1200, to: 700, time: 0.05, loud: 0.3 },
  lash: { wave: 'sawtooth', from: 500, to: 90, time: 0.3, loud: 0.8 },
  bell: { wave: 'sine', from: 523, to: 515, time: 0.9, loud: 0.8 },
  rise: { wave: 'sawtooth', from: 80, to: 160, time: 0.5, loud: 0.6 },
  crown: { wave: 'triangle', from: 330, to: 660, time: 0.3, loud: 0.6 },
  win: { wave: 'triangle', from: 392, to: 1047, time: 1.1, loud: 0.8 },
  lose: { wave: 'sawtooth', from: 220, to: 55, time: 0.9, loud: 0.7 },
} satisfies Record<string, Tone>

export type Cue = keyof typeof cues

// The least time between two plays of the same cue, so a crowded fight does
// not turn into noise.
const gap = 0.045

export class Sound {
  // 0 is silent, 1 is full.
  volume = 0.6
  // Tones actually sent to the speakers, per cue. Tests read this.
  readonly sounded: Partial<Record<Cue, number>> = {}
  private context?: AudioContext
  private last: Partial<Record<Cue, number>> = {}

  // Browsers allow sound only after the player has clicked or pressed a key.
  unlock() {
    const Audio = globalThis.AudioContext
    if (!Audio) return
    this.context ??= new Audio()
    void this.context.resume()
  }

  play(cue: Cue) {
    const context = this.context
    if (!context || this.volume <= 0) return
    const now = context.currentTime
    if (now - (this.last[cue] ?? -1) < gap) return
    this.last[cue] = now
    const tone: Tone = cues[cue]
    const voice = context.createOscillator()
    const level = context.createGain()
    voice.type = tone.wave
    voice.frequency.setValueAtTime(tone.from, now)
    voice.frequency.exponentialRampToValueAtTime(tone.to, now + tone.time)
    // A quick attack and a fade to silence, so tones never click.
    level.gain.setValueAtTime(0.0001, now)
    level.gain.exponentialRampToValueAtTime(0.5 * tone.loud * this.volume, now + 0.008)
    level.gain.exponentialRampToValueAtTime(0.0001, now + tone.time)
    voice.connect(level).connect(context.destination)
    voice.start(now)
    voice.stop(now + tone.time + 0.02)
    this.sounded[cue] = (this.sounded[cue] ?? 0) + 1
  }
}
