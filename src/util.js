import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ---------- DOM ----------
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(c));
  }
  return e;
}

export function btn(text, onClick, cls = '') {
  return el('button', { class: `btn ${cls}`, onclick: onClick, html: text });
}

export function toggle(text, checked, onChange) {
  const input = el('input', { type: 'checkbox' });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'toggle' }, input, el('span', { class: 'switch' }), el('span', {}, text));
}

export function slider(text, min, max, step, value, onInput, fmt = (v) => v) {
  const out = el('span', { class: 'slider-val' }, fmt(value));
  const input = el('input', { type: 'range', min, max, step, value });
  input.addEventListener('input', () => { out.textContent = fmt(+input.value); onInput(+input.value); });
  const wrap = el('div', { class: 'slider' }, el('div', { class: 'slider-head' }, el('span', {}, text), out), input);
  wrap.input = input;
  wrap.set = (v) => { input.value = v; out.textContent = fmt(+v); };
  return wrap;
}

export function section(title, ...children) {
  return el('div', { class: 'section' }, title ? el('h3', {}, title) : null, ...children);
}

// ---------- 3D 标签 ----------
export function label3D(html, cls = 'label', center = [0.5, 0.5]) {
  const div = el('div', { class: cls, html });
  const obj = new CSS2DObject(div);
  obj.center.set(center[0], center[1]);
  return obj;
}

// ---------- 动画 ----------
export const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

// 简易补间：每帧在 update 中调用 tweens.update(dt)
export class Tweens {
  constructor() { this.list = []; }
  add(duration, onUpdate, { easing = ease.inOut, onDone, delay = 0 } = {}) {
    const tw = { t: -delay, duration, onUpdate, easing, onDone };
    this.list.push(tw);
    return new Promise((res) => { tw.resolve = res; });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = Math.min(tw.t / tw.duration, 1);
      tw.onUpdate(tw.easing(k));
      if (k >= 1) {
        this.list.splice(i, 1);
        tw.onDone?.();
        tw.resolve();
      }
    }
  }
  get busy() { return this.list.length > 0; }
  clear() { this.list.length = 0; }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 材质 ----------
export const MAT = {
  gold: () => new THREE.MeshPhysicalMaterial({ color: 0xe9b65a, metalness: 1, roughness: 0.2, clearcoat: 0.4, clearcoatRoughness: 0.15 }),
  goldMatte: () => new THREE.MeshStandardMaterial({ color: 0xd9a24c, metalness: 1, roughness: 0.38 }),
  copper: () => new THREE.MeshStandardMaterial({ color: 0xd07a52, metalness: 1, roughness: 0.3 }),
  steel: () => new THREE.MeshStandardMaterial({ color: 0xbfc4cb, metalness: 1, roughness: 0.32 }),
  brushed: () => new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 1, roughness: 0.45 }),
  aluminum: () => new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.22 }),
  dark: () => new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.4, roughness: 0.6 }),
  g10: () => new THREE.MeshStandardMaterial({ color: 0xc9b98a, metalness: 0, roughness: 0.55 }),
};

// 让 InstancedMesh 的实例颜色同时作为自发光，便于泛光
export function glowByInstanceColor(material, k = 0.4) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
        totalEmissiveRadiance += vColor.rgb * ${k.toFixed(3)};
      #endif`
    );
  };
  material.customProgramCacheKey = () => `glow${k}`;
  return material;
}

// 发光小球材质（颜色值 > 1 会触发 bloom）
export function glowMat(hex, intensity = 3) {
  const c = new THREE.Color(hex).multiplyScalar(intensity);
  return new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
}

export function phaseColor(re, im, target = new THREE.Color()) {
  const ph = Math.atan2(im, re); // -π..π
  const h = ((ph / (2 * Math.PI)) + 1.0 + 0.5) % 1; // 正实数 → 青色(0.5)
  return target.setHSL(h, 0.95, 0.5);
}

// 布洛赫坐标 (x,y,z) → three.js 坐标（x 朝向观众，y 向右，z 向上）
export function blochToVec3(b, out = new THREE.Vector3()) {
  return out.set(b.y, b.z, b.x);
}

export function fmtSci(log10v, digits = 1) {
  if (log10v < 4) return Math.round(10 ** log10v).toLocaleString();
  const e = Math.floor(log10v);
  const m = 10 ** (log10v - e);
  return `${m.toFixed(digits)}×10<sup>${e}</sup>`;
}

// 秒（以 log10 表示）→ 人类可读时长
const p2 = (v) => (v >= 100 ? Math.round(v).toString() : v.toPrecision(2));

export function fmtDuration(log10s) {
  const s = 10 ** log10s;
  if (log10s < -6) return `${p2(s * 1e9)} 纳秒`;
  if (log10s < -3) return `${p2(s * 1e6)} 微秒`;
  if (s < 1) return `${p2(s * 1e3)} 毫秒`;
  if (s < 60) return `${p2(s)} 秒`;
  if (s < 3600) return `${p2(s / 60)} 分钟`;
  if (s < 86400) return `${p2(s / 3600)} 小时`;
  if (s < 86400 * 365) return `${p2(s / 86400)} 天`;
  const ly = log10s - Math.log10(3.156e7);
  if (ly < 4) return `${Math.round(10 ** ly).toLocaleString()} 年`;
  return `${fmtSci(ly)} 年`;
}
