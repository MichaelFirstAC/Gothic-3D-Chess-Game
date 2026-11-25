// The cathedral's stone: one plain colour with a soft polish, like the slab the
// board stands on. What keeps it alive is light. Coloured light spills from the
// stained glass and warm light rises near the board, so every shaft and moulding
// has a lit side and a shaded one. The building is also falling apart: cracks
// run through it in patches, and flakes have broken from its face. The cracks
// are laid at two sizes and shifted on every pier and bay, so they do not repeat
// to the eye.
import * as THREE from 'three';
import { noiseTexture, crackTexture } from './textures.js';
import { addAbyssFog } from './abyssFog.js';
import { windowMask, MOONLIGHT_GLSL } from './brokenRose.js';
import { GLOWS, LAMP_LIGHT, lampPlan } from './lampPlan.js';
import { bakeLight, GRID } from './lightBake.js';

// How bright all the painted light is, against the cathedral's dark stone.
const POOL_POWER = 3.2;

// The seconds on the clock, which only the flicker of firelight needs.
export const stoneTime = { value: 0 };

// Every glow and every lamp, worked out once into two grids through space.
function bakedLight() {
  const lit = ([x, y, z], reach, colour, strength, fire) => ({
    x, y, z, reach, fire, colour: new THREE.Color(colour).multiplyScalar(strength * POOL_POWER).toArray(),
  });
  const grids = bakeLight([
    ...GLOWS.map(([x, y, z, reach, colour, strength]) => lit([x, y, z], reach, colour, strength, false)),
    ...lampPlan().map(({ kind, at }) => {
      const { colour, reach, strength } = LAMP_LIGHT[kind];
      return lit(at, reach, colour, strength, true);
    }),
  ]);
  return [grids.light, grids.way].map((values) => {
    const packed = new Uint16Array(values.length);
    for (let i = 0; i < values.length; i++) packed[i] = THREE.DataUtils.toHalfFloat(values[i]);
    const texture = new THREE.Data3DTexture(packed, ...GRID.size);
    texture.type = THREE.HalfFloatType;
    texture.format = THREE.RGBAFormat;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    return texture;
  });
}

// From a place in the building to a place in the grids.
const inGrid = (axis) => `${(0.5 - GRID.min[axis] / GRID.step).toFixed(3)}`;
const GRID_OFFSET = `vec3(${inGrid(0)}, ${inGrid(1)}, ${inGrid(2)})`;
const GRID_SIZE = `vec3(${GRID.size.map((n) => n.toFixed(1)).join(', ')})`;

const VERTEX_HEAD = /* glsl */ `
  varying vec3 vStonePos;
  varying vec3 vStoneNormal;
  varying vec2 vStoneShift;
`;

const VERTEX_BODY = /* glsl */ `
  vec4 stoneAt = vec4(transformed, 1.0);
  vec3 stoneNormal = objectNormal;
  vStoneShift = vec2(0.0);
  vec3 stoneSpace = vec3(0.0);
  #ifdef USE_INSTANCING
    stoneAt = instanceMatrix * stoneAt;
    stoneNormal = mat3(instanceMatrix) * stoneNormal;
    // Every pier and wall bay cracks in its own way.
    stoneSpace = instanceMatrix[3].xyz;
    vStoneShift = fract(sin(vec2(dot(stoneSpace, vec3(12.9, 78.2, 37.7)), dot(stoneSpace, vec3(93.9, 11.3, 47.1)))) * 43758.5453);
  #endif
  vStonePos = (modelMatrix * stoneAt).xyz;
  vStoneNormal = normalize(mat3(modelMatrix) * stoneNormal);
`;

const FRAGMENT_HEAD = /* glsl */ `
  uniform sampler2D uNoise;
  uniform sampler2D uCracks;
  uniform sampler2D uWindowMask;
  uniform highp sampler3D uLight;
  uniform highp sampler3D uLightWay;
  uniform float uTime;
  varying vec3 vStonePos;
  varying vec3 vStoneNormal;
  varying vec2 vStoneShift;
  ${MOONLIGHT_GLSL}

  // How cracked a point of the face is. \`at\` is its place seen from the side it
  // mostly faces, and \`drop\` looks a little higher or lower on upright faces.
  float stoneCracks(vec2 at, vec2 shift, float tile, vec2 drop) {
    return texture2D(uCracks, (at + drop) / tile + shift).r;
  }
`;

// The colour stays one colour, only drifting a little in depth over distances
// far larger than any detail, so that no wall looks like a flat cut-out.
const FRAGMENT_COLOUR = /* glsl */ `
  vec2 drift = vec2(vStonePos.x + vStonePos.y * 0.37, vStonePos.z - vStonePos.y * 0.61);
  float broad = texture2D(uNoise, drift * 0.011).r;
  diffuseColor.rgb *= 0.82 + 0.36 * broad;
  // Candle smoke has darkened everything high up.
  diffuseColor.rgb *= 1.0 - 0.5 * smoothstep(12.0, 40.0, vStonePos.y);

  // One lookup from the side the face mostly looks to, with height as the
  // second coordinate on anything upright.
  vec3 facingBy = abs(vStoneNormal);
  bool level = facingBy.y > max(facingBy.x, facingBy.z);
  vec2 onFace = level ? vStonePos.xz : (facingBy.x > facingBy.z ? vStonePos.zy : vStonePos.xy);
  vec2 up = level ? vec2(0.0) : vec2(0.0, 1.0);
  // Damage comes in patches, with sound stone in between.
  vec2 patchAt = vec2(vStonePos.x * 0.8 + vStonePos.z * 0.6, vStonePos.y + vStonePos.x * 0.23);
  vec3 wear = texture2D(uNoise, patchAt * 0.019 + 0.31).rgb;
  float wide = smoothstep(0.26, 0.42, wear.g);
  float fine = smoothstep(0.28, 0.46, wear.b);
  // Great splits, and a web of finer ones at a size unrelated to theirs.
  vec2 webShift = vStoneShift * 1.7 + 0.53;
  float split = max(
    stoneCracks(onFace, vStoneShift, 15.0, vec2(0.0)) * wide,
    stoneCracks(onFace, webShift, 6.3, vec2(0.0)) * fine * 0.95);
  // The lower edge of a split catches the light: it is where the stone a little
  // above is split and this point is not.
  float lip = max(
    stoneCracks(onFace, vStoneShift, 15.0, up * 0.07) * wide,
    stoneCracks(onFace, webShift, 6.3, up * 0.05) * fine * 0.95);
  lip = clamp(lip - split, 0.0, 1.0);

  // Flakes broken from the face: rougher, darker hollows with a sharp edge.
  vec3 pits = texture2D(uNoise, patchAt * 0.085 + 0.62).rgb;
  float ragged = pits.r + (texture2D(uNoise, patchAt * 0.31).g - 0.5) * 0.34;
  float flake = smoothstep(0.668, 0.682, ragged) * smoothstep(0.45, 0.6, wear.r);
  float rim = clamp(smoothstep(0.645, 0.668, ragged) * smoothstep(0.45, 0.6, wear.r) - flake, 0.0, 1.0);

  float broken = clamp(split * 1.45, 0.0, 1.0);
  // Grime has settled round the great splits: the same lookup, badly blurred.
  float grime = texture2D(uCracks, onFace / 15.0 + vStoneShift, 4.5).r * wide;
  diffuseColor.rgb *= 1.0 - clamp(grime * 2.6, 0.0, 0.55);
  diffuseColor.rgb *= 1.0 - 0.97 * broken;
  diffuseColor.rgb *= 1.0 - 0.5 * flake;
  diffuseColor.rgb *= 1.0 + 0.7 * lip + 0.55 * rim;
`;

const FRAGMENT_LIGHT = /* glsl */ `
  {
    vec3 faceNormal = normalize(vStoneNormal);
    #ifdef DOUBLE_SIDED
      faceNormal *= gl_FrontFacing ? 1.0 : -1.0;
    #endif
    // Undersides get less of the light from above than ledges do.
    float openness = 0.55 + 0.45 * smoothstep(-0.9, 0.7, faceNormal.y);
    reflectedLight.directDiffuse *= openness;
    reflectedLight.indirectDiffuse *= openness;

    // The glows and the lamps, read a little way off the face so that stone
    // takes the light of the side it looks to.
    vec3 cell = ((vStonePos + faceNormal * 0.7) / ${GRID.step.toFixed(1)} + ${GRID_OFFSET}) / ${GRID_SIZE};
    vec4 still = texture(uLight, cell);
    vec3 way = texture(uLightWay, cell).xyz;
    // Light wraps a little past the edge, then leaves the far side in shade;
    // where it comes from several sides, every face gets some.
    float facing = clamp((dot(faceNormal, way) + 0.15) / 1.15 + (1.0 - min(length(way), 1.0)) * 0.3, 0.0, 1.0);
    float flicker = 1.0 + still.a * (sin(uTime * 7.3 + vStonePos.x * 0.35 + vStonePos.z * 0.29) * 0.07
      + sin(uTime * 12.9 + vStonePos.y * 0.5 + vStonePos.x * 0.41) * 0.045);
    reflectedLight.directDiffuse += still.rgb * (facing * flicker) * diffuseColor.rgb;

    // Direct moonlight: only what can see the moon through the opening, and
    // only the faces turned toward where it comes from.
    float along;
    vec3 moonlit = moonThrough(vStonePos, along);
    float facingMoon = max(dot(faceNormal, -MOON_RAY), 0.0);
    reflectedLight.directDiffuse += moonlit * vec3(0.5, 0.63, 1.0) * (facingMoon * exp(-along * 0.022) * 7.0) * diffuseColor.rgb;

    // Nothing gleams from inside a crack or a hollow.
    float dull = (1.0 - broken) * (1.0 - 0.7 * flake);
    reflectedLight.directSpecular *= dull;
    reflectedLight.indirectSpecular *= dull;
  }
`;

// The candle lamps and the lamp over the board do not reach the walls, which
// have the painted light instead, so the stone's shader leaves them out.
const without = (source, loop) => {
  if (!source.includes(loop)) throw new Error(`three.js lighting code has changed: ${loop}`);
  return source.replace(loop, '#if 0');
};
const DISTANT_LIGHTS = ['POINT', 'SPOT'].reduce(
  (source, kind) => without(source, `#if ( NUM_${kind}_LIGHTS > 0 ) && defined( RE_Direct )`),
  THREE.ShaderChunk.lights_fragment_begin,
);

let shared = null;

function uniforms() {
  if (shared) return shared;
  const [still, way] = bakedLight();
  shared = {
    uNoise: { value: noiseTexture() },
    uCracks: { value: crackTexture(131) },
    uWindowMask: { value: windowMask() },
    uLight: { value: still },
    uLightWay: { value: way },
    uTime: stoneTime,
  };
  return shared;
}

export function stoneMaterial({ color = 0xffffff } = {}) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.52, metalness: 0.08 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms());
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace('#include <map_fragment>', FRAGMENT_COLOUR)
      .replace('#include <lights_fragment_begin>', DISTANT_LIGHTS)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${FRAGMENT_LIGHT}`);
    addAbyssFog(shader);
  };
  material.customProgramCacheKey = () => 'cathedral-stone';
  return material;
}
