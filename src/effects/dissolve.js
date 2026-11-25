// Copies of a piece's materials that can dissolve through noise, glow, fade, and
// vanish below a height, so that things look swallowed by the board. The shared
// originals are never changed.
import * as THREE from 'three';

const NOISE = /* glsl */ `
  uniform float uDissolve;
  uniform float uGlow;
  uniform float uClipY;
  uniform vec3 uEdge;
  varying vec3 vLocal;
  varying float vWorldY;
  float cell(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float grain(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(cell(i), cell(i + vec3(1,0,0)), u.x), mix(cell(i + vec3(0,1,0)), cell(i + vec3(1,1,0)), u.x), u.y),
      mix(mix(cell(i + vec3(0,0,1)), cell(i + vec3(1,0,1)), u.x), mix(cell(i + vec3(0,1,1)), cell(i + vec3(1,1,1)), u.x), u.y),
      u.z);
  }
`;

// Adds dissolving to a copy, on top of whatever its original already does to
// the shader.
function patch(material, original, uniforms) {
  material.onBeforeCompile = (shader, renderer) => {
    original.onBeforeCompile(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;\nvarying float vWorldY;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vLocal = position;
        vWorldY = (modelMatrix * vec4(transformed, 1.0)).y;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vWorldY < uClipY) discard;
        float speckle = grain(vLocal * 22.0) * 0.7 + grain(vLocal * 53.0) * 0.3;
        if (uDissolve > 0.0 && speckle < uDissolve * 1.04 - 0.02) discard;`)
      // A bright rim where the surface is being eaten away.
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rim = uDissolve > 0.0 ? 1.0 - smoothstep(0.0, 0.1, speckle - uDissolve) : 0.0;
        totalEmissiveRadiance += uEdge * (rim * 2.6 + uGlow);`);
  };
  // Copies of like originals share their compiled programs.
  material.customProgramCacheKey = () => `dissolve ${original.customProgramCacheKey()}`;
}

// Sets of copies waiting to be used again. They are never disposed: disposing
// the last material using a shader throws the compiled shader away, and
// compiling it again freezes the picture for a noticeable moment.
const spare = new Map(); // which originals and which side -> sets

function buildSet(materials, edge, doubleSided) {
  const uniforms = {
    uDissolve: { value: 0 }, uGlow: { value: 0 }, uClipY: { value: -1000 }, uEdge: { value: new THREE.Color(edge) },
  };
  const copies = materials.map((material) => {
    const copy = material.clone();
    // Chunks are open shells, so their insides must be drawn too.
    if (doubleSided) copy.side = THREE.DoubleSide;
    patch(copy, material, uniforms);
    return copy;
  });
  return { uniforms, copies };
}

export function createDissolve(materials, { edge = 0xffa23a, doubleSided = true } = {}) {
  const key = [edge, doubleSided, ...materials.map((m) => m.uuid)].join();
  if (!spare.has(key)) spare.set(key, []);
  const set = spare.get(key).pop() || buildSet(materials, edge, doubleSided);
  const { uniforms, copies } = set;
  let released = false;
  return {
    materials: copies,
    set amount(value) { uniforms.uDissolve.value = value; },
    set glow(value) { uniforms.uGlow.value = value; },
    set clipY(value) { uniforms.uClipY.value = value; },
    // A plain fade, for people who prefer less motion.
    set opacity(value) {
      for (const copy of copies) {
        if (!copy.transparent) {
          copy.transparent = true;
          copy.needsUpdate = true;
        }
        copy.opacity = value;
      }
    },
    // Resets the set and puts it back for the next effect.
    release() {
      if (released) return;
      released = true;
      uniforms.uDissolve.value = 0;
      uniforms.uGlow.value = 0;
      uniforms.uClipY.value = -1000;
      copies.forEach((copy, i) => {
        copy.opacity = materials[i].opacity;
        if (copy.transparent !== materials[i].transparent) {
          copy.transparent = materials[i].transparent;
          copy.needsUpdate = true;
        }
      });
      spare.get(key).push(set);
    },
  };
}
