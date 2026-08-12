// Third-person player controller: WASD move, Shift sprint, Ctrl crouch, mouse aim.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { solidAt } from '../world/World.js';
import { playFootstep, playStep } from '../systems/Audio.js';

const P = CONFIG.player;

export class PlayerController {
  constructor(scene, world, camera) {
    this.world = world;
    this.camera = camera;
    this.scene = scene;

    this.pos = new THREE.Vector3(world.spawn[0], 0, world.spawn[1]);
    this.vel = new THREE.Vector3();
    this.yaw = 0;              // horizontal facing
    this.pitch = 0;
    this.crouching = false;
    this.sprinting = false;
    this.grounded = true;
    this.footstepT = 0;
    this.eyeBase = P.eyeHeight;

    // build player mesh
    this.root = new THREE.Group();
    this.root.position.copy(this.pos);
    // body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.4), scene.userData.mats.player);
    body.position.y = 0.85; body.castShadow = true;
    // head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), scene.userData.mats.player);
    head.position.y = 1.55; head.castShadow = true;
    // visor
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.16), scene.userData.mats.playerVisor);
    visor.position.set(0, 1.58, 0.2); visor.castShadow = true;
    // gun (held, animated in weapon module)
    this.gunMount = new THREE.Group();
    this.gunMount.position.set(0.28, 1.05, 0.15);
    this.root.add(body, head, visor, this.gunMount);
    this.root.position.y = 0;
    scene.add(this.root);

    // stats
    this.health = P.maxHealth;
    this.stamina = P.maxStamina;
    this.maxHealth = P.maxHealth;
    this.maxStamina = P.maxStamina;
    this.upgrades = { vitality: 0, condition: 0, shadow: 0, silencer: 0, optics: 0 };
    this.intel = 0;
    this.alive = true;
    this.detection = 0;        // 0..100 currently seen
    this.detectionActive = false;
  }

  get moveSpeed() {
    if (!this.grounded) return 1;
    if (this.crouching) return P.crouchSpeed * this.speedMult();
    if (this.sprinting && this.stamina > P.staminaSprintCostThreshold) return P.sprintSpeed * this.speedMult();
    return P.walkSpeed * this.speedMult();
  }
  speedMult() { return 1 + this.upgrades.condition * 0.14; }
  get noiseRadius() {
    const shadow = this.upgrades.shadow;
    if (this.crouching) return P.noise.crouch * (1 - shadow * 0.12);
    if (this.sprinting) return P.noise.sprint * (1 - shadow * 0.1);
    if (this.vel.lengthSq() > 0.01) return P.noise.walk * (1 - shadow * 0.1);
    return 0;
  }
  get sneakMult() { return Math.max(0.4, 1 - this.upgrades.shadow * 0.18); }
  get eyeHeight() { return this.crouching ? P.crouchEye : P.eyeHeight; }

  damage(n) {
    if (!this.alive) return;
    this.health -= n;
    if (this.health <= 0) { this.health = 0; this.alive = false; }
  }

  update(dt, input) {
    // facing from mouse
    this.yaw += -input.mouseDX * input.sens * 0.0016;
    this.pitch += -input.mouseDY * input.sens * 0.0016;
    const pitchClamp = 1.2;
    this.pitch = Math.max(-pitchClamp, Math.min(pitchClamp, this.pitch));

    // desired direction
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    wish.addScaledVector(forward, (input.keys['KeyW'] ? 1 : 0) - (input.keys['KeyS'] ? 1 : 0));
    wish.addScaledVector(right, (input.keys['KeyD'] ? 1 : 0) - (input.keys['KeyA'] ? 1 : 0));
    if (wish.lengthSq() > 0) wish.normalize();

    this.crouching = input.keys['ControlLeft'] || input.keys['ControlRight'];
    this.sprinting = (input.keys['ShiftLeft'] || input.keys['ShiftRight']) && !this.crouching
      && wish.lengthSq() > 0 && this.stamina > 0;

    // stamina
    if (this.sprinting) this.stamina = Math.max(0, this.stamina - P.staminaDrain * dt);
    else this.stamina = Math.min(this.maxStamina, this.stamina + P.staminaRegen * dt);

    // target velocity
    const spd = this.moveSpeed;
    const targetVX = wish.x * spd;
    const targetVZ = wish.z * spd;

    // X move with collision
    this.vel.x = approach(this.vel.x, targetVX, P.accel * dt);
    const nx = this.pos.x + this.vel.x * dt;
    if (!solidAt(this.world.grid, nx, this.pos.z, P.radius)) this.pos.x = nx;
    else this.vel.x = 0;

    // Z move
    this.vel.z = approach(this.vel.z, targetVZ, P.accel * dt);
    const nz = this.pos.z + this.vel.z * dt;
    if (!solidAt(this.world.grid, this.pos.x, nz, P.radius)) this.pos.z = nz;
    else this.vel.z = 0;

    // footsteps
    if (wish.lengthSq() > 0 && this.grounded) {
      this.footstepT += dt * (this.sprinting ? 2.1 : this.crouching ? 1.0 : 1.6);
      if (this.footstepT >= 1) {
        this.footstepT = 0;
        playStep();
        this.emitNoise('step');
      }
    }

    // update root + gun anim
    this.root.position.set(this.pos.x, 0, this.pos.z);
    this.root.rotation.y = this.yaw;
    const bob = wish.lengthSq() > 0 && this.grounded
      ? Math.sin(this.footstepT * Math.PI) * (this.sprinting ? 0.14 : 0.06) : 0;
    const targetEyeY = this.eyeHeight;
    // lerp gun to aim pose
    this.gunMount.rotation.x = -this.pitch * 0.6;

    // camera: over-shoulder follow
    const shoulder = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); // right
    const back = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));     // behind
    const camTarget = this.pos.clone();
    camTarget.y = targetEyeY + bob * 0.5;
    const dist = 3.2;
    const height = 1.0;
    let desired = camTarget.clone()
      .addScaledVector(back, dist)
      .addScaledVector(shoulder, 0.62)
      .add(new THREE.Vector3(0, height, 0));
    desired = this.clampCam(desired, camTarget);
    const k = 1 - Math.exp(-8 * dt);
    this.camera.position.lerp(desired, k);

    // aim look-at point ahead of player
    const lookAt = camTarget.clone().add(new THREE.Vector3(-Math.sin(this.yaw), Math.sin(this.pitch), -Math.cos(this.yaw)).multiplyScalar(6));
    const smooth = 1 - Math.exp(-14 * dt);
    if (this._look) this._look.lerp(lookAt, smooth); else this._look = lookAt.clone();
    this.camera.lookAt(this._look);

    // detection meter decay when unseen (handled by enemies)
  }

  emitNoise(type) { this.lastNoise = { type, radius: this.noiseRadius, pos: this.pos.clone(), t: performance.now() }; }

  clampCam(desired, target) {
    // keep camera out of geometry: if inside solid, pull forward
    let gx = Math.floor(desired.x / this.world.cell), gz = Math.floor(desired.z / this.world.cell);
    const inGrid = gx >= 0 && gz >= 0 && gx < this.world.gridW && gz < this.world.gridH;
    if (inGrid) {
      const v = this.world.grid[gz][gx];
      if (v === 0 || v === 2) {
        // pull camera back toward player until not inside
        const dir = target.clone().sub(desired).normalize();
        for (let t = 0; t <= 1; t += 0.08) {
          const p = desired.clone().add(dir.clone().multiplyScalar(t * 2));
          const cx = Math.floor(p.x / this.world.cell), cz = Math.floor(p.z / this.world.cell);
          const ok = cx >= 0 && cz >= 0 && cx < this.world.gridW && cz < this.world.gridH
            && this.world.grid[cz][cx] !== 0 && this.world.grid[cz][cx] !== 2;
          if (ok) { desired = p; break; }
        }
      }
    }
    return desired;
  }
}

function approach(cur, target, maxDelta) {
  if (cur < target) return Math.min(cur + maxDelta, target);
  return Math.max(cur - maxDelta, target);
}
