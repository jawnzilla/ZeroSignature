// Main game orchestrator: scene, renderer, lighting, loop, input, missions.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { generateWorld, buildMesh } from './world/World.js';
import { setupPostFX } from './systems/PostFX.js';
import { PlayerController } from './player/PlayerController.js';
import { Enemy, EnemyManager } from './ai/Enemy.js';
import { SecurityCamera, CameraManager } from './ai/Camera.js';
import { Weapon } from './combat/Weapon.js';
import { HUD } from './ui/HUD.js';
import { initAudio, resumeAudio, playPickup, playAlert, toggleMute, playKnock } from './systems/Audio.js';

export class Game {
  constructor(container) {
    this.container = container;
    this.difficulty = 1;
    this.missionComplete = false;
    this.lastNoise = null;
    this.anyCombat = false;

    // renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Filmic tone mapping lifts crushed shadows and gives a film-like rolloff.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(CONFIG.fx.fogColor, 18, 80);
    this.scene.background = new THREE.Color(CONFIG.fx.skyColor);
    this.scene.userData = {};

    this.camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 200);
    this.scene.userData.camera = this.camera;

    this.hud = new HUD(container);

    this.setupLights();
    this.fx = setupPostFX(this.renderer, this.scene, this.camera);

    this.initInput();
    this.buildMission(CONFIG.seed);
    this.hud.message('MISSION 01 — Recover the Zero Signature. Stay undetected — security cameras and guards patrol every room.', 4.5);

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.tick());
    window.addEventListener('resize', () => this.onResize());
  }

  setupLights() {
    const hemi = new THREE.HemisphereLight(0x4d5fd0, 0x0c0c12, 1.2);
    this.scene.add(hemi);
    const ambient = new THREE.AmbientLight(0x1a2030, 1.15);
    this.scene.add(ambient);
    const moon = new THREE.DirectionalLight(0x93a4ff, 1.35);
    moon.position.set(-30, 60, -20);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -40; moon.shadow.camera.right = 40;
    moon.shadow.camera.top = 40; moon.shadow.camera.bottom = -40;
    moon.shadow.camera.far = 140;
    this.scene.add(moon);
    this.moon = moon;
  }

  addRoomLights(world) {
    const hues = [0xffb86b, 0xff9f4a, 0xffcf7a, 0xe8b25a, 0xffa35c, 0xffc07a, 0xffb060];
    world.rooms.forEach((r, i) => {
      const x = (r.x + r.w / 2) * world.cell;
      const z = (r.z + r.h / 2) * world.cell;
      const pl = new THREE.PointLight(hues[i % hues.length], 6, 24, 1.6);
      pl.position.set(x, world.wallH - 0.6, z);
      this.scene.add(pl);
    });
  }

  buildMission(seed, missionNo) {
    // clear previous dynamic objects
    if (this.worldGroup) this.scene.remove(this.worldGroup);
    this.scene.traverse(o => { if (o.userData._dyn) this.scene.remove(o); });

    const world = generateWorld(seed);
    this.world = world;
    this.scene.userData.world = world;
    this.scene.userData.grid = world.grid;

    const built = buildMesh(world);
    this.worldGroup = built.group;
    this.worldGroup.userData._dyn = true;
    this.scene.add(this.worldGroup);
    this.scene.userData.mats = built.mats;
    this.addRoomLights(world);

    // player
    this.player = new PlayerController(this.scene, world, this.camera);
    this.player.intel = this.missionComplete ? this.player.intel : this.player.intel;
    // weapon
    this.weapon = new Weapon(this.scene, this.player, built.mats, (n) => { this.lastNoise = { ...n, pos: this.player.pos.clone(), t: performance.now() }; });
    this.player.weapon = this.weapon;
    if (this.player.upgrades.silencer > 0) this.weapon.setSuppressed(true);

    // enemies
    this.enemyManager = new EnemyManager(this.scene, world, this.player);
    const count = Math.min(4 + this.difficulty, 12);
    this.enemyManager.spawn(count, world.waypoints);
    this.scene.userData.enemies = this.enemyManager.enemies;
    this.scene.userData.game = this;

    // security cameras
    this.cameraManager = new CameraManager(this.scene, world, this.player, built.mats);
    this.cameraManager.spawnForRooms(world.rooms);
    this.scene.userData.cameras = this.cameraManager.cameras;

    this.spawnIntel(world);
    this.spawnObjective(world);

    this.missionComplete = false;
    this.anyCombat = false;
    this.objText = `MISSION ${String(missionNo || this.difficulty).padStart(2, '0')} — RECOVER THE ZERO SIGNATURE`;
    this.hud.objectiveText = this.objText;
  }

  spawnIntel(world) {
    this.intelPickups = [];
    for (const [x, z] of world.intelPoints) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), this.scene.userData.mats.intel);
      box.position.y = 0.8;
      g.add(box);
      const glow = new THREE.PointLight(0x4fc3ff, 2.2, 7, 2);
      glow.position.y = 0.8;
      g.add(glow);
      g.position.set(x, 0, z);
      g.userData._dyn = true;
      this.scene.add(g);
      this.intelPickups.push(g);
    }
  }
  spawnObjective(world) {
    const [x, z] = world.objective;
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.9), this.scene.userData.mats.console);
    base.position.y = 0.15;
    const caseM = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.6), this.scene.userData.mats.objective);
    caseM.position.y = 0.45;
    g.add(base, caseM);
    const glow = new THREE.PointLight(0x3ddc84, 3, 10, 2);
    glow.position.y = 1.0;
    g.add(glow);
    g.position.set(x, 0, z);
    g.userData._dyn = true;
    this.scene.add(g);
    this.objective = g;
  }

  initInput() {
    this.input = {
      keys: {}, mouseDX: 0, mouseDY: 0, sens: 1.0, mouseDown: false, locked: false,
    };
    window.addEventListener('keydown', e => {
      this.input.keys[e.code] = true;
      if (e.code === 'Tab') { e.preventDefault(); this.toggleUpgrades(); }
      if (e.code === 'KeyR') this.weapon.reload();
      if (e.code === 'KeyE') this.attemptTakedown();
      if (e.code === 'KeyT') this.toggleSuppressor();
      if (e.code === 'KeyG' && this.missionComplete) this.newMission();
      if (e.code === 'KeyM') this.toggleMute();
    });
    window.addEventListener('keyup', e => { this.input.keys[e.code] = false; });
    this.renderer.domElement.addEventListener('click', () => {
      resumeAudio();
      if (!this.input.locked) { this.renderer.domElement.requestPointerLock(); }
    });
    document.addEventListener('pointerlockchange', () => {
      this.input.locked = document.pointerLockElement === this.renderer.domElement;
      this.hud.els ? this.hud.toggleUpgradePanel(this.hud.isUpgradeOpen() && this.input.locked, this.player, () => {}) : null;
    });
    document.addEventListener('mousemove', e => {
      if (!this.input.locked) return;
      this.input.mouseDX = e.movementX; this.input.mouseDY = e.movementY;
    });
    this.renderer.domElement.addEventListener('mousedown', e => { if (e.button === 0) this.input.mouseDown = true; });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.input.mouseDown = false; });
  }

  toggleUpgrades() {
    const open = !this.hud.isUpgradeOpen();
    this.hud.toggleUpgradePanel(open, this.player, (id) => this.buyUpgrade(id));
    if (open) { this.renderer.domElement.requestPointerLock(); }
    else { document.exitPointerLock(); }
  }
  toggleSuppressor() {
    this.weapon.setSuppressed(!this.weapon.suppressed);
    this.hud.message(this.weapon.suppressed ? 'Suppressor engaged.' : 'Suppressor removed.', 1.2);
  }
  toggleMute() {
    this._muted = !this._muted;
    this.hud.message(toggleMute() ? 'Audio muted.' : 'Audio on.', 1.2);
  }
  buyUpgrade(id) {
    const defs = CONFIG.upgrade.cost;
    const lvl = this.player.upgrades[id];
    const cost = defs[lvl];
    if (lvl >= 3 || this.player.intel < cost) return;
    this.player.intel -= cost;
    this.player.upgrades[id] = lvl + 1;
    this.applyUpgrade(id);
    playPickup();
  }
  applyUpgrade(id) {
    const p = this.player;
    if (id === 'vitality') { p.maxHealth += 30; p.health = p.maxHealth; }
    if (id === 'silencer') this.weapon.setSuppressed(true);
    if (id === 'condition') { p.maxStamina += 20; }
    this.hud.message(`Upgrade acquired: ${id}`, 1.5);
  }

  spawnEnemyTracer(muzzle, targetPos) {
    const start = new THREE.Vector3();
    muzzle.getWorldPosition(start);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff5533, transparent: true, opacity: 0.6 });
    const len = start.distanceTo(targetPos);
    const geo = new THREE.CylinderGeometry(0.02, 0.02, len, 6, 1, true);
    geo.translate(0, len / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(start); m.lookAt(targetPos); m.rotateX(Math.PI / 2);
    this.scene.add(m);
    this.weapon.tracers.push({ mesh: m, start: start.clone(), end: targetPos.clone(), life: 1 });
    playAlert();
  }

  onPlayerHit() { this.hud.flashDamage(); }

  onCameraAlert(pos) {
    // a camera locked on: the whole facility knows (classic MGS behaviour) —
    // every live guard enters combat and converges on the camera area
    for (const e of this.enemyManager.enemies) {
      if (!e.alive || e.state === 'COMBAT') continue;
      e.enterCombat();
      e.targetPos = pos.clone();
    }
    this.hud.message('CAMERA ALERT', 1.8);
  }

  nearestUnawareEnemy(range) {
    let best = null, bestD = range;
    for (const e of this.enemyManager.enemies) {
      if (!e.isUnaware()) continue;
      const d = this.player.pos.distanceTo(e.pos);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  attemptTakedown() {
    const e = this.nearestUnawareEnemy(2.2);
    if (!e) return;
    e.knockout();
    playKnock();
    this.hud.message('GUARD KNOCKED OUT', 1.4);
  }

  tick() {
    try {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.player) return;

    // shooting
    if (this.input.mouseDown && this.input.locked && !this.hud.isUpgradeOpen() && this.player.alive) {
      this.weapon.tryFire(this.input);
    }
    // release look reset
    this.player.update(dt, this.input);
    this.input.mouseDX = 0; this.input.mouseDY = 0;
    this.weapon.update(dt);

    // enemy AI + security cameras
    this.anyCombat = false;
    this.enemyManager.update(dt, this);
    if (this.cameraManager) this.cameraManager.update(dt, this);

    // intel pickups
    for (const g of [...this.intelPickups]) {
      const d = g.position.distanceTo(this.player.pos);
      if (d < 2) { this.scene.remove(g); this.intelPickups.splice(this.intelPickups.indexOf(g), 1); this.player.intel++; playPickup(); this.hud.message(`INTEL ACQUIRED (+1)`, 1.5); }
      else g.rotation.y += dt * 2;
    }
    // objective
    if (this.objective && this.player.pos.distanceTo(this.objective.position) < 2.2 && !this.missionComplete) {
      this.missionComplete = true;
      this.hud.message('ZERO SIGNATURE SECURED.', 3);
      playPickup(); playAlert();
    }

    // detection aggregation for HUD
    let maxDet = 0;
    for (const e of this.enemyManager.enemies) { if (e.alive) maxDet = Math.max(maxDet, e.detection); if (e.state === 'COMBAT') this.anyCombat = true; }
    if (this.cameraManager) maxDet = Math.max(maxDet, this.cameraManager.maxDetection());
    if (!this.player.alive) {
      maxDet = 100; this.anyCombat = true; this.hud.showGameOver();
      // release pointer lock so the player can move the cursor to the NEW MISSION button
      if (document.pointerLockElement) document.exitPointerLock();
      this.input.locked = false;
      this.renderer.setAnimationLoop(null);
    }

    this.interactTarget = this.nearestUnawareEnemy(2.2);
    this.hud.update({ player: this.player, maxDet, anyCombat: this.anyCombat, missionComplete: this.missionComplete, objectiveText: this.hud.objectiveText, interactText: this.interactTarget ? 'E — KNOCK OUT' : '' });

    // track player noise
    if (this.player.lastNoise && performance.now() - this.player.lastNoise.t < 120) {
      this.lastNoise = { ...this.player.lastNoise, pos: this.player.lastNoise.pos };
    }

    this.moon.position.set(this.camera.position.x - 30, 60, this.camera.position.z - 20);
    this.moon.target.position.copy(this.camera.position);
    this.moon.target.updateMatrixWorld();
    this.fx.composer.render();
    } catch (err) {
      console.error('[tick error]', err);
      window.__err = window.__err || (err && (err.stack || err.message));
    }
  }

  newMission() {
    this.difficulty++;
    this.player.alive = true;
    this.player.health = this.player.maxHealth;
    const seed = (CONFIG.seed + this.difficulty * 977) >>> 0;
    this.buildMission(seed, this.difficulty);
    this.hud.message(`MISSION ${String(this.difficulty).padStart(2, '0')} — SEED ${seed}`, 3);
    this.hud.objectiveText = `MISSION ${String(this.difficulty).padStart(2, '0')} — RECOVER THE ZERO SIGNATURE`;
  }

  onResize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.fx.composer.setSize(w, h);
  }
}
