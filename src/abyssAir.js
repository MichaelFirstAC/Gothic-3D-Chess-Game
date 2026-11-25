// The air over the chasm: dust that drifts slowly upward on a cold draught, and
// a few very faint layers of haze rising from below.
import * as THREE from 'three';
import { noiseTexture, seededRandom } from './textures.js';

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

function haze(time) {
  const noise = noiseTexture(77);
  const layers = [
    { y: -5.5, strength: 0.05, drift: 0.006, inner: 6.5 },
    { y: -10, strength: 0.06, drift: -0.004, inner: 5.5 },
    { y: -17, strength: 0.045, drift: 0.003, inner: 4.5 },
  ];
  return layers.map(({ y, strength, drift, inner }, i) => {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: time, uNoise: { value: noise }, uStrength: { value: strength },
        uDrift: { value: drift }, uInner: { value: inner }, uSeed: { value: i * 0.37 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec3 vAt;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vAt = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uNoise;
        uniform float uTime, uStrength, uDrift, uInner, uSeed;
        varying vec3 vAt;
        void main() {
          vec2 uv = vAt.xz * 0.019 + uSeed;
          float a = texture2D(uNoise, uv + vec2(uTime * uDrift, uTime * uDrift * 0.6)).r;
          float b = texture2D(uNoise, uv * 2.3 - vec2(uTime * uDrift * 1.4, 0.0)).g;
          float wisp = smoothstep(0.42, 0.8, a * 0.65 + b * 0.35);
          // Thins out toward the rock in the middle and the walls around.
          float out_ = length(vAt.xz);
          float fade = smoothstep(uInner, uInner + 4.0, out_) * (1.0 - smoothstep(11.0, 15.5, max(abs(vAt.x), abs(vAt.z))));
          gl_FragColor = vec4(vec3(0.34, 0.44, 0.72) * wisp * fade * uStrength, 1.0);
        }`,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(32, 32).rotateX(-Math.PI / 2), material);
    plane.position.y = y;
    return plane;
  });
}

export function createAbyssAir(scene) {
  const time = { value: 0 };
  const group = new THREE.Group();
  group.add(motes(time), ...haze(time));
  scene.add(group);
  return {
    update(seconds) { time.value = seconds; },
    setVisible(visible) { group.visible = visible; },
  };
}
