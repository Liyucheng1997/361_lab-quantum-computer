import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAT, el, btn, toggle, section, label3D } from '../util.js';
import {
  CHIP, ARM, ARM_W, LINE_W, FEED_W, qubits, couplers, resonators, lines, feedline, pads, bridges, squidOf, chipTextures,
} from '../chipLayout.js';

const H = 0.018; // 金属薄膜在模型中的（夸张后的）厚度

// 沿折线生成一串扁平长方体并合并
function polylineGeo(pts, w, h, y = 0) {
  const geos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const b = new THREE.BoxGeometry(len + w, h, w);
    b.rotateY(-Math.atan2(z1 - z0, x1 - x0));
    b.translate((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2);
    geos.push(b);
  }
  return mergeGeometries(geos);
}

function boxAt(w, h, d, x, y, z) {
  const b = new THREE.BoxGeometry(w, h, d);
  b.translate(x, y, z);
  return b;
}

export default class ChipScene {
  static id = 'chip';
  static title = '量子芯片';

  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.view = { pos: [0, 15.5, 14.5], target: [0, -0.5, 0.8], min: 0.25, max: 40, bloom: 0.8 };
    this.running = true;
    this.labels = [];
    this.events = [];
    this.timer = 0;
    this.layer = 0;
    this.build();
    this.buildPanel();
  }

  build() {
    const g = this.group;
    const gold = MAT.gold(), goldMatte = MAT.goldMatte(), steel = MAT.steel();
    const alu = new THREE.MeshStandardMaterial({ color: 0xd4d9e0, metalness: 1, roughness: 0.28, envMapIntensity: 0.5 });
    this.alu = alu;

    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(6, 12, 8);
    const rim = new THREE.DirectionalLight(0x7cc0ff, 1.2);
    rim.position.set(-8, 5, -6);
    g.add(key, rim, new THREE.HemisphereLight(0x9cc4ff, 0x20160a, 0.4));

    // 样品座（镀金铜）
    const holder = new THREE.Mesh(new THREE.BoxGeometry(21, 0.8, 21), goldMatte);
    holder.position.y = -0.75;
    g.add(holder);
    // PCB（中间开窗）
    const s = new THREE.Shape();
    s.moveTo(-8.6, -8.6); s.lineTo(8.6, -8.6); s.lineTo(8.6, 8.6); s.lineTo(-8.6, 8.6);
    const hole = new THREE.Path();
    hole.moveTo(-6.25, -6.25); hole.lineTo(-6.25, 6.25); hole.lineTo(6.25, 6.25); hole.lineTo(6.25, -6.25);
    s.holes.push(hole);
    const pcbGeo = new THREE.ExtrudeGeometry(s, { depth: 0.15, bevelEnabled: false });
    pcbGeo.rotateX(-Math.PI / 2);
    const pcbTex = this.pcbTexture();
    pcbTex.repeat.set(1 / 17.2, 1 / 17.2);
    pcbTex.offset.set(0.5, 0.5);
    const pcbSide = new THREE.MeshStandardMaterial({ color: 0x2b3530, roughness: 0.7 });
    const pcb = new THREE.Mesh(pcbGeo, [new THREE.MeshStandardMaterial({ map: pcbTex, metalnessMap: pcbTex, metalness: 0.9, roughness: 0.35 }), pcbSide]);
    pcb.position.y = -0.35;
    g.add(pcb);

    // 硅衬底
    const sub = new THREE.Mesh(new THREE.BoxGeometry(CHIP, 0.3, CHIP), new THREE.MeshStandardMaterial({ color: 0x2c3242, metalness: 0.5, roughness: 0.3 }));
    sub.position.y = -0.15;
    g.add(sub);
    // 芯片表面（接地面 + 刻蚀间隙）
    const { map, metal } = chipTextures();
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(CHIP, CHIP), new THREE.MeshStandardMaterial({ map, metalnessMap: metal, metalness: 1, roughness: 0.5, envMapIntensity: 0.38 }));
    surf.rotation.x = -Math.PI / 2;
    surf.position.y = 0.001;
    g.add(surf);

    // ---- 立体金属结构 ----
    const geos = [];
    for (const q of qubits) {
      geos.push(boxAt(2 * ARM, H * 1.6, ARM_W, q.x, H * 0.8, q.z));
      geos.push(boxAt(ARM_W, H * 1.6, 2 * ARM, q.x, H * 0.8, q.z));
    }
    for (const c of couplers) {
      if (c.dir === 'x') geos.push(boxAt(c.x1 - c.x0, H, 0.06, (c.x0 + c.x1) / 2, H / 2, c.z));
      else geos.push(boxAt(0.06, H, c.z1 - c.z0, c.x, H / 2, (c.z0 + c.z1) / 2));
      // 耦合器中央的 SQUID 小方块
      const cx = c.dir === 'x' ? (c.x0 + c.x1) / 2 : c.x, cz = c.dir === 'x' ? c.z : (c.z0 + c.z1) / 2;
      geos.push(boxAt(0.12, H * 1.2, 0.12, cx, H * 0.6, cz));
    }
    for (const r of resonators) {
      geos.push(polylineGeo(r.pts, LINE_W, H));
      geos.push(boxAt(0.1, H, 0.1, r.claw[0], H / 2, r.claw[1]));
    }
    for (const l of lines) geos.push(polylineGeo(l.pts, LINE_W, H));
    geos.push(polylineGeo(feedline.pts, FEED_W, H));
    for (const p of pads) {
      const horiz = p.side === 'left' || p.side === 'right';
      geos.push(boxAt(horiz ? 0.34 : 0.24, H, horiz ? 0.24 : 0.34, p.x, H / 2, p.z));
    }
    // 约瑟夫森结短桩 + SQUID 环
    for (const q of qubits) {
      const sq = squidOf(q);
      geos.push(polylineGeo([[q.x, q.z], [sq.x + 0.05, sq.z + 0.05]], 0.06, H));
      geos.push(boxAt(0.1, H * 0.7, 0.018, sq.x, H * 0.35, sq.z - 0.05));
      geos.push(boxAt(0.1, H * 0.7, 0.018, sq.x, H * 0.35, sq.z + 0.05));
      geos.push(boxAt(0.018, H * 0.7, 0.04, sq.x - 0.05, H * 0.35, sq.z - 0.035));
      geos.push(boxAt(0.018, H * 0.7, 0.04, sq.x - 0.05, H * 0.35, sq.z + 0.035));
      geos.push(boxAt(0.018, H * 0.7, 0.04, sq.x + 0.05, H * 0.35, sq.z - 0.035));
      geos.push(boxAt(0.018, H * 0.7, 0.04, sq.x + 0.05, H * 0.35, sq.z + 0.035));
    }
    g.add(new THREE.Mesh(mergeGeometries(geos), alu));

    // 约瑟夫森结（Al/AlOx/Al 隧道结）——发光的小点
    const jGeo = [];
    for (const q of qubits) {
      const sq = squidOf(q);
      jGeo.push(boxAt(0.022, H * 0.9, 0.03, sq.x - 0.05, H * 0.45, sq.z));
      jGeo.push(boxAt(0.022, H * 0.9, 0.03, sq.x + 0.05, H * 0.45, sq.z));
    }
    g.add(new THREE.Mesh(mergeGeometries(jGeo), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc861).multiplyScalar(2.2), toneMapped: false })));

    // 空气桥
    const bGeo = [];
    for (const b of bridges) {
      const span = b.cross ? 0.32 : 0.2;
      const parts = [
        boxAt(0.035, 0.05, 0.035, 0, 0.025, -span / 2),
        boxAt(0.035, 0.05, 0.035, 0, 0.025, span / 2),
        boxAt(0.045, 0.012, span + 0.035, 0, 0.056, 0),
      ];
      const m = mergeGeometries(parts);
      if (b.dir === 'z') m.rotateY(Math.PI / 2);
      m.translate(b.x, 0, b.z);
      bGeo.push(m);
    }
    g.add(new THREE.Mesh(mergeGeometries(bGeo), alu));

    // 引线键合（铝线）+ PCB 上的金焊盘
    const wires = [];
    const padGeo = [];
    for (const p of pads) {
      const horiz = p.side === 'left' || p.side === 'right';
      const out = horiz ? Math.sign(p.x) : Math.sign(p.z);
      for (const off of [-0.07, 0, 0.07]) {
        const a = horiz ? new THREE.Vector3(p.x - out * 0.05, H, p.z + off) : new THREE.Vector3(p.x + off, H, p.z - out * 0.05);
        const e = horiz ? new THREE.Vector3(out * 6.95, -0.2, p.z + off * 1.6) : new THREE.Vector3(p.x + off * 1.6, -0.2, out * 6.95);
        const mid = a.clone().lerp(e, 0.35).setY(0.55);
        const curve = new THREE.QuadraticBezierCurve3(a, mid, e);
        wires.push(new THREE.TubeGeometry(curve, 24, 0.009, 5));
      }
      padGeo.push(horiz ? boxAt(0.5, 0.02, 0.36, out * 7.0, -0.2, p.z) : boxAt(0.36, 0.02, 0.5, p.x, -0.2, out * 7.0));
    }
    g.add(new THREE.Mesh(mergeGeometries(wires), new THREE.MeshStandardMaterial({ color: 0xd8dde5, metalness: 1, roughness: 0.2 })));
    g.add(new THREE.Mesh(mergeGeometries(padGeo), gold));

    // SMP 接头 & 螺丝
    const conGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.32, 0.32, 0.35, 24).translate(0, 0.17, 0),
      new THREE.CylinderGeometry(0.42, 0.42, 0.12, 6).translate(0, 0.06, 0),
      new THREE.CylinderGeometry(0.12, 0.12, 0.4, 16).translate(0, 0.4, 0),
    ]);
    const cons = [];
    for (const p of pads) {
      const horiz = p.side === 'left' || p.side === 'right';
      const out = horiz ? Math.sign(p.x) : Math.sign(p.z);
      cons.push(horiz ? [out * 9.6, p.z * 1.35] : [p.x * 1.35, out * 9.6]);
    }
    const ci = new THREE.InstancedMesh(conGeo, gold, cons.length);
    const m4 = new THREE.Matrix4();
    cons.forEach(([x, z], i) => { m4.makeTranslation(x, -0.35, z); ci.setMatrixAt(i, m4); });
    g.add(ci);
    const screws = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 20), steel, 8);
    [[-8, -8], [8, -8], [-8, 8], [8, 8], [0, -10], [0, 10], [-10, 0], [10, 0]].forEach(([x, z], i) => {
      m4.makeTranslation(x * 0.98, -0.12, z * 0.98);
      screws.setMatrixAt(i, m4);
    });
    g.add(screws);

    // ---- 动态发光层 ----
    this.qGlow = qubits.map((q) => {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ce1e6), transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.11, 32), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(q.x, H * 1.6 + 0.004, q.z);
      g.add(mesh);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.66, 64), mat.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(q.x, 0.01, q.z);
      ring.material.opacity = 0;
      g.add(ring);
      return { mesh, ring, color: new THREE.Color(0x5ce1e6), base: new THREE.Color(0x5ce1e6), flash: 0, ringT: 0 };
    });
    this.cGlow = couplers.map((c) => {
      const len = c.dir === 'x' ? c.x1 - c.x0 + 1.0 : c.z1 - c.z0 + 1.0;
      const geo = c.dir === 'x' ? new THREE.BoxGeometry(len, 0.03, 0.09) : new THREE.BoxGeometry(0.09, 0.03, len);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb18cff).multiplyScalar(3), transparent: true, opacity: 0, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      mesh.position.set(c.dir === 'x' ? (c.x0 + c.x1) / 2 : c.x, H + 0.02, c.dir === 'x' ? c.z : (c.z0 + c.z1) / 2);
      g.add(mesh);
      return { mesh, t: 0 };
    });
    this.rGlow = resonators.map((r) => {
      const mesh = new THREE.Mesh(polylineGeo(r.pts.slice(1), 0.07, 0.01, H + 0.004), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a4c).multiplyScalar(2.5), transparent: true, opacity: 0, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      g.add(mesh);
      return { mesh, t: 0 };
    });
    const pulseGeo = new THREE.SphereGeometry(0.06, 12, 8);
    this.pulsePool = [];
    for (let i = 0; i < 30; i++) {
      const mesh = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ce1e6).multiplyScalar(4), toneMapped: false }));
      mesh.visible = false;
      g.add(mesh);
      this.pulsePool.push({ mesh, active: false });
    }
    this.feedPulse = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a4c).multiplyScalar(4), toneMapped: false }));
    this.feedPulse.visible = false;
    g.add(this.feedPulse);

    this.buildLabels();
  }

  pcbTexture() {
    const S = 1024, c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    const P = (v) => (v / 17.2 + 0.5) * S;
    x.fillStyle = '#16201c'; x.fillRect(0, 0, S, S);
    // 网格过孔
    x.fillStyle = '#c99a48';
    for (let i = -8.2; i <= 8.2; i += 0.42) for (let j = -8.2; j <= 8.2; j += 0.42) {
      if (Math.max(Math.abs(i), Math.abs(j)) < 7.4) continue;
      x.beginPath(); x.arc(P(i), P(j), 2.2, 0, Math.PI * 2); x.fill();
    }
    // 共面波导走线：PCB 焊盘 → 外侧接头
    x.strokeStyle = '#e2b45c'; x.lineCap = 'round';
    for (const p of pads) {
      const horiz = p.side === 'left' || p.side === 'right';
      const out = horiz ? Math.sign(p.x) : Math.sign(p.z);
      const a = horiz ? [out * 7.0, p.z] : [p.x, out * 7.0];
      const b = horiz ? [out * 9.6, p.z * 1.35] : [p.x * 1.35, out * 9.6];
      x.lineWidth = 0.16 / 17.2 * S;
      x.beginPath(); x.moveTo(P(a[0]), P(a[1])); x.lineTo(P(b[0]), P(b[1])); x.stroke();
    }
    // 窗口边缘金色接地环
    x.lineWidth = 0.3 / 17.2 * S;
    x.strokeRect(P(-6.6), P(-6.6), (13.2 / 17.2) * S, (13.2 / 17.2) * S);
    // y 方向翻转：ExtrudeGeometry 的 UV 与 canvas 方向一致性无关紧要（对称）
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  buildLabels() {
    const q = qubits[12];
    const sq = squidOf(qubits[18]);
    const cp = couplers.find((c) => c.a === 12 && c.dir === 'x');
    const r = resonators[6];
    const l = lines.find((x) => x.side === 'left');
    const b = bridges[3];
    const p = pads.find((x) => x.side === 'bottom');
    const add = (html, pos, info) => {
      const lb = label3D(html, 'label leader', [0, 0.5]);
      lb.position.set(...pos);
      lb.element.addEventListener('click', () => { this.info.innerHTML = info; });
      this.group.add(lb);
      this.labels.push(lb);
    };
    add('<span class="dot" style="color:#5ce1e6"></span>Transmon 量子比特', [q.x + 0.5, 0.05, q.z],
      '<b>Transmon（Xmon 十字形）</b><br>一块十字形超导电容 + 约瑟夫森结，组成一个非线性 LC 振荡器——相当于一个“人造原子”。它最低的两个能级被用作 |0⟩ 和 |1⟩。');
    add('<span class="dot" style="color:#ffc861"></span>SQUID / 约瑟夫森结', [sq.x, 0.03, sq.z],
      '<b>约瑟夫森结</b><br>两层铝之间约 1–2 nm 的氧化铝绝缘层。库珀对可以量子隧穿通过它，形成一个<b>非线性电感</b>，让能级间距不再均匀——这样才能只操控 |0⟩↔|1⟩ 而不误激发到 |2⟩。两个结并联成 SQUID，可用磁通调节频率。');
    add('<span class="dot" style="color:#b18cff"></span>可调耦合器', [(cp.x0 + cp.x1) / 2, 0.03, cp.z],
      '<b>可调耦合器</b><br>平时关闭，让相邻比特互不干扰；需要做两比特门（如 CZ）时，用磁通脉冲把它“打开”几十纳秒，两个比特发生相互作用 → 产生<b>纠缠</b>。');
    add('<span class="dot" style="color:#ff8a4c"></span>读出谐振腔', [r.pts[5][0] + 0.3, 0.03, r.pts[5][1]],
      '<b>读出谐振腔</b><br>一段蛇形的 λ/4 共面波导谐振腔。比特处于 |0⟩ 或 |1⟩ 时，谐振腔的频率会有微小偏移（色散读出），向读出总线发一个微波探测脉冲，就能从反射信号中判断比特状态。');
    add('<span class="dot" style="color:#5aa9ff"></span>微波控制线', [(l.pts[0][0] + l.pts[1][0]) / 2, 0.03, l.pts[0][1]],
      '<b>XY 控制线</b><br>从室温传来的 ~5 GHz 微波脉冲经这里耦合到比特。脉冲的<b>幅度和时长</b>决定在布洛赫球上转多少角度，<b>相位</b>决定绕哪根轴转——这就是单比特量子门。');
    add('空气桥', [b.x, 0.07, b.z + 0.1],
      '<b>空气桥</b><br>跨在共面波导上方的微小铝桥，把两侧地平面连在一起，抑制寄生模式；在线路交叉处也用它“立交”跨越。');
    add('引线键合', [p.x + 0.1, 0.3, p.z + 0.75],
      '<b>引线键合</b><br>直径约 25 μm 的铝线，把芯片焊盘连接到 PCB，再经 SMP 接头接到同轴线上。');
    add('<span class="dot" style="color:#ff8a4c"></span>读出总线', [0, 0.03, feedline.pts[0][1]],
      '<b>读出总线（Feedline）</b><br>多个读出谐振腔共享一根传输线，用不同频率区分（频分复用），一次测量多个比特。');
  }

  buildPanel() {
    this.info = el('div', { class: 'info-card', html: '点击芯片上的标签了解每个部件。' });
    const q = qubits[12];
    const sq = squidOf(q);
    const levels = `
<svg class="circuit" viewBox="0 0 340 170">
  <defs><linearGradient id="wellg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#5aa9ff" stop-opacity="0.25"/><stop offset="1" stop-color="#5aa9ff" stop-opacity="0"/></linearGradient></defs>
  <text x="80" y="16" fill="#8a9ab3" font-size="11" text-anchor="middle">谐振子（等间距）</text>
  <path d="M 20 30 Q 80 230 140 30" fill="none" stroke="#8a9ab3" stroke-width="1.5"/>
  ${[0, 1, 2, 3].map((n) => `<line x1="${80 - 14 - n * 9}" x2="${80 + 14 + n * 9}" y1="${140 - n * 28}" y2="${140 - n * 28}" stroke="#8a9ab3" stroke-width="2"/>`).join('')}
  <text x="250" y="16" fill="#5ce1e6" font-size="11" text-anchor="middle">Transmon（非等间距）</text>
  <path d="M 190 30 C 215 120, 230 150, 250 150 C 270 150, 285 120, 310 30" fill="url(#wellg)" stroke="#5aa9ff" stroke-width="1.5"/>
  ${[0, 34, 64, 90].map((d, n) => `<line x1="${250 - 16 - n * 9}" x2="${250 + 16 + n * 9}" y1="${140 - d}" y2="${140 - d}" stroke="${n < 2 ? '#5ce1e6' : '#56657d'}" stroke-width="${n < 2 ? 2.5 : 1.5}"/>`).join('')}
  <text x="296" y="144" fill="#fff" font-size="12">|0⟩</text>
  <text x="300" y="110" fill="#fff" font-size="12">|1⟩</text>
  <text x="306" y="80" fill="#8a9ab3" font-size="12">|2⟩</text>
  <text x="200" y="126" fill="#f3c46b" font-size="10">≈5 GHz</text>
</svg>`;

    this.panel = el('div', {},
      el('div', { class: 'kicker' }, 'Chapter 2 · Processor'),
      el('h2', {}, '芯片上的“人造原子”'),
      el('p', { class: 'lead', html: '这是一块 <b>5×5 = 25 比特</b>的超导量子芯片（参考 Google Sycamore 等结构绘制）。每个发光的十字就是一个 <span class="hl">transmon 量子比特</span>，相邻比特之间由可调耦合器相连。' }),
      section('视角',
        el('div', { class: 'btn-row' },
          btn('芯片全景', () => this.app.flyTo(this.view.pos, this.view.target)),
          btn('放大一个比特', () => this.app.flyTo([q.x + 1.1, 1.6, q.z + 2.0], [q.x, 0, q.z])),
          btn('约瑟夫森结', () => this.app.flyTo([sq.x + 0.22, 0.32, sq.z + 0.38], [sq.x, 0, sq.z])),
          btn('引线键合', () => this.app.flyTo([-8.5, 2.4, 3.2], [-6.2, 0, 1.0])),
        ),
        this.info,
      ),
      section('人造原子：为什么用约瑟夫森结？',
        el('div', { html: levels }),
        el('p', { html: '普通 LC 电路的能级等间距，一个微波脉冲会把 0→1→2→… 一路激发上去。约瑟夫森结让能级<b>不等间距</b>，于是可以只在 |0⟩ 与 |1⟩ 之间操作，把它当作一个<b>量子比特</b>。' }),
      ),
      section('动画里发生了什么',
        el('ul', { class: 'list' },
          el('li', { html: '<span class="hl">青色光点</span>：微波脉冲沿控制线飞向比特，执行单比特门（旋转）。' }),
          el('li', { html: '<span style="color:#b18cff;font-weight:600">紫色闪光</span>：耦合器打开，相邻比特执行 CZ 门，产生<b>纠缠</b>。' }),
          el('li', { html: '<span style="color:#ff8a4c;font-weight:600">橙色</span>：线路末尾，所有读出谐振腔同时被探测，得到一串 0/1 结果。' }),
        ),
        toggle('运行随机量子线路', true, (v) => { this.running = v; }),
        toggle('显示标签', true, (v) => this.labels.forEach((l) => (l.visible = v))),
      ),
      section('典型参数',
        el('div', { class: 'stat-grid' },
          ...[['比特频率', '4–7', 'GHz'], ['单比特门', '≈25', 'ns'], ['两比特门', '≈30', 'ns'], ['相干时间', '≈100', 'μs'], ['工作温度', '≈10', 'mK'], ['芯片尺寸', '≈1', 'cm']].map(([k, v, u]) =>
            el('div', { class: 'stat' }, el('div', { class: 'k' }, k), el('div', { class: 'v', html: `${v} <small>${u}</small>` }))),
        ),
        el('div', { class: 'callout', html: '相干时间 / 门时间 ≈ 几千：量子态“坏掉”之前，只来得及做几千步操作。这就是为什么需要<b>量子纠错</b>，以及为什么硬件要做得如此极致。' }),
      ),
    );
  }

  // 单比特门层：随机一些比特被“旋转”
  singleLayer() {
    for (const q of qubits) {
      if (Math.random() < 0.55) {
        const line = lines.find((l) => l.q === q.index);
        const hue = Math.random();
        if (line && Math.random() < 0.7) this.launchPulse(line, q.index, hue);
        else this.kick(q.index, hue, 0.2);
      }
    }
  }

  // 两比特门层：按 Sycamore 风格的 4 种耦合器图样之一
  twoLayer() {
    const pattern = this.layer % 4;
    couplers.forEach((c, i) => {
      const qa = qubits[c.a];
      // 每种图样都是一组互不相交的耦合器，保证一个比特同一时刻只参与一个两比特门
      const dir = pattern % 2 ? 'z' : 'x';
      const on = c.dir === dir && (dir === 'x' ? qa.i : qa.j) % 2 === (pattern >> 1);
      if (on && Math.random() < 0.85) {
        this.cGlow[i].t = 1;
        const mix = this.qGlow[c.a].color.clone().lerp(this.qGlow[c.b].color, 0.5);
        mix.offsetHSL(0.08, 0, 0);
        this.kick(c.a, null, 0.1, mix);
        this.kick(c.b, null, 0.1, mix);
      }
    });
  }

  readout() {
    this.rGlow.forEach((r) => (r.t = 1));
    this.feedPulse.visible = true;
    this.feedT = 0;
    qubits.forEach((q) => {
      const bit = Math.random() < 0.5;
      this.kick(q.index, null, 0.15, new THREE.Color(bit ? 0xff8a4c : 0x5aa9ff));
    });
  }

  kick(index, hue, delay = 0, color) {
    this.events.push({ t: delay, fn: () => {
      const qg = this.qGlow[index];
      if (color) qg.color.copy(color);
      else qg.color.setHSL(hue, 0.85, 0.6);
      qg.flash = 1;
      qg.ringT = 1;
    } });
  }

  launchPulse(line, qIndex, hue) {
    const p = this.pulsePool.find((x) => !x.active);
    if (!p) return;
    p.active = true;
    p.t = 0;
    p.dur = 0.45;
    p.from = new THREE.Vector3(line.pts[0][0], 0.05, line.pts[0][1]);
    p.to = new THREE.Vector3(line.pts[1][0], 0.05, line.pts[1][1]);
    p.q = qIndex;
    p.hue = hue;
    p.mesh.visible = true;
  }

  update(dt, t) {
    if (this.running) {
      this.timer += dt;
      if (this.timer > 0.75) {
        this.timer = 0;
        const step = this.layer % 7;
        if (step === 6) this.readout();
        else if (step % 2 === 0) this.singleLayer();
        else this.twoLayer();
        this.layer++;
      }
    }
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      e.t -= dt;
      if (e.t <= 0) { e.fn(); this.events.splice(i, 1); }
    }
    for (const p of this.pulsePool) {
      if (!p.active) continue;
      p.t += dt / p.dur;
      if (p.t >= 1) {
        p.active = false; p.mesh.visible = false;
        this.kick(p.q, p.hue, 0);
        continue;
      }
      p.mesh.position.lerpVectors(p.from, p.to, p.t);
    }
    if (this.feedPulse.visible) {
      this.feedT += dt / 0.6;
      if (this.feedT >= 1) this.feedPulse.visible = false;
      else this.feedPulse.position.set(-5.5 + 11 * this.feedT, 0.06, feedline.pts[0][1]);
    }
    for (const qg of this.qGlow) {
      qg.flash = Math.max(0, qg.flash - dt * 1.6);
      qg.ringT = Math.max(0, qg.ringT - dt * 1.4);
      const k = 1.1 + 2.4 * qg.flash + 0.2 * Math.sin(t * 3 + qg.mesh.position.x);
      qg.mesh.material.color.copy(qg.color).multiplyScalar(k);
      qg.mesh.scale.setScalar(1 + qg.flash * 0.6);
      qg.ring.material.color.copy(qg.color).multiplyScalar(2.5);
      qg.ring.material.opacity = qg.ringT * 0.8;
      qg.ring.scale.setScalar(1 + (1 - qg.ringT) * 0.35);
    }
    for (const c of this.cGlow) { c.t = Math.max(0, c.t - dt * 1.5); c.mesh.material.opacity = c.t; }
    for (const r of this.rGlow) { r.t = Math.max(0, r.t - dt * 1.1); r.mesh.material.opacity = r.t * 0.9; }
  }
}
