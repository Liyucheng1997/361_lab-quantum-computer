import * as THREE from 'three';
import { el, btn, section, slider, label3D, phaseColor, glowByInstanceColor, sleep } from '../util.js';
import { QState, ket, rz } from '../quantum.js';

const MAXN = 10;

function fmtBytes(log2bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const k = Math.floor(log2bytes / 10);
  if (k < units.length) return `${(2 ** (log2bytes - k * 10)).toFixed(0)} ${units[k]}`;
  const l10 = log2bytes * Math.log10(2);
  return `10<sup>${Math.floor(l10)}</sup> 字节`;
}

export default class StateSpaceScene {
  static id = 'statespace';
  static title = '指数空间';

  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.view = { pos: [0, 8.5, 12.5], target: [0, 0.2, 0], min: 3, max: 40, bloom: 0.7 };
    this.n = 4;
    this.busy = false;
    this.build();
    this.buildPanel();
    this.setN(4);
  }

  build() {
    const g = this.group;
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(5, 10, 7);
    g.add(key, new THREE.AmbientLight(0x8fb4ff, 0.5));

    this.bars = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      glowByInstanceColor(new THREE.MeshStandardMaterial({ color: 0x6f6f6f, metalness: 0.1, roughness: 0.45, envMapIntensity: 0.5 }), 0.32),
      1 << MAXN
    );
    for (let i = 0; i < 1 << MAXN; i++) this.bars.setColorAt(i, new THREE.Color());
    g.add(this.bars);

    this.base = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 1), new THREE.MeshStandardMaterial({ color: 0x141e30, metalness: 0.6, roughness: 0.45 }));
    this.base.position.y = -0.04;
    g.add(this.base);
    this.gridLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x2f4669, transparent: true, opacity: 0.7 }));
    this.gridLines.position.y = 0.002;
    g.add(this.gridLines);

    this.labelGroup = new THREE.Group();
    g.add(this.labelGroup);
    this.qubitGroup = new THREE.Group();
    g.add(this.qubitGroup);

    this.title = label3D('', 'big-tag', [0.5, 0]);
    g.add(this.title);
  }

  buildPanel() {
    this.stats = el('div', { class: 'stat-grid' });
    this.info = el('div', { class: 'info-card', html: '先点 <b>H⊗n</b>：每个比特都进入叠加，所有 2<sup>n</sup> 个基态同时拥有相同振幅。' });
    this.nSlider = slider('量子比特数 n', 1, MAXN, 1, 4, (v) => this.setN(v), (v) => `${v}  →  ${2 ** v} 个振幅`);

    const rows = [10, 20, 30, 50, 100, 300].map((n) => {
      const extra = n === 50 ? '超级计算机极限附近' : n === 300 ? '远超宇宙中原子数（~10<sup>80</sup>）' : '';
      return `<tr><td>${n}</td><td class="r mono">${n <= 60 ? (2 ** n).toLocaleString('en-US', { maximumFractionDigits: 0 }) : `≈10<sup>${Math.floor(n * Math.log10(2))}</sup>`}</td><td class="r mono">${fmtBytes(n + 4)}</td></tr>${extra ? `<tr><td colspan="3" style="color:#f3c46b;font-size:11.5px;padding-top:0">↑ ${extra}</td></tr>` : ''}`;
    }).join('');

    this.panel = el('div', {},
      el('div', { class: 'kicker' }, 'Chapter 5 · State Space & Interference'),
      el('h2', {}, '2ⁿ：指数级的状态空间'),
      el('p', { class: 'lead', html: '每根柱子代表一个基态 |x⟩，<b>高度</b> = 振幅大小，<b>颜色</b> = 相位（<span style="color:#5ce1e6">青色为正</span>，<span style="color:#ff6b6b">红色为负</span>）。每加一个量子比特，柱子数量就<span class="hl">翻倍</span>。' }),
      section('规模', this.nSlider, this.stats),
      section('操作（同时作用于全部振幅）',
        el('div', { class: 'btn-row' },
          btn('H⊗n', () => this.op('h'), 'primary'),
          btn('随机相位+纠缠', () => this.op('rand')),
          btn('测量', () => this.op('measure')),
          btn('重置', () => this.op('reset'), 'warn'),
        ),
        this.info,
      ),
      section('干涉：让答案“浮现”',
        el('p', { html: '再点一次 <b>H⊗n</b>：所有柱子突然消失，只剩 |00…0⟩！这是因为振幅可以<b>相互抵消</b>（相消干涉）或<b>相互加强</b>（相长干涉）。' }),
        el('p', { html: '下面的 <b>Bernstein–Vazirani 算法</b>利用干涉，只问一次“黑盒”，就能读出一个藏起来的 n 位密码 s；经典方法则必须问 n 次。' }),
        el('div', { class: 'btn-row' }, btn('▶ 运行 Bernstein–Vazirani', () => this.bv(), 'primary')),
      ),
      section('经典计算机要模拟它需要多少内存？',
        el('table', { class: 'table', html: `<tr><th>比特数</th><th class="r">振幅个数</th><th class="r">内存(16B/振幅)</th></tr>${rows}` }),
        el('div', { class: 'callout', html: '“量子计算机同时尝试所有答案”是一个流行但<b>不准确</b>的说法：测量只给出一个随机结果。真正的秘诀是精心设计线路，让<b>错误答案的振幅相互抵消、正确答案的振幅相互加强</b>。' }),
      ),
    );
  }

  setN(n) {
    if (this.busy) { this.nSlider.set(this.n); return; }
    this.n = n;
    this.N = 1 << n;
    this.state = new QState(n);
    this.shown = { re: new Float64Array(this.N), im: new Float64Array(this.N) };
    this.shown.re[0] = 1;
    this.scale = 3;
    this.layout();
    this.renderStats();
    this.info.innerHTML = '先点 <b>H⊗n</b>：每个比特都进入叠加，所有 2<sup>n</sup> 个基态同时拥有相同振幅。';
  }

  layout() {
    const n = this.n, N = this.N;
    this.cols = 1 << Math.ceil(n / 2);
    this.rows = 1 << Math.floor(n / 2);
    const W = 9.5;
    this.sp = Math.min(1.3, W / this.cols);
    this.foot = this.sp * 0.7;
    const w = this.cols * this.sp, d = this.rows * this.sp;
    this.base.scale.set(w + 0.6, 1, d + 0.6);
    this.bars.count = N;

    const pts = [];
    for (let c = 0; c <= this.cols; c++) { const x = -w / 2 + c * this.sp; pts.push(x, 0, -d / 2, x, 0, d / 2); }
    for (let r = 0; r <= this.rows; r++) { const z = -d / 2 + r * this.sp; pts.push(-w / 2, 0, z, w / 2, 0, z); }
    this.gridLines.geometry.dispose();
    this.gridLines.geometry = new THREE.BufferGeometry();
    this.gridLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));

    this.pos = [];
    for (let i = 0; i < N; i++) {
      const c = i % this.cols, r = Math.floor(i / this.cols);
      this.pos.push([-w / 2 + (c + 0.5) * this.sp, -d / 2 + (r + 0.5) * this.sp]);
    }

    // 基态标签
    this.labelGroup.children.slice().forEach((l) => { l.element?.remove(); this.labelGroup.remove(l); });
    if (n <= 4) {
      for (let i = 0; i < N; i++) {
        const lb = label3D(`|${ket(i, n)}⟩`, 'ket small', [0.5, 0]);
        lb.position.set(this.pos[i][0], 0, this.pos[i][1] + this.foot * 0.5 + 0.1);
        this.labelGroup.add(lb);
      }
    }

    // 量子比特小球
    this.qubitGroup.children.slice().forEach((o) => { o.element?.remove(); this.qubitGroup.remove(o); });
    this.qGlow = [];
    for (let q = 0; q < n; q++) {
      const x = (q - (n - 1) / 2) * 0.75;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ce1e6), toneMapped: false }));
      m.position.set(x, 0.17, d / 2 + 1.4);
      this.qubitGroup.add(m);
      const lb = label3D(`q${q}`, 'axis-tag', [0.5, 0]);
      lb.position.set(x, -0.1, d / 2 + 1.75);
      this.qubitGroup.add(lb);
      this.qGlow.push({ m, t: 0 });
    }
    this.title.position.set(0, 0, d / 2 + 2.3);
    this.title.element.innerHTML = `${n} 个量子比特 = ${N.toLocaleString()} 个复数振幅`;
  }

  renderStats() {
    const n = this.n;
    this.stats.innerHTML = [
      ['量子比特', `${n}`],
      ['同时描述的振幅', `${(2 ** n).toLocaleString()}`],
      ['经典比特只能存', '1 <small>个状态</small>'],
      ['经典模拟内存', fmtBytes(n + 4)],
    ].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  }

  glowQubits() { this.qGlow.forEach((q) => (q.t = 1)); }

  // 把显示状态平滑过渡到 this.state
  transition(dur = 0.9) {
    const r0 = Float64Array.from(this.shown.re), i0 = Float64Array.from(this.shown.im);
    const r1 = this.state.re, i1 = this.state.im;
    return this.app.tweens.add(dur, (k) => {
      for (let i = 0; i < this.N; i++) {
        this.shown.re[i] = r0[i] + (r1[i] - r0[i]) * k;
        this.shown.im[i] = i0[i] + (i1[i] - i0[i]) * k;
      }
    });
  }

  async op(kind) {
    if (this.busy) return;
    this.busy = true;
    const s = this.state, n = this.n;
    const wasUniform = this.isUniformPositive();
    if (kind === 'h') {
      s.hAll();
      this.glowQubits();
      if (wasUniform) this.info.innerHTML = '<b>相消干涉！</b>每个非零基态都收到来自 2<sup>n</sup> 条“路径”的贡献，一半为正一半为负，正好全部抵消；只有 |00…0⟩ 的所有贡献同号，彼此加强。';
      else if (s.prob(0) > 0.999 || this.isUniformPositive()) this.info.innerHTML = `一次 H⊗n，${this.N.toLocaleString()} 个振幅同时被更新。量子计算机做这一步只需要 <b>${n}</b> 个门；经典模拟则要计算全部 ${this.N.toLocaleString()} 个数。`;
      else this.info.innerHTML = '再次施加 H⊗n：振幅按相位相互叠加或抵消。';
    } else if (kind === 'rand') {
      for (let q = 0; q < n; q++) { s.gate('H', q); s.apply1(q, rz(Math.random() * Math.PI * 2)); }
      for (let q = 0; q < n - 1; q++) s.cz(q, q + 1);
      for (let q = 0; q < n; q++) s.apply1(q, rz(Math.random() * Math.PI));
      this.glowQubits();
      this.info.innerHTML = '随机的单比特旋转 + 相邻 CZ 门：振幅有了各种<b>相位</b>（颜色）。比特之间已经纠缠，无法再分别描述每个比特。';
    } else if (kind === 'measure') {
      const k = s.measureAll();
      this.info.innerHTML = `测量结果：<b class="mono">|${ket(k, n)}⟩</b>。<br>${this.N.toLocaleString()} 个振幅中只“留下”了一个——叠加本身并不能把所有信息都读出来。`;
    } else if (kind === 'reset') {
      s.reset();
      this.info.innerHTML = '已重置为 |00…0⟩。';
    }
    await this.transition();
    this.busy = false;
  }

  isUniformPositive() {
    const a = 1 / Math.sqrt(this.N);
    for (let i = 0; i < this.N; i++) if (Math.abs(this.state.re[i] - a) > 1e-6 || Math.abs(this.state.im[i]) > 1e-6) return false;
    return true;
  }

  async bv() {
    if (this.busy) return;
    this.busy = true;
    const n = this.n, s = this.state;
    const secret = 1 + Math.floor(Math.random() * (this.N - 1));
    const sStr = ket(secret, n);
    const say = (h) => { this.info.innerHTML = `<b>Bernstein–Vazirani</b>　隐藏串 s = <span class="mono hl-gold">${'?'.repeat(n)}</span><br>${h}`; };
    s.reset();
    say('① 从 |00…0⟩ 开始。');
    await this.transition(0.6);
    await sleep(500);
    s.hAll();
    this.glowQubits();
    say('② H⊗n：制备所有输入 x 的均匀叠加。');
    await this.transition();
    await sleep(900);
    for (let x = 0; x < this.N; x++) {
      let p = x & secret, c = 0;
      while (p) { c ^= p & 1; p >>= 1; }
      if (c) s.flip(x);
    }
    say('③ <b>只调用一次</b>黑盒 f(x) = s·x mod 2：把 f(x)=1 的振幅乘以 −1（变成<span style="color:#ff6b6b">红色</span>）。所有 x 同时被“查询”，但答案藏在相位里，直接测量什么也得不到。');
    await this.transition(1.1);
    await sleep(1600);
    s.hAll();
    this.glowQubits();
    say('④ 再做一次 H⊗n：相位图样发生<b>干涉</b>，除 |s⟩ 外的所有振幅全部抵消……');
    await this.transition(1.3);
    await sleep(400);
    this.info.innerHTML = `<b>Bernstein–Vazirani</b>　隐藏串 s = <span class="mono hl-gold">${sStr}</span><br>⑤ 测量必然得到 <b class="mono">|${sStr}⟩</b> = s。量子：<b>1 次</b>查询；经典：需要 <b>${n} 次</b>（每次只能问出一位）。`;
    this.busy = false;
  }

  update(dt, t) {
    const N = this.N;
    let maxA = 0;
    for (let i = 0; i < N; i++) maxA = Math.max(maxA, Math.hypot(this.shown.re[i], this.shown.im[i]));
    const target = maxA > 1e-6 ? 3.2 / maxA : 3;
    this.scale += (target - this.scale) * Math.min(1, dt * 4);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const re = this.shown.re[i], im = this.shown.im[i];
      const a = Math.hypot(re, im);
      const h = Math.max(a * this.scale, 0.015);
      const f = a < 1e-3 ? 0 : this.foot;
      m.makeScale(f, h, f).setPosition(this.pos[i][0], 0, this.pos[i][1]);
      this.bars.setMatrixAt(i, m);
      if (a < 1e-4) col.setRGB(0.12, 0.16, 0.24);
      else phaseColor(re, im, col);
      this.bars.setColorAt(i, col);
    }
    this.bars.instanceMatrix.needsUpdate = true;
    this.bars.instanceColor.needsUpdate = true;
    for (const q of this.qGlow) {
      q.t = Math.max(0, q.t - dt * 1.5);
      q.m.material.color.setHex(0x5ce1e6).multiplyScalar(0.9 + q.t * 1.6);
      q.m.scale.setScalar(1 + q.t * 0.5 + 0.05 * Math.sin(t * 3));
    }
  }
}
