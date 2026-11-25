// The fires of the cathedral: iron torch brackets, caged lanterns and hanging
// fire bowls. All the ironwork is one mesh, all the flames are one draw and so
// are their halos, so any number of lamps costs about the same as a few.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lampPlan } from './lampPlan.js';
import { flameShader } from './effects/flame.js';

const IRON = new THREE.Color(0x2a2522);
const WOOD = new THREE.Color(0x4a2c17);
// Metal and wood warmed by their own fire.
const HOT = new THREE.Color(0x6a3a1a);

function painted(geometry, colour) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.deleteAttribute('uv');
  const colours = new Float32Array(flat.attributes.position.count * 3);
  for (let i = 0; i < colours.length; i += 3) colours.set([colour.r, colour.g, colour.b], i);
  flat.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return flat;
}

// A straight bar from one point to another.
function bar(from, to, radius, colour = IRON, sides = 5, topRadius = radius) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const geometry = new THREE.CylinderGeometry(topRadius, radius, a.distanceTo(b), sides);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return painted(geometry, colour);
}

const hoop = (radius, tube, y, colour = IRON, z = 0) => painted(
  new THREE.TorusGeometry(radius, tube, 4, 12).rotateX(Math.PI / 2).translate(0, y, z), colour,
);

// Links from `bottom` up to `top`, each turned a quarter from the last.
function chain(bottom, top) {
  const a = new THREE.Vector3(...bottom);
  const b = new THREE.Vector3(...top);
  const count = Math.max(2, Math.round(a.distanceTo(b) / 0.24));
  const lean = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return Array.from({ length: count }, (_, i) => {
    const link = new THREE.TorusGeometry(0.1, 0.026, 4, 8).scale(1, 1.55, 1);
    if (i % 2) link.rotateY(Math.PI / 2);
    const at = a.clone().lerp(b, (i + 0.5) / count);
    return painted(link.applyQuaternion(lean).translate(at.x, at.y, at.z), IRON);
  });
}

// Each kind is built with its flame at the origin, facing +z.
const BUILD = {
  // A torch leaning out from a plate on the stone, which is 0.65 behind it.
  torch: () => [
    painted(new THREE.BoxGeometry(0.42, 1.05, 0.12).translate(0, -1.15, -0.66), IRON),
    bar([0, -0.85, -0.65], [0, -0.78, -0.13], 0.055),
    bar([0, -1.55, -0.65], [0, -0.9, -0.16], 0.04),
    // The wooden haft, bound with iron, and the basket that holds the pitch.
    bar([0, -1.65, -0.42], [0, -0.36, -0.03], 0.075, WOOD, 7, 0.115),
    hoop(0.13, 0.03, -0.8, IRON, -0.15),
    painted(new THREE.CylinderGeometry(0.27, 0.13, 0.34, 8, 1, true).translate(0, -0.22, 0), HOT),
    hoop(0.28, 0.035, -0.06, HOT),
    ...[0, 1, 2, 3, 4, 5].map((i) => {
      const a = (i / 6) * Math.PI * 2;
      return bar([Math.sin(a) * 0.27, -0.08, Math.cos(a) * 0.27], [Math.sin(a) * 0.34, 0.2, Math.cos(a) * 0.34], 0.022, HOT, 4, 0.008);
    }),
  ],
  // A six-sided cage under a pointed iron roof.
  lantern: ({ hangs }) => {
    const corners = [0, 1, 2, 3, 4, 5].map((i) => {
      const a = (i / 6) * Math.PI * 2;
      return [Math.sin(a) * 0.46, Math.cos(a) * 0.46];
    });
    return [
      painted(new THREE.CylinderGeometry(0.5, 0.36, 0.16, 6).translate(0, -0.5, 0), IRON),
      painted(new THREE.ConeGeometry(0.2, 0.34, 6).rotateX(Math.PI).translate(0, -0.74, 0), IRON),
      ...corners.map(([x, z]) => bar([x, -0.46, z], [x, 0.72, z], 0.035)),
      hoop(0.47, 0.04, -0.4),
      hoop(0.47, 0.03, 0.18),
      hoop(0.47, 0.045, 0.72),
      painted(new THREE.ConeGeometry(0.64, 0.55, 6).translate(0, 1.0, 0), IRON),
      ...chain([0, 1.3, 0], [0, 1.3 + hangs, 0]),
    ];
  },
  // A wide bowl slung from three chains that meet at a bracket from the pillar.
  brazier: ({ hangs }) => {
    const bowl = new THREE.LatheGeometry(
      [[0.12, -0.72], [0.5, -0.62], [0.82, -0.36], [0.93, -0.1], [1.02, -0.06], [0.93, -0.02]]
        .map(([r, y]) => new THREE.Vector2(r, y)), 14,
    );
    return [
      painted(bowl, HOT),
      painted(new THREE.ConeGeometry(0.17, 0.4, 6).rotateX(Math.PI).translate(0, -0.9, 0), IRON),
      hoop(0.99, 0.055, -0.07, HOT),
      ...[0, 1, 2].flatMap((i) => {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        return chain([Math.sin(a) * 0.95, -0.05, Math.cos(a) * 0.95], [0, hangs, 0]);
      }),
      // The arm reaching back to the stone.
      bar([0, hangs, 0], [0, hangs + 0.1, -1.95], 0.09),
      bar([0, hangs - 1.1, -1.9], [0, hangs + 0.02, -0.5], 0.06),
    ];
  },
};

// How large each kind's flame is, beside a candle's.
const FIRE = { torch: 5.2, lantern: 4.1, brazier: 8.5 };

export function lampGeometry(lamps = lampPlan()) {
  return mergeGeometries(lamps.flatMap((lamp) => BUILD[lamp.kind](lamp).map((part) => part
    .rotateY(lamp.facing)
    .translate(...lamp.at))));
}

// One quad, drawn once for every flame, always turned to the camera.
function billboards(lamps, material, scaleOf) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.attributes.position);
  geometry.setAttribute('uv', quad.attributes.uv);
  geometry.setAttribute('at', new THREE.InstancedBufferAttribute(new Float32Array(lamps.flatMap((l) => l.at)), 3));
  geometry.setAttribute('size', new THREE.InstancedBufferAttribute(new Float32Array(lamps.map(scaleOf)), 1));
  geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(new Float32Array(lamps.map((_, i) => (i * 7.31) % 19)), 1));
  geometry.instanceCount = lamps.length;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

// How brightly a fire burns at a moment, the same for its flame and halo.
const FLICKER = /* glsl */ `
  float burn(float t, float s) {
    return 1.0 + sin(t * 6.7 + s * 2.1) * 0.08 + sin(t * 13.3 + s * 5.7) * 0.05 + sin(t * 2.3 + s) * 0.06;
  }
`;

function flames(lamps, time) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: time },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    vertexShader: /* glsl */ `
      attribute vec3 at;
      attribute float size;
      attribute float seed;
      uniform float uTime;
      varying vec2 vUv;
      varying float vTime;
      varying float vSeed;
      varying float vStrength;
      ${FLICKER}
      void main() {
        vUv = uv;
        vSeed = seed * 13.7;
        vTime = uTime + seed * 7.0;
        vStrength = burn(uTime, seed);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 eyeUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 up = normalize(mix(vec3(0.0, 1.0, 0.0), eyeUp, 0.5));
        // The quad is a candle flame's, drawn larger; its foot sits in the fire.
        vec3 world = at + right * position.x * 0.17 * size
          + up * (position.y + 0.34) * 0.34 * size * (0.8 + 0.2 * vStrength)
          + right * sin(uTime * 3.1 + seed) * 0.03 * size * uv.y * uv.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`,
    // The candle flame's shading, with each flame's numbers passed along.
    fragmentShader: `
      varying float vTime;
      varying float vSeed;
      varying float vStrength;
      ${flameShader.replace(/uniform float u(Time|Seed|Strength);/g, '').replace(/\bu(Time|Seed|Strength)\b/g, 'v$1')}`,
  });
  const mesh = billboards(lamps, material, (lamp) => FIRE[lamp.kind]);
  mesh.renderOrder = 4;
  return mesh;
}

function halos(lamps, time) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: time },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    vertexShader: /* glsl */ `
      attribute vec3 at;
      attribute float size;
      attribute float seed;
      uniform float uTime;
      varying vec2 vUv;
      varying float vGlow;
      ${FLICKER}
      void main() {
        vUv = uv;
        vGlow = burn(uTime, seed);
        vec4 view = viewMatrix * vec4(at, 1.0);
        view.xy += position.xy * size * (0.86 + 0.14 * vGlow);
        // Drawn a little nearer, so the stone behind does not slice it in half.
        view.z += min(1.2, -view.z * 0.05);
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying float vGlow;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float soft = max(0.0, 1.0 - d);
        vec3 colour = vec3(1.0, 0.42, 0.1) * (soft * soft * soft * 0.5 + soft * soft * 0.1);
        gl_FragColor = vec4(colour * vGlow, 1.0);
      }`,
  });
  const mesh = billboards(lamps, material, (lamp) => FIRE[lamp.kind] * 0.78);
  mesh.renderOrder = 3;
  return mesh;
}

export function createLamps() {
  const lamps = lampPlan();
  const time = { value: 0 };
  const group = new THREE.Group();
  const iron = new THREE.Mesh(
    lampGeometry(lamps),
    new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.62, metalness: 0.55,
      // A touch of their own firelight keeps the ironwork from going black.
      emissive: 0x1a0b03,
    }),
  );
  group.add(iron, halos(lamps, time), flames(lamps, time));
  return { group, update(seconds) { time.value = seconds; } };
}
