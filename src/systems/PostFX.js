// Post-processing: RenderPass -> SSAO -> UnrealBloomPass -> Vignette -> OutputPass.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { CONFIG } from '../config.js';

export function setupPostFX(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // SSAO grounds objects into the geometry — kills the floating/hard-shadow look.
  const ssao = new SSAOPass(scene, camera, renderer.domElement.width, renderer.domElement.height);
  ssao.kernelRadius = 16;
  ssao.minDistance = 0.003;
  ssao.maxDistance = 0.16;
  ssao.output = SSAOPass.OUTPUT.Default;
  composer.addPass(ssao);

  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), CONFIG.fx.bloomStrength, CONFIG.fx.bloomRadius, CONFIG.fx.bloomThreshold);
  composer.addPass(bloom);
  const vignette = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, intensity: { value: 0.5 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float intensity; varying vec2 vUv;
      void main(){
        vec4 c=texture2D(tDiffuse,vUv);
        float d=distance(vUv,vec2(0.5,0.5));
        float v=smoothstep(0.5,0.72,d)*intensity;
        gl_FragColor=vec4(c.rgb*(1.0-v),c.a);
      }`,
  });
  composer.addPass(vignette);
  const output = new OutputPass();
  composer.addPass(output);
  return { composer, bloom, ssao };
}
