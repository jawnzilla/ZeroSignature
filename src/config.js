// Zero Signature — central tuning / configuration.
export const CONFIG = {
  seed: 1337,

  world: {
    gridW: 26,          // columns
    gridH: 20,          // rows
    cell: 5,            // metres per cell
    wallH: 4.2,         // wall height
    rooms: 7,           // target rooms to carve
  },

  player: {
    height: 1.7,
    radius: 0.42,
    walkSpeed: 3.4,
    sprintSpeed: 6.2,
    crouchSpeed: 2.0,
    crouchScale: 0.62,       // scale height when crouched
    accel: 26,
    friction: 10,
    maxHealth: 100,
    maxStamina: 100,
    staminaDrain: 26,        // per second while sprinting
    staminaRegen: 22,
    staminaSprintCostThreshold: 10,
    detectionHidden: 12,     // enemy detection recover per sec when hidden
    eyeHeight: 1.55,
    crouchEye: 0.95,
  },

  weapon: {
    ammo: 90,
    magSize: 24,
    reloadTime: 1.5,
    fireInterval: 0.115,
    damage: 12,
    spread: 0.012,           // base radians
    recoilKick: 0.05,
    muzzleFlashTime: 0.05,
    // noise radii (hearing)
    shotNoise: 46,
    suppressedShotNoise: 15,
  },

  noise: {                  // player noise radii by action
    walk: 7,
    sprint: 15,
    crouch: 3,
    land: 10,
  },

  ai: {
    viewRange: 24,
    viewAngle: 1.05,         // radians total field (±0.525)
    suspicionRadius: 18,     // hearing radius to enter SUSPICIOUS
    maxHealth: 100,
    alertHealthScale: 1.35,
    moveSpeed: 3.2,
    alertSpeed: 5.0,
    turnSpeed: 4.2,
    fireInterval: 0.9,
    fireDamage: 7,
    fireSpread: 0.02,
    fireRange: 60,
    detection: {
      gainIdle: 6,           // per second close+seen
      gainAlert: 18,
      lose: 26,
      minDistFactor: 1.6,    // closer => faster
    },
    searchTime: 8,           // seconds before dropping ALERT->SEARCH->IDLE
  },

  fx: {
    bloomStrength: 0.7,
    bloomRadius: 0.55,
    bloomThreshold: 0.8,
    fogColor: 0x070a12,
    skyColor: 0x05070d,
  },

  upgrade: {
    cost: [1, 2, 3],         // intel cost per tier for each line
  },
};

export const UPGRADE_DEFS = [
  { id: 'vitality',   name: 'Vitality',      desc: '+30 max health',        max: 3, effect: (p,l)=>0 },
  { id: 'condition',  name: 'Conditioning',  desc: 'Sprint faster & longer',max: 3, effect: (p,l)=>0 },
  { id: 'shadow',     name: 'Shadow Ops',    desc: 'Move quieter & harder to see', max: 3, effect: (p,l)=>0 },
  { id: 'silencer',   name: 'Suppressor',    desc: 'Gunshots near-silent',  max: 2, effect: (p,l)=>0 },
  { id: 'optics',     name: 'Optics',        desc: 'Better night vision',   max: 2, effect: (p,l)=>0 },
];
