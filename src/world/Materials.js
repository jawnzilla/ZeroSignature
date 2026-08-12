// Shared PBR materials — one set reused across the whole level.
import * as THREE from 'three';
import { buildTextures } from './Textures.js';

function makeColor(hex, rough, metal, { emissive = null, emissiveIntensity = 1 } = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: hex, roughness: rough, metalness: metal,
  });
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = emissiveIntensity; }
  return m;
}

// Apply procedural surface detail to a structural material (kills the greybox look).
function surface(mat, texs, { map = 'floor', bump = true, rough = true } = {}) {
  if (map) mat.map = texs[map];
  if (bump) { mat.bumpMap = texs.bump; mat.bumpScale = 0.05; }
  if (rough) { mat.roughnessMap = texs.rough; mat.roughnessMap.matrixAutoUpdate = false; }
}

export function buildMaterials() {
  const texs = buildTextures();
  const floor = makeColor(0x3a4048, 0.92, 0.04);
  const wall = makeColor(0x454c57, 0.94, 0.03);
  const wallDark = makeColor(0x333943, 0.92, 0.06);
  const ceiling = makeColor(0x3a3f48, 0.95, 0.0);
  const concrete = makeColor(0x565d66, 0.9, 0.05);
  const metal = makeColor(0x545a66, 0.35, 0.85);
  const metalDark = makeColor(0x33363d, 0.5, 0.7);
  surface(floor, texs);
  surface(wall, texs, { map: 'wall', bump: true, rough: true });
  surface(wallDark, texs, { map: 'wall', bump: true, rough: true });
  surface(ceiling, texs, { map: 'ceiling', bump: false, rough: true });
  surface(concrete, texs);
  surface(metal, texs, { map: false, bump: true, rough: false });
  surface(metalDark, texs, { map: false, bump: true, rough: false });

  return {
    floor,
    floorTrim: makeColor(0x3a4150, 0.7, 0.1, { emissive: 0x1a3a55, emissiveIntensity: 0.35 }),
    wall, wallDark, ceiling, concrete, metal, metalDark,
    accent: makeColor(0x8a2026, 0.5, 0.4),
    hazard: makeColor(0x9c7a14, 0.6, 0.2, { emissive: 0x6b5200, emissiveIntensity: 0.45 }),
    lampGlow: makeColor(0xfff2cc, 0.4, 0.0, { emissive: 0xffe9a0, emissiveIntensity: 1.05 }),
    lampBody: makeColor(0x22252b, 0.4, 0.7),
    crateWood: makeColor(0x6b4a2a, 0.8, 0.05),
    crateBand: makeColor(0x3a3a3a, 0.5, 0.6),
    pipe: makeColor(0x2f3339, 0.5, 0.8),
    pipeValve: makeColor(0x9c2a2a, 0.4, 0.5),
    vent: makeColor(0x3c4149, 0.7, 0.3),
    console: makeColor(0x14161b, 0.5, 0.3),
    screenGlow: makeColor(0x0b0e14, 0.3, 0.3, { emissive: 0x2a8a55, emissiveIntensity: 1.6 }),
    player: makeColor(0x3f6ea8, 0.6, 0.4),
    playerVisor: makeColor(0x1a1c22, 0.3, 0.6, { emissive: 0x4fc3ff, emissiveIntensity: 1.8 }),
    enemy: makeColor(0x4a3540, 0.7, 0.3),
    enemyVisor: makeColor(0x1a1c22, 0.3, 0.5, { emissive: 0xff3b30, emissiveIntensity: 2.0 }),
    enemyAlertVisor: makeColor(0x1a1c22, 0.3, 0.5, { emissive: 0xffd43b, emissiveIntensity: 2.4 }),
    gun: makeColor(0x1d2025, 0.4, 0.9),
    gunAccent: makeColor(0x2a2d33, 0.5, 0.7),
    objective: makeColor(0x0f1115, 0.4, 0.8, { emissive: 0x3ddc84, emissiveIntensity: 2.0 }),
    intel: makeColor(0x0f1115, 0.3, 0.7, { emissive: 0x4fc3ff, emissiveIntensity: 2.2 }),
    decalImpact: makeColor(0x1a1c20, 0.6, 0.5),
  };
}
