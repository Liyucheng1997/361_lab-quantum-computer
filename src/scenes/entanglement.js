import * as THREE from 'three';
import { el, btn, section, label3D, blochToVec3, phaseColor, glowByInstanceColor } from '../util.js';
import { BlochSphere } from '../blochSphere.js';
import { QState, ket } from '../quantum.js';

const SEP = 3.6;

export default class EntanglementScene {
  static id = 'entanglement';
  static title = '纠缠';

  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.view = { pos: [0.6, 2.4, 13], target: [0, -0.4, 0], min: 4, max: 34, bloom: 0.75 };
    this.state = new QState(2);
    this.prepared = new QState(2);
    this.ops = [];
    this.counts = [0, 0, 0, 0];
    this.measured = false;
    this.ent = 0;
    this.entShown = 0;
    this.busy = false;
    this.build();
    this.buildPanel();
    this.sync(true);
  }

  build() {
    const g = this.group;
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(4, 8, 7);
    g.add(key, new THREE.AmbientLight(0x8fb4ff, 0.45));

    this.spheres = [0, 1].map((k) => {
      const b = new BlochSphere({ radius: 1.7, color: k ? 0xff8a4c : 0x5ce1e6, small: true });
      b.group.position.x = k ? SEP : -SEP;
      b.group.position.y = 0.5;
      g.add(b.group);
      const lb = label3D(`量子比特 q${k}`, 'big-tag', [0.5, 1]);
      lb.position.set(0, 2.75, 0);
      b.group.add(lb);
      // 测量闪光
      const fl = new THREE.Mesh(new THREE.SphereGeometry(1.75, 48, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(2), transparent: true, opacity: 0, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide }));
      b.group.add(fl);
      b.flash = fl;
      b.flashT = 0;
      return b;
    });

    // 纠缠“纽带”：两条交织的光流
    this.linkCurves = [0, 1].map((s) => {
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const u = i / 60;
        const x = -SEP + 1.75 + u * (2 * SEP - 3.5);
        const env = Math.sin(u * Math.PI);
        const ph = u * Math.PI * 4 + s * Math.PI;
        pts.push(new THREE.Vector3(x, 0.5 + 0.35 * env * Math.sin(ph), 0.35 * env * Math.cos(ph)));
      }
      return new THREE.CatmullRomCurve3(pts);
    });
    this.linkTubes = this.linkCurves.map((c, s) => {
      const m = new THREE.Mesh(new THREE.TubeGeometry(c, 120, 0.012, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(s ? 0xff8a4c : 0x5ce1e6).multiplyScalar(2), transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
      g.add(m);
      return m;
    });
    const np = 36;
    this.linkParticles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2.5, 2.5), toneMapped: false, transparent: true }), np);
    for (let i = 0; i < np; i++) this.linkParticles.setColorAt(i, new THREE.Color(i % 2 ? 0xff8a4c : 0x5ce1e6));
    this.linkParticles.instanceColor.needsUpdate = true;
    g.add(this.linkParticles);
    this.linkLabel = label3D('', 'big-tag', [0.5, 1]);
    this.linkLabel.position.set(0, 1.55, 0);
    g.add(this.linkLabel);

    // 底部：4 个基态的振幅柱
    const bars = new THREE.Group();
    bars.position.set(0, -2.6, 0);
    const base = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.06, 1.3), new THREE.MeshStandardMaterial({ color: 0x18233a, metalness: 0.5, roughness: 0.5 }));
    bars.add(base);
    this.barMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 1, 0.9).translate(0, 0.5, 0), glowByInstanceColor(new THREE.MeshStandardMaterial({ color: 0x6f6f6f, metalness: 0.1, roughness: 0.45, envMapIntensity: 0.5 }), 0.32), 4);
    this.barH = [0, 0, 0, 0];
    this.barTarget = [0, 0, 0, 0];
    this.barCol = [0, 1, 2, 3].map(() => new THREE.Color(0x5ce1e6));
    for (let i = 0; i < 4; i++) {
      const x = -2.4 + i * 1.6;
      const lb = label3D(`|${ket(i, 2)}⟩`, 'ket small', [0.5, 0]);
      lb.position.set(x, -0.15, 0.75);
      bars.add(lb);
      this.barMesh.setColorAt(i, this.barCol[i]);
    }
    this.barVals = [0, 1, 2, 3].map((i) => {
      const v = label3D('', 'axis-tag', [0.5, 1]);
      v.position.set(-2.4 + i * 1.6, 0.2, 0);
      bars.add(v);
      return v;
    });
    bars.add(this.barMesh);
    const bt = label3D('两比特联合状态的概率（颜色 = 相位）', 'axis-tag', [0.5, 0]);
    bt.position.set(0, -0.62, 0.7);
    bars.add(bt);
    g.add(bars);
  }

  buildPanel() {
    this.formula = el('div', { class: 'formula' });
    this.circuit = el('div');
    this.entInfo = el('div', { class: 'info-card' });
    this.stats = el('div');
    const b = (t, f, c = 'small') => btn(t, () => this.run(f), c);

    this.panel = el('div', {},
      el('div', { class: 'kicker' }, 'Chapter 4 · Entanglement'),
      el('h2', {}, '纠缠：无法拆开的整体'),
      el('p', { class: 'lead', html: '两个量子比特纠缠后，就不再各自拥有确定的状态，只有<b>整体</b>才有。测量其中一个，另一个的结果立刻随之确定——爱因斯坦称之为“鬼魅般的超距作用”。' }),
      section('一步制备贝尔态',
        el('div', { class: 'btn-row' },
          btn('▶ 演示：H + CNOT', () => this.demo(), 'primary'),
          btn('重置 |00⟩', () => this.reset(), 'warn small'),
        ),
        this.circuit,
        this.formula,
        this.entInfo,
      ),
      section('手动施加量子门',
        el('div', { class: 'btn-row' },
          b('H(q0)', () => this.gate('H', 0)), b('H(q1)', () => this.gate('H', 1)),
          b('X(q0)', () => this.gate('X', 0)), b('X(q1)', () => this.gate('X', 1)),
          b('Z(q0)', () => this.gate('Z', 0)), b('CNOT q0→q1', () => this.cnot()),
        ),
      ),
      section('测量',
        el('div', { class: 'btn-row' },
          btn('只测 q0', () => this.run(() => this.measure([0]))),
          btn('只测 q1', () => this.run(() => this.measure([1]))),
          btn('重复整个实验 1000 次', () => this.repeat(1000), 'primary'),
        ),
        this.stats,
      ),
      section('关键点',
        el('ul', { class: 'list' },
          el('li', { html: '纠缠后，每个球内的箭头<b>缩到了球心</b>：单独看 q0 或 q1，都是 50/50 的随机，没有任何确定方向。' }),
          el('li', { html: '但两者的结果<b>永远相同</b>（00 或 11），信息存在于“关联”之中。' }),
          el('li', { html: '2 个比特需要 4 个振幅；n 个纠缠比特需要 2<sup>n</sup> 个振幅，经典计算机无法把它拆成 n 个独立部分来存储——这正是量子计算强大、也难以模拟的根源。' }),
        ),
        el('div', { class: 'callout', html: '纠缠不能用来超光速通信：单看任意一方，结果都是完全随机的，只有把两边记录拿到一起比对，才能看到关联。' }),
      ),
    );
    this.renderStats();
  }

  // 串行执行，避免动画重叠
  async run(fn) {
    if (this.busy) return;
    this.busy = true;
    try { await fn(); } finally { this.busy = false; }
  }

  async demo() {
    await this.run(async () => {
      this.resetNow();
      await new Promise((r) => setTimeout(r, 400));
      await this.gate('H', 0);
      await new Promise((r) => setTimeout(r, 300));
      await this.cnot();
    });
  }

  reset() { this.run(async () => this.resetNow()); }

  resetNow() {
    this.state.reset();
    this.prepared.reset();
    this.ops = [];
    this.measured = false;
    this.sync(true);
  }

  async gate(name, q) {
    if (this.measured) this.unmeasure();
    this.lastMeasure = '';
    this.ops.push({ t: name, q });
    this.state.gate(name, q);
    this.prepared.copyFrom(this.state);
    await this.animateTo();
  }

  async cnot() {
    if (this.measured) this.unmeasure();
    this.lastMeasure = '';
    this.ops.push({ t: 'CNOT' });
    this.state.cnot(0, 1);
    this.prepared.copyFrom(this.state);
    await this.animateTo();
  }

  unmeasure() {
    // 测量后继续加门：从坍缩后的态继续
    this.measured = false;
  }

  async measure(qs) {
    const before = this.state.clone();
    const res = qs.map((q) => ({ q, r: this.state.measure(q) }));
    this.measured = true;
    for (const { q, r } of res) this.ops.push({ t: 'M', q, r });
    for (const s of this.spheres) s.flashT = 1;
    // 对另一个比特的影响
    const other = qs.length === 1 ? 1 - qs[0] : null;
    let msg = res.map(({ q, r }) => `q${q} = <b>${r}</b>`).join('，');
    if (other !== null) {
      const pOther = this.state.prob1(other);
      const pBefore = before.prob1(other);
      if (Math.abs(pOther - pBefore) > 0.01) {
        msg += `。<br>与此同时 q${other} 的状态立刻变成了 <b>|${pOther > 0.5 ? 1 : 0}⟩</b>——尽管我们没有碰它！（测前它测到 1 的概率是 ${(pBefore * 100).toFixed(0)}%，现在是 ${(pOther * 100).toFixed(0)}%）`;
      } else {
        msg += `。q${other} 的状态没有受影响——它们之间没有纠缠。`;
      }
    }
    this.lastMeasure = msg;
    await this.animateTo();
  }

  repeat(n) {
    const p = this.prepared.probs();
    const c = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      let acc = 0, k = 0;
      for (; k < 3; k++) { acc += p[k]; if (r < acc) break; }
      c[k]++;
    }
    this.counts = c;
    this.renderStats(n);
  }

  renderStats(n) {
    const tot = this.counts.reduce((a, b) => a + b, 0);
    const rows = [0, 1, 2, 3].map((i) => {
      const f = tot ? this.counts[i] / tot : 0;
      return `<div class="prob-row"><span class="mono">${ket(i, 2)}</span><div class="bar ${i === 1 || i === 2 ? 'alt' : ''}"><div style="width:${f * 100}%"></div></div><span class="mono">${this.counts[i]}</span></div>`;
    }).join('');
    let note = '点击“重复整个实验”：按当前线路反复制备并测量两个比特，统计结果。';
    if (tot) {
      const same = this.counts[0] + this.counts[3];
      note = `${n} 次实验中，两个比特结果相同的有 <b>${same}</b> 次（${((same / tot) * 100).toFixed(1)}%）。q0 单独为 1 的比例：${(((this.counts[1] + this.counts[3]) / tot) * 100).toFixed(1)}%。`;
    }
    this.stats.innerHTML = `<div class="prob-bars" style="margin-top:10px">${rows}</div><div class="info-card">${this.lastMeasure ? this.lastMeasure + '<br><br>' : ''}${note}</div>`;
  }

  animateTo() {
    const from = this.spheres.map((s) => s.vec.clone());
    const to = [0, 1].map((q) => blochToVec3(this.state.bloch(q)));
    const h0 = [...this.barH];
    const p = this.state.probs();
    for (let i = 0; i < 4; i++) {
      this.barTarget[i] = p[i] * 2.6;
      if (p[i] > 1e-6) phaseColor(this.state.re[i], this.state.im[i], this.barCol[i]);
    }
    this.sync(false);
    return this.app.tweens.add(0.8, (k) => {
      this.spheres.forEach((s, q) => s.setVec(from[q].clone().lerp(to[q], k)));
      for (let i = 0; i < 4; i++) this.barH[i] = h0[i] + (this.barTarget[i] - h0[i]) * k;
    });
  }

  sync(immediate) {
    const s = this.state;
    // 纠缠度：并发度 C = 2|a·d − b·c|，其中 a=|00⟩ b=|01⟩ c=|10⟩ d=|11⟩（q0 写在左边）
    const A = [s.re[0], s.im[0]], B = [s.re[2], s.im[2]], C = [s.re[1], s.im[1]], D = [s.re[3], s.im[3]];
    const mr = A[0] * D[0] - A[1] * D[1] - (B[0] * C[0] - B[1] * C[1]);
    const mi = A[0] * D[1] + A[1] * D[0] - (B[0] * C[1] + B[1] * C[0]);
    this.ent = Math.min(1, 2 * Math.hypot(mr, mi));

    const terms = [];
    for (let i = 0; i < 4; i++) {
      const re = s.re[i], im = s.im[i];
      if (re * re + im * im < 1e-9) continue;
      const mag = Math.hypot(re, im);
      let coef = Math.abs(mag - Math.SQRT1_2) < 1e-6 ? '1/√2' : Math.abs(mag - 0.5) < 1e-6 ? '1/2' : Math.abs(mag - 1) < 1e-6 ? '' : mag.toFixed(3);
      let sign = re < -1e-9 ? '−' : '+';
      if (Math.abs(im) > 1e-9) { sign = im < 0 ? '−' : '+'; coef = `${coef}i`; }
      terms.push({ sign, coef, k: ket(i, 2) });
    }
    this.formula.innerHTML = '|ψ⟩ = ' + terms.map((t, i) => `${i === 0 ? (t.sign === '−' ? '−' : '') : ` ${t.sign} `}${t.coef}|${t.k}⟩`).join('');

    const ent = this.ent > 0.99 ? '<b style="color:#b18cff">最大纠缠</b>（贝尔态）' : this.ent > 0.01 ? `部分纠缠（并发度 ${this.ent.toFixed(2)}）` : '<b>没有纠缠</b>：可以写成 (q0 的态) ⊗ (q1 的态)';
    const lens = [0, 1].map((q) => { const b = s.bloch(q); return Math.hypot(b.x, b.y, b.z); });
    this.entInfo.innerHTML = `${ent}<br>单比特布洛赫矢量长度：q0 = <span class="mono">${lens[0].toFixed(2)}</span>，q1 = <span class="mono">${lens[1].toFixed(2)}</span>${this.ent > 0.99 ? '<br>两个箭头都缩到了球心：<b>单独的比特没有确定状态</b>。' : ''}`;
    this.linkLabel.element.innerHTML = this.ent > 0.01 ? `<span style="color:#b18cff">纠缠</span>` : '';

    this.drawCircuit();
    if (immediate) {
      this.spheres.forEach((sp, q) => sp.setBloch(s.bloch(q)));
      const p = s.probs();
      for (let i = 0; i < 4; i++) {
        this.barH[i] = this.barTarget[i] = p[i] * 2.6;
        phaseColor(s.re[i], s.im[i], this.barCol[i]);
      }
      this.lastMeasure = '';
      this.renderStats();
    } else if (this.lastMeasure) this.renderStats();
  }

  drawCircuit() {
    const ops = this.ops.slice(-9);
    const W = 340, y0 = 28, y1 = 72;
    let x = 52;
    let body = '';
    for (const o of ops) {
      if (o.t === 'CNOT') {
        body += `<line x1="${x}" x2="${x}" y1="${y0}" y2="${y1 + 11}" stroke="#b18cff" stroke-width="2"/><circle cx="${x}" cy="${y0}" r="5" fill="#b18cff"/><circle cx="${x}" cy="${y1}" r="11" fill="none" stroke="#b18cff" stroke-width="2"/>`;
      } else if (o.t === 'M') {
        const y = o.q ? y1 : y0;
        body += `<rect x="${x - 13}" y="${y - 13}" width="26" height="26" rx="4" fill="#2a2030" stroke="#f3c46b"/><path d="M ${x - 8} ${y + 5} A 9 9 0 0 1 ${x + 8} ${y + 5}" fill="none" stroke="#f3c46b" stroke-width="1.5"/><line x1="${x}" y1="${y + 5}" x2="${x + 6}" y2="${y - 6}" stroke="#f3c46b" stroke-width="1.5"/><text x="${x}" y="${y + 26}" fill="#f3c46b" font-size="10" text-anchor="middle">${o.r}</text>`;
      } else {
        const y = o.q ? y1 : y0;
        body += `<rect x="${x - 13}" y="${y - 13}" width="26" height="26" rx="4" fill="#12324a" stroke="#5ce1e6"/><text x="${x}" y="${y + 5}" fill="#fff" font-size="14" font-weight="700" text-anchor="middle">${o.t}</text>`;
      }
      x += 36;
    }
    this.circuit.innerHTML = `<svg class="circuit" viewBox="0 0 ${W} 100">
      <text x="6" y="${y0 + 4}" fill="#5ce1e6" font-size="12">q0 |0⟩</text>
      <text x="6" y="${y1 + 4}" fill="#ff8a4c" font-size="12">q1 |0⟩</text>
      <line x1="44" x2="${W - 6}" y1="${y0}" y2="${y0}" stroke="#56657d"/>
      <line x1="44" x2="${W - 6}" y1="${y1}" y2="${y1}" stroke="#56657d"/>
      ${body}
    </svg>`;
  }

  update(dt, t) {
    this.entShown += (this.ent - this.entShown) * Math.min(1, dt * 3);
    const e = this.entShown;
    this.linkTubes.forEach((m) => (m.material.opacity = e * 0.55));
    const n = this.linkParticles.count;
    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const c = this.linkCurves[i % 2];
      let u = ((i >> 1) / (n / 2) + t * 0.18) % 1;
      if (i % 2) u = 1 - u;
      c.getPointAt(u, p);
      const s = e * (0.6 + 0.4 * Math.sin(u * Math.PI));
      m4.makeScale(s, s, s).setPosition(p);
      this.linkParticles.setMatrixAt(i, m4);
    }
    this.linkParticles.instanceMatrix.needsUpdate = true;
    this.linkParticles.visible = e > 0.01;

    const m = new THREE.Matrix4();
    for (let i = 0; i < 4; i++) {
      const hh = this.barH[i];
      m.makeScale(hh > 0.004 ? 1 : 0, Math.max(hh, 0.002), 1).setPosition(-2.4 + i * 1.6, 0.03, 0);
      this.barMesh.setMatrixAt(i, m);
      this.barMesh.setColorAt(i, this.barCol[i]);
      this.barVals[i].position.y = this.barH[i] + 0.3;
      this.barVals[i].element.textContent = `${((this.barH[i] / 2.6) * 100).toFixed(0)}%`;
    }
    this.barMesh.instanceMatrix.needsUpdate = true;
    this.barMesh.instanceColor.needsUpdate = true;

    for (const s of this.spheres) {
      s.flashT = Math.max(0, s.flashT - dt * 2.2);
      s.flash.material.opacity = s.flashT * 0.35;
      s.pulse(t);
    }
  }
}
