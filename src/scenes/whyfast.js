import * as THREE from 'three';
import { el, btn, section, label3D, fmtSci, fmtDuration } from '../util.js';

const LN10 = Math.log(10);

// 大数分解：经典最优的数域筛法（GNFS） vs Shor 算法，均为数量级示意
function gnfsLog10(bits) {
  const lnN = bits * Math.log(2);
  return (1.923 * Math.cbrt(lnN) * Math.pow(Math.log(lnN), 2 / 3)) / LN10;
}

const MODES = {
  factor: {
    name: '大数分解（RSA）',
    unit: '运算',
    groups: [256, 512, 1024, 2048, 4096].map((b) => ({
      label: `RSA-${b}`,
      c: gnfsLog10(b),
      q: 3 * Math.log10(b),
    })),
    cRate: 18, // 经典：E 级超算，每秒 10^18 次运算
    qRate: 6, // 量子：每秒 10^6 次逻辑门（容错量子计算机的乐观估计）
    note: '经典：数域筛法，复杂度 exp(c·(ln N)<sup>1/3</sup>(ln ln N)<sup>2/3</sup>)，按每秒 10<sup>18</sup> 次运算（E 级超算）估算。<br>量子：Shor 算法约 n³ 个逻辑门，按每秒 10<sup>6</sup> 个逻辑门估算。<br>数字只示意数量级。',
  },
  search: {
    name: '无序搜索',
    unit: '次查询',
    groups: [3, 6, 9, 12, 15, 18].map((e) => ({
      label: `N=10<sup>${e}</sup>`,
      c: e - Math.log10(2),
      q: e / 2 + Math.log10(Math.PI / 4),
    })),
    cRate: 9, // 经典：每秒 10^9 次检查
    qRate: 6, // 量子：每秒 10^6 次 Grover 迭代
    note: '经典：平均检查 N/2 次，每次 1 ns。<br>量子：Grover 约 (π/4)√N 次迭代，每次 1 μs（量子门比晶体管慢得多！）。<br>注意 N 较小时量子反而更慢。',
  },
};

export default class WhyFastScene {
  static id = 'whyfast';
  static title = '为什么快';

  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.view = { pos: [1.5, 5.6, 19.5], target: [0.4, 3.5, 0], min: 4, max: 45, bloom: 0.6 };
    this.chart = new THREE.Group();
    this.group.add(this.chart);
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(5, 10, 8);
    this.group.add(key, new THREE.AmbientLight(0x8fb4ff, 0.5));
    this.buildPanel();
    this.setMode('factor');
  }

  buildPanel() {
    this.modeBtns = Object.entries(MODES).map(([k, m]) => btn(m.name, () => this.setMode(k), 'small'));
    this.note = el('div', { class: 'callout cyan' });
    const pillar = (ico, color, t, d) => el('div', { class: 'pillar' },
      el('div', { class: 'ico', style: `background:${color}22;color:${color};border:1px solid ${color}55` }, ico),
      el('div', {}, el('div', { class: 't' }, t), el('div', { class: 'd', html: d })));

    this.panel = el('div', {},
      el('div', { class: 'kicker' }, 'Chapter 7 · Why So Fast'),
      el('h2', {}, '量子计算为什么快？'),
      el('p', { class: 'lead', html: '不是因为“时钟更快”——量子门其实比晶体管<b>慢上千倍</b>。快，是因为对某些问题，量子算法需要的<span class="hl">步数</span>少得多。' }),
      section('三大支柱',
        el('div', { class: 'pillars' },
          pillar('ψ', '#5ce1e6', '叠加：指数级的“草稿纸”', 'n 个量子比特同时承载 2<sup>n</sup> 个振幅；一个量子门作用一次，就同时更新所有振幅。'),
          pillar('∞', '#b18cff', '纠缠：无法拆分的关联', '纠缠使整体状态无法分解为各比特之和，经典计算机必须完整记录 2<sup>n</sup> 个数才能模拟。'),
          pillar('≈', '#f3c46b', '干涉：让正确答案浮现', '振幅可正可负。精心设计的线路让错误答案相互抵消、正确答案相互加强，最终一次测量就大概率得到答案。'),
        ),
      ),
      section('加速有多大？（右侧 3D 图，纵轴为对数刻度）',
        el('div', { class: 'btn-row' }, ...this.modeBtns),
        this.note,
        el('p', { html: '<b>Shor 算法</b>把分解问题转化为“找周期”，用量子傅里叶变换让周期信息通过干涉凸显出来，实现<b>指数级</b>加速——这正是 RSA 加密面临的威胁。<b>Grover</b> 则是适用面更广的<b>平方级</b>加速。' }),
      ),
      section('但它不是万能的',
        el('ul', { class: 'list' },
          el('li', { html: '只有具备特殊结构的问题才有大幅加速（分解、量子化学模拟、某些线性代数等）；办公、上网、游戏不会更快。' }),
          el('li', { html: '每次测量只得到一个结果，算法必须靠干涉把答案“集中”起来。' }),
          el('li', { html: '量子态极其脆弱：需要<b>量子纠错</b>，一个可靠的逻辑比特要用成百上千个物理比特；破解 RSA-2048 估计需要约百万量级的物理比特。' }),
          el('li', { html: '对小规模问题，经典计算机往往更快（见“无序搜索”图左侧）。' }),
        ),
      ),
      section('最有希望的应用',
        el('div', { class: 'stat-grid' },
          ...[['🧪', '分子与材料模拟'], ['🔐', '密码分析 / 抗量子密码'], ['💊', '药物与催化剂设计'], ['📈', '优化与采样（探索中）']].map(([i, t]) =>
            el('div', { class: 'stat' }, el('div', { class: 'v', style: 'font-size:20px' }, i), el('div', { class: 'k', style: 'font-size:12.5px;color:#c3cfe0' }, t))),
        ),
      ),
    );
  }

  setMode(key) {
    this.mode = key;
    const M = MODES[key];
    this.modeBtns.forEach((b, i) => b.classList.toggle('primary', Object.keys(MODES)[i] === key));
    this.note.innerHTML = M.note;

    // 清空旧图表
    this.chart.traverse((o) => { if (o.isCSS2DObject) o.element.remove(); });
    this.chart.clear();

    const maxDec = Math.max(...M.groups.map((g) => g.c));
    const H = 7.2;
    const sc = H / maxDec;
    const gap = 2.25;
    const n = M.groups.length;
    const x0 = -((n - 1) * gap) / 2;
    const width = (n - 1) * gap + 2.4;

    // 底座与背板
    const base = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, 2.0), new THREE.MeshStandardMaterial({ color: 0x141e30, metalness: 0.5, roughness: 0.45 }));
    base.position.y = -0.06;
    this.chart.add(base);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, H + 0.8), new THREE.MeshBasicMaterial({ color: 0x0c1528, transparent: true, opacity: 0.6 }));
    wall.position.set(0, (H + 0.8) / 2, -1.0);
    this.chart.add(wall);
    const step = maxDec > 30 ? 10 : 3;
    const pts = [];
    for (let d = 0; d <= maxDec + 0.5; d += step) {
      pts.push(-width / 2, d * sc, -0.99, width / 2, d * sc, -0.99);
      const lb = label3D(`10<sup>${d}</sup>`, 'axis-tag', [1, 0.5]);
      lb.position.set(-width / 2 - 0.1, d * sc, -1);
      this.chart.add(lb);
    }
    const grid = new THREE.BufferGeometry();
    grid.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.chart.add(new THREE.LineSegments(grid, new THREE.LineBasicMaterial({ color: 0x2f4669 })));
    const yl = label3D(`所需${M.unit}（对数刻度）`, 'axis-tag', [0, 0.5]);
    yl.position.set(-width / 2, H + 0.6, -1);
    this.chart.add(yl);

    const geo = new THREE.BoxGeometry(0.62, 1, 0.62).translate(0, 0.5, 0);
    const mats = {
      c: new THREE.MeshStandardMaterial({ color: 0xd9733f, emissive: 0xff8a4c, emissiveIntensity: 0.18, metalness: 0.2, roughness: 0.45, envMapIntensity: 0.5 }),
      q: new THREE.MeshStandardMaterial({ color: 0x3fbcc4, emissive: 0x5ce1e6, emissiveIntensity: 0.25, metalness: 0.2, roughness: 0.45, envMapIntensity: 0.5 }),
    };
    this.bars = [];
    M.groups.forEach((g, i) => {
      const x = x0 + i * gap;
      for (const kind of ['c', 'q']) {
        const dec = g[kind];
        const h = Math.max(dec * sc, 0.02);
        const bar = new THREE.Mesh(geo, mats[kind]);
        bar.position.set(x + (kind === 'c' ? -0.38 : 0.38), 0, 0);
        bar.scale.y = 0.001;
        this.chart.add(bar);
        const secs = dec - (kind === 'c' ? M.cRate : M.qRate);
        const tag = label3D(`${fmtSci(dec)} 次<br><b>${fmtDuration(secs)}</b>`, `bar-tag ${kind}`, [0.5, 1]);
        tag.position.set(bar.position.x, h + 0.15, 0);
        tag.element.style.opacity = '0';
        tag.element.style.transition = 'opacity 0.5s';
        this.chart.add(tag);
        this.bars.push({ bar, h, tag, delay: i * 0.12 + (kind === 'q' ? 0.06 : 0) });
      }
      const lb = label3D(g.label, 'big-tag', [0.5, 0]);
      lb.position.set(x, -0.1, 1.15);
      this.chart.add(lb);
    });
    // 图例
    const lg = label3D('<span style="color:#ff8a4c">■ 经典计算机</span>　<span style="color:#5ce1e6">■ 量子计算机</span>', 'axis-tag', [1, 0.5]);
    lg.position.set(width / 2, H + 0.6, -1);
    lg.element.style.fontSize = '13px';
    this.chart.add(lg);

    // 生长动画
    for (const b of this.bars) {
      this.app.tweens.add(1.2, (k) => {
        b.bar.scale.y = Math.max(b.h * k, 0.001);
      }, { delay: b.delay, onDone: () => (b.tag.element.style.opacity = '1') });
    }
  }

  enter() { if (this.mode) this.setMode(this.mode); }

  update() {}
}
