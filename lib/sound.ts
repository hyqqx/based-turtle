/* Tiny WebAudio synth: no audio files, everything generated in code.
   All functions are safe to call anywhere; they no-op when muted or
   when the browser blocks audio. */

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(v: boolean) {
  muted = v;
  try {
    window.localStorage.setItem("bt-muted", v ? "1" : "0");
  } catch {
    /* cosmetic only */
  }
}

export function isMuted(): boolean {
  return muted;
}

export function loadMuted() {
  try {
    muted = window.localStorage.getItem("bt-muted") === "1";
  } catch {
    muted = false;
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBuffer(ac: AudioContext, seconds: number): AudioBuffer {
  const buf = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Filtered noise with a volume envelope: base for water-ish sounds. */
function playNoise(opts: {
  seconds: number;
  filter: BiquadFilterType;
  freq: number;
  peak: number;
  attack: number;
  swells?: number;
}) {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, opts.seconds);
  const flt = ac.createBiquadFilter();
  flt.type = opts.filter;
  flt.frequency.value = opts.freq;
  const gain = ac.createGain();
  const t = ac.currentTime;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(opts.peak, t + opts.attack);
  if (opts.swells && opts.swells > 1) {
    const step = opts.seconds / opts.swells;
    for (let i = 1; i < opts.swells; i++) {
      gain.gain.linearRampToValueAtTime(opts.peak * 0.35, t + step * i);
      gain.gain.linearRampToValueAtTime(opts.peak, t + step * i + step * 0.55);
    }
  }
  gain.gain.linearRampToValueAtTime(0.0001, t + opts.seconds);
  src.connect(flt).connect(gain).connect(ac.destination);
  src.start(t);
  src.stop(t + opts.seconds);
}

function tone(freq: number, start: number, dur: number, peak = 0.12) {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;
  const gain = ac.createGain();
  const t = ac.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/* ------------------------------ sfx ------------------------------- */

export function playMunch() {
  // three soft low bites
  for (let i = 0; i < 3; i++) {
    setTimeout(
      () =>
        playNoise({
          seconds: 0.14,
          filter: "lowpass",
          freq: 420,
          peak: 0.22,
          attack: 0.01,
        }),
      i * 260,
    );
  }
}

export function playShower(seconds = 4) {
  playNoise({
    seconds,
    filter: "bandpass",
    freq: 2400,
    peak: 0.14,
    attack: 0.25,
  });
}

export function playWaves(seconds = 4.5) {
  playNoise({
    seconds,
    filter: "lowpass",
    freq: 700,
    peak: 0.18,
    attack: 0.6,
    swells: 3,
  });
}

export function playPop() {
  tone(660, 0, 0.12, 0.1);
}

export function playGm() {
  tone(523, 0, 0.15);
  tone(659, 0.12, 0.18);
}

export function playLevelUp() {
  tone(523, 0, 0.16);
  tone(659, 0.14, 0.16);
  tone(784, 0.28, 0.2);
  tone(1046, 0.44, 0.34, 0.16);
}
