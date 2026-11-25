// The dark below the board. Fog by height: it thickens the deeper a point lies
// and ends in pure black, so nothing in the chasm ever shows a bottom.

// No fog at or above this height, which covers the board, the stands and graves.
const TOP = -1.5;
const number = (v) => v.toFixed(4);

// Adds the fog to a shader being compiled. `density` sets how fast the light
// dies; everything is black by `floor`. Both are world heights.
export function addAbyssFog(shader, { density = 0.125, floor = -42 } = {}) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vAbyssY;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 abyssAt = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          abyssAt = instanceMatrix * abyssAt;
        #endif
        vAbyssY = (modelMatrix * abyssAt).y;
      }`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vAbyssY;')
    // After the distance fog, so depth darkens whatever that leaves. Scaling
    // toward black also suits light that is added on top of the scene.
    .replace('#include <fog_fragment>', `#include <fog_fragment>
      {
        float deep = 1.0 - exp(-max(0.0, ${number(TOP)} - vAbyssY) * ${number(density)});
        deep = max(deep, smoothstep(${number(floor * 0.55)}, ${number(floor)}, vAbyssY));
        gl_FragColor.rgb *= 1.0 - deep;
      }`);
}

// Gives an ordinary material the fog. Materials with the same settings share a
// shader.
export function withAbyss(material, options = {}) {
  material.onBeforeCompile = (shader) => addAbyssFog(shader, options);
  material.customProgramCacheKey = () => `abyss ${JSON.stringify(options)}`;
  return material;
}
