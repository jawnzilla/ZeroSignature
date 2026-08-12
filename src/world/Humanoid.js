// Low-poly humanoid builder — makes characters actually read as human
// (head, torso, arms, legs) instead of a box with a sphere on top.
import * as THREE from 'three';

export function makeHumanoid(mats, { bodyColor = 'body', visorColor = 'visor', gear = false } = {}) {
  const root = new THREE.Group();
  const body = mats[bodyColor];
  const visor = mats[visorColor];
  const dark = mats.metalDark || mats.gun;

  // legs
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.78, 0.2), body);
  legL.position.set(-0.14, 0.39, 0); legL.castShadow = true;
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.78, 0.2), body);
  legR.position.set(0.14, 0.39, 0); legR.castShadow = true;

  // torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.28), body);
  torso.position.set(0, 1.06, 0); torso.castShadow = true;

  // shoulders / arms (front toward +z, the visor side)
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.56, 0.16), body);
  armR.position.set(0.34, 1.18, 0.02); armR.rotation.z = -0.15; armR.castShadow = true;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.56, 0.16), body);
  armL.position.set(-0.34, 1.18, 0.02); armL.rotation.z = 0.15; armL.castShadow = true;

  // head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.27), body);
  head.position.set(0, 1.68, 0); head.castShadow = true;
  // visor band across the face
  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.06), visor);
  visorMesh.position.set(0, 1.7, 0.14);

  // small tactical gear / backpack on the back
  let pack = null;
  if (gear) {
    pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.14), dark);
    pack.position.set(0, 1.15, -0.2);
    pack.castShadow = true;
  }

  // gun mount at the front (arms grip it)
  const gunMount = new THREE.Group();
  gunMount.position.set(0.3, 1.22, 0.34);

  root.add(legL, legR, torso, armL, armR, head, visorMesh, gunMount);
  if (pack) root.add(pack);
  root.castShadow = true;
  return { root, gunMount, visor: visorMesh };
}
