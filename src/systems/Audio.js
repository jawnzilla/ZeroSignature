// Procedural WebAudio — all sounds synthesized, no asset files.
let ctx = null;
let master = null;
let muted = false;

export function initAudio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  return ctx;
}
export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}
export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.8;
  return muted;
}

function noiseBuffer(dur) {
  const b = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function env(g, t0, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

export function playGunshot({ suppressed = false, vol = 0.9 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  if (suppressed) {
    // short, dull "thwip"
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.12);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 400;
    const g = ctx.createGain();
    env(g, t0, 0.002, vol * 0.5, 0.09);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  } else {
    // crack: noise burst + low thump
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.18);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
    const g = ctx.createGain();
    env(g, t0, 0.001, vol, 0.14);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
    // thump
    const o = ctx.createOscillator(); o.type = 'sine';
    const og = ctx.createGain();
    o.frequency.setValueAtTime(120, t0);
    o.frequency.exponentialRampToValueAtTime(40, t0 + 0.15);
    env(og, t0, 0.005, vol * 0.8, 0.16);
    o.connect(og); og.connect(master);
    o.start(t0); o.stop(t0 + 0.2);
  }
}
export function playFootstep({ loud = false } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(loud ? 0.09 : 0.05);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = loud ? 700 : 350;
  const g = ctx.createGain();
  env(g, t0, 0.004, loud ? 0.22 : 0.12, 0.06);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0);
}
export function playHit() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'square';
  const g = ctx.createGain();
  o.frequency.setValueAtTime(220, t0);
  o.frequency.exponentialRampToValueAtTime(90, t0 + 0.1);
  env(g, t0, 0.002, 0.5, 0.12);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + 0.14);
}
export function playAlert() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  [660, 880].forEach((freq, i) => {
    const o = ctx.createOscillator(); o.type = 'triangle';
    const g = ctx.createGain();
    o.frequency.value = freq;
    env(g, t0 + i * 0.13, 0.005, 0.3, 0.11);
    o.connect(g); g.connect(master);
    o.start(t0 + i * 0.13); o.stop(t0 + i * 0.13 + 0.13);
  });
}
export function playPickup() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  [523, 784, 1046].forEach((freq, i) => {
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = ctx.createGain();
    o.frequency.value = freq;
    env(g, t0 + i * 0.05, 0.01, 0.28, 0.14);
    o.connect(g); g.connect(master);
    o.start(t0 + i * 0.05); o.stop(t0 + i * 0.05 + 0.16);
  });
}
export function playStep() { playFootstep(); }
export function playReload() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  [0, 0.28, 0.55].forEach((dt, i) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.04);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1000;
    const g = ctx.createGain();
    env(g, t0 + dt, 0.002, i === 2 ? 0.3 : 0.16, 0.05);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0 + dt);
  });
}
export function playHurt() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  const g = ctx.createGain();
  o.frequency.setValueAtTime(160, t0);
  o.frequency.exponentialRampToValueAtTime(70, t0 + 0.25);
  env(g, t0, 0.005, 0.4, 0.28);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + 0.32);
}
export function playKnock() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  // dull body thump
  const o = ctx.createOscillator(); o.type = 'sine';
  const g = ctx.createGain();
  o.frequency.setValueAtTime(90, t0);
  o.frequency.exponentialRampToValueAtTime(45, t0 + 0.18);
  env(g, t0, 0.003, 0.5, 0.22);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + 0.25);
  // cloth/impact noise
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.08);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
  const g2 = ctx.createGain();
  env(g2, t0, 0.002, 0.3, 0.08);
  src.connect(f); f.connect(g2); g2.connect(master);
  src.start(t0);
}
export function playAlertSting() { playAlert(); }
