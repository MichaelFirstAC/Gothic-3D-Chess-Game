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

// How bright all the painted light is, against the cathedral's dark stone.
const POOL_POWER = 3.2;

// Pools of light painted by the shader, which costs far less than real lamps:
// [x, y, z, reach, colour, strength].
const WARM = 0xffa755;
const ROSE = 0xc9466e;
const BLUE = 0x5478e8;
const VIOLET = 0x9461e0;
const POOLS = [
  // Beneath the clerestory windows along the nave, either side of the crossing.
  [12, 24, 21, 20, WARM, 0.9], [-12, 22, 22, 20, BLUE, 1.0],
  [12, 22, -22, 20, VIOLET, 1.0], [-12, 24, -21, 20, ROSE, 0.9],
  // Along the transepts.
  [23, 17, 11, 17, ROSE, 0.8], [23, 20, -11, 17, BLUE, 0.9],
  [-23, 20, 11, 17, VIOLET, 0.9], [-23, 17, -11, 17, WARM, 0.8],
  // Between the tall windows on the two end walls of the transepts.
  [30, 17, 4.2, 12, WARM, 1.1], [30, 8, -4.2, 12, BLUE, 1.2],
  [-30, 17, -4.2, 12, ROSE, 1.1], [-30, 8, 4.2, 12, VIOLET, 1.2],
  // Under the great rose.
  [0, 23, -45, 24, VIOLET, 1.1],
  // Candlelight reaching the four piers round the board.
  [11, 3, 11, 13, WARM, 0.85], [-11, 3, 11, 13, WARM, 0.85],
  [11, 3, -11, 13, WARM, 0.85], [-11, 3, -11, 13, WARM, 0.85],
];

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
  uniform vec4 uPoolAt[${POOLS.length}];
  uniform vec3 uPoolColour[${POOLS.length}];
  varying vec3 vStonePos;
  varying vec3 vStoneNormal;
  varying vec2 vStoneShift;

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
  float wide = smoothstep(0.42, 0.56, wear.g);
  float fine = smoothstep(0.46, 0.62, wear.b);
  // Great splits, and a web of finer ones at a size unrelated to theirs.
  vec2 webShift = vStoneShift * 1.7 + 0.53;
  float split = max(
    stoneCracks(onFace, vStoneShift, 15.0, vec2(0.0)) * wide,
    stoneCracks(onFace, webShift, 6.3, vec2(0.0)) * fine * 0.8);
  // The lower edge of a split catches the light: it is where the stone a little
  // above is split and this point is not.
  float lip = max(
    stoneCracks(onFace, vStoneShift, 15.0, up * 0.07) * wide,
    stoneCracks(onFace, webShift, 6.3, up * 0.05) * fine * 0.8);
  lip = clamp(lip - split, 0.0, 1.0);

  // Flakes broken from the face: rougher, darker hollows with a sharp edge.
  vec3 pits = texture2D(uNoise, patchAt * 0.085 + 0.62).rgb;
  float ragged = pits.r + (texture2D(uNoise, patchAt * 0.31).g - 0.5) * 0.34;
  float flake = smoothstep(0.668, 0.682, ragged) * smoothstep(0.45, 0.6, wear.r);
  float rim = clamp(smoothstep(0.645, 0.668, ragged) * smoothstep(0.45, 0.6, wear.r) - flake, 0.0, 1.0);

  float broken = clamp(split * 1.25, 0.0, 1.0);
  diffuseColor.rgb *= 1.0 - 0.86 * broken;
  diffuseColor.rgb *= 1.0 - 0.28 * flake;
  diffuseColor.rgb *= 1.0 + 1.1 * lip + 0.85 * rim;
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

    vec3 spill = vec3(0.0);
    for (int i = 0; i < ${POOLS.length}; i++) {
      vec3 toward = uPoolAt[i].xyz - vStonePos;
      float away = length(toward);
      float fall = max(0.0, 1.0 - away / uPoolAt[i].w);
      // Light wraps a little past the edge, then leaves the far side in shade.
      float facing = max(0.0, (dot(faceNormal, toward / away) + 0.15) / 1.15);
      spill += uPoolColour[i] * (fall * fall * facing);
    }
    reflectedLight.directDiffuse += spill * diffuseColor.rgb;

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
  shared ||= {
    uNoise: { value: noiseTexture() },
    uCracks: { value: crackTexture(131) },
    uPoolAt: { value: POOLS.map(([x, y, z, reach]) => new THREE.Vector4(x, y, z, reach)) },
    uPoolColour: {
      value: POOLS.map(([, , , , colour, strength]) => new THREE.Color(colour).multiplyScalar(strength * POOL_POWER)),
    },
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
