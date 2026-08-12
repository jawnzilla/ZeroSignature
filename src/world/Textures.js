// Procedural canvas textures — concrete grime, panel seams, scratches — so
// the merged geometry reads as real material instead of flat colour greybox.
import * as THREE from 'three';

function makeTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// deterministic-ish pseudo random in [0,1)
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function buildTextures() {
  const texs = {};

  // --- concrete / floor: mottled base + grime + tile seam grid ---
  texs.floor = makeTex(256, (ctx, s) => {
    const r = rng(11);
    // base tint (light so colour multiplies)
    ctx.fillStyle = '#6f7680'; ctx.fillRect(0, 0, s, s);
    // large grime patches
    for (let i = 0; i < 26; i++) {
      const x = r() * s, y = r() * s;
      const grad = ctx.createRadialGradient(x, y, 2, x, y, 24 + r() * 30);
      grad.addColorStop(0, `rgba(20,24,30,${0.25 + r() * 0.25})`);
      grad.addColorStop(1, 'rgba(20,24,30,0)');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, 24 + r() * 30, 0, 7); ctx.fill();
    }
    // fine speckle
    for (let i = 0; i < 3200; i++) {
      const v = 40 + r() * 140;
      ctx.fillStyle = `rgba(${v},${v * 1.02 | 0},${v * 1.05 | 0},${0.15 + r() * 0.25})`;
      ctx.fillRect(r() * s, r() * s, 1 + r() * 4, 1 + r() * 4);
    }
    // wear / light streaks
    ctx.strokeStyle = 'rgba(230,235,240,0.08)'; ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) { ctx.beginPath(); ctx.moveTo(r() * s, r() * s); ctx.lineTo(r() * s, r() * s); ctx.stroke(); }
    // tile seams every 128px — strong, readable
    ctx.strokeStyle = 'rgba(12,14,18,0.7)'; ctx.lineWidth = 4;
    for (let i = 0; i <= s; i += 128) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(200,210,220,0.18)'; ctx.lineWidth = 1;
    for (let i = 0; i <= s; i += 128) { ctx.beginPath(); ctx.moveTo(i + 4, 0); ctx.lineTo(i + 4, s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i + 4); ctx.lineTo(s, i + 4); ctx.stroke(); }
  });

  // --- wall: vertical panel plates + vents hint ---
  texs.wall = makeTex(256, (ctx, s) => {
    const r = rng(22);
    ctx.fillStyle = '#636a74'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) {
      const x = r() * s, y = r() * s;
      const grad = ctx.createRadialGradient(x, y, 2, x, y, 20 + r() * 26);
      grad.addColorStop(0, `rgba(18,22,30,${0.22 + r() * 0.22})`);
      grad.addColorStop(1, 'rgba(18,22,30,0)');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, 20 + r() * 26, 0, 7); ctx.fill();
    }
    for (let i = 0; i < 2200; i++) {
      const v = 30 + r() * 120;
      ctx.fillStyle = `rgba(${v},${v},${v * 1.03 | 0},${0.12 + r() * 0.2})`;
      ctx.fillRect(r() * s, r() * s, 2 + r() * 5, 2 + r() * 5);
    }
    // vertical panel seams every 85px
    ctx.strokeStyle = 'rgba(12,14,20,0.6)'; ctx.lineWidth = 3;
    for (let i = 0; i <= s; i += 85) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke(); }
    // horizontal seam + scuff band near bottom
    ctx.strokeStyle = 'rgba(20,24,30,0.5)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, s - 42); ctx.lineTo(s, s - 42); ctx.stroke();
    // bolt dots
    ctx.fillStyle = 'rgba(30,34,42,0.7)';
    for (let i = 42; i <= s - 42; i += 85) ctx.fillRect(i - 4, 14, 8, 8);
  });

  // --- ceiling: panels ---
  texs.ceiling = makeTex(256, (ctx, s) => {
    const r = rng(33);
    ctx.fillStyle = '#7e848d'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    for (let i = 0; i < 600; i++) ctx.fillRect(r() * s, r() * s, 3, 3);
    ctx.strokeStyle = 'rgba(15,18,24,0.5)'; ctx.lineWidth = 2;
    for (let i = 0; i <= s; i += 128) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke(); }
  });

  // --- bump/roughness: scratches + pits ---
  texs.bump = makeTex(256, (ctx, s) => {
    const r = rng(44);
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      ctx.beginPath();
      const x = r() * s, y = r() * s;
      ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 40);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let i = 0; i < 300; i++) ctx.fillRect(r() * s, r() * s, 2, 2);
  });

  // --- roughness variation ---
  texs.rough = makeTex(256, (ctx, s) => {
    const r = rng(55);
    ctx.fillStyle = '#909090'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1500; i++) {
      const v = 120 + r() * 120;
      ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
      ctx.fillRect(r() * s, r() * s, 3 + r() * 8, 3 + r() * 8);
    }
  });

  // shared maps per material set
  for (const k of Object.keys(texs)) texs[k].needsUpdate = true;
  return texs;
}
