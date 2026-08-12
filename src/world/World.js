// Procedural facility generator. Produces a seeded, replayable level:
//   grid: 0=void 1=floor(walkable) 2=obstacle(blocks move+los)
// Builds merged floor/ceiling/wall geometry + dressing, lights, spawn/objective.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, randInt, pick, randRange, MinHeap } from '../util/rng.js';
import { CONFIG } from '../config.js';
import { buildMaterials } from './Materials.js';

const W = CONFIG.world.gridW;
const H = CONFIG.world.gridH;
const S = CONFIG.world.cell;
const WH = CONFIG.world.wallH;

export function generateWorld(seed) {
  const rng = mulberry32(seed);
  const grid = Array.from({ length: H }, () => new Array(W).fill(0));

  // ---- carve rooms ----
  const rooms = [];
  const attempts = 200;
  const target = CONFIG.world.rooms;
  for (let a = 0; a < attempts && rooms.length < target; a++) {
    const rw = randInt(rng, 4, 7), rh = randInt(rng, 3, 6);
    const x = randInt(rng, 1, W - rw - 2), z = randInt(rng, 1, H - rh - 2);
    let ok = true;
    for (const r of rooms) {
      if (x < r.x + r.w + 1 && x + rw + 1 > r.x && z < r.z + r.h + 1 && z + rh + 1 > r.z) { ok = false; break; }
    }
    if (!ok) continue;
    rooms.push({ x, z, w: rw, h: rh });
    for (let cz = z; cz < z + rh; cz++)
      for (let cx = x; cx < x + rw; cx++) grid[cz][cx] = 1;
  }
  if (rooms.length < 2) throw new Error('level gen failed');

  // ---- connect rooms with corridors ----
  for (let i = 1; i < rooms.length; i++) {
    const A = rooms[i - 1], B = rooms[i];
    const ax = A.x + (A.w >> 1), az = A.z + (A.h >> 1);
    const bx = B.x + (B.w >> 1), bz = B.z + (B.h >> 1);
    if (rng() < 0.5) {
      carveLine(grid, ax, az, bx, az); carveLine(grid, bx, az, bx, bz);
    } else {
      carveLine(grid, ax, az, ax, bz); carveLine(grid, ax, bz, bx, bz);
    }
  }

  // ---- obstacles (cover) inside rooms ----
  const obstacleCells = [];
  for (const r of rooms) {
    const count = randInt(rng, 3, 6);
    for (let i = 0; i < count; i++) {
      const cx = randInt(rng, r.x + 1, r.x + r.w - 2);
      const cz = randInt(rng, r.z + 1, r.z + r.h - 2);
      if (grid[cz][cx] === 1) { grid[cz][cx] = 2; obstacleCells.push([cx, cz]); }
    }
  }

  // ---- nav cells (walkable) ----
  const navCells = [];
  for (let cz = 0; cz < H; cz++) for (let cx = 0; cx < W; cx++)
    if (grid[cz][cx] === 1) navCells.push([cx, cz]);

  // ---- spawn + objective ----
  // prefer a cell with walkable neighbours so you never spawn wedged against a wall
  const openCells = navCells.filter(([x, z]) => {
    let n = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx >= 0 && nz >= 0 && nx < W && nz < H && grid[nz][nx] === 1) n++;
    }
    return n >= 2;
  });
  const spawn = cellCenter(pick(rng, openCells.length ? openCells : navCells));
  const objCells = navCells.filter(([x, z]) => dist2(x, z, spawn[0], spawn[1]) > 14 * 14);
  const objectiveCell = pick(rng, objCells);
  const objective = cellCenter(objectiveCell);

  // ---- intel pickups ----
  const intelPoints = [];
  const taken = new Set([cellKey(objectiveCell)]);
  let guard = 0;
  while (intelPoints.length < 6 && guard++ < 200) {
    const c = pick(rng, navCells);
    const k = cellKey(c);
    if (taken.has(k) || dist2(c[0], c[1], spawn[0], spawn[1]) < 3 * 3) continue;
    taken.add(k); intelPoints.push(cellCenter(c));
  }

  // ---- patrol waypoints ----
  const waypoints = [];
  for (const r of rooms) {
    const rx = r.x + (r.w >> 1), rz = r.z + (r.h >> 1);
    waypoints.push(cellCenter([rx, rz]));
  }
  for (const c of navCells) {
    if (rng() < 0.05) waypoints.push(cellCenter(c));
  }

  return {
    seed, grid, rooms, spawn, objective, intelPoints, waypoints, obstacleCells,
    cell: S, gridW: W, gridH: H, wallH: WH,
    solidAt, buildMesh,
  };
}

function carveLine(grid, x0, z0, x1, z1) {
  let x = x0, z = z0;
  const dx = Math.sign(x1 - x0), dz = Math.sign(z1 - z0);
  const safe = (cx, cz) => cx >= 0 && cz >= 0 && cx < W && cz < H;
  let guard = 0;
  while ((x !== x1 || z !== z1) && guard++ < 400) {
    if (safe(x, z) && grid[z][x] === 0) grid[z][x] = 1;
    if (x !== x1) x += dx; else if (z !== z1) z += dz;
  }
  if (safe(x1, z1) && grid[z1][x1] === 0) grid[z1][x1] = 1;
}

function cellCenter([cx, cz]) {
  return [cx * S + S / 2, cz * S + S / 2];
}
function cellKey([cx, cz]) { return cz * W + cx; }
function dist2(x0, z0, x1, z1) { const dx = x0 - x1, dz = z0 - z1; return dx * dx + dz * dz; }

// world coords -> grid cell
function toCell(x, z) { return [Math.floor(x / S), Math.floor(z / S)]; }

// Is a world position walkable? circle radius r around (x,z)
export function solidAt(grid, x, z, r = 0.3) {
  const minX = Math.floor((x - r) / S), maxX = Math.floor((x + r) / S);
  const minZ = Math.floor((z - r) / S), maxZ = Math.floor((z + r) / S);
  for (let cz = minZ; cz <= maxZ; cz++)
    for (let cx = minX; cx <= maxX; cx++) {
      if (cx < 0 || cz < 0 || cx >= W || cz >= H) return true; // out of bounds = solid
      if (grid[cz][cx] === 0 || grid[cz][cx] === 2) return true;
    }
  return false;
}

// Bresenham LOS on grid — returns false if blocked by obstacle/void.
// Inputs are world metres; we convert to grid cells (S = cell size).
export function losClear(grid, x0, z0, x1, z1) {
  const sx = x0 / S, sz = z0 / S, ex = x1 / S, ez = z1 / S;
  const steps = Math.max(Math.abs(ex - sx), Math.abs(ez - sz));
  if (steps === 0) return true;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.round(sx + (ex - sx) * t);
    const cz = Math.round(sz + (ez - sz) * t);
    if (cx < 0 || cz < 0 || cx >= W || cz >= H) return false;
    const v = grid[cz][cx];
    if (v === 0 || v === 2) return false;
  }
  return true;
}

// A* pathfinding over walkable (value 1) cells. Returns list of [x,z] world coords.
export function findPath(grid, startX, startZ, goalX, goalZ) {
  const s = toCell(startX, startZ), g = toCell(goalX, goalZ);
  if (s[0] === g[0] && s[1] === g[1]) return [];
  const key = (x, z) => z * W + x;
  const open = new MinHeap();
  open.push(key(s[0], s[1]), 0);
  const came = new Map(); const gScore = new Map();
  gScore.set(key(s[0], s[1]), 0);
  const goalK = key(g[0], g[1]);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let found = null, guard = 0;
  while (open.size() > 0 && guard++ < 6000) {
    const cur = open.pop();
    if (cur === goalK) { found = cur; break; }
    const cx = cur % W, cz = Math.floor(cur / W);
    for (const [dx, dz] of dirs) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      if (grid[nz][nx] !== 1) continue;
      const nk = key(nx, nz);
      const tentative = gScore.get(cur) + 1;
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        came.set(nk, cur); gScore.set(nk, tentative);
        const f = tentative + Math.abs(nx - g[0]) + Math.abs(nz - g[1]);
        open.push(nk, f);
      }
    }
  }
  if (found == null) return [];
  // reconstruct
  const path = []; let c = found;
  while (c !== undefined) { path.push(c); c = came.get(c); }
  path.reverse();
  return path.map(k => { const cx = k % W, cz = Math.floor(k / W); return [cx * S + S / 2, cz * S + S / 2]; });
}

// --- geometry building ---
export function buildMesh(world) {
  const mats = buildMaterials();
  const { grid } = world;
  const group = new THREE.Group();

  const floorG = [], ceilG = [], wallG = [];
  const boxCache = {};
  const box = (w, h, d) => {
    const k = `${w}|${h}|${d}`;
    if (!boxCache[k]) boxCache[k] = new THREE.BoxGeometry(w, h, d);
    return boxCache[k].clone();
  };

  for (let cz = 0; cz < H; cz++) {
    for (let cx = 0; cx < W; cx++) {
      const v = grid[cz][cx];
      if (v === 0) continue;
      const x = cx * S, z = cz * S;
      const m = new THREE.Matrix4();
      // floor
      m.makeTranslation(x + S / 2, 0, z + S / 2);
      floorG.push(box(S, 0.25, S).applyMatrix4(m));
      // ceiling
      m.makeTranslation(x + S / 2, WH, z + S / 2);
      ceilG.push(box(S, 0.15, S).applyMatrix4(m));
      // walls along borders with void
      const borders = [
        [1, 0], [-1, 0], [0, 1], [0, -1],
      ];
      for (const [dx, dz] of borders) {
        const nx = cx + dx, nz = cz + dz;
        const out = nx < 0 || nz < 0 || nx >= W || nz >= H || grid[nz][nx] === 0;
        if (!out) continue;
        let wx, wz, ww, wd, ry = 0;
        if (dx === 1) { wx = x + S; wz = z + S / 2; ww = 0.4; wd = S; ry = 0; }
        else if (dx === -1) { wx = x; wz = z + S / 2; ww = 0.4; wd = S; ry = 0; }
        else if (dz === 1) { wx = x + S / 2; wz = z + S; ww = S; wd = 0.4; ry = Math.PI / 2; }
        else { wx = x + S / 2; wz = z; ww = S; wd = 0.4; ry = Math.PI / 2; }
        m.makeRotationY(ry).multiply(m.makeTranslation(wx, WH / 2, wz));
        wallG.push(box(ww, WH, wd).applyMatrix4(m));
      }
    }
  }

  const merge = (arr) => mergeGeometries(arr, false);
  const mk = (g, mat, shadow = true) => {
    if (!g) return null;
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    group.add(mesh); return mesh;
  };
  mk(merge(floorG), mats.floor);
  mk(merge(ceilG), mats.ceiling, false);
  mk(merge(wallG), mats.wall);

  // obstacle containers + dressing
  const dressGroup = buildDressing(world, mats, rngDress());
  group.add(dressGroup);
  return { group, mats, dressing: dressGroup };
}

function rngDress() { return mulberry32(99); }

function buildDressing(world, mats, rng) {
  const g = new THREE.Group();
  const { grid, obstacleCells, cell } = world;
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const put = (geo, mat, x, y, z, ry = 0, s = 1) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.y = ry; m.scale.setScalar(s);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m); return m;
  };

  // edge-lit baseboard trim along every wall base (breaks the flat wall/floor join)
  const trimBox = box(0.3, 0.28, cell);
  const trimBoxT = box(cell, 0.28, 0.3);
  for (let cz = 0; cz < H; cz++) {
    for (let cx = 0; cx < W; cx++) {
      if (grid[cz][cx] === 0) continue;
      const x = cx * cell, z = cz * cell;
      const out = (nx, nz) => nx < 0 || nz < 0 || nx >= W || nz >= H || grid[nz][nx] === 0;
      if (out(cx + 1, cz)) put(trimBox, mats.floorTrim, x + cell, 0.14, z + cell / 2, 0);
      if (out(cx - 1, cz)) put(trimBox, mats.floorTrim, x, 0.14, z + cell / 2, 0);
      if (out(cx, cz + 1)) put(trimBoxT, mats.floorTrim, x + cell / 2, 0.14, z + cell, 0);
      if (out(cx, cz - 1)) put(trimBoxT, mats.floorTrim, x + cell / 2, 0.14, z, 0);
    }
  }

  // big containers on obstacle cells (cover)
  for (const [cx, cz] of obstacleCells) {
    const x = cx * cell + cell / 2, z = cz * cell + cell / 2;
    const ry = rng() < 0.5 ? 0 : Math.PI / 2;
    const tall = rng() < 0.5;
    const w = tall ? 1.4 : 2.2, h = tall ? 3.4 : 1.6, d = tall ? 1.4 : 2.2;
    put(box(w, h, d), rng() < 0.5 ? mats.metal : mats.crateWood, x, h / 2, z, ry);
    // hazard stripe band on some
    if (rng() < 0.35) put(box(w + 0.05, 0.25, d + 0.05), mats.hazard, x, h * 0.45, z, ry);
    // top vent lines
    put(box(w * 0.6, 0.04, d * 0.6), mats.metalDark, x, h + 0.05, z, ry);
  }

  // scatter small crates/barrels/consoles in rooms
  for (const r of world.rooms) {
    const sx = r.x, sz = r.z;
    const n = 3;
    for (let i = 0; i < n; i++) {
      const cx = randInt(rng, sx, sx + r.w - 1), cz = randInt(rng, sz, sz + r.h - 1);
      if (grid[cz][cx] !== 1) continue;
      const x = cx * cell + cell / 2 + randRange(rng, -1, 1), z = cz * cell + cell / 2 + randRange(rng, -1, 1);
      const k = rng();
      if (k < 0.45) put(box(0.9, 0.9, 0.9), mats.crateWood, x, 0.45, z, rng() * Math.PI);
      else if (k < 0.7) put(box(0.7, 1.15, 0.7), mats.metalDark, x, 0.57, z);
      else if (k < 0.85) { // console w/ glowing screen
        put(box(1.4, 0.12, 0.7), mats.console, x, 0.06, z);
        put(box(1.1, 0.05, 0.5), mats.screenGlow, x, 0.15, z);
      } else { // barrel
        put(box(0.5, 1.0, 0.5), mats.accent, x, 0.5, z);
      }
    }
  }

  // ceiling hanging lamps in rooms (warm pools for bloom)
  for (const r of world.rooms) {
    const lx = (r.x + r.w / 2) * cell, lz = (r.z + r.h / 2) * cell;
    const lamp = put(box(0.9, 0.1, 0.9), mats.lampBody, lx, world.wallH - 0.3, lz);
    const glow = put(box(0.55, 0.06, 0.55), mats.lampGlow, lx, world.wallH - 0.42, lz);
    lamp.userData.isLamp = true; glow.userData.isLampGlow = true;
  }
  return g;
}
