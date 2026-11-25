// The air over the chasm: specks of dust drifting slowly upward on a cold
// draught.
import * as THREE from 'three';
import { seededRandom } from './textures.js';

const MOTES = 750;
// Motes rise through this span of heights, then start again at the bottom.
const LOW = -30;
const HIGH = 3;

function motes(time) {
  const random = seededRandom(419);
  const position = new Float32Array(MOTES * 3);
  const trait = new Float32Array(MOTES * 3); // speed, size, phase
  for (let i = 0; i < MOTES; i++) {
    const angle = random() * Math.PI * 2;
    // In a ring about the spire, clear of its rock and of the board.
    const out = 7.2 + random() ** 0.8 * 8.5;
    position.set([Math.sin(angle) * out, LOW + random() * (HIGH - LOW), Math.cos(angle) * out], i * 3);
    trait.set([0.12 + random() * 0.35, 0.5 + random() ** 3 * 1.8, random() * 6.28], i * 3);
  }
  const geometry = new THREE.BufferGeometry()
    .setAttribute('position', new THREE.BufferAttribute(position, 3))
    .setAttribute('trait', new THREE.BufferAttribute(trait, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uScale: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 trait;
      uniform float uTime;
      uniform float uScale;
      varying float vLight;
      void main() {
        vec3 p = position;
        p.y = ${LOW.toFixed(1)} + mod(position.y - ${LOW.toFixed(1)} + uTime * trait.x, ${(HIGH - LOW).toFixed(1)});
        p.x += sin(uTime * 0.21 + trait.z) * 0.55;
        p.z += cos(uTime * 0.17 + trait.z * 1.7) * 0.55;
        vec4 view = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp(trait.y * uScale / -view.z, 0.0, 7.0);
        // Dim in the depths, and gone before the point where they start again.
        vLight = exp(-max(0.0, -1.5 - p.y) * 0.09)
          * (1.0 - smoothstep(${(HIGH - 3).toFixed(1)}, ${HIGH.toFixed(1)}, p.y))
          * (0.6 + 0.4 * sin(uTime * 0.9 + trait.z * 3.0));
      }`,
    fragmentShader: /* glsl */ `
      varying float vLight;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = max(0.0, 1.0 - d);
        gl_FragColor = vec4(vec3(0.5, 0.55, 0.72) * a * vLight * 0.5, 1.0);
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  // Keeps the motes the same size on screen whatever the resolution.
  const size = new THREE.Vector2();
  points.onBeforeRender = (renderer) => {
    material.uniforms.uScale.value = renderer.getDrawingBufferSize(size).y * 0.04;
  };
  return points;
}

export function createAbyssAir(scene) {
  const time = { value: 0 };
  const group = new THREE.Group();
  group.add(motes(time));
  scene.add(group);
  return {
    update(seconds) { time.value = seconds; },
    setVisible(visible) { group.visible = visible; },
  };
}
