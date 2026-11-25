// Candle flames: a camera-facing billboard shaded with animated noise, with a
// soft glow behind it. flicker.js supplies the motion.
import * as THREE from 'three';
import { flameState } from './flicker.js';
import { glowTexture } from '../textures.js';

const WIDTH = 0.15;
const HEIGHT = 0.36;
const BASE = 0.16; // how far up the quad the wick sits, as a fraction

const vertexShader = /* glsl */ `
  uniform float uStrength;
  uniform vec2 uSway;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 centre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    // Turn to face the camera. "Up" leans partway toward the camera's own up,
    // so the flame keeps its shape when seen from above.
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 up = normalize(mix(vec3(0.0, 1.0, 0.0), camUp, 0.65));
    float tip = clamp((uv.y - ${BASE.toFixed(2)}) / 0.84, 0.0, 1.0);
    vec3 world = centre
      + camRight * position.x
      + up * position.y * (0.82 + 0.18 * uStrength)
      + vec3(uSway.x, 0.0, uSway.y) * tip * tip;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

// Also used, with its numbers passed per flame, by the cathedral's lamps.
export const flameShader = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uStrength;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 3; i++) {
      sum += amplitude * noise(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return sum;
  }

  void main() {
    // x runs -1..1 across, y runs 0 at the wick to 1 at the top.
    float x = vUv.x * 2.0 - 1.0;
    float y = (vUv.y - ${BASE.toFixed(2)}) / ${(1 - BASE).toFixed(2)};
    // Noise scrolls upward and pulls harder at the edges nearer the tip.
    float n = fbm(vec2(x * 1.8 + uSeed, y * 3.2 - uTime * 3.4));
    float m = fbm(vec2(x * 3.5 - uSeed, y * 6.0 - uTime * 5.1));
    float lift = clamp(y, 0.0, 1.0);
    x += (n - 0.45) * 0.75 * lift;
    float h = y + (m - 0.45) * 0.22 * lift;

    // A teardrop: round at the bottom, drawn out to a point.
    float widest = 0.24;
    float width = h < widest
      ? 0.62 * sqrt(max(0.0, 1.0 - pow((widest - h) / (widest + 0.07), 2.0)))
      : 0.62 * pow(max(0.0, 1.0 - (h - widest) / (0.86 - widest)), 0.85);
    float d = abs(x) / max(width, 0.001);
    float body = 1.0 - smoothstep(0.55, 1.05, d);
    body *= 1.0 - smoothstep(0.62, 0.9, h);

    float core = (1.0 - smoothstep(0.0, 0.85, d)) * (1.0 - smoothstep(0.18, 0.62, h));
    vec3 orange = vec3(1.0, 0.42, 0.05);
    vec3 amber = vec3(1.0, 0.68, 0.18);
    vec3 hot = vec3(1.0, 0.95, 0.74);
    vec3 color = mix(orange, amber, 1.0 - smoothstep(0.25, 0.65, h));
    color = mix(color, hot, core);

    // The faint blue of complete combustion at the foot.
    float blue = (1.0 - smoothstep(-0.02, 0.17, h)) * smoothstep(-0.12, 0.0, y);
    color = mix(color, vec3(0.16, 0.32, 1.0), blue * (1.0 - core) * 0.85);

    float alpha = body * (0.55 + 0.45 * core) * (1.0 - smoothstep(0.5, 0.88, h) * 0.65);
    gl_FragColor = vec4(color * (0.8 + 0.45 * uStrength), alpha);
  }
`;

let quad = null;
let glowMap = null;

export function createFlame(seed) {
  quad ||= new THREE.PlaneGeometry(WIDTH, HEIGHT).translate(0, HEIGHT * (0.5 - BASE), 0);
  glowMap ||= glowTexture();

  const uniforms = {
    uTime: { value: 0 }, uSeed: { value: seed * 13.7 }, uStrength: { value: 1 }, uSway: { value: new THREE.Vector2() },
  };
  const flame = new THREE.Mesh(quad, new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader: flameShader,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  // The shader moves the quad, so it must not be culled by its rest position.
  flame.frustumCulled = false;
  flame.renderOrder = 4;

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowMap, color: 0xff8a28, opacity: 0.3,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  glow.position.y = HEIGHT * 0.2;
  glow.renderOrder = 3;

  const group = new THREE.Group();
  group.add(glow, flame);

  return {
    object: group,
    // Returns the state used, so that a light can follow the same flicker.
    update(time) {
      const state = flameState(time, seed);
      uniforms.uTime.value = time + seed * 7;
      uniforms.uStrength.value = state.strength;
      uniforms.uSway.value.set(state.swayX, state.swayZ);
      glow.scale.setScalar(0.5 * (0.7 + 0.3 * state.strength));
      glow.material.opacity = 0.3 * state.strength;
      glow.position.x = state.swayX * 0.4;
      return state;
    },
  };
}
