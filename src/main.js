import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { Tweens, ease, el } from './util.js';
import HardwareScene from './scenes/hardware.js';
import ChipScene from './scenes/chip.js';
import SuperpositionScene from './scenes/superposition.js';
import EntanglementScene from './scenes/entanglement.js';
import StateSpaceScene from './scenes/statespace.js';
import GroverScene from './scenes/grover.js';
import WhyFastScene from './scenes/whyfast.js';

// ---------- 渲染器 ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });
labelRenderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envMap;
scene.environmentIntensity = 0.9;

// 径向渐变背景
{
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(256, 210, 20, 256, 256, 380);
  grd.addColorStop(0, '#16233d');
  grd.addColorStop(0.45, '#0a1222');
  grd.addColorStop(1, '#03050a');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}

// 漂浮的微尘，增加空间感
{
  const n = 1400;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 18 + Math.random() * 50;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph) * 0.6;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x7fb4ff, size: 0.09, transparent: true, opacity: 0.55, depthWrite: false }));
  dust.name = 'dust';
  scene.add(dust);
}

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 400);
camera.position.set(12, 4, 22);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.7;
// 标签层在画布上方，让鼠标事件穿透到画布
labelRenderer.domElement.style.pointerEvents = 'none';

// ---------- 后期：泛光 ----------
const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.45, 1.15);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- 应用上下文 ----------
const tweens = new Tweens();
const app = {
  THREE, renderer, scene, camera, controls, envMap, tweens, bloom,
  flyTo(pos, target, duration = 1.6) {
    const p0 = camera.position.clone();
    const t0 = controls.target.clone();
    const p1 = new THREE.Vector3(...pos);
    const t1 = new THREE.Vector3(...target);
    return tweens.add(duration, (k) => {
      camera.position.lerpVectors(p0, p1, k);
      controls.target.lerpVectors(t0, t1, k);
    }, { easing: ease.inOut });
  },
};

const sceneClasses = [HardwareScene, ChipScene, SuperpositionScene, EntanglementScene, StateSpaceScene, GroverScene, WhyFastScene];
const instances = new Array(sceneClasses.length).fill(null);
let current = -1;

const tabs = document.getElementById('tabs');
const panel = document.getElementById('panel');
sceneClasses.forEach((C, i) => {
  tabs.append(el('button', { class: 'tab', onclick: () => go(i) }, el('span', { class: 'num' }, String(i + 1)), C.title));
});

function get(i) {
  if (!instances[i]) {
    const inst = new sceneClasses[i](app);
    inst.group.visible = false;
    scene.add(inst.group);
    instances[i] = inst;
  }
  return instances[i];
}

function go(i) {
  if (i === current || i < 0 || i >= sceneClasses.length) return;
  const prev = current >= 0 ? instances[current] : null;
  if (prev) { prev.exit?.(); prev.group.visible = false; }
  current = i;
  const s = get(i);
  s.group.visible = true;
  [...tabs.children].forEach((t, k) => t.classList.toggle('active', k === i));
  panel.replaceChildren(s.panel);
  panel.scrollTop = 0;
  const v = s.view;
  controls.minDistance = v.min ?? 1;
  controls.maxDistance = v.max ?? 80;
  bloom.strength = v.bloom ?? 0.55;
  if (prev) app.flyTo(v.pos, v.target, 1.5);
  else { camera.position.set(...v.pos); controls.target.set(...v.target); }
  s.enter?.();
  history.replaceState(null, '', `#${sceneClasses[i].id}`);
}

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = parseInt(e.key, 10);
  if (k >= 1 && k <= sceneClasses.length) go(k - 1);
});

// 侧边面板占据左侧，把画面中心向右平移，让模型落在可见区域中央
function applyViewOffset() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  if (w > 900) camera.setViewOffset(w, h, -198, 0, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
applyViewOffset();

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  if (!w || !h) return;
  applyViewOffset();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  labelRenderer.setSize(w, h);
});

// ---------- 主循环 ----------
let last = performance.now();
const dust = scene.getObjectByName('dust');
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const t = now / 1000;
  tweens.update(dt);
  controls.update();
  dust.rotation.y += dt * 0.01;
  const s = instances[current];
  s?.update?.(dt, t);
  // 窗口尺寸为 0（如被隐藏的面板）时跳过渲染，避免帧缓冲为空
  if (window.innerWidth > 0 && window.innerHeight > 0) {
    composer.render();
    labelRenderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

const start = Math.max(0, sceneClasses.findIndex((C) => `#${C.id}` === location.hash));
go(start);
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});
setTimeout(() => document.getElementById('loading').classList.add('hide'), 60);

// 方便调试
window.__app = { app, go, instances };
