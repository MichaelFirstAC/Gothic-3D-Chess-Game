// The sky all round the ruined building: stars, the moon, and dark cloud
// drifting among them, which keeps clear of the moon. It is judged by the direction you look, so it stays at
// an immense distance. Below the horizon it dies into the black of the chasm.
import * as THREE from 'three';
import { noiseTexture } from './textures.js';
import { SKY_GLSL, moonUniform } from './nightSky.js';
import { MOON_SIZE } from './roseShape.js';

export function createSkyDome() {
  const time = { value: 0 };
  const material = new THREE.ShaderMaterial({
    uniforms: { uMoonDir: moonUniform, uTime: time, uNoise: { value: noiseTexture(97) } },
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uMoonDir;
      uniform sampler2D uNoise;
      uniform float uTime;
      varying vec3 vWorld;
      ${SKY_GLSL}
      void main() {
        vec3 view = normalize(vWorld - cameraPosition);
        // A little brighter than through a window, with a faint glow low down, so
        // that the ruins stand out against it and dark cloud has something to cross.
        vec3 colour = nightSky(view) * 1.5
          + vec3(0.007, 0.012, 0.03) * (1.0 - smoothstep(0.0, 0.75, view.y));

        // Cloud on a ceiling high above: it crowds together toward the horizon.
        vec2 ceiling = view.xz / (max(view.y, -0.05) + 0.32);
        vec2 stir = texture2D(uNoise, ceiling * 0.21 + vec2(uTime * 0.0042, 0.0)).rg - 0.5;
        float heavy = texture2D(uNoise, ceiling * 0.12 + stir * 0.2 + vec2(uTime * 0.0021, uTime * 0.0008)).r;
        float torn = texture2D(uNoise, ceiling * 0.47 + stir * 0.42 - vec2(uTime * 0.0061, 0.0)).b;
        float mass = heavy * 0.64 + torn * 0.36;
        float density = smoothstep(0.43, 0.6, mass);
        // Strongest just where a cloud begins.
        float fringe = smoothstep(0.4, 0.49, mass) * (1.0 - smoothstep(0.49, 0.6, mass));
        float toward = max(dot(view, uMoonDir), 0.0);
        // No cloud drifts across the face of the moon.
        float clear_ = smoothstep(${(MOON_SIZE * 1.3).toFixed(4)}, ${(MOON_SIZE * 3.4).toFixed(4)}, acos(min(toward, 1.0)));
        density *= clear_;
        fringe *= clear_;
        // Dark bellies, with a silver edge where thin cloud nears the moon.
        vec3 cloud = vec3(0.0014, 0.0019, 0.0048)
          + vec3(0.02, 0.03, 0.068) * pow(toward, 6.0)
          + vec3(0.2, 0.26, 0.42) * pow(toward, 60.0) * (1.0 - density);
        colour = mix(colour, cloud, density * 0.94);
        colour += (vec3(0.013, 0.019, 0.042) + vec3(0.07, 0.095, 0.18) * pow(toward, 8.0)) * fringe;
        // Thin high cloud lit faintly, to give the dark ones something to cross.
        colour += vec3(0.008, 0.012, 0.025) * smoothstep(0.35, 0.8, torn) * (1.0 - density) * clear_;
        colour = withMoon(view, colour);

        colour *= smoothstep(-0.3, 0.12, view.y);
        gl_FragColor = vec4(colour, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(190, 32, 20), material);
  mesh.frustumCulled = false;
  // After the building, so that only the sky that shows is ever shaded.
  mesh.renderOrder = 2;
  return { mesh, update(seconds) { time.value = seconds; } };
}
