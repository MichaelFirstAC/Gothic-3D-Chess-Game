// The night outside: sky, stars and moon. All of it depends only on the
// direction you look, so it stays immeasurably far away however the camera
// moves. The sky round the building and the holes in the windows share it.
import * as THREE from 'three';
import { MOON_DIR, MOON_SIZE } from './roseShape.js';

export const moonUniform = { value: new THREE.Vector3(MOON_DIR.x, MOON_DIR.y, MOON_DIR.z) };

// Needs `uniform vec3 uMoonDir`. nightSky() is the sky with its stars and the
// glow round the moon; withMoon() then lays the moon itself over a colour.
export const SKY_GLSL = /* glsl */ `
  float skyHash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.11, 0.27, 0.43));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float skyNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(skyHash(i), skyHash(i + vec3(1,0,0)), f.x), mix(skyHash(i + vec3(0,1,0)), skyHash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(skyHash(i + vec3(0,0,1)), skyHash(i + vec3(1,0,1)), f.x), mix(skyHash(i + vec3(0,1,1)), skyHash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }

  vec3 nightSky(vec3 view) {
    vec3 colour = mix(vec3(0.0045, 0.0075, 0.019), vec3(0.0012, 0.002, 0.0075), smoothstep(-0.1, 0.8, view.y));
    // A tight corona round the moon inside a wide soft glow.
    float toward = max(dot(view, uMoonDir), 0.0);
    colour += vec3(0.30, 0.40, 0.62) * pow(toward, 2400.0) * 0.5;
    colour += vec3(0.07, 0.12, 0.27) * pow(toward, 520.0) * 0.32;
    colour += vec3(0.02, 0.038, 0.1) * pow(toward, 70.0) * 0.24;
    // Many faint stars and very few bright, each a pin-point, drowned out
    // close to the moon.
    vec3 cell = view * 300.0;
    float chance = skyHash(floor(cell));
    if (chance > 0.978) {
      float rank = (chance - 0.978) / 0.022;
      float spot = 1.0 - smoothstep(0.04, 0.2 + 0.16 * rank, length(fract(cell) - 0.5));
      vec3 hue = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.9, 0.76), step(0.8, fract(chance * 977.0)));
      colour += hue * spot * (0.07 + 0.95 * rank * rank * rank) * (1.0 - pow(toward, 300.0));
    }
    return colour;
  }

  // A storybook moon: a clean disc, softly rounded, with a few broad pale seas.
  vec3 withMoon(vec3 view, vec3 colour) {
    if (dot(view, uMoonDir) < ${Math.cos(MOON_SIZE * 1.2).toFixed(7)}) return colour;
    vec3 right = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, uMoonDir);
    vec2 at = vec2(dot(view, right), dot(view, up)) / ${MOON_SIZE.toFixed(4)};
    float out_ = length(at);
    // Read as the face of a ball, for its seas and shading.
    vec3 ball = vec3(at, sqrt(max(0.0, 1.0 - out_ * out_)));
    float turned = dot(ball, vec3(-0.6, 0.35, 0.72));
    float light = 0.5 + 0.28 * smoothstep(-0.45, 0.15, turned) + 0.26 * smoothstep(0.2, 0.75, turned);
    float seas = smoothstep(0.5, 0.58, skyNoise(ball * 1.8 + 4.0) * 0.76 + skyNoise(ball * 3.7) * 0.24);
    vec3 moon = mix(vec3(0.86, 0.87, 0.84), vec3(0.55, 0.62, 0.76), seas * 0.8) * light;
    moon += vec3(0.2, 0.27, 0.46) * pow(1.0 - ball.z, 2.2);
    return mix(colour, moon, 1.0 - smoothstep(0.95, 1.04, out_));
  }
`;
