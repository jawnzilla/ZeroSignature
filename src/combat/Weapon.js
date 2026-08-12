// Player weapon: hitscan rifle, recoil, muzzle flash, tracer, impact sparks,
// suppressor variant (quieter + lower damage slightly). Attaches to player.gunMount.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { playGunshot, playReload } from '../systems/Audio.js';

const W = CONFIG.weapon;

export class Weapon {
  constructor(scene, player, mats, onShot) {
    this.scene = scene; this.player = player; this.mats = mats;
    this.onShot = onShot;
    this.ammo = W.ammo;
    this.mag = W.magSize;
    this.fireTimer = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.suppressed = false;
    this.muzzleFlashT = 0;
    this.tracers = [];

    // visual gun model
    this.gun = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.55), mats.gun);
    body.position.set(0, 0, 0.05);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 10), mats.gunAccent);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, 0.35);
    this.suppressorMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 10), mats.metalDark);
    this.suppressorMesh.rotation.x = Math.PI / 2; this.suppressorMesh.position.set(0, 0.02, 0.55);
    this.suppressorMesh.visible = false;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.02), mats.gunAccent);
    sight.position.set(0, 0.09, 0.18);
    const mag2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.09), mats.gun);
    mag2.position.set(0, -0.16, 0.05);
    this.gun.add(body, barrel, this.suppressorMesh, sight, mag2);
    this.player.gunMount.add(this.gun);

    // muzzle flash light
    this.flashLight = new THREE.PointLight(0xffd27a, 0, 12, 2);
    this.flashLight.position.set(0.3, 1.15, 0.9);
    this.player.root.add(this.flashLight);

    this.recoil = 0;
    this.player._look = null;
  }

  setSuppressed(v) {
    this.suppressed = v;
    this.suppressorMesh.visible = v;
  }

  update(dt) {
    this.fireTimer -= dt;
    this.muzzleFlashT -= dt;
    this.recoil *= Math.exp(-10 * dt);
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const need = W.magSize - this.mag;
        const take = Math.min(need, this.ammo);
        this.mag += take; this.ammo -= take;
        this.reloading = false;
      }
    }
    // recoil applies to player pitch
    if (this.recoil > 0.0001) {
      this.player.pitch += this.recoil;
    }
    // muzzle flash visible
    this.gun.traverse(o => { if (o.isMesh && o.material === this.mats.lampGlow) o.visible = this.muzzleFlashT > 0; });
    // tracers
    this.tracers = this.tracers.filter(t => t.life > 0);
    for (const t of this.tracers) {
      t.life -= dt * 6;
      t.mesh.material.opacity = Math.max(0, Math.min(1, t.life)) * 0.8;
      t.mesh.position.copy(t.end.clone().lerp(t.start, 1 - Math.max(0, t.life)));
    }
  }

  tryFire(input) {
    if (this.reloading || this.fireTimer > 0) return;
    if (this.mag <= 0) { this.reload(); return; }
    this.fireTimer = W.fireInterval;
    this.mag--;
    this.fire();

    // suppress upgrade auto-applies
    const silenced = this.suppressed || this.player.upgrades.silencer > 0;
    const noiseRadius = silenced ? W.suppressedShotNoise : W.shotNoise;
    this.onShot({ type: 'shot', radius: noiseRadius, suppressed: silenced });
  }

  fire() {
    this.muzzleFlashT = W.muzzleFlashTime;
    this.recoil += W.recoilKick;
    this.flashLight.intensity = 30;
    setTimeout(() => { this.flashLight.intensity = 0; }, 40);
    playGunshot({ suppressed: this.suppressed || this.player.upgrades.silencer > 0 });

    // hitscan from camera
    const cam = this.player.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const spread = W.spread + this.player.sprinting ? W.spread * 2 : 0;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    const origin = cam.position.clone();
    const end = origin.clone().add(dir.multiplyScalar(120));
    const impact = this.raycast(origin, end);
    this.spawnTracer(origin, impact.point);

    if (impact.enemy) {
      impact.enemy.damage(W.damage);
    }
    this.spawnImpact(impact);
  }

  raycast(origin, end) {
    const dir = end.clone().sub(origin).normalize();
    const dist = origin.distanceTo(end);
    let best = null, bestDist = dist;
    // enemies
    for (const e of this.scene.userData.enemies) {
      if (!e.alive) continue;
      const d = origin.distanceTo(e.pos);
      if (d > bestDist) continue;
      // approximate hit via sphere of enemy
      const toE = e.pos.clone().add(new THREE.Vector3(0, 1, 0)).sub(origin);
      const proj = toE.dot(dir);
      if (proj < 0 || proj > bestDist) continue;
      const perp = toE.lengthSq() - proj * proj;
      if (perp < 1.0) { best = e; bestDist = proj; }
    }
    // walls: sample grid along ray until solid
    let wallHit = false;
    const steps = Math.floor(bestDist / 0.6);
    for (let i = 1; i <= steps; i++) {
      const p = origin.clone().add(dir.clone().multiplyScalar(i * 0.6));
      const cx = Math.floor(p.x / this.player.world.cell), cz = Math.floor(p.z / this.player.world.cell);
      const g = this.player.world.grid;
      if (cx < 0 || cz < 0 || cx >= g[0].length || cz >= g.length || g[cz][cx] === 0) {
        wallHit = true;
        return { point: p, enemy: null, wall: true };
      }
    }
    return { point: origin.clone().add(dir.multiplyScalar(bestDist)), enemy: best, wall: wallHit };
  }

  spawnTracer(start, end) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.8 });
    const len = start.distanceTo(end);
    const geo = new THREE.CylinderGeometry(0.015, 0.015, len, 6, 1, true);
    geo.translate(0, len / 2, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(start);
    mesh.lookAt(end);
    mesh.rotateX(Math.PI / 2);
    this.scene.add(mesh);
    this.tracers.push({ mesh, start: start.clone(), end: end.clone(), life: 1 });
  }

  spawnImpact(impact) {
    if (!impact.wall) return;
    // spark particles
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc53b, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), mat);
      s.position.copy(impact.point);
      const d = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).normalize().multiplyScalar(1.2);
      s.userData.vel = d;
      this.scene.add(s);
      this.tracers.push({ mesh: s, start: impact.point.clone(), end: impact.point.clone().add(d), life: 1 });
    }
  }

  reload() {
    if (this.reloading || this.mag >= W.magSize || this.ammo <= 0) return;
    this.reloading = true;
    this.reloadT = W.reloadTime;
    playReload();
  }
}
