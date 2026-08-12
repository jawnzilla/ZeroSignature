// Enemy agent — stealth AI: patrol, hearing, vision cone, grid LOS, 4 states, combat.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { solidAt, losClear, findPath } from '../world/World.js';
import { playAlert, playHit } from '../systems/Audio.js';

const AI = CONFIG.ai;

export class Enemy {
  constructor(scene, world, player, mats, x, z, waypoints) {
    this.world = world; this.player = player; this.scene = scene;
    this.mats = mats;
    this.pos = new THREE.Vector3(x, 0, z);
    this.health = AI.maxHealth * AI.alertHealthScale;
    this.alive = true;
    this.state = 'PATROL';       // PATROL | SUSPICIOUS | SEARCH | COMBAT
    this.detection = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.speed = AI.moveSpeed;
    this.waypoints = [...waypoints];
    this.wpIndex = 0;
    this.path = [];
    this.pathIndex = 0;
    this.targetPos = null;       // investigation / last known
    this.stateTime = 0;
    this.investigateT = 0;
    this.fireTimer = 0;
    this.losFlash = 0;
    this.down = false;          // non-lethal knocked out (stays out this run)

    this.buildMesh();
    this.scene.add(this.root);
  }

  buildMesh() {
    const root = new THREE.Group();
    const visorMat = this.mats.enemyVisor;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.15, 0.42), this.mats.enemy);
    body.position.y = 0.9; body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), this.mats.enemy);
    head.position.y = 1.62; head.castShadow = true;
    this.visor = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.18), visorMat);
    this.visor.position.set(0, 1.66, 0.22); this.visor.castShadow = true;
    // rifle
    const rifle = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.9), this.mats.gun);
    barrel.position.set(0, 0, 0.2);
    const body2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.5), this.mats.gun);
    body2.position.set(0, 0, -0.2);
    rifle.add(barrel, body2);
    rifle.position.set(0.3, 1.1, 0.25);
    this.rifle = rifle;
    root.add(body, head, this.visor, rifle);
    root.position.copy(this.pos);
    this.root = root;
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0.3, 1.25, 0.8);
    root.add(this.muzzle);
    this.alertPulse = 0;
  }

  // Called by manager each frame.
  update(dt, game) {
    if (!this.alive || this.down) return;
    this.stateTime += dt;
    this.losFlash = Math.max(0, this.losFlash - dt * 3);
    this.alertPulse = Math.max(0, this.alertPulse - dt);

    // --- perception: hearing ---
    this.perceiveNoise(game.lastNoise);

    // --- vision ---
    const sees = this.seePlayer();
    if (sees) {
      this.detection = Math.min(100, this.detection + this.detectionRate(dt));
      this.player.detectionActive = true;
      if (this.detection >= 100) this.enterCombat();
      this.targetPos = this.player.pos.clone();
      if (this.state !== 'COMBAT' && this.state !== 'PATROL') {
        // brief seen, not yet combat -> suspicious
        if (this.state === 'PATROL') this.enterSuspicious();
      }
    } else if (this.state !== 'COMBAT') {
      this.detection = Math.max(0, this.detection - AI.detection.lose * dt * this.player.sneakMult);
    }

    // --- state behaviour ---
    switch (this.state) {
      case 'PATROL': this.patrol(dt); break;
      case 'SUSPICIOUS': this.suspicious(dt, game); break;
      case 'SEARCH': this.search(dt); break;
      case 'COMBAT': this.combat(dt, game); break;
    }

    // move along current path/target
    this.followPath(dt);

    // visuals
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.root.scale.setScalar(this.alive ? 1 : 0.001);
    this.updateVisor();
    this.updateVisionCone(game);
  }

  detectionRate(dt) {
    const dist = this.pos.distanceTo(this.player.pos);
    const d = Math.max(3, dist);
    let rate = AI.detection.gainIdle * dt;
    rate *= Math.min(AI.detection.minDistFactor, (AI.viewRange * 0.6) / d);
    if (this.player.crouching) rate *= 0.45;
    if (this.player.sprinting) rate *= 1.5;
    if (this.player.noiseRadius > 8) rate *= 1.3;
    return rate;
  }

  perceiveNoise(lastNoise) {
    if (!lastNoise) return;
    const dx = this.pos.x - lastNoise.pos.x, dz = this.pos.z - lastNoise.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < lastNoise.radius && this.state !== 'COMBAT' && this.state !== 'SEARCH') {
      this.targetPos = lastNoise.pos.clone();
      this.enterSuspicious();
    }
  }

  seePlayer() {
    const p = this.player.pos;
    if (!this.player.alive) return false;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > AI.viewRange * (1 + this.player.upgrades.optics * 0.06)) return false;
    // angle
    const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw);
    const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ;
    const halfAngle = AI.viewAngle / 2 * (this.state === 'COMBAT' ? 1.5 : 1);
    if (dot < Math.cos(halfAngle)) return false;
    // LOS on grid
    if (!losClear(this.world.grid, this.pos.x, this.pos.z, p.x, p.z)) return false;
    this.losFlash = 1;
    return true;
  }

  enterSuspicious() {
    if (this.state === 'COMBAT') return;
    this.state = 'SUSPICIOUS';
    this.stateTime = 0;
    this.investigateT = 0;
    this.speed = AI.moveSpeed * 1.2;
  }
  enterCombat() {
    if (this.state === 'COMBAT') return;
    this.state = 'COMBAT';
    this.stateTime = 0;
    this.speed = AI.alertSpeed;
    this.detection = 100;
    this.alertPulse = 1;
    playAlert();
    // alert nearby allies
    this.alertNearby();
  }
  alertNearby() {
    // manager propagates; store pending
    this._propagate = true;
  }

  patrol(dt) {
    // pick next waypoint if idle
    if (this.path.length === 0) {
      const wp = this.waypoints[this.wpIndex % this.waypoints.length];
      this.wpIndex++;
      this.path = findPath(this.world.grid, this.pos.x, this.pos.z, wp[0], wp[1]);
      this.pathIndex = 0;
    }
    if (this.path.length === 0) {
      // slow idle scan
      this.yaw += Math.sin(this.stateTime * 0.6) * dt * 0.5;
    }
  }

  suspicious(dt) {
    if (this.targetPos) {
      if (this.path.length === 0) {
        this.path = findPath(this.world.grid, this.pos.x, this.pos.z, this.targetPos.x, this.targetPos.z);
        this.pathIndex = 0;
      }
      // look around at target when arrived
      if (this.path.length === 0 || this.pathIndex >= this.path.length) {
        this.investigateT += dt;
        this.yaw += dt * 1.2;
        if (this.investigateT > 2.2) {
          this.state = 'PATROL'; this.path = []; this.stateTime = 0;
        }
      }
    } else {
      this.state = 'PATROL';
    }
  }

  search(dt) {
    if (this.stateTime > AI.searchTime) { this.state = 'PATROL'; this.path = []; this.detection = 0; }
    if (this.targetPos && this.path.length === 0) {
      this.path = findPath(this.world.grid, this.pos.x, this.pos.z, this.targetPos.x, this.targetPos.z);
      this.pathIndex = 0;
    }
  }

  combat(dt, game) {
    this.detection = 100;
    const p = this.player;
    if (!p.alive) { this.state = 'SEARCH'; this.stateTime = 0; return; }
    const d = this.pos.distanceTo(p.pos);
    // face player
    const targetYaw = Math.atan2(-(p.pos.x - this.pos.x), -(p.pos.z - this.pos.z));
    this.yaw = lerpAngle(this.yaw, targetYaw, AI.turnSpeed * dt);
    // engage: move to within firing range, shoot
    if (d > 18) {
      if (this.path.length === 0) {
        this.path = findPath(this.world.grid, this.pos.x, this.pos.z, p.pos.x, p.pos.z);
        this.pathIndex = 0;
      }
    }
    if (this.seePlayer()) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = AI.fireInterval;
        game.spawnEnemyTracer(this.muzzle, p.pos);
        // hit chance
        const hitP = Math.max(0.08, 1 - d / AI.fireRange);
        if (Math.random() < hitP) {
          p.damage(AI.fireDamage);
          if (p.alive) game.onPlayerHit();
        }
      }
    } else {
      // lost sight in combat -> SEARCH last known
      this.state = 'SEARCH'; this.stateTime = 0; this.detection = 40;
    }
  }

  followPath(dt) {
    if (this.path.length === 0 || this.pathIndex >= this.path.length) {
      // arrive: stop
      this.velX = 0; this.velZ = 0;
      return;
    }
    const [tx, tz] = this.path[this.pathIndex];
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.25) { this.pathIndex++; return; }
    const mx = (dx / dist) * this.speed * dt;
    const mz = (dz / dist) * this.speed * dt;
    // collision-resolved move
    let nx = this.pos.x + mx;
    if (!solidAt(this.world.grid, nx, this.pos.z, 0.3)) this.pos.x = nx;
    nx = this.pos.x;
    let nz = this.pos.z + mz;
    if (!solidAt(this.world.grid, nx, nz, 0.3)) this.pos.z = nz;
    // face movement direction while patrolling
    if (this.state === 'PATROL' || this.state === 'SUSPICIOUS' || this.state === 'SEARCH') {
      const moveYaw = Math.atan2(-mx, -mz);
      this.yaw = lerpAngle(this.yaw, moveYaw, 6 * dt);
    }
  }

  updateVisor() {
    if (!this.alive) return;
    const stateColor = this.state === 'COMBAT' || this.detection > 40
      ? this.mats.enemyAlertVisor : this.mats.enemyVisor;
    this.visor.material = stateColor;
  }

  updateVisionCone(game) {
    if (!this.cone) {
      const geo = new THREE.ConeGeometry(1, 1, 24, 1, true);
      geo.translate(0, 0, -0.5);
      const mat = new THREE.MeshBasicMaterial({
        color: this.state === 'COMBAT' ? 0xff5533 : 0xffc53b,
        transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false,
      });
      this.cone = new THREE.Mesh(geo, mat);
      this.cone.rotation.x = Math.PI / 2;
      this.scene.add(this.cone);
      this.coneMesh = { geo, mat };
    }
    const r = AI.viewRange;
    this.cone.scale.set(Math.sin(AI.viewAngle / 2) * r * 2, r, r);
    this.cone.position.set(this.pos.x, 0.35, this.pos.z);
    this.cone.rotation.z = -this.yaw + Math.PI / 2;
    const targetOpacity = this.state === 'COMBAT' ? 0.12 : this.detection > 40 ? 0.1 : 0.055;
    this.cone.material.opacity = targetOpacity;
    this.cone.material.color.set(this.state === 'COMBAT' ? 0xff5533 : 0xffc53b);
  }

  damage(n) {
    if (!this.alive) return;
    this.health -= n;
    playHit();
    this.detection = Math.min(100, this.detection + 45);
    if (this.detection >= 100) this.enterCombat();
    if (this.health <= 0) { this.alive = false; this.root.rotation.x = Math.PI / 2; }
  }

  // non-lethal takedown — guard is knocked out and stays down this run
  knockout() {
    if (this.down || !this.alive) return;
    this.down = true;
    this.state = 'DOWN';
    this.detection = 0;
    this.speed = 0;
    this.path = [];
    this.pathIndex = 0;
    this.root.rotation.x = -Math.PI / 2;   // fall back
    this.root.position.y = 0.04;
    if (this.visor) this.visor.material = this.mats.enemyVisor;
    if (this.cone) this.cone.visible = false;
  }

  // can the player sneak up and knock this one out?
  isUnaware() {
    return this.alive && !this.down && (this.state === 'PATROL' || this.state === 'SUSPICIOUS');
  }

  dispose() { if (this.root) this.scene.remove(this.root); }
}

export class EnemyManager {
  constructor(scene, world, player) {
    this.scene = scene; this.world = world; this.player = player;
    this.enemies = [];
  }
  spawn(count, waypoints) {
    // distribute across rooms
    const wp = [...waypoints];
    for (let i = 0; i < count; i++) {
      const base = wp[i % wp.length];
      const x = base[0] + (Math.random() - 0.5) * 4;
      const z = base[1] + (Math.random() - 0.5) * 4;
      const e = new Enemy(this.scene, this.world, this.player, this.scene.userData.mats, x, z, [wp[i % wp.length], wp[(i + 2) % wp.length]]);
      this.enemies.push(e);
    }
  }
  update(dt, game) {
    // propagate alerts (down guards don't wake)
    const alerted = this.enemies.filter(e => e.alive && !e.down && e.state === 'COMBAT');
    for (const a of alerted) {
      for (const e of this.enemies) {
        if (e === a || !e.alive || e.down || e.state === 'COMBAT') continue;
        if (e.pos.distanceTo(a.pos) < 26) e.enterCombat();
      }
    }
    for (const e of this.enemies) if (e.alive) e.update(dt, game);
  }
  countAlive() { return this.enemies.filter(e => e.alive && !e.down).length; }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}
