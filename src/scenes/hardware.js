import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAT, el, toggle, section, label3D } from '../util.js';
import { chipTextures } from '../chipLayout.js';

// 稀释制冷机各温区（自上而下）
const STAGES = [
  {
    key: 'rt', name: '室温顶板', temp: '300 K', y: 8.0, r: 3.3, h: 0.34, color: '#ff6b4a',
    text: '不锈钢顶法兰，整台机器悬挂于此。所有微波线缆从这里经气密馈通进入真空腔，上方是<b>脉冲管制冷机</b>的冷头和抽气管路。',
  },
  {
    key: '50k', name: '50 K 级', temp: '50 K', y: 5.7, r: 3.0, h: 0.16, color: '#ffa04a',
    text: '脉冲管第一级冷却。它和挂在下方的铝制辐射屏蔽罩一起，拦截来自室温的热辐射——这是整个制冷链的“第一道防线”。',
  },
  {
    key: '4k', name: '4 K 级', temp: '4 K', y: 3.5, r: 2.7, h: 0.16, color: '#ffd35a',
    text: '脉冲管第二级，温度已接近液氦。这里装有 <b>HEMT 低噪声放大器</b>，把从芯片读出的只有几个光子的微弱信号放大约 40 dB。',
  },
  {
    key: 'still', name: '蒸馏室 Still', temp: '0.8 K', y: 1.5, r: 2.35, h: 0.15, color: '#9be37a',
    text: '稀释制冷的“泵”：³He 从 ³He/⁴He 混合液中优先蒸发被抽走，驱动整个循环。下方螺旋状的铜管是<b>连续热交换器</b>，让回流的 ³He 预冷。',
  },
  {
    key: 'cp', name: '冷板 Cold Plate', temp: '100 mK', y: -0.4, r: 2.1, h: 0.14, color: '#5ce1e6',
    text: '中间热沉。输入线在这里再经过一级<b>衰减器</b>：把室温带下来的热噪声一级一级“吃掉”，只让精心设计的微波脉冲到达芯片。',
  },
  {
    key: 'mxc', name: '混合室 MXC', temp: '≈10 mK', y: -2.4, r: 1.9, h: 0.2, color: '#5aa9ff',
    text: '最冷的地方。³He 原子穿过相分界面“溶解”进 ⁴He 中时吸收热量，温度可低至约 10 mK——比宇宙微波背景（2.7 K）还冷约 270 倍。读出线上的<b>环行器/隔离器</b>也装在这里。',
  },
];

const PARTS = {
  chip: {
    name: '量子处理器', temp: '10 mK', color: '#b18cff', y: -5.2,
    text: '超导量子芯片装在镀金铜样品盒中，外面套着<b>磁屏蔽罩</b>。芯片上的 transmon 量子比特由铝/铌薄膜和约瑟夫森结构成，只有在接近绝对零度时才能保持量子相干。切换到第 2 章可放大查看芯片。',
  },
  cables: {
    name: '同轴线（输入/输出）', temp: '', color: '#c8ccd2', y: 2.5,
    text: '每根输入线逐级衰减约 60 dB，把室温热噪声压到 mK 级以下；输出线则反过来，经过隔离器、HEMT 放大器把信号送回室温。动画中<span style="color:#5ce1e6">青色</span>脉冲是控制信号，<span style="color:#ff8a4c">橙色</span>是读出信号。',
  },
  pulse: {
    name: '脉冲管制冷机', temp: '', color: '#ff6b4a', y: 6.8,
    text: '无需液氦的“干式”预冷：高压氦气周期性压缩/膨胀，把 50 K 和 4 K 两级冷下来，为稀释制冷做准备。',
  },
};

export default class HardwareScene {
  static id = 'hardware';
  static title = '硬件结构';

  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.view = { pos: [12.5, 3.2, 24.5], target: [0, 0.6, 0], min: 2.5, max: 50, bloom: 0.7 };
    this.time = 0;
    this.labels = [];
    this.partLabels = [];
    this.build();
    this.buildPanel();
  }

  build() {
    const g = this.group;
    const mats = {
      gold: MAT.gold(), goldMatte: MAT.goldMatte(), steel: MAT.steel(), brushed: MAT.brushed(),
      copper: MAT.copper(), g10: MAT.g10(), dark: MAT.dark(), alu: MAT.aluminum(),
      silver: new THREE.MeshStandardMaterial({ color: 0xe6e8ec, metalness: 1, roughness: 0.15 }),
    };
    this.mats = mats;

    // 灯光
    const key = new THREE.DirectionalLight(0xfff1dd, 2.2);
    key.position.set(8, 14, 10);
    const rim = new THREE.DirectionalLight(0x6fb6ff, 1.4);
    rim.position.set(-10, 4, -8);
    const fill = new THREE.PointLight(0x9fd8ff, 25, 20, 2);
    fill.position.set(0, -4, 5);
    g.add(key, rim, fill, new THREE.HemisphereLight(0x8fb4ff, 0x1a1208, 0.35));

    // 地面光晕
    {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const x = c.getContext('2d');
      const grd = x.createRadialGradient(128, 128, 0, 128, 128, 128);
      grd.addColorStop(0, 'rgba(90,169,255,0.35)');
      grd.addColorStop(0.5, 'rgba(90,169,255,0.08)');
      grd.addColorStop(1, 'rgba(90,169,255,0)');
      x.fillStyle = grd; x.fillRect(0, 0, 256, 256);
      const tex = new THREE.CanvasTexture(c);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -8.8;
      g.add(floor);
      // 同心刻度环
      for (let i = 1; i <= 3; i++) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(i * 2.2, i * 2.2 + 0.02, 128), new THREE.MeshBasicMaterial({ color: 0x5aa9ff, transparent: true, opacity: 0.25 / i, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = -8.79;
        g.add(ring);
      }
    }

    this.buildPlates();
    this.buildRods();
    this.buildDilutionUnit();
    this.buildPulseTube();
    this.buildSampleStage();
    this.buildCables();
    this.buildShields();
    this.buildLabels();
  }

  // ---------- 金色温区板 ----------
  plateGeo(r, h) {
    const c = Math.min(0.035, h * 0.28);
    const body = new THREE.CylinderGeometry(r, r, h - 2 * c, 160, 1, true);
    const top = new THREE.CylinderGeometry(r - c, r, c, 160, 1, false);
    top.translate(0, h / 2 - c / 2, 0);
    const bot = new THREE.CylinderGeometry(r, r - c, c, 160, 1, false);
    bot.translate(0, -h / 2 + c / 2, 0);
    return mergeGeometries([body, top, bot]);
  }

  buildPlates() {
    const { gold, steel, dark } = this.mats;
    const boltM = [];
    const m4 = new THREE.Matrix4();
    this.plates = [];
    for (const s of STAGES) {
      const mesh = new THREE.Mesh(this.plateGeo(s.r, s.h), s.key === 'rt' ? steel : gold);
      mesh.position.y = s.y;
      this.group.add(mesh);
      this.plates.push(mesh);

      // 外圈螺栓
      const nb = Math.round(s.r * 14);
      for (let i = 0; i < nb; i++) {
        const a = (i / nb) * Math.PI * 2;
        const rr = s.r - 0.12;
        m4.makeTranslation(rr * Math.cos(a), s.y + s.h / 2 + 0.015, rr * Math.sin(a));
        boltM.push(m4.clone());
      }
      // 内圈刻槽
      const groove = new THREE.Mesh(new THREE.TorusGeometry(s.r * 0.78, 0.008, 6, 160), dark);
      groove.rotation.x = Math.PI / 2;
      groove.position.y = s.y + s.h / 2;
      this.group.add(groove);

      // 选中时的发光环
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(s.r + 0.03, 0.025, 8, 200),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(s.color).multiplyScalar(3), transparent: true, opacity: 0, toneMapped: false })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = s.y;
      this.group.add(halo);
      s.halo = halo;
    }
    const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 0.035, 6), steel, boltM.length);
    boltM.forEach((m, i) => bolts.setMatrixAt(i, m));
    this.group.add(bolts);
  }

  // ---------- 支撑杆 ----------
  buildRods() {
    const { g10, gold } = this.mats;
    const specs = [
      { from: 0, to: 1, r: 2.72, n: 6, mat: g10, rad: 0.07, a0: Math.PI / 6 },
      { from: 1, to: 2, r: 2.45, n: 6, mat: g10, rad: 0.06, a0: Math.PI / 6 },
      { from: 2, to: 3, r: 2.1, n: 4, mat: gold, rad: 0.05, a0: Math.PI / 4 },
      { from: 3, to: 4, r: 1.9, n: 4, mat: gold, rad: 0.05, a0: Math.PI / 4 },
      { from: 4, to: 5, r: 1.72, n: 4, mat: gold, rad: 0.05, a0: Math.PI / 4 },
    ];
    const collarGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
    const collars = [];
    for (const sp of specs) {
      const A = STAGES[sp.from], B = STAGES[sp.to];
      const y0 = A.y - A.h / 2, y1 = B.y + B.h / 2;
      const len = y0 - y1;
      for (let i = 0; i < sp.n; i++) {
        const a = sp.a0 + (i / sp.n) * Math.PI * 2;
        const x = sp.r * Math.cos(a), z = sp.r * Math.sin(a);
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(sp.rad, sp.rad, len, 20), sp.mat);
        rod.position.set(x, (y0 + y1) / 2, z);
        this.group.add(rod);
        collars.push([x, y0 - 0.04, z, sp.rad * 1.7], [x, y1 + 0.04, z, sp.rad * 1.7]);
      }
    }
    const inst = new THREE.InstancedMesh(collarGeo, this.mats.goldMatte, collars.length);
    const m = new THREE.Matrix4();
    collars.forEach(([x, y, z, r], i) => {
      m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(r, 0.08, r));
      inst.setMatrixAt(i, m);
    });
    this.group.add(inst);
  }

  // ---------- 稀释单元：抽气管、蒸馏室、热交换器、混合室 ----------
  buildDilutionUnit() {
    const { steel, copper, gold, silver, goldMatte } = this.mats;
    const g = this.group;
    const ys = Object.fromEntries(STAGES.map((s) => [s.key, s.y]));

    // 中心抽气管（不锈钢）
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 9.9 - ys.still, 40), steel);
    pump.position.y = (9.9 + ys.still) / 2;
    g.add(pump);
    // 顶部 KF 法兰
    for (const y of [9.9, 9.1]) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 40), steel);
      f.position.y = y;
      g.add(f);
    }
    // 波纹管段
    const bellowsPts = [];
    for (let i = 0; i <= 40; i++) bellowsPts.push(new THREE.Vector2(0.22 + (i % 2 ? 0.05 : 0), i * 0.02));
    const bellows = new THREE.Mesh(new THREE.LatheGeometry(bellowsPts, 40), steel);
    bellows.position.y = 9.15;
    g.add(bellows);

    // 蒸馏室（Still pot）
    const still = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 64), gold);
    still.position.y = ys.still - 0.08 - 0.25;
    g.add(still);
    for (const dy of [-0.08, -0.58]) {
      const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.05, 64), goldMatte);
      fl.position.y = ys.still + dy;
      g.add(fl);
    }

    // 连续热交换器：双螺旋铜管
    const helix = (r, turns, yTop, yBot, phase) => {
      const pts = [];
      const n = turns * 40;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = phase + t * turns * Math.PI * 2;
        pts.push(new THREE.Vector3(r * Math.cos(a), yTop + (yBot - yTop) * t, r * Math.sin(a)));
      }
      return new THREE.CatmullRomCurve3(pts);
    };
    const yTop = ys.still - 0.65, yBot = ys.cp + 0.12;
    g.add(new THREE.Mesh(new THREE.TubeGeometry(helix(0.42, 9, yTop, yBot, 0), 600, 0.032, 10), copper));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(helix(0.42, 9, yTop - 0.04, yBot - 0.04, Math.PI), 600, 0.022, 10), copper));
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, yTop - yBot, 24), steel);
    core.position.y = (yTop + yBot) / 2;
    g.add(core);

    // 阶梯式银烧结热交换器
    const yA = ys.cp - 0.07, yB = ys.mxc + 0.75;
    const nStep = 4;
    for (let i = 0; i < nStep; i++) {
      const y = yA - 0.35 - (i * (yA - 0.35 - yB)) / (nStep - 1);
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.16, 48), silver);
      d.position.y = y;
      g.add(d);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 8, 64), goldMatte);
      rim.rotation.x = Math.PI / 2; rim.position.y = y;
      g.add(rim);
    }
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, yA - yB, 16), steel);
    tube.position.y = (yA + yB) / 2;
    g.add(tube);
    // 毛细管
    const cap = [];
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      const a = t * Math.PI * 5;
      cap.push(new THREE.Vector3(0.3 * Math.cos(a), yA - t * (yA - yB + 0.05), 0.3 * Math.sin(a)));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cap), 300, 0.016, 8), copper));

    // 混合室（金色罐体）
    const mxc = STAGES[5];
    const potH = 0.62;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, potH, 64), gold);
    pot.position.y = mxc.y + mxc.h / 2 + potH / 2;
    g.add(pot);
    for (const dy of [0.02, potH - 0.02]) {
      const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.05, 64), goldMatte);
      fl.position.y = mxc.y + mxc.h / 2 + dy;
      g.add(fl);
    }
    const nb = 18;
    const boltGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.03, 6);
    const bolts = new THREE.InstancedMesh(boltGeo, steel, nb);
    const m = new THREE.Matrix4();
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2;
      m.makeTranslation(0.65 * Math.cos(a), mxc.y + mxc.h / 2 + potH, 0.65 * Math.sin(a));
      bolts.setMatrixAt(i, m);
    }
    g.add(bolts);
  }

  // ---------- 脉冲管制冷机 ----------
  buildPulseTube() {
    const { steel, brushed, copper, dark } = this.mats;
    const g = this.group;
    const a = Math.PI * 1.15;
    const x = 2.25 * Math.cos(a), z = 2.25 * Math.sin(a);
    const top = STAGES[0], s50 = STAGES[1], s4 = STAGES[2];
    this.pulsePos = new THREE.Vector3(x, top.y + 0.8, z);

    // 冷头（室温以上）
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 48), brushed);
    head.position.set(x, top.y + 0.62, z);
    g.add(head);
    const motor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.55), dark);
    motor.position.set(x, top.y + 1.28, z);
    g.add(motor);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 48), steel);
    cap.position.set(x, top.y + 0.2, z);
    g.add(cap);
    // 高压氦气软管
    const hose = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x + 0.28, top.y + 1.28, z),
      new THREE.Vector3(x + 0.9, top.y + 1.6, z + 0.3),
      new THREE.Vector3(x + 1.2, top.y + 2.4, z + 0.8),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(hose, 40, 0.07, 12), brushed));

    // 一级、二级冷管
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, top.y - s50.y, 40), steel);
    t1.position.set(x, (top.y + s50.y) / 2, z);
    g.add(t1);
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, s50.y - s4.y, 32), steel);
    t2.position.set(x, (s50.y + s4.y) / 2, z);
    g.add(t2);
    // 第二根（回热器）
    const t3 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, top.y - s4.y, 24), steel);
    t3.position.set(x + 0.36 * Math.cos(a + 1.4), (top.y + s4.y) / 2, z + 0.36 * Math.sin(a + 1.4));
    g.add(t3);
    // 铜热连接块
    for (const s of [s50, s4]) {
      const blk = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 40), copper);
      blk.position.set(x, s.y - s.h / 2 - 0.11, z);
      g.add(blk);
      // 柔性铜编织带
      for (let k = 0; k < 3; k++) {
        const pts = [
          new THREE.Vector3(x + 0.2, s.y - s.h / 2 - 0.15, z + (k - 1) * 0.12),
          new THREE.Vector3(x + 0.55, s.y - s.h / 2 - 0.45, z + (k - 1) * 0.16),
          new THREE.Vector3(x + 0.9, s.y - s.h / 2 - 0.05, z + (k - 1) * 0.2),
        ];
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.03, 8), copper));
      }
    }
  }

  // ---------- 样品台、样品盒、芯片、磁屏蔽 ----------
  buildSampleStage() {
    const { gold, goldMatte, steel, copper } = this.mats;
    const g = this.group;
    const mxc = STAGES[5];
    const stageY = -3.7;
    this.stageY = stageY;
    const stage = new THREE.Mesh(this.plateGeo(1.35, 0.12), gold);
    stage.position.y = stageY;
    g.add(stage);
    // 冷指
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const len = mxc.y - mxc.h / 2 - (stageY + 0.06);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 20), gold);
      rod.position.set(1.18 * Math.cos(a), stageY + 0.06 + len / 2, 1.18 * Math.sin(a));
      g.add(rod);
    }

    // 样品盒
    const boxY = -5.2, bw = 1.3, bh = 1.5, bd = 0.36;
    this.boxTop = boxY + bh / 2;
    const hang = new THREE.Mesh(new THREE.BoxGeometry(0.5, stageY - this.boxTop, 0.12), goldMatte);
    hang.position.set(0, (stageY + this.boxTop) / 2, -0.12);
    g.add(hang);
    const box = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), goldMatte);
    box.position.set(0, boxY, 0);
    g.add(box);
    // 前面框（镂空）
    const frameShape = new THREE.Shape();
    frameShape.moveTo(-bw / 2, -bh / 2); frameShape.lineTo(bw / 2, -bh / 2); frameShape.lineTo(bw / 2, bh / 2); frameShape.lineTo(-bw / 2, bh / 2);
    const hole = new THREE.Path();
    hole.moveTo(-0.42, -0.5); hole.lineTo(-0.42, 0.5); hole.lineTo(0.42, 0.5); hole.lineTo(0.42, -0.5);
    frameShape.holes.push(hole);
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 0.05, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 }), gold);
    frame.position.set(0, boxY, bd / 2);
    g.add(frame);
    // 框上的螺丝
    const sm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), steel, 8);
    const mm = new THREE.Matrix4();
    [[-0.54, -0.64], [0.54, -0.64], [-0.54, 0.64], [0.54, 0.64], [-0.54, 0], [0.54, 0], [0, 0.64], [0, -0.64]].forEach(([x, y], i) => {
      mm.makeRotationX(Math.PI / 2).setPosition(x, boxY + y, bd / 2 + 0.07);
      sm.setMatrixAt(i, mm);
    });
    g.add(sm);

    // PCB
    const pcbTex = this.pcbTexture();
    const pcb = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 1.0), new THREE.MeshStandardMaterial({ map: pcbTex, metalness: 0.5, roughness: 0.4 }));
    pcb.position.set(0, boxY, bd / 2 + 0.005);
    g.add(pcb);
    // 芯片
    const { map, metal } = chipTextures();
    const chipMat = new THREE.MeshStandardMaterial({ map, metalnessMap: metal, metalness: 1, roughness: 0.3 });
    const chipSide = new THREE.MeshStandardMaterial({ color: 0x2a2f40, metalness: 0.3, roughness: 0.4 });
    const chip = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.03), [chipSide, chipSide, chipSide, chipSide, chipMat, chipSide]);
    chip.position.set(0, boxY, bd / 2 + 0.02);
    g.add(chip);
    this.chipPos = chip.position.clone();

    // 顶部 SMP 接头（两排 × 12）
    this.connectors = [];
    const conGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.12, 16);
    const nutGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 6);
    const cons = new THREE.InstancedMesh(conGeo, gold, 24);
    const nuts = new THREE.InstancedMesh(nutGeo, steel, 24);
    let k = 0;
    for (const zr of [0.09, -0.09]) {
      for (let i = 0; i < 12; i++) {
        const x = -0.55 + (i * 1.1) / 11;
        mm.makeTranslation(x, this.boxTop + 0.06, zr);
        cons.setMatrixAt(k, mm);
        mm.makeTranslation(x, this.boxTop + 0.02, zr);
        nuts.setMatrixAt(k, mm);
        this.connectors.push(new THREE.Vector3(x, this.boxTop + 0.12, zr));
        k++;
      }
    }
    g.add(cons, nuts);

    // 磁屏蔽罩（剖面，μ-metal / 低温坡莫合金）
    const shieldMat = new THREE.MeshStandardMaterial({ color: 0x5f6672, metalness: 0.9, roughness: 0.55, side: THREE.DoubleSide, envMapIntensity: 0.6 });
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 1.22, stageY - 0.06 + 6.15, 96, 1, true, Math.PI / 4, Math.PI * 1.5), shieldMat);
    sh.position.y = (stageY - 0.06 - 6.15) / 2;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.22, 64, 16, Math.PI * 0.75, Math.PI * 1.5, Math.PI / 2, Math.PI / 2), shieldMat);
    dome.scale.y = 0.3;
    dome.position.y = -6.15;
    this.magShield = new THREE.Group();
    this.magShield.add(sh, dome);
    g.add(this.magShield);
  }

  pcbTexture() {
    const c = document.createElement('canvas');
    c.width = 420; c.height = 500;
    const x = c.getContext('2d');
    x.fillStyle = '#1c2622'; x.fillRect(0, 0, 420, 500);
    x.strokeStyle = '#e0b25a'; x.lineWidth = 4;
    const cx = 210, cy = 250;
    for (let i = 0; i < 24; i++) {
      const sx = 20 + (i % 12) * 34, sy = i < 12 ? 6 : 494;
      const ex = cx - 90 + (i % 12) * 16.4, ey = cy + (i < 12 ? -100 : 100);
      x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx, i < 12 ? 70 : 430); x.lineTo(ex, ey); x.stroke();
    }
    x.fillStyle = '#e0b25a';
    x.fillRect(cx - 112, cy - 112, 224, 224);
    x.fillStyle = '#0b0e14';
    x.fillRect(cx - 104, cy - 104, 208, 208);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ---------- 同轴线、衰减器、放大器、微波脉冲 ----------
  buildCables() {
    const { gold, steel, copper, goldMatte, dark } = this.mats;
    const g = this.group;
    const N = 24, R = 1.45;
    const outputs = new Set([0, 6, 12, 18]);
    const inMat = new THREE.MeshStandardMaterial({ color: 0x9da3ab, metalness: 1, roughness: 0.38 });
    const outMat = new THREE.MeshStandardMaterial({ color: 0xc27a50, metalness: 1, roughness: 0.36 });
    this.cables = [];

    // 接头分配：前半圈 → 前排，按 x 排序
    const angles = Array.from({ length: N }, (_, i) => ((i + 0.5) / N) * Math.PI * 2);
    const front = angles.map((a, i) => ({ a, i })).filter((o) => Math.sin(o.a) > 0).sort((p, q) => Math.cos(p.a) - Math.cos(q.a));
    const back = angles.map((a, i) => ({ a, i })).filter((o) => Math.sin(o.a) <= 0).sort((p, q) => Math.cos(p.a) - Math.cos(q.a));
    const conOf = {};
    front.forEach((o, k) => (conOf[o.i] = this.connectors[k]));
    back.forEach((o, k) => (conOf[o.i] = this.connectors[12 + k]));

    const attM = [], hemtM = [], circM = [], smaM = [];
    const m = new THREE.Matrix4();
    const at = (a, r, y) => new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));

    for (let i = 0; i < N; i++) {
      const a = angles[i];
      const isOut = outputs.has(i);
      const pts = [];
      const topY = STAGES[0].y + 0.75;
      pts.push(at(a, R, topY), at(a, R, STAGES[0].y + 0.3));
      for (let s = 0; s < STAGES.length; s++) {
        const S = STAGES[s];
        pts.push(at(a, R, S.y + 0.22), at(a, R, S.y - 0.35));
        const next = STAGES[s + 1];
        if (next) {
          const yMid = (S.y + next.y) / 2;
          const wob = (i % 3 === 0 ? 0.16 : 0.08) * (s % 2 ? 1 : -1);
          pts.push(at(a + wob * 0.25, R + wob, yMid));
        }
        // 元件
        if (!isOut && (S.key === '4k' || S.key === 'cp' || S.key === 'mxc')) attM.push(at(a, R, S.y - 0.22));
        if (isOut && S.key === '4k') hemtM.push({ p: at(a, R, S.y - 0.22), a });
        if (isOut && S.key === 'mxc') circM.push({ p: at(a, R, S.y - 0.22), a });
        if (isOut && S.key === 'cp') circM.push({ p: at(a, R, S.y - 0.22), a });
      }
      // 混合室以下 → 样品台 → 样品盒接头
      const con = conOf[i];
      pts.push(at(a, R * 0.88, (STAGES[5].y + this.stageY) / 2 - 0.1));
      pts.push(at(a, 0.95, this.stageY + 0.2), at(a, 0.95, this.stageY - 0.18));
      const approach = new THREE.Vector3(con.x, this.boxTop + 0.42, con.z);
      pts.push(new THREE.Vector3().lerpVectors(at(a, 0.95, this.stageY - 0.18), approach, 0.55).setY(this.stageY - 0.45));
      pts.push(approach, con.clone());

      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 420, 0.021, 8), isOut ? outMat : inMat);
      g.add(mesh);
      this.cables.push({ curve, isOut, phase: Math.random(), speed: 0.12 + Math.random() * 0.05 });
      smaM.push(at(a, R, topY + 0.05));
    }

    // 顶部馈通环 + SMA 接头
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.16, 96, 1, false), steel);
    ring.position.y = STAGES[0].y + STAGES[0].h / 2 + 0.08;
    g.add(ring);
    const ringIn = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.17, 96), this.mats.brushed);
    ringIn.position.copy(ring.position);
    g.add(ringIn);
    const sma = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 6), gold, smaM.length);
    smaM.forEach((p, i) => { m.makeTranslation(p.x, p.y, p.z); sma.setMatrixAt(i, m); });
    g.add(sma);

    // 每块板上的穿板接头
    const feedM = [];
    for (const S of STAGES.slice(1)) {
      for (let i = 0; i < N; i++) feedM.push(at(angles[i], R, S.y));
    }
    const feed = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 12), goldMatte, feedM.length);
    feedM.forEach((p, i) => { m.makeTranslation(p.x, p.y, p.z); feed.setMatrixAt(i, m); });
    g.add(feed);

    // 衰减器
    const att = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.048, 0.048, 0.22, 16), steel, attM.length);
    attM.forEach((p, i) => { m.makeTranslation(p.x, p.y, p.z); att.setMatrixAt(i, m); });
    g.add(att);
    const attBand = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.051, 0.051, 0.04, 16), gold, attM.length);
    attM.forEach((p, i) => { m.makeTranslation(p.x, p.y + 0.06, p.z); attBand.setMatrixAt(i, m); });
    g.add(attBand);

    // HEMT 放大器
    for (const { p, a } of hemtM) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.16), gold);
      b.position.copy(p);
      b.rotation.y = -a;
      g.add(b);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.02), dark);
      lid.position.copy(p).add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.09));
      lid.rotation.y = -a + Math.PI / 2;
      g.add(lid);
    }
    this.hemtPos = hemtM[1]?.p.clone();
    // 环行器 / 隔离器
    for (const { p, a } of circM) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), copper);
      b.position.copy(p);
      b.rotation.y = -a;
      g.add(b);
      for (const s of [-1, 1]) {
        const mag = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 24), dark);
        mag.position.copy(p).add(new THREE.Vector3(0, s * 0.115, 0));
        g.add(mag);
      }
    }

    // 微波脉冲粒子
    const per = 2;
    const pulseGeo = new THREE.SphereGeometry(0.05, 12, 8);
    const pulseMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(4), toneMapped: false });
    this.pulses = new THREE.InstancedMesh(pulseGeo, pulseMat, N * per);
    const cIn = new THREE.Color(0x5ce1e6), cOut = new THREE.Color(0xff8a4c);
    for (let i = 0; i < N; i++) for (let k = 0; k < per; k++) this.pulses.setColorAt(i * per + k, this.cables[i].isOut ? cOut : cIn);
    this.pulses.instanceColor.needsUpdate = true;
    this.pulsesPer = per;
    g.add(this.pulses);
  }

  // ---------- 真空罩与辐射屏蔽（剖面） ----------
  buildShields() {
    const defs = [
      { top: STAGES[0].y - STAGES[0].h / 2, r: 3.22, bottom: -7.4, mat: new THREE.MeshStandardMaterial({ color: 0xbfc4cb, metalness: 1, roughness: 0.38, side: THREE.DoubleSide }) },
      { top: STAGES[1].y - STAGES[1].h / 2, r: 2.92, bottom: -7.1, mat: new THREE.MeshStandardMaterial({ color: 0xd6dbe2, metalness: 1, roughness: 0.25, side: THREE.DoubleSide }) },
      { top: STAGES[2].y - STAGES[2].h / 2, r: 2.62, bottom: -6.8, mat: new THREE.MeshStandardMaterial({ color: 0xd2955f, metalness: 1, roughness: 0.3, side: THREE.DoubleSide }) },
      { top: STAGES[3].y - STAGES[3].h / 2, r: 2.28, bottom: -6.5, mat: new THREE.MeshStandardMaterial({ color: 0xe0ad5a, metalness: 1, roughness: 0.22, side: THREE.DoubleSide }) },
    ];
    this.shields = new THREE.Group();
    for (const d of defs) {
      const h = d.top - d.bottom;
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(d.r, d.r, h, 128, 1, true, Math.PI / 4, Math.PI * 1.5), d.mat);
      cyl.position.y = (d.top + d.bottom) / 2;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(d.r, 96, 20, Math.PI * 0.75, Math.PI * 1.5, Math.PI / 2, Math.PI / 2), d.mat);
      dome.scale.y = 0.3;
      dome.position.y = d.bottom;
      this.shields.add(cyl, dome);
    }
    this.shields.visible = false;
    this.group.add(this.shields);
  }

  // ---------- 标签 ----------
  buildLabels() {
    const ang = 0.42;
    for (const s of STAGES) {
      const lb = label3D(`<span class="dot" style="color:${s.color}"></span>${s.name}<span class="t">${s.temp}</span>`, 'label leader', [0, 0.5]);
      lb.position.set((s.r + 0.02) * Math.cos(ang), s.y, (s.r + 0.02) * Math.sin(ang));
      lb.element.addEventListener('click', () => this.select(s.key));
      this.group.add(lb);
      this.labels.push(lb);
      s.label = lb;
    }
    const add = (key, pos) => {
      const p = PARTS[key];
      const lb = label3D(`<span class="dot" style="color:${p.color}"></span>${p.name}${p.temp ? `<span class="t">${p.temp}</span>` : ''}`, 'label leader', [0, 0.5]);
      lb.position.copy(pos);
      lb.element.addEventListener('click', () => this.select(key));
      this.group.add(lb);
      this.partLabels.push(lb);
      p.label = lb;
    };
    add('chip', this.chipPos.clone().add(new THREE.Vector3(0.25, 0, 0.05)));
    add('cables', new THREE.Vector3(1.45 * Math.cos(1.0), 2.5, 1.45 * Math.sin(1.0)));
    add('pulse', this.pulsePos.clone().add(new THREE.Vector3(0.45, 0.2, 0)));

    const plain = (html, pos) => {
      const lb = label3D(html, 'label plain leader', [0, 0.5]);
      lb.position.copy(pos);
      this.group.add(lb);
      this.partLabels.push(lb);
    };
    if (this.hemtPos) plain('HEMT 放大器', this.hemtPos.clone().add(new THREE.Vector3(0.15, 0, 0)));
    plain('连续热交换器', new THREE.Vector3(0.45, 0.45, 0.2));
    plain('混合室', new THREE.Vector3(0.62, STAGES[5].y + 0.45, 0.12));
    plain('银烧结热交换器', new THREE.Vector3(0.42, -1.1, 0.1));
    plain('磁屏蔽罩', new THREE.Vector3(1.22 * Math.cos(-0.6), -5.8, 1.22 * Math.sin(-0.6) * -1));
  }

  // ---------- 面板 ----------
  buildPanel() {
    this.info = el('div', { class: 'info-card', html: '点击左侧列表或模型上的标签，查看每一层的作用。' });
    const all = [...STAGES.map((s) => ({ key: s.key, name: s.name, temp: s.temp, color: s.color })),
      { key: 'chip', name: PARTS.chip.name, temp: '10 mK', color: PARTS.chip.color }];
    this.items = {};
    const list = el('div', { class: 'stage-list' }, all.map((s) => {
      const it = el('div', { class: 'stage-item', onclick: () => this.select(s.key) },
        el('span', { class: 'dot', style: `color:${s.color};background:${s.color}` }), s.name, el('span', { class: 'temp' }, s.temp));
      this.items[s.key] = it;
      return it;
    }));

    this.panel = el('div', {},
      el('div', { class: 'kicker' }, 'Chapter 1 · Hardware'),
      el('h2', {}, '超导量子计算机长什么样？'),
      el('p', { class: 'lead', html: '你看到的“金色吊灯”其实是一台<b>稀释制冷机</b>。真正做计算的芯片只有指甲盖大小，挂在最底部；上面层层叠叠的金色圆盘，是为了把它冷却到 <span class="hl">约 10 mK（−273.14 °C）</span>。' }),
      section('温区（自上而下逐级变冷）', list, this.info),
      section('显示',
        toggle('真空罩与辐射屏蔽（剖面）', false, (v) => { this.shields.visible = v; }),
        toggle('磁屏蔽罩', true, (v) => { this.magShield.visible = v; }),
        toggle('部件标签', true, (v) => this.partLabels.forEach((l) => (l.visible = v))),
        toggle('微波脉冲动画', true, (v) => { this.pulses.visible = v; }),
        toggle('自动旋转', false, (v) => { this.autoRotate = v; this.app.controls.autoRotate = v; }),
      ),
      section('为什么要这么冷？',
        el('p', { html: '量子比特的 |0⟩ 和 |1⟩ 能量差约对应 <b>5 GHz</b> 的微波光子，相当于 <b>0.25 K</b> 的温度。如果环境温度更高，热噪声会随机“踢”翻比特，摧毁叠加态（称为<span class="hl-red">退相干</span>）。' }),
        el('p', { html: '同时，铝和铌只有在极低温下才进入<b>超导态</b>：电流零电阻流动，电路才能表现出量子行为。' }),
        el('div', { class: 'callout cyan', html: '冷却只是“让量子效应得以存在”。真正带来加速的是量子比特的<b>叠加、纠缠与干涉</b>——后面几章逐一演示。' }),
      ),
    );
  }

  select(key) {
    const stage = STAGES.find((s) => s.key === key);
    const part = PARTS[key];
    const d = stage || part;
    Object.entries(this.items).forEach(([k, it]) => it.classList.toggle('active', k === key));
    [...STAGES, ...Object.values(PARTS)].forEach((s) => s.label?.element.classList.toggle('active', s === d));
    this.info.innerHTML = `<b>${d.name}</b>${d.temp ? ` · <span class="mono">${d.temp}</span>` : ''}<br>${d.text}`;
    this.selected = stage || null;
    const y = d.y;
    if (key === 'chip') this.app.flyTo([1.6, -4.7, 3.6], [0, -5.2, 0]);
    else if (key === 'pulse') this.app.flyTo([-4.5, 9.5, 5.5], [this.pulsePos.x, 7.2, this.pulsePos.z]);
    else if (key === 'cables') this.app.flyTo([7, 3, 10], [0, 1.5, 0]);
    else this.app.flyTo([5.2, y + 2.6, 8.8], [0, y - 0.2, 0]);
  }

  enter() { this.app.controls.autoRotate = !!this.autoRotate; this.app.controls.autoRotateSpeed = 0.6; }
  exit() { this.app.controls.autoRotate = false; }

  update(dt, t) {
    // 脉冲
    if (this.pulses.visible) {
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      this.cables.forEach((c, i) => {
        for (let k = 0; k < this.pulsesPer; k++) {
          let u = (t * c.speed + c.phase + k / this.pulsesPer) % 1;
          if (c.isOut) u = 1 - u;
          c.curve.getPointAt(u, p);
          const s = 0.6 + 0.4 * Math.sin(u * Math.PI);
          m.makeScale(s, s, s).setPosition(p);
          this.pulses.setMatrixAt(i * this.pulsesPer + k, m);
        }
      });
      this.pulses.instanceMatrix.needsUpdate = true;
    }
    // 选中光环
    for (const s of STAGES) {
      const target = s === this.selected ? 0.55 + 0.45 * Math.sin(t * 4) : 0;
      s.halo.material.opacity += (target - s.halo.material.opacity) * Math.min(1, dt * 8);
    }
  }
}
