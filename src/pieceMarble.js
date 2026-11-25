// Turns a plain piece material into honed stone that belongs with the board:
// marble crowded with hair-thin veins, specks and small flaws, shade that gathers low down and under
// overhangs, and a faint edge of light that lifts each shape off the dark. The
// veins are worked out from the piece's own coordinates, so they stay with it
// as it moves.
import * as THREE from 'three';

const VERTEX_HEAD = /* glsl */ `
  // Fragments of a broken piece say where they were cut from; whole pieces have
  // no such attribute and read zero.
  attribute vec3 cutFrom;
  varying vec3 vStoneAt;
  varying float vStoneUp;
`;

const VERTEX_BODY = /* glsl */ `
  vStoneAt = position + cutFrom;
  vStoneUp = normalize(mat3(modelMatrix) * objectNormal).y;
`;

const FRAGMENT_HEAD = /* glsl */ `
  uniform vec3 uCloud;
  uniform vec3 uVein;
  uniform vec3 uGilt;
  uniform vec3 uRim;
  uniform float uVeinStrength;
  varying vec3 vStoneAt;
  varying float vStoneUp;

  float pieceHash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float pieceNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(pieceHash(i), pieceHash(i + vec3(1, 0, 0)), f.x), mix(pieceHash(i + vec3(0, 1, 0)), pieceHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(pieceHash(i + vec3(0, 0, 1)), pieceHash(i + vec3(1, 0, 1)), f.x), mix(pieceHash(i + vec3(0, 1, 1)), pieceHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  // A thin line wherever the noise passes through its middle.
  float pieceVein(float n, float width) {
    return 1.0 - smoothstep(0.0, width, abs(n - 0.5));
  }
`;

const FRAGMENT_COLOUR = /* glsl */ `
  // How worn the surface is here, used again for its polish.
  float pieceFlaw = 0.0;
  {
    vec3 p = vStoneAt;
    float warp = pieceNoise(p * 9.0);
    float clouds = pieceNoise(p * 6.5 + 7.3) * 0.6 + pieceNoise(p * 19.0) * 0.4;
    diffuseColor.rgb = mix(diffuseColor.rgb, uCloud, smoothstep(0.36, 0.76, clouds) * 0.75);
    // Veins run on a slant, crowded and hair thin.
    vec3 slant = vec3(p.x + p.y * 0.55, p.y * 0.5 - p.x * 0.2, p.z + p.y * 0.3) + warp * 0.2;
    // Detail finer than a pixel is faded out, so that it cannot sparkle.
    float pixel = length(fwidth(p));
    float near = 1.0 - smoothstep(0.012, 0.03, pixel);
    float close = 1.0 - smoothstep(0.006, 0.017, pixel);
    // Each vein comes and goes along its length.
    float broken = smoothstep(0.34, 0.62, pieceNoise(p * 7.7 + 2.0));
    float veins = pieceVein(pieceNoise(slant * 14.0), 0.026) * (0.35 + 0.65 * broken)
      + pieceVein(pieceNoise(slant * 27.0 + 3.1), 0.03) * 0.7 * near * broken;
    float hairs = pieceVein(pieceNoise(vec3(slant.z, slant.x, -slant.y) * 46.0 + 8.4), 0.03) * close;
    float flaws = clamp(veins + hairs * 0.55, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, uVein, flaws * uVeinStrength);
    // Specks and little pits.
    float speck = smoothstep(0.76, 0.86, pieceNoise(p * 58.0 + 4.0)) * near;
    diffuseColor.rgb = mix(diffuseColor.rgb, uVein, speck * uVeinStrength * 0.9);
    float gilt = pieceVein(pieceNoise(slant * 10.0 + 11.7), 0.012) * smoothstep(0.55, 0.75, warp);
    diffuseColor.rgb = mix(diffuseColor.rgb, uGilt, gilt * 0.7);
    // A little grain over everything.
    float grain = pieceNoise(p * 90.0) - 0.5;
    diffuseColor.rgb *= 1.0 + grain * 0.16 * near;
    pieceFlaw = clamp(flaws * 0.6 + speck + (clouds - 0.5) * 0.6, 0.0, 1.0);
  }
`;

const FRAGMENT_LIGHT = /* glsl */ `
  {
    // Less light reaches the foot of a piece and the undersides of its ledges.
    float low = mix(0.5, 1.0, smoothstep(0.0, 0.42, vStoneAt.y));
    float under = mix(0.55, 1.0, smoothstep(-0.8, 0.45, vStoneUp));
    float shade = low * under;
    reflectedLight.directDiffuse *= shade;
    reflectedLight.indirectDiffuse *= shade;
    reflectedLight.indirectSpecular *= mix(0.6, 1.0, shade);
    // Light catching the edges that turn away from the eye.
    float edge = pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 3.0);
    totalEmissiveRadiance += uRim * edge * (0.45 + 0.55 * low);
  }
`;

export function marbleFinish(material, { cloud, vein, gilt, rim, veinStrength }) {
  const uniforms = {
    uCloud: { value: new THREE.Color(cloud) },
    uVein: { value: new THREE.Color(vein) },
    uGilt: { value: new THREE.Color(gilt) },
    uRim: { value: new THREE.Color(rim) },
    uVeinStrength: { value: veinStrength },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_COLOUR}`)
      // Duller where it is flawed, as honed stone is.
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + pieceFlaw * 0.2, 0.0, 1.0);`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${FRAGMENT_LIGHT}`);
  };
  material.customProgramCacheKey = () => 'piece-marble';
  return material;
}
