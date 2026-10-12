import * as THREE from 'three';
import { el, btn, section, label3D, glowByInstanceColor, sleep } from '../util.js';
import { QState, ket } from '../quantum.js';

const HQ = 4.2; // 振幅 1 对应的柱高
const QX = -3.3, CX = 3.7; // 量子 / 经典区域的中心 x

export default class GroverScene {
  static id = 'grover';
  static title = '量子搜索';

  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.view = { pos: [0.4, 9.2, 15.5], target: [0.4, 0.8, 0], min: 4, max: 40, bloom: 0.75 };
    this.busy = false;
    this.build();
    this.buildPanel();
    this.setN(64);
  }

  build() {
    const g = this.group;
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(4, 10, 8);
    g.add(key, new THREE.AmbientLight(0x8fb4ff, 0.5));

    const glowMatQ = glowByInstanceColor(new THREE.MeshStandardMaterial({ color: 0x6f6f6f, metalness: 0.1, roughness: 0.45, envMapIntensity: 0.5 }), 0.32);
    this.qBars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), glowMatQ, 256);
    this.cTiles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), glowByInstanceColor(new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.2, roughness: 0.5, envMapIntensity: 0.5 }), 0.2), 256);
    for (let i = 0; i < 256; i++) { this.qBars.setColorAt(i, new THREE.Color()); this.cTiles.setColorAt(i, new THREE.Color()); }
    g.add(this.qBars, this.cTiles);

    this.qBase = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 1), new THREE.MeshStandardMaterial({ color: 0x1a2a45, metalness: 0.3, roughness: 0.4, transparent: true, opacity: 0.55, depthWrite: false }));
    this.qBase.position.set(QX, -0.02, 0);
    this.cBase = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 1), new THREE.MeshStandardMaterial({ color: 0x141e30, metalness: 0.5, roughness: 0.5 }));
    this.cBase.position.set(CX, -0.03, 0);
    g.add(this.qBase, this.cBase);

    // 平均值平面
    this.meanPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf3c46b).multiplyScalar(1.5), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    this.meanPlane.rotation.x = -Math.PI / 2;
    this.meanPlane.position.x = QX;
    g.add(this.meanPlane);
    this.meanLabel = label3D('平均值', 'axis-tag', [0, 0.5]);
    this.meanLabel.element.style.color = '#f3c46b';
    g.add(this.meanLabel);
    this.meanLabel.visible = false;

    // 经典搜索的指针
    this.pointer = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a4c).multiplyScalar(3), toneMapped: false }));
    this.pointer.rotation.x = Math.PI / 2;
    g.add(this.pointer);
    // 量子测量结果标记
    this.marker = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4ade80).multiplyScalar(3), toneMapped: false }));
    this.marker.rotation.x = Math.PI / 2;
    this.marker.visible = false;
    g.add(this.marker);

    this.qTitle = label3D('', 'big-tag', [0.5, 1]);
    this.cTitle = label3D('', 'big-tag', [0.5, 1]);
    g.add(this.qTitle, this.cTitle);
    this.qCount = label3D('', 'bar-tag q', [0.5, 0]);
    this.cCount = label3D('', 'bar-tag c', [0.5, 0]);
    g.add(this.qCount, this.cCount);
  }

  buildPanel() {
    this.stats = el('div', { class: 'stat-grid' });
    this.info = el('div', { class: 'info-card' });
    this.canvas = el('canvas', { class: 'inset', width: 680, height: 330 });
    this.sizeBtns = [16, 64, 256].map((N) => btn(`N = ${N}`, () => this.setN(N), 'small'));
    this.stepBtn = btn('下一步', () => this.step(), '');
    this.autoBtn = btn('▶ 自动运行', () => this.auto(), 'primary');

    this.panel = el('div', {},
      el('div', { class: 'kicker' }, 'Chapter 6 · Grover Search'),
      el('h2', {}, '在 N 个抽屉里找一件东西'),
      el('p', { class: 'lead', html: '在无序的 N 个条目中找出唯一的目标：经典计算机只能一个个翻，平均要查 <b>N/2</b> 次；Grover 算法只需约 <span class="hl">(π/4)·√N</span> 次。左边是量子振幅，右边是经典逐个检查。' }),
      section('数据库大小', el('div', { class: 'btn-row' }, ...this.sizeBtns)),
      section('运行',
        el('div', { class: 'btn-row' }, this.autoBtn, this.stepBtn, btn('测量', () => this.guard(() => this.measure())), btn('重置', () => this.reset(), 'warn')),
        this.info,
        this.stats,
      ),
      section('几何图像：每次迭代转一个固定角度',
        this.canvas,
        el('p', { html: '状态矢量从几乎垂直于目标 |w⟩ 的均匀叠加 |s⟩ 出发。每次“oracle + 扩散”相当于两次镜面反射 = 一次<b>旋转 2θ</b>，其中 sin θ = 1/√N。转约 π/(4θ) ≈ (π/4)√N 次就指向目标。' }),
      ),
      section('每一步在做什么',
        el('ul', { class: 'list' },
          el('li', { html: '<b>Oracle（黑盒查询）</b>：把目标的振幅乘以 −1（柱子翻到下方）。只是改了相位，此时测量概率完全没变。' }),
          el('li', { html: '<b>扩散（关于平均值反射）</b>：每个振幅 a → 2·平均值 − a。目标是负的、远在平均值下方，于是被“弹”得很高；其余振幅略微变小。' }),
          el('li', { html: '这就是<b>振幅放大</b>：干涉把概率从错误答案“搬运”到正确答案上。' }),
        ),
        el('div', { class: 'callout', html: 'N = 1 万亿时：经典平均需 5000 亿次查询，Grover 只需约 78 万次。这是<b>平方级加速</b>；对于大数分解，Shor 算法甚至能带来<b>指数级加速</b>（见下一章）。' }),
      ),
    );
  }

  setN(N) {
    if (this.busy) return;
    this.N = N;
    this.n = Math.log2(N);
    this.side = Math.sqrt(N);
    this.sizeBtns.forEach((b, i) => b.classList.toggle('primary', [16, 64, 256][i] === N));
    const W = 5.4;
    this.sp = W / this.side;
    this.foot = this.sp * 0.72;
    this.qBase.scale.set(W + 0.5, 1, W + 0.5);
    this.cBase.scale.set(W + 0.5, 1, W + 0.5);
    this.meanPlane.scale.set(W + 0.3, W + 0.3, 1);
    this.qBars.count = N;
    this.cTiles.count = N;
    this.pos = [];
    for (let i = 0; i < N; i++) {
      const c = i % this.side, r = Math.floor(i / this.side);
      this.pos.push([(c - (this.side - 1) / 2) * this.sp, (r - (this.side - 1) / 2) * this.sp]);
    }
    this.qTitle.position.set(QX, 0, -W / 2 - 0.5);
    this.cTitle.position.set(CX, 0, -W / 2 - 0.5);
    this.qTitle.element.innerHTML = '量子：Grover 振幅放大';
    this.cTitle.element.innerHTML = '经典：逐个检查';
    this.qCount.position.set(QX, 0, W / 2 + 0.45);
    this.cCount.position.set(CX, 0, W / 2 + 0.45);
    this.pointer.scale.setScalar(this.foot * 0.75);
    this.marker.scale.setScalar(this.foot * 0.8);
    this.theta = Math.asin(1 / Math.sqrt(N));
    this.kOpt = Math.floor(Math.PI / (4 * this.theta));
    this.reset();
  }

  reset() {
    if (this.busy) return;
    this.target = Math.floor(Math.random() * this.N);
    this.state = new QState(this.n);
    this.shown = Float64Array.from(this.state.re);
    this.phase = 'init'; // init → oracle → diffuse → oracle …
    this.k = 0;
    this.qQueries = 0;
    this.order = Array.from({ length: this.N }, (_, i) => i).sort(() => Math.random() - 0.5);
    this.cChecked = 0;
    this.cFound = false;
    this.checked = new Uint8Array(this.N);
    this.marker.visible = false;
    this.measured = null;
    this.meanTarget = 0;
    this.pointerPos = null;
    this.say(`目标藏在 <b class="mono">|${ket(this.target, this.n)}⟩</b>（金色）。第一步：用 H⊗n 制备所有条目的<b>均匀叠加</b>。`);
    this.renderStats();
    this.drawInset();
  }

  say(h) { this.info.innerHTML = h; }

  async guard(fn) {
    if (this.busy) return;
    this.busy = true;
    try { await fn(); } finally { this.busy = false; this.renderStats(); }
  }

  step() { return this.guard(() => this.doStep()); }

  async doStep() {
    if (this.measured !== null) return;
    if (this.phase === 'init') {
      this.state.hAll();
      this.phase = 'oracle';
      this.say(`均匀叠加：每个条目的振幅都是 1/√${this.N} = ${(1 / Math.sqrt(this.N)).toFixed(3)}，测到目标的概率只有 ${(100 / this.N).toFixed(2)}%。`);
      await this.animate(0.9);
    } else if (this.phase === 'oracle') {
      this.state.flip(this.target);
      this.qQueries++;
      this.phase = 'diffuse';
      this.classicalStep();
      this.say(`<b>Oracle 查询 #${this.qQueries}</b>：目标振幅变号（翻到平面下方）。概率还没变——信息藏在<b>相位</b>里。经典这边同时也只能检查 1 个条目。`);
      await this.animate(0.8);
    } else {
      let m = 0;
      for (let i = 0; i < this.N; i++) m += this.state.re[i];
      m /= this.N;
      this.meanTarget = m;
      this.meanLabel.visible = true;
      await sleep(350);
      this.state.diffuse();
      this.k++;
      this.phase = 'oracle';
      const p = this.state.prob(this.target);
      this.say(`<b>扩散 #${this.k}</b>：所有振幅关于<span style="color:#f3c46b">平均值</span>做反射。目标被放大，P(目标) = <b>${(p * 100).toFixed(1)}%</b>。${this.k === this.kOpt ? '<br>已到最优迭代次数，现在测量吧！' : this.k > this.kOpt ? '<br>转过头了！概率开始下降——迭代次数必须恰到好处。' : ''}`);
      await this.animate(1.0);
      await sleep(250);
      this.meanLabel.visible = false;
    }
    this.drawInset();
  }

  classicalStep() {
    if (this.cFound || this.cChecked >= this.N) return;
    const idx = this.order[this.cChecked++];
    this.checked[idx] = 1;
    this.pointerPos = idx;
    if (idx === this.target) this.cFound = true;
  }

  async measure() {
    if (this.measured !== null) return;
    if (this.phase === 'init') { this.say('先运行几步再测量。'); return; }
    const p = this.state.prob(this.target);
    const r = this.state.measureAll();
    this.measured = r;
    this.marker.visible = true;
    const ok = r === this.target;
    this.say(ok
      ? `测量得到 <b class="mono">|${ket(r, this.n)}⟩</b> —— <b style="color:#4ade80">找到了！</b>只用了 <b>${this.qQueries}</b> 次查询（成功概率 ${(p * 100).toFixed(1)}%）。`
      : `测量得到 <b class="mono">|${ket(r, this.n)}⟩</b>，不是目标（这次成功概率只有 ${(p * 100).toFixed(1)}%）。量子算法是概率性的，重来一次即可。`);
    await this.animate(0.6);
  }

  async auto() {
    await this.guard(async () => {
      if (this.measured !== null) { this.busy = false; this.reset(); this.busy = true; }
      while (this.k < this.kOpt || this.phase === 'diffuse' || this.phase === 'init') {
        await this.doStep();
        await sleep(this.N > 64 ? 150 : 350);
      }
      await this.measure();
      await sleep(900);
      // 经典这边继续翻，直到找到
      const per = Math.max(1, Math.round(this.N / 64));
      while (!this.cFound) {
        for (let i = 0; i < per && !this.cFound; i++) this.classicalStep();
        this.renderStats();
        await sleep(45);
      }
      const ok = this.measured === this.target;
      this.info.innerHTML += `<br><br>经典逐个检查用了 <b style="color:#ff8a4c">${this.cChecked}</b> 次才找到（平均 ${this.N / 2} 次）；Grover 用了 <b style="color:#5ce1e6">${this.qQueries}</b> 次${ok ? '' : '（但这次测量没有命中）'}。`;
    });
  }

  animate(dur) {
    const from = Float64Array.from(this.shown);
    const to = this.state.re;
    return this.app.tweens.add(dur, (k) => {
      for (let i = 0; i < this.N; i++) this.shown[i] = from[i] + (to[i] - from[i]) * k;
    });
  }

  renderStats() {
    const p = this.phase === 'init' ? (this.target === 0 ? 1 : 0) : this.state.prob(this.target);
    const cells = [
      ['条目数 N', this.N],
      ['最优迭代次数', `${this.kOpt} <small>≈ π/4·√N</small>`],
      ['量子查询', `<span style="color:#5ce1e6">${this.qQueries}</span>`],
      ['经典查询', `<span style="color:#ff8a4c">${this.cChecked}</span> <small>${this.cFound ? '✓ 找到' : ''}</small>`],
      ['P(目标)', `${(p * 100).toFixed(1)}%`],
      ['已迭代', `${this.k} / ${this.kOpt}`],
    ];
    this.stats.innerHTML = cells.map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
    this.stepBtn.textContent = this.measured !== null ? '已测量' : this.phase === 'init' ? '下一步：H⊗n' : this.phase === 'oracle' ? '下一步：Oracle' : '下一步：扩散';
    this.qCount.element.innerHTML = `查询 ${this.qQueries} 次 · P(目标) ${(p * 100).toFixed(1)}%`;
    this.cCount.element.innerHTML = `查询 ${this.cChecked} 次${this.cFound ? ' · 找到 ✓' : ''}`;
  }

  drawInset() {
    const c = this.canvas, g = c.getContext('2d');
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    g.font = '22px "Microsoft YaHei", sans-serif';
    // 左：旋转图
    const ox = 50, oy = H - 50, R = H - 100;
    g.strokeStyle = 'rgba(138,154,179,0.6)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + R + 20, oy); g.moveTo(ox, oy); g.lineTo(ox, oy - R - 20); g.stroke();
    g.beginPath(); g.arc(ox, oy, R, -Math.PI / 2, 0); g.strokeStyle = 'rgba(90,169,255,0.35)'; g.stroke();
    g.fillStyle = '#f3c46b'; g.fillText('|w⟩ 目标', ox + 8, oy - R - 8);
    g.fillStyle = '#8a9ab3'; g.fillText("|s'⟩", ox + R - 10, oy + 32);
    const kk = this.phase === 'init' ? -1 : this.k;
    for (let j = 0; j <= Math.max(kk, 0); j++) {
      const a = (2 * j + 1) * this.theta;
      const cur = j === kk;
      if (kk < 0) break;
      g.strokeStyle = cur ? '#5ce1e6' : 'rgba(92,225,230,0.25)';
      g.lineWidth = cur ? 5 : 2;
      g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + R * Math.cos(a), oy - R * Math.sin(a)); g.stroke();
      if (cur) { g.fillStyle = '#5ce1e6'; g.beginPath(); g.arc(ox + R * Math.cos(a), oy - R * Math.sin(a), 7, 0, Math.PI * 2); g.fill(); }
    }
    // 右：P(目标) 曲线
    const x0 = W / 2 + 30, x1 = W - 20, y0 = H - 50, y1 = 30;
    const kMax = Math.max(this.kOpt * 2, 4);
    g.strokeStyle = 'rgba(138,154,179,0.6)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0, y1); g.lineTo(x0, y0); g.lineTo(x1, y0); g.stroke();
    g.strokeStyle = 'rgba(243,196,107,0.8)'; g.lineWidth = 3; g.beginPath();
    for (let i = 0; i <= 200; i++) {
      const k = (i / 200) * kMax;
      const p = Math.sin((2 * k + 1) * this.theta) ** 2;
      const X = x0 + (k / kMax) * (x1 - x0), Y = y0 - p * (y0 - y1);
      i ? g.lineTo(X, Y) : g.moveTo(X, Y);
    }
    g.stroke();
    const kx = x0 + (this.kOpt / kMax) * (x1 - x0);
    g.setLineDash([6, 6]); g.strokeStyle = 'rgba(92,225,230,0.5)'; g.beginPath(); g.moveTo(kx, y0); g.lineTo(kx, y1); g.stroke(); g.setLineDash([]);
    if (kk >= 0) {
      const p = Math.sin((2 * kk + 1) * this.theta) ** 2;
      g.fillStyle = '#5ce1e6'; g.beginPath(); g.arc(x0 + (kk / kMax) * (x1 - x0), y0 - p * (y0 - y1), 8, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#8a9ab3';
    g.fillText('P(目标)', x0 + 8, y1 + 4);
    g.fillText('迭代次数 →', x1 - 120, y0 + 32);
    g.fillText(`最优 ${this.kOpt}`, kx - 30, y0 + 32);
  }

  update(dt, t) {
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    const gold = new THREE.Color(0xf3c46b), cyan = new THREE.Color(0x5ce1e6), red = new THREE.Color(0xff5470);
    for (let i = 0; i < this.N; i++) {
      const a = this.shown[i];
      const h = Math.max(Math.abs(a) * HQ, 0.012);
      const [px, pz] = this.pos[i];
      m.makeScale(this.foot, h, this.foot).setPosition(QX + px, a < 0 ? -h : 0, pz);
      this.qBars.setMatrixAt(i, m);
      if (i === this.target) col.copy(gold);
      else if (a < -1e-6) col.copy(red);
      else col.copy(cyan);
      if (Math.abs(a) < 1e-3) col.multiplyScalar(0.25);
      this.qBars.setColorAt(i, col);

      // 经典格子
      const isPtr = i === this.pointerPos;
      const found = this.checked[i] && i === this.target;
      const th = found ? 0.6 : this.checked[i] ? 0.06 : 0.14;
      m.makeScale(this.foot, th, this.foot).setPosition(CX + px, 0, pz);
      this.cTiles.setMatrixAt(i, m);
      if (found) col.setHex(0x4ade80);
      else if (this.checked[i]) col.setRGB(0.18, 0.2, 0.25);
      else col.setHex(0x2b5a9a);
      if (isPtr && !found) col.setHex(0xff8a4c);
      this.cTiles.setColorAt(i, col);
    }
    this.qBars.instanceMatrix.needsUpdate = true;
    this.qBars.instanceColor.needsUpdate = true;
    this.cTiles.instanceMatrix.needsUpdate = true;
    this.cTiles.instanceColor.needsUpdate = true;

    // 平均值平面
    const op = this.meanLabel.visible ? 0.28 : 0;
    this.meanPlane.material.opacity += (op - this.meanPlane.material.opacity) * Math.min(1, dt * 8);
    this.meanPlane.position.y = this.meanTarget * HQ;
    this.meanLabel.position.set(QX + 3.0, this.meanTarget * HQ, 0);

    if (this.pointerPos !== null && this.pointerPos !== undefined) {
      const [px, pz] = this.pos[this.pointerPos];
      this.pointer.visible = true;
      this.pointer.position.set(CX + px, 0.2 + 0.05 * Math.sin(t * 6), pz);
    } else this.pointer.visible = false;
    if (this.marker.visible && this.measured !== null) {
      const [px, pz] = this.pos[this.measured];
      this.marker.position.set(QX + px, Math.abs(this.shown[this.measured]) * HQ + 0.15, pz);
      this.marker.material.color.setHex(this.measured === this.target ? 0x4ade80 : 0xff5470).multiplyScalar(3);
    }
    this.statT = (this.statT || 0) + dt;
    if (this.busy && this.statT > 0.12) {
      this.statT = 0;
      this.renderStats();
    }
  }
}
