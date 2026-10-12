import * as THREE from 'three';
import { el, btn, section, slider, label3D, blochToVec3, glowMat } from '../util.js';
import { BlochSphere } from '../blochSphere.js';
import { QState, GATES, rx, ry } from '../quantum.js';

// 每个门在布洛赫球上等价于一次旋转（布洛赫坐标中的轴与角度）
const S2 = Math.SQRT1_2;
const GATE_ROT = {
  X: { axis: [1, 0, 0], angle: Math.PI, m: GATES.X },
  Y: { axis: [0, 1, 0], angle: Math.PI, m: GATES.Y },
  Z: { axis: [0, 0, 1], angle: Math.PI, m: GATES.Z },
  H: { axis: [S2, 0, S2], angle: Math.PI, m: GATES.H },
  S: { axis: [0, 0, 1], angle: Math.PI / 2, m: GATES.S },
  T: { axis: [0, 0, 1], angle: Math.PI / 4, m: GATES.T },
  'Rx(π/8)': { axis: [1, 0, 0], angle: Math.PI / 8, m: rx(Math.PI / 8) },
  'Ry(π/8)': { axis: [0, 1, 0], angle: Math.PI / 8, m: ry(Math.PI / 8) },
};
const GATE_DESC = {
  X: '量子“非门”：绕 x 轴转 180°，|0⟩ ↔ |1⟩。',
  Y: '绕 y 轴转 180°。',
  Z: '绕 z 轴转 180°：不改变 0/1 的概率，只翻转相对相位（|+⟩ ↔ |−⟩）。',
  H: '阿达马门：绕 (x+z) 轴转 180°，把 |0⟩ 变成等概率叠加 |+⟩ = (|0⟩+|1⟩)/√2。',
  S: '绕 z 轴转 90°：相位门。',
  T: '绕 z 轴转 45°：π/8 门。',
  'Rx(π/8)': '绕 x 轴转一个小角度——量子门可以是任意连续的角度。',
  'Ry(π/8)': '绕 y 轴转一个小角度。',
};

export default class SuperpositionScene {
  static id = 'superposition';
  static title = '叠加态';

  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.view = { pos: [2.8, 2.6, 12.5], target: [0.2, -0.2, 0], min: 4, max: 30, bloom: 0.7 };
    this.state = new QState(1);
    this.queue = [];
    this.anim = null;
    this.counts = [0, 0];
    this.build();
    this.buildPanel();
    this.refresh();
  }

  build() {
    const g = this.group;
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(5, 8, 6);
    g.add(key, new THREE.AmbientLight(0x8fb4ff, 0.4));

    this.bloch = new BlochSphere({ radius: 2.4 });
    g.add(this.bloch.group);

    // 左侧：经典比特
    const cb = new THREE.Group();
    cb.position.set(-4.8, 0, 0);
    const track = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 16), new THREE.MeshStandardMaterial({ color: 0x3b4a66, metalness: 0.6, roughness: 0.4 }));
    cb.add(track);
    for (const s of [1, -1]) {
      const slot = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 48), new THREE.MeshBasicMaterial({ color: 0x5a6c8c }));
      slot.position.y = s * 1.6;
      cb.add(slot);
      const lb = label3D(s > 0 ? '0' : '1', 'ket');
      lb.position.set(0.65, s * 1.6, 0);
      cb.add(lb);
    }
    this.cbBall = new THREE.Mesh(new THREE.SphereGeometry(0.24, 32, 24), glowMat(0xf3c46b, 1.4));
    this.cbBall.position.y = 1.6;
    cb.add(this.cbBall);
    const t1 = label3D('经典比特<br><span style="font-size:11px;color:#8a9ab3">只能处于两点之一</span>', 'big-tag', [0.5, 0]);
    t1.element.style.textAlign = 'center';
    t1.position.set(0, -2.2, 0);
    cb.add(t1);
    g.add(cb);
    this.cbY = 1.6;

    const t2 = label3D('量子比特<br><span style="font-size:11px;color:#8a9ab3">可以是球面上任意一点</span>', 'big-tag', [0.5, 0]);
    t2.element.style.textAlign = 'center';
    t2.position.set(0, -3.1, 0);
    g.add(t2);

    // 右侧：测量统计直方图
    const hist = new THREE.Group();
    hist.position.set(4.7, -1.6, 0);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 1.0), new THREE.MeshStandardMaterial({ color: 0x1b2638, metalness: 0.5, roughness: 0.5 }));
    hist.add(base);
    this.bars = [0, 1].map((k) => {
      const mat = new THREE.MeshStandardMaterial({ color: k ? 0xb5582a : 0x2f9aa0, emissive: k ? 0xff8a4c : 0x5ce1e6, emissiveIntensity: 0.12, metalness: 0.2, roughness: 0.5, envMapIntensity: 0.4 });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1, 0.62).translate(0, 0.5, 0), mat);
      bar.position.set(k ? 0.5 : -0.5, 0.03, 0);
      bar.scale.y = 0.001;
      bar.visible = false;
      hist.add(bar);
      const lb = label3D(`|${k}⟩`, 'ket small', [0.5, 0]);
      lb.position.set(k ? 0.5 : -0.5, -0.12, 0.6);
      hist.add(lb);
      const v = label3D('0', 'axis-tag', [0.5, 1]);
      v.position.set(k ? 0.5 : -0.5, 0.2, 0);
      hist.add(v);
      return { bar, v, h: 0.001 };
    });
    const ht = label3D('测量统计', 'big-tag', [0.5, 0]);
    ht.position.set(0, -0.9, 0);
    hist.add(ht);
    g.add(hist);

    // 测量闪光
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(2.45, 48, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(2), transparent: true, opacity: 0, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide }));
    g.add(this.flash);
  }

  buildPanel() {
    this.formula = el('div', { class: 'formula' });
    this.p0 = el('div');
    this.p1 = el('div');
    this.gateInfo = el('div', { class: 'info-card', html: '点一个门试试。先按 <b>H</b>：箭头从北极转到赤道，量子比特进入 0 和 1 的<b>叠加态</b>。' });
    this.measureInfo = el('div', { class: 'info-card', html: '“测量”会让叠加态<b>随机坍缩</b>成 0 或 1，概率由振幅决定。' });

    this.thetaS = slider('θ（极角）', 0, 180, 1, 0, () => this.fromSliders(), (v) => `${v}°`);
    this.phiS = slider('φ（相位）', 0, 359, 1, 0, () => this.fromSliders(), (v) => `${v}°`);

    const gateBtns = Object.keys(GATE_ROT).map((n) => btn(n, () => this.applyGate(n), 'gate small'));

    this.panel = el('div', {},
      el('div', { class: 'kicker' }, 'Chapter 3 · Superposition'),
      el('h2', {}, '叠加：既是 0 又是 1'),
      el('p', { class: 'lead', html: '经典比特只能是 0 或 1，就像左边只能停在两端的小球。量子比特的状态是<b>布洛赫球面上的任意一点</b>：北极是 |0⟩，南极是 |1⟩，其余位置都是两者的<span class="hl">叠加</span>。' }),
      section('当前量子态',
        this.formula,
        el('div', { class: 'prob-bars' }, this.p0, this.p1),
      ),
      section('施加量子门（= 在球面上旋转）',
        el('div', { class: 'btn-row' }, ...gateBtns),
        el('div', { class: 'btn-row', style: 'margin-top:8px' }, btn('重置为 |0⟩', () => this.reset(), 'warn small'), btn('清除轨迹', () => this.bloch.clearTrail(), 'small')),
        this.gateInfo,
      ),
      section('直接设定状态',
        this.thetaS, this.phiS,
        el('div', { class: 'formula', html: '|ψ⟩ = cos(θ/2)|0⟩ + e<sup>iφ</sup> sin(θ/2)|1⟩' }),
      ),
      section('测量',
        el('div', { class: 'btn-row' },
          btn('测量一次', () => this.measure(), 'primary'),
          btn('制备并测量 100 次', () => this.measureMany(100)),
          btn('清空统计', () => { this.counts = [0, 0]; this.updateHist(); }, 'small'),
        ),
        this.measureInfo,
      ),
      section('这为什么重要？',
        el('p', { html: '一个量子比特需要<b>两个复数</b>（α、β）才能描述；<b>n</b> 个量子比特则需要 <b>2<sup>n</sup></b> 个复数。量子门一次操作，就同时作用在所有这些振幅上。' }),
        el('div', { class: 'callout', html: '但要注意：测量只能得到<b>一个</b>随机结果。叠加本身并不能直接“读出”所有答案——如何利用它，要靠后面讲的<b>干涉</b>。' }),
      ),
    );
  }

  reset() {
    this.queue.length = 0;
    this.anim = null;
    this.state.reset();
    this.bloch.clearTrail();
    this.refresh(true);
  }

  fromSliders() {
    const th = (this.thetaS.input.value * Math.PI) / 180;
    const ph = (this.phiS.input.value * Math.PI) / 180;
    this.queue.length = 0;
    this.anim = null;
    this.state.re[0] = Math.cos(th / 2); this.state.im[0] = 0;
    this.state.re[1] = Math.sin(th / 2) * Math.cos(ph); this.state.im[1] = Math.sin(th / 2) * Math.sin(ph);
    this.refresh(false, true);
  }

  applyGate(name) {
    this.gateInfo.innerHTML = `<b>${name}</b>：${GATE_DESC[name]}`;
    this.queue.push(name);
  }

  startNext() {
    const name = this.queue.shift();
    const g = GATE_ROT[name];
    const axis = blochToVec3({ x: g.axis[0], y: g.axis[1], z: g.axis[2] }).normalize();
    this.anim = { name, axis, angle: g.angle, t: 0, dur: 0.35 + 0.55 * (g.angle / Math.PI), from: this.bloch.vec.clone() };
  }

  // 立即完成尚未播放完的门，保证测量作用在用户看到的最终状态上
  flush() {
    if (this.anim) this.state.apply1(0, GATE_ROT[this.anim.name].m);
    for (const n of this.queue) this.state.apply1(0, GATE_ROT[n].m);
    const pending = this.anim || this.queue.length;
    this.anim = null;
    this.queue.length = 0;
    if (pending) this.refresh(true);
  }

  async measure() {
    this.flush();
    const p1 = this.state.prob1(0);
    const r = this.state.measure(0);
    this.counts[r]++;
    this.flashT = 1;
    const from = this.bloch.vec.clone();
    const to = new THREE.Vector3(0, r ? -1 : 1, 0);
    await this.app.tweens.add(0.35, (k) => this.bloch.setVec(from.clone().lerp(to, k).normalize()));
    this.cbTarget = r ? -1.6 : 1.6;
    this.measureInfo.innerHTML = `结果：<b>${r}</b>（测到 1 的概率原本是 ${(p1 * 100).toFixed(1)}%）。<br>测量后状态<b>坍缩</b>为 |${r}⟩，叠加消失了——再测多少次都是 ${r}。`;
    this.refresh();
  }

  measureMany(n) {
    this.flush();
    const p1 = this.state.prob1(0);
    let c1 = 0;
    for (let i = 0; i < n; i++) if (Math.random() < p1) c1++;
    this.counts[0] += n - c1;
    this.counts[1] += c1;
    this.measureInfo.innerHTML = `把同一个态制备 ${n} 次分别测量：得到 0 共 <b>${n - c1}</b> 次，1 共 <b>${c1}</b> 次。<br>理论概率 P(1) = ${(p1 * 100).toFixed(1)}%。每一次都是随机的，但统计规律由振幅决定。`;
    this.updateHist();
  }

  updateHist() {
    const tot = this.counts[0] + this.counts[1];
    this.bars.forEach((b, k) => {
      b.target = tot ? (this.counts[k] / tot) * 2.6 : 0.001;
      b.v.element.textContent = `${this.counts[k]}`;
    });
  }

  refresh(resetArrow = false, fromSlider = false) {
    const s = this.state;
    const a = [s.re[0], s.im[0]], b = [s.re[1], s.im[1]];
    // 去掉全局相位，便于显示
    const g = Math.atan2(a[1], a[0]);
    const rot = ([r, i]) => [r * Math.cos(-g) - i * Math.sin(-g), r * Math.sin(-g) + i * Math.cos(-g)];
    const A = rot(a), B = rot(b);
    const fmt = ([r, i]) => {
      const R = Math.abs(r) < 5e-4 ? 0 : r, I = Math.abs(i) < 5e-4 ? 0 : i;
      if (I === 0) return R.toFixed(3);
      if (R === 0) return `${I.toFixed(3)}i`;
      return `(${R.toFixed(3)}${I < 0 ? '−' : '+'}${Math.abs(I).toFixed(3)}i)`;
    };
    this.formula.innerHTML = `|ψ⟩ = <span style="color:#5ce1e6">${fmt(A)}</span>|0⟩ + <span style="color:#ff8a4c">${fmt(B)}</span>|1⟩`;
    const p0 = s.prob(0), p1 = s.prob(1);
    this.p0.className = 'prob-row';
    this.p0.innerHTML = `<span>P(0)</span><div class="bar"><div style="width:${p0 * 100}%"></div></div><span class="mono">${(p0 * 100).toFixed(1)}%</span>`;
    this.p1.className = 'prob-row';
    this.p1.innerHTML = `<span>P(1)</span><div class="bar alt"><div style="width:${p1 * 100}%"></div></div><span class="mono">${(p1 * 100).toFixed(1)}%</span>`;

    if (!fromSlider) {
      const th = 2 * Math.acos(Math.min(1, Math.hypot(A[0], A[1])));
      let ph = Math.atan2(B[1], B[0]);
      if (ph < 0) ph += Math.PI * 2;
      this.thetaS.set(Math.round((th * 180) / Math.PI));
      this.phiS.set(Math.round((ph * 180) / Math.PI) % 360);
    }
    if (resetArrow || fromSlider || !this.anim) this.bloch.setBloch(s.bloch(0), fromSlider);
  }

  update(dt, t) {
    if (!this.anim && this.queue.length) this.startNext();
    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / a.dur);
      const k = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2;
      const q = new THREE.Quaternion().setFromAxisAngle(a.axis, a.angle * k);
      this.bloch.setVec(a.from.clone().applyQuaternion(q), true);
      if (a.t >= 1) {
        this.state.apply1(0, GATE_ROT[a.name].m);
        this.anim = null;
        this.refresh();
      }
    }
    // 经典比特小球
    if (this.cbTarget !== undefined) this.cbBall.position.y += (this.cbTarget - this.cbBall.position.y) * Math.min(1, dt * 10);
    // 直方图
    for (const b of this.bars) {
      if (b.target === undefined) continue;
      b.h += (b.target - b.h) * Math.min(1, dt * 6);
      b.bar.scale.y = Math.max(b.h, 0.001);
      b.bar.visible = b.h > 0.01;
      b.v.position.y = b.h + 0.25;
    }
    // 闪光
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 2.5);
      this.flash.material.opacity = this.flashT * 0.35;
    }
    this.bloch.pulse(t);
  }
}
