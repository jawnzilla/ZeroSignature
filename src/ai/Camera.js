// Security camera — sweeps a vision cone, builds detection on the player, and
// triggers a guard alert when it locks on. Destructible (one hit disables it).
import * as THREE from 'three';
import { losClear } from '../world/World.js';
import { playAlert } from '../systems/Audio.js';

export class SecurityCamera {
  constructor(scene, world, player, mats, x, z, facingYaw) {
    this.world = world;
    this.player = player;
    this.mats = mats;
    this.pos = new THREE.Vector3(x, 2.8, z);
    this.baseYaw = facingYaw;
    this.yaw = facingYaw;
    this.sweepHalf = Math.PI * 0.38;
    this.sweepPeriod = 6.5;
    this.sweepT = Math.random() * this.sweepPeriod;
    this.status = 'active';      // active | alert | disabled
    this.detection = 0;
    this.range = 24;
    this.coneAngle = Math.PI * 0.52;
    this.buildMesh(scene, mats);
  }

  buildMesh(scene, mats) {
    const g = new THREE.Group();
    // body + lens
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 0.32), mats.metal);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.06, 10), mats.gunAccent);
    lens.rotation.x = Math.PI / 2; lens.position.z = 0.17;
    // status LED
    this.ledMat = new THREE.MeshBasicMaterial({ color: 0x3ddc84 });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), this.ledMat);
    led.position.set(0, 0.1, 0);
    // mount arm + wall base
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), mats.metalDark);
    arm.position.y = -0.3;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.3), mats.metalDark);
    base.position.y = -0.52;
    g.add(body, lens, led, arm, base);
    g.position.copy(this.pos);
    g.userData._dyn = true;
    g.castShadow = true;
    scene.add(g);
    this.root = g;

    // sweep vision cone (child of root so it is cleaned up together)
    const geo = new THREE.ConeGeometry(1, 1, 20, 1, true);
    geo.translate(0, 0, -0.5);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x33ffd0, transparent: true, opacity: 0.05,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.cone = new THREE.Mesh(geo, mat);
    this.cone.rotation.x = Math.PI / 2;
    this.cone.position.set(0, 0.1, 0.4);
    g.add(this.cone);
  }

  update(dt, game) {
    if (this.status === 'disabled') return;
    // sweep
    this.sweepT += dt;
    this.yaw = this.baseYaw + Math.sin(this.sweepT / this.sweepPeriod * Math.PI * 2) * this.sweepHalf;
    this.root.rotation.y = this.yaw;

    if (this.status === 'alert') { this.blinkLED(dt, 0xff3b30, 0.18); return; }

    // vision
    const sees = this.seePlayer();
    if (sees) {
      this.detection = Math.min(100, this.detection + 55 * dt);
      this.player.detectionActive = true;
      if (this.detection >= 100) { this.status = 'alert'; playAlert(); game.onCameraAlert(this.pos); }
    } else {
      this.detection = Math.max(0, this.detection - 24 * dt);
    }
    this.ledMat.color.setHex(sees ? 0xffd60a : 0x3ddc84);
    this.cone.material.color.setHex(sees ? 0xffd60a : 0x33ffd0);
    this.cone.material.opacity = sees ? 0.12 : 0.05;
    // cone geometry scale by yaw-relative view: keep fixed length
    const r = this.range;
    this.cone.scale.set(Math.sin(this.coneAngle / 2) * r * 2, r, r);
  }

  seePlayer() {
    const p = this.player.pos;
    if (!this.player.alive) return false;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > this.range) return false;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const dot = (dx / dist) * fx + (dz / dist) * fz;
    if (dot < Math.cos(this.coneAngle / 2)) return false;
    if (!losClear(this.world.grid, this.pos.x, this.pos.z, p.x, p.z)) return false;
    return true;
  }

  blinkLED(dt, color, speed) {
    this.ledMat.color.setHex(color);
    this.ledMat.opacity = (Math.sin(performance.now() * 0.02 * (1 / speed)) > 0) ? 1 : 0.2;
    this.ledMat.transparent = true;
    this.cone.material.color.setHex(0xff5533);
    this.cone.material.opacity = 0.14;
  }

  damage() {
    if (this.status === 'disabled') return;
    this.status = 'disabled';
    this.detection = 0;
    this.ledMat.color.setHex(0x22242a);
    this.cone.visible = false;
    this.root.rotation.x = -0.4; // tilt down as if knocked out
  }
}

export class CameraManager {
  constructor(scene, world, player, mats) {
    this.scene = scene; this.world = world; this.player = player; this.mats = mats;
    this.cameras = [];
  }
  // place one camera per room on a random wall, facing into the room
  spawnForRooms(rooms) {
    const S = this.world.cell;
    const INSET = 1.3; // keep LOS origin inside the room, off the wall boundary
    rooms.forEach((r, i) => {
      const wall = i % 4; // rotate which wall per room for variety
      let x = 0, z = 0, yaw = 0;
      const cx = (r.x + r.w / 2) * S, cz = (r.z + r.h / 2) * S;
      if (wall === 0) { x = cx; z = r.z * S + INSET; yaw = Math.PI; }            // north wall, face south
      else if (wall === 1) { x = cx; z = (r.z + r.h) * S - INSET; yaw = 0; }     // south wall, face north
      else if (wall === 2) { x = r.x * S + INSET; z = cz; yaw = -Math.PI / 2; }  // west wall, face east
      else { x = (r.x + r.w) * S - INSET; z = cz; yaw = Math.PI / 2; }           // east wall, face west
      this.cameras.push(new SecurityCamera(this.scene, this.world, this.player, this.mats, x, z, yaw));
    });
  }
  update(dt, game) {
    for (const c of this.cameras) if (c.status !== 'disabled') c.update(dt, game);
  }
  countActive() { return this.cameras.filter(c => c.status !== 'disabled').length; }
  maxDetection() { let m = 0; for (const c of this.cameras) m = Math.max(m, c.detection); return m; }
}
