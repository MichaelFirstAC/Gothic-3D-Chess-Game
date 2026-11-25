// The leaded windows, broken. Ragged holes are punched out of the painted glass;
// through them shows the same night as beyond the east window, which stays far
// away as the camera moves, and the edges of each break are given thickness.
import * as THREE from 'three';
import { lancetGlass, seededRandom } from './textures.js';
import { SKY_GLSL, moonUniform } from './nightSky.js';
import { addAbyssFog } from './abyssFog.js';

// Where glass is missing from a window `width` by `height`: one great break and
// a few small ones, each a ragged ring of [x, y] points.
export function breaks(seed, width = 256, height = 1024) {
  const random = seededRandom(seed * 313 + 11);
  const between = (min, max) => min + random() * (max - min);
  const ragged = (x, y, rx, ry, points) => Array.from({ length: points }, (_, i) => {
    const angle = ((i + between(-0.3, 0.3)) / points) * Math.PI * 2;
    // Every other point juts inward, leaving long teeth of glass.
    const reach = i % 2 ? between(0.35, 0.75) : between(0.8, 1.25);
    return [x + Math.cos(angle) * rx * reach, y + Math.sin(angle) * ry * reach];
  });
  const great = ragged(
    between(0.3, 0.7) * width, between(0.22, 0.78) * height,
    between(0.36, 0.62) * width, between(0.1, 0.2) * height, 22,
  );
  const small = Array.from({ length: 2 + Math.floor(random() * 3) }, () => ragged(
    between(0.1, 0.9) * width, between(0.08, 0.95) * height,
    between(0.08, 0.22) * width, between(0.02, 0.06) * height, 10,
  ));
  return [great, ...small];
}

// A lancet with its breaks cut out. Missing glass is marked by being clear.
export function brokenLancet(seed) {
  const texture = lancetGlass(seed);
  const ctx = texture.image.getContext('2d');
  const path = (ring) => {
    ctx.beginPath();
    ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  const random = seededRandom(seed + 99);
  for (const ring of breaks(seed)) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    path(ring);
    ctx.fill();
    ctx.restore();
    // The bent lead along the break, and strips of it left hanging into the gap.
    ctx.strokeStyle = '#060408';
    ctx.lineWidth = 5;
    path(ring);
    ctx.stroke();
    ctx.lineWidth = 3.5;
    for (let i = 0; i < ring.length; i += 5) {
      const [x, y] = ring[i];
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + (random() - 0.5) * 50, y + random() * 36, x + (random() - 0.5) * 70, y + (random() - 0.3) * 66);
      ctx.stroke();
    }
  }
  texture.needsUpdate = true;
  return texture;
}

const GLASS_COLOUR = /* glsl */ `
  {
    vec4 pane = texture2D(map, vMapUv);
    // A second look a little to one side finds the edges of the breaks.
    float beside = texture2D(map, vMapUv + vec2(0.022, 0.007)).a;
    if (pane.a < 0.5) {
      vec3 seen = normalize(vGlassAt - cameraPosition);
      vec3 night = withMoon(seen, nightSky(seen));
      // The thickness of what is left throws a shadow just inside the break.
      diffuseColor.rgb = night * (beside < 0.5 ? 1.0 : 0.3);
    } else {
      diffuseColor.rgb *= pane.rgb;
      // A broken edge catches the moon.
      if (beside < 0.5) diffuseColor.rgb += vec3(0.07, 0.1, 0.19);
    }
  }
`;

export function brokenGlassMaterial(map, tint) {
  const material = new THREE.MeshBasicMaterial({ map, color: tint, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMoonDir = moonUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlassAt;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_INSTANCING
          // Half the windows show their glass mirrored, so breaks do not recur.
          if (fract(dot(instanceMatrix[3].xyz, vec3(0.137, 0.531, 0.271))) > 0.5) vMapUv.x = 1.0 - vMapUv.x;
        #endif`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 glassAt = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            glassAt = instanceMatrix * glassAt;
          #endif
          vGlassAt = (modelMatrix * glassAt).xyz;
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uMoonDir;\nvarying vec3 vGlassAt;\n${SKY_GLSL}`)
      .replace('#include <map_fragment>', GLASS_COLOUR);
    addAbyssFog(shader);
  };
  material.customProgramCacheKey = () => 'broken-glass';
  return material;
}
