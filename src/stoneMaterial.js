// Cathedral stone that does not visibly repeat. It is mapped by world position
// (no UVs), shifted differently on every instance, blends two differently built
// walls, and is weathered by large-scale noise whose period has nothing to do
// with the texture's.
import * as THREE from 'three';
import { stoneWall, noiseTexture } from './textures.js';
import { addAbyssFog } from './abyssFog.js';

// World units covered by one stone texture.
const TILE = 17;

const VERTEX_HEAD = /* glsl */ `
  varying vec3 vStonePos;
  varying vec3 vStoneNormal;
  varying vec2 vStoneShift;
`;

const VERTEX_BODY = /* glsl */ `
  vec4 stoneAt = vec4(transformed, 1.0);
  vec3 stoneNormal = objectNormal;
  vStoneShift = vec2(0.0);
  #ifdef USE_INSTANCING
    stoneAt = instanceMatrix * stoneAt;
    stoneNormal = mat3(instanceMatrix) * stoneNormal;
    // Every pier and wall bay starts at its own place in the texture.
    vec3 origin = instanceMatrix[3].xyz;
    vStoneShift = fract(sin(vec2(dot(origin, vec3(12.9, 78.2, 37.7)), dot(origin, vec3(93.9, 11.3, 47.1)))) * 43758.5453);
  #endif
  vStonePos = (modelMatrix * stoneAt).xyz;
  vStoneNormal = normalize(mat3(modelMatrix) * stoneNormal);
`;

const FRAGMENT_HEAD = /* glsl */ `
  uniform sampler2D uWallA;
  uniform sampler2D uWallB;
  uniform sampler2D uReliefA;
  uniform sampler2D uReliefB;
  uniform sampler2D uNoise;
  varying vec3 vStonePos;
  varying vec3 vStoneNormal;
  varying vec2 vStoneShift;

  // Smooth noise looked up along a slanted slice through space.
  vec3 stoneNoise(vec3 p, float scale) {
    vec3 a = texture2D(uNoise, vec2(p.x + p.y * 0.37, p.z - p.y * 0.61) * scale).rgb;
    vec3 b = texture2D(uNoise, vec2(p.y - p.z * 0.29, p.x * 0.53 + p.z * 0.81) * scale * 1.37 + 0.43).rgb;
    return (a + b) * 0.5;
  }
`;

// Replaces the colour lookup. The names declared here are used again below.
const FRAGMENT_COLOUR = /* glsl */ `
  vec3 faceNormal = normalize(vStoneNormal);
  vec3 blend = pow(abs(faceNormal), vec3(8.0));
  blend /= blend.x + blend.y + blend.z;
  vec2 shift = vStoneShift;
  vec2 uvX = vStonePos.zy / ${TILE.toFixed(1)} + shift + vec2(0.37, 0.0);
  vec2 uvY = vStonePos.xz / ${TILE.toFixed(1)} + shift.yx;
  vec2 uvZ = vStonePos.xy / ${TILE.toFixed(1)} + shift;

  // Which of the two walls shows here.
  vec3 patches = stoneNoise(vStonePos, 0.0135);
  float variant = smoothstep(0.47, 0.53, patches.r);

  vec3 wall = mix(
    texture2D(uWallA, uvX).rgb * blend.x + texture2D(uWallA, uvY).rgb * blend.y + texture2D(uWallA, uvZ).rgb * blend.z,
    texture2D(uWallB, uvX).rgb * blend.x + texture2D(uWallB, uvY).rgb * blend.y + texture2D(uWallB, uvZ).rgb * blend.z,
    variant);

  // Weathering on a much larger scale than any block.
  vec3 broad = stoneNoise(vStonePos + 31.0, 0.0071);
  vec3 streaks = stoneNoise(vStonePos * vec3(2.6, 0.45, 2.6) + 77.0, 0.012);
  float soot = smoothstep(0.52, 0.74, patches.g);
  float damp = smoothstep(0.54, 0.76, streaks.b);
  wall *= mix(vec3(1.1, 1.0, 0.88), vec3(0.9, 0.96, 1.09), smoothstep(0.35, 0.65, broad.r));
  wall *= 0.8 + 0.42 * broad.g;
  wall *= mix(vec3(1.0), vec3(0.42, 0.4, 0.4), soot);
  wall = mix(wall, wall * vec3(0.6, 0.68, 0.55), damp * 0.8);
  // Candle smoke has darkened everything high up.
  wall *= 1.0 - 0.62 * smoothstep(11.0, 40.0, vStonePos.y);
  diffuseColor.rgb *= wall;
`;

const FRAGMENT_RELIEF = /* glsl */ `
  vec3 tnX = mix(texture2D(uReliefA, uvX).xyz, texture2D(uReliefB, uvX).xyz, variant) * 2.0 - 1.0;
  vec3 tnY = mix(texture2D(uReliefA, uvY).xyz, texture2D(uReliefB, uvY).xyz, variant) * 2.0 - 1.0;
  vec3 tnZ = mix(texture2D(uReliefA, uvZ).xyz, texture2D(uReliefB, uvZ).xyz, variant) * 2.0 - 1.0;
  // Each projection tilts the surface within its own plane.
  vec3 bumped = faceNormal
    + 0.9 * (vec3(0.0, tnX.y, tnX.x) * blend.x
    + vec3(tnY.x, 0.0, tnY.y) * blend.y
    + vec3(tnZ.x, tnZ.y, 0.0) * blend.z);
  normal = normalize((viewMatrix * vec4(normalize(bumped), 0.0)).xyz);
  #ifdef DOUBLE_SIDED
    normal *= gl_FrontFacing ? 1.0 : -1.0;
  #endif
`;

let shared = null;

function textures() {
  if (!shared) {
    const a = stoneWall(11);
    const b = stoneWall(47);
    shared = {
      uWallA: { value: a.map }, uWallB: { value: b.map },
      uReliefA: { value: a.normalMap }, uReliefB: { value: b.normalMap },
      uNoise: { value: noiseTexture() },
    };
  }
  return shared;
}

// Matte stone: no specular highlight and no reflection, so nothing reads as metal.
export function stoneMaterial({ color = 0xffffff } = {}) {
  const material = new THREE.MeshLambertMaterial({ color, reflectivity: 0 });
  const uniforms = textures();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace('#include <map_fragment>', FRAGMENT_COLOUR)
      .replace('#include <normal_fragment_maps>', FRAGMENT_RELIEF);
    addAbyssFog(shader);
  };
  material.customProgramCacheKey = () => 'cathedral-stone';
  return material;
}
