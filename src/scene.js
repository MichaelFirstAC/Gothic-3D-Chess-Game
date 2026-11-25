// The setting: marble board, carved frame, candle towers and lighting. The
// building around them is in cathedral.js.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { isKnightShift, knightArrowOutline } from './effects/arrowShape.js';
import { canvasTexture, marble } from './textures.js';
import { addCathedral } from './cathedral.js';
import { createQualityGovernor } from './quality.js';

export const squarePosition = (sq) => new THREE.Vector3((sq & 7) - 3.5, 0, 3.5 - (sq >> 3));

function addBoard(scene) {
  const textures = {
    light: marble('#a99d8a', '#4f4338', 7),
    dark: marble('#2b151b', '#9b6a63', 91),
  };
  const materials = Object.fromEntries(Object.entries(textures).map(([k, map]) => [
    k, new THREE.MeshStandardMaterial({ map, roughness: 0.34, metalness: 0.12 }),
  ]));
  for (let sq = 0; sq < 64; sq++) {
    const light = ((sq & 7) + (sq >> 3)) % 2 === 1;
    const geometry = new THREE.BoxGeometry(1, 0.2, 1);
    // Give every square its own cut of the marble slab.
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (uv.getX(i) + (sq & 7)) / 8, (uv.getY(i) + (sq >> 3)) / 8);
    }
    const tile = new THREE.Mesh(geometry, materials[light ? 'light' : 'dark']);
    tile.position.copy(squarePosition(sq)).setY(-0.1);
    tile.receiveShadow = true;
    tile.userData.square = sq;
    scene.add(tile);
  }

  const stone = new THREE.MeshStandardMaterial({ color: 0x1d1a20, roughness: 0.62, metalness: 0.25 });
  const gold = new THREE.MeshStandardMaterial({ color: 0x8d7038, roughness: 0.38, metalness: 0.95 });
  const slab = (size, height, y, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, height, size), material);
    mesh.position.y = y;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  // Frame rails sit around the squares; the plinth steps sit below them.
  for (let side = 0; side < 4; side++) {
    const rail = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(8.9, 0.24, 0.45), stone);
    beam.position.set(0.225, -0.09, 4.225);
    beam.receiveShadow = true;
    const inlay = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.025, 0.035), gold);
    inlay.position.set(0, 0.035, 4.035);
    rail.add(beam, inlay);
    rail.rotation.y = side * Math.PI / 2;
    scene.add(rail);
  }
  slab(9.15, 0.16, -0.29, gold);
  slab(9.5, 0.4, -0.55, stone);

  const label = (text) => {
    const map = canvasTexture(128, (ctx) => {
      ctx.fillStyle = '#c9ad6a';
      ctx.font = '600 86px "EB Garamond", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 64, 68);
    });
    return new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
    );
  };
  const labels = [];
  for (let i = 0; i < 8; i++) {
    for (const side of [1, -1]) {
      const file = label('abcdefgh'[i]);
      file.position.set(i - 3.5, 0.034, side * 4.25);
      const rank = label(String(i + 1));
      rank.position.set(-side * 4.25, 0.034, 3.5 - i);
      labels.push(file, rank);
    }
  }
  for (const mesh of labels) {
    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
  }
  // Keeps the coordinates upright for whichever side the camera is on.
  return (cameraZ) => {
    for (const mesh of labels) mesh.rotation.z = cameraZ < 0 ? Math.PI : 0;
  };
}

function addCandleTowers(scene) {
  const stone = new THREE.MeshLambertMaterial({ color: 0x3a342f, flatShading: true, reflectivity: 0 });
  const wax = new THREE.MeshStandardMaterial({ color: 0xcfc3a4, roughness: 0.7, emissive: 0x2a1c08 });
  const flame = new THREE.MeshBasicMaterial({ color: 0xffb547 });
  const flames = [];
  for (const x of [-5.7, 5.7]) {
    for (const z of [-5.7, 5.7]) {
      const tower = new THREE.Group();
      const part = (geometry, material, y, px = 0, pz = 0) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(px, y, pz);
        mesh.castShadow = material !== flame;
        tower.add(mesh);
        return mesh;
      };
      part(new THREE.CylinderGeometry(0.5, 0.58, 0.3, 8), stone, -0.65);
      part(new THREE.CylinderGeometry(0.2, 0.3, 1.5, 8), stone, 0.25);
      part(new THREE.CylinderGeometry(0.4, 0.22, 0.22, 8), stone, 1.1);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * Math.PI / 2;
        part(new THREE.ConeGeometry(0.07, 0.55, 4), stone, 1.46, Math.sin(a) * 0.32, Math.cos(a) * 0.32);
      }
      const candles = [[0, 0, 0.55], [0.17, 0.06, 0.34], [-0.1, -0.16, 0.42]];
      for (const [cx, cz, h] of candles) {
        part(new THREE.CylinderGeometry(0.055, 0.065, h, 10), wax, 1.2 + h / 2, cx, cz);
        const tip = part(new THREE.SphereGeometry(0.036, 10, 8), flame, 1.26 + h, cx, cz);
        tip.scale.y = 2.1;
        flames.push(tip);
      }
      const light = new THREE.PointLight(0xff8c2e, 9, 12, 1.8);
      light.position.set(0, 2.15, 0);
      tower.add(light);
      tower.position.set(x, 0, z);
      tower.userData.light = light;
      scene.add(tower);
      flames.push(tower);
    }
  }
  return (time) => {
    flames.forEach((object, i) => {
      const flicker = 1 + Math.sin(time * 9 + i * 1.7) * 0.07 + Math.sin(time * 23 + i * 4.1) * 0.05;
      if (object.userData.light) object.userData.light.intensity = 9 * flicker;
      else object.scale.set(1, 2.1 * flicker, 1);
    });
  };
}

// ?quality=high or ?quality=low fixes the level instead of measuring it.
function qualityOptions() {
  const wanted = new URLSearchParams(window.location.search).get('quality');
  if (wanted === 'high') return { level: 0, maxLevel: 0 };
  if (wanted === 'low') return { level: 3 };
  return {};
}

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07050b);
  scene.fog = new THREE.FogExp2(0x0a0710, 0.017);

  // Reflections for the pieces and the polished squares. The stone of the
  // setting is matte and takes none of it.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.34;

  scene.add(new THREE.HemisphereLight(0x8c93c4, 0x2a1810, 0.55));
  const moon = new THREE.DirectionalLight(0xcfd8ff, 1.85);
  moon.position.set(-6, 13, 4);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.02;
  scene.add(moon);
  // Colored rim light, as if through stained glass, to separate the black pieces.
  for (const [color, x, z] of [[0xb0304a, 9, -7], [0x4a52d0, -9, -7], [0x8040a0, 0, 10]]) {
    const rim = new THREE.DirectionalLight(color, 0.8);
    rim.position.set(x, 5, z);
    scene.add(rim);
  }
  // A soft lamp over the crossing keeps the board the brightest thing in view.
  const lamp = new THREE.SpotLight(0xffe6c4, 130, 40, 0.5, 0.7, 1.6);
  lamp.position.set(0, 17, 0);
  scene.add(lamp, lamp.target);

  const orientLabels = addBoard(scene);
  const flickerCandles = addCandleTowers(scene);
  const cathedral = addCathedral(scene);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 260);

  const quality = createQualityGovernor((level) => {
    const ratio = Math.min(window.devicePixelRatio, [2, 1.25, 1, 0.85][level]);
    renderer.setPixelRatio(ratio);
    const shadowSize = level === 0 ? 2048 : 1024;
    if (moon.shadow.mapSize.width !== shadowSize) {
      moon.shadow.mapSize.set(shadowSize, shadowSize);
      moon.shadow.map?.dispose();
      moon.shadow.map = null;
    }
    cathedral.setShafts(level < 2);
    moon.castShadow = level < 3;
  }, qualityOptions());

  // At low camera angles, shift the view upward like an architect's lens, so
  // the height of the nave shows and its verticals stay upright.
  let shift = 0;
  const raiseView = () => {
    const polar = Math.acos(THREE.MathUtils.clamp(camera.position.y / camera.position.length(), -1, 1));
    const next = THREE.MathUtils.smoothstep(polar, 0.9, 1.44) * 0.3;
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height || (Math.abs(next - shift) < 0.0005 && camera.view?.fullHeight === height)) return;
    shift = next;
    camera.setViewOffset(width, height, 0, -shift * height, width, height);
  };

  return {
    renderer, scene, camera, quality,
    update(time, elapsed) {
      quality.frame(elapsed);
      flickerCandles(time);
      orientLabels(camera.position.z);
      raiseView();
    },
  };
}

// A glowing arrow from one square to another, for the engine's preferred move.
export function createBestMoveArrow(scene) {
  const arrow = new THREE.Group();
  arrow.visible = false;
  scene.add(arrow);

  const material = (opacity) => new THREE.MeshBasicMaterial({
    color: 0x2fd391,
    opacity,
    transparent: true,
    toneMapped: false,
    depthWrite: false,
    // Drawn over the pieces, so a tall piece never hides where the arrow goes.
    depthTest: false,
    fog: false,
  });
  const core = material(0.88);
  const halo = material(0.28);

  // Outline pointing along +y, laid flat so that it points toward -z.
  const outline = (length, shaft, head, headLength) => {
    const shape = new THREE.Shape();
    shape.moveTo(-shaft, 0);
    shape.lineTo(-shaft, length - headLength);
    shape.lineTo(-head, length - headLength);
    shape.lineTo(0, length);
    shape.lineTo(head, length - headLength);
    shape.lineTo(shaft, length - headLength);
    shape.lineTo(shaft, 0);
    shape.closePath();
    return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  };

  // A knight's L, as a single outline so the layers never double up at the corner.
  const angled = (dx, dz, style) => {
    // Shape y becomes world -z once the shape is laid flat.
    const points = knightArrowOutline(dx, dz, style).map(([x, z]) => new THREE.Vector2(x, -z));
    return new THREE.ShapeGeometry(new THREE.Shape(points)).rotateX(-Math.PI / 2);
  };

  const add = (halfGlow, solid) => {
    for (const [geometry, look] of [[halfGlow, halo], [solid, core]]) {
      const mesh = new THREE.Mesh(geometry, look);
      mesh.renderOrder = 3;
      arrow.add(mesh);
    }
  };

  return {
    // move: { from, to } or null to hide.
    show(move) {
      for (const mesh of arrow.children) mesh.geometry.dispose();
      arrow.clear();
      arrow.visible = Boolean(move);
      if (!move) return;
      const from = squarePosition(move.from);
      const direction = squarePosition(move.to).sub(from);
      if (isKnightShift(move.from, move.to)) {
        const { x, z } = direction;
        add(
          angled(x, z, { start: 0.2, reach: 0.1, shaft: 0.13, head: 0.34, headLength: 0.5 }),
          angled(x, z, { start: 0.2, reach: 0.05, shaft: 0.065, head: 0.25, headLength: 0.4 }),
        );
        arrow.position.copy(from).setY(0.06);
        arrow.rotation.y = 0;
        return;
      }
      const length = direction.length() - 0.1;
      add(outline(length, 0.13, 0.34, 0.5), outline(length - 0.05, 0.065, 0.25, 0.4));
      arrow.position.copy(from).addScaledVector(direction.normalize(), 0.2).setY(0.06);
      arrow.rotation.y = Math.atan2(-direction.x, -direction.z);
    },
    pulse(time) {
      core.opacity = 0.82 + Math.sin(time * 3) * 0.1;
      halo.opacity = 0.26 + Math.sin(time * 3) * 0.1;
    },
  };
}

// Flat markers laid over squares for selection, legal moves, last move and check.
export function createHighlights(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const flat = (geometry, color, opacity) => {
    geometry.rotateX(-Math.PI / 2);
    return {
      geometry,
      material: new THREE.MeshBasicMaterial({ color, opacity, transparent: true, depthWrite: false }),
    };
  };
  const glow = canvasTexture(128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 66);
    g.addColorStop(0, 'rgba(255,30,30,1)');
    g.addColorStop(1, 'rgba(255,0,0,0.12)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  const styles = {
    selected: flat(new THREE.PlaneGeometry(0.96, 0.96), 0xffc14d, 0.5),
    last: flat(new THREE.PlaneGeometry(0.96, 0.96), 0x7d5cff, 0.3),
    hover: flat(new THREE.PlaneGeometry(0.96, 0.96), 0xffffff, 0.13),
    target: flat(new THREE.CircleGeometry(0.15, 32), 0x62f0b4, 0.8),
    capture: flat(new THREE.RingGeometry(0.4, 0.49, 40), 0xff5a4a, 0.95),
    check: flat(new THREE.PlaneGeometry(1, 1), 0xffffff, 0.9),
  };
  styles.check.material.map = glow;
  const heights = { last: 0.004, check: 0.006, selected: 0.008, hover: 0.01, target: 0.012, capture: 0.012 };

  return {
    // marks: [{ square, style }]
    show(marks) {
      group.clear();
      for (const { square, style } of marks) {
        const mesh = new THREE.Mesh(styles[style].geometry, styles[style].material);
        mesh.position.copy(squarePosition(square)).setY(heights[style]);
        mesh.renderOrder = 1;
        group.add(mesh);
      }
    },
    pulse(time) {
      styles.check.material.opacity = 0.7 + Math.sin(time * 5) * 0.25;
    },
  };
}
