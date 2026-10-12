import * as THREE from 'three';

// 一块 5×5 transmon（Xmon）超导量子芯片的版图。单位：模型单位，芯片边长 12。
// 坐标：x 向右，z 向下（朝向观众），芯片中心在原点。

export const CHIP = 12;
export const SP = 1.9; // 比特间距
const OFF = -0.45;
export const ARM = 0.5; // 十字臂长（半长）
export const ARM_W = 0.14;
export const GAP = 0.05;
export const LINE_W = 0.05;
export const LINE_GAP = 0.03;
export const FEED_W = 0.08;
export const FEED_GAP = 0.04;
export const FEED_Z = 4.95;
export const PAD_POS = 5.5;

export const qubits = [];
for (let j = 0; j < 5; j++) {
  for (let i = 0; i < 5; i++) {
    qubits.push({ i, j, x: OFF + (i - 2) * SP, z: OFF + (j - 2) * SP, index: qubits.length });
  }
}
export const qAt = (i, j) => qubits[j * 5 + i];

// 可调耦合器
export const couplers = [];
for (const q of qubits) {
  if (q.i < 4) couplers.push({ a: q.index, b: qAt(q.i + 1, q.j).index, dir: 'x', x0: q.x + 0.62, x1: q.x + SP - 0.62, z: q.z });
  if (q.j < 4) couplers.push({ a: q.index, b: qAt(q.i, q.j + 1).index, dir: 'z', z0: q.z + 0.62, z1: q.z + SP - 0.62, x: q.x });
}

// 读出谐振腔（蛇形共面波导），位于每个比特右下方的格子中央
export const resonators = qubits.map((q) => {
  const cx = q.x + 0.95, cz = q.z + 0.95, h = 0.3;
  const pts = [[q.x + 0.22, q.z + 0.22], [cx - h, cz - h]];
  const rows = 7;
  for (let r = 0; r < rows; r++) {
    const z = cz - h + (r * 2 * h) / (rows - 1);
    const xa = r % 2 === 0 ? cx - h : cx + h;
    const xb = r % 2 === 0 ? cx + h : cx - h;
    if (r > 0) pts.push([xa, z]);
    pts.push([xb, z]);
  }
  return { q: q.index, pts, claw: [q.x + 0.22, q.z + 0.22] };
});

// 微波控制线（XY 驱动）：从芯片边缘的焊盘连到外圈比特的臂端
export const lines = [];
for (const q of qubits) {
  if (q.i === 0) lines.push({ q: q.index, pts: [[-PAD_POS, q.z], [q.x - ARM - 0.17, q.z]], side: 'left' });
  if (q.i === 4) lines.push({ q: q.index, pts: [[PAD_POS, q.z], [q.x + ARM + 0.17, q.z]], side: 'right' });
  if (q.j === 0) lines.push({ q: q.index, pts: [[q.x, -PAD_POS], [q.x, q.z - ARM - 0.17]], side: 'top' });
  if (q.j === 4) lines.push({ q: q.index, pts: [[q.x, PAD_POS], [q.x, q.z + ARM + 0.17]], side: 'bottom' });
}

// 读出总线（feedline）
export const feedline = { pts: [[-PAD_POS, FEED_Z], [PAD_POS, FEED_Z]] };

// 焊盘
export const pads = [];
for (const l of lines) pads.push({ x: l.pts[0][0], z: l.pts[0][1], side: l.side });
pads.push({ x: -PAD_POS, z: FEED_Z, side: 'left', feed: true });
pads.push({ x: PAD_POS, z: FEED_Z, side: 'right', feed: true });

// 空气桥：沿线周期分布 + 控制线跨越读出总线处
export const bridges = [];
function addBridgesAlong(pts, step, skipEnds) {
  const [a, b] = pts;
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  for (let s = skipEnds; s < len - skipEnds; s += step) {
    bridges.push({ x: a[0] + (dx * s) / len, z: a[1] + (dz * s) / len, dir: Math.abs(dx) > Math.abs(dz) ? 'x' : 'z' });
  }
}
for (const l of lines) addBridgesAlong(l.pts, 0.85, 0.55);
addBridgesAlong(feedline.pts, 0.85, 0.45);
for (const l of lines) {
  if (l.side === 'bottom') bridges.push({ x: l.pts[0][0], z: FEED_Z, dir: 'x', cross: true });
}

// SQUID 位置（约瑟夫森结）：十字中心沿 (-1,-1) 方向伸出的短桩末端
export const squidOf = (q) => ({ x: q.x - 0.37, z: q.z - 0.37 });

// ---------- 绘制芯片表面纹理 ----------
export function makeChipTextures(size = 2048) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const k = size / CHIP;
  const P = (v) => (v + CHIP / 2) * k;

  const METAL = '#a4aab4';
  const SI = '#1a1f2e';

  // 接地面（铌/铝薄膜）
  g.fillStyle = METAL;
  g.fillRect(0, 0, size, size);
  // 细微的金属纹理
  const grd = g.createLinearGradient(0, 0, size, size);
  grd.addColorStop(0, 'rgba(255,255,255,0.06)');
  grd.addColorStop(0.5, 'rgba(0,0,0,0.05)');
  grd.addColorStop(1, 'rgba(255,255,255,0.05)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);

  // 磁通钉扎孔阵列
  g.fillStyle = '#5b6170';
  const hs = 0.11;
  for (let x = -5.8; x <= 5.8; x += hs) {
    for (let z = -5.8; z <= 5.8; z += hs) {
      g.fillRect(P(x) - 1.1, P(z) - 1.1, 2.2, 2.2);
    }
  }

  const rect = (cx, cz, w, h, color) => { g.fillStyle = color; g.fillRect(P(cx - w / 2), P(cz - h / 2), w * k, h * k); };
  const poly = (pts, w, color) => {
    g.strokeStyle = color; g.lineWidth = w * k; g.lineJoin = 'miter'; g.lineCap = 'butt';
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(P(x), P(z)) : g.moveTo(P(x), P(z))));
    g.stroke();
  };
  const cross = (q, pad, color) => {
    rect(q.x, q.z, 2 * ARM + 2 * pad, ARM_W + 2 * pad, color);
    rect(q.x, q.z, ARM_W + 2 * pad, 2 * ARM + 2 * pad, color);
  };

  // 控制线
  for (const l of lines) {
    const [a, b] = l.pts;
    const ext = [a, [b[0] + Math.sign(b[0] - a[0]) * LINE_GAP, b[1] + Math.sign(b[1] - a[1]) * LINE_GAP]];
    poly(ext, LINE_W + 2 * LINE_GAP, SI);
    poly(l.pts, LINE_W, METAL);
  }
  // 读出总线（画在控制线之上 → 交叉处形成空气桥跨越）
  poly(feedline.pts, FEED_W + 2 * FEED_GAP, SI);
  poly(feedline.pts, FEED_W, METAL);

  // 焊盘
  for (const p of pads) {
    const horiz = p.side === 'left' || p.side === 'right';
    const w = horiz ? 0.34 : 0.24, h = horiz ? 0.24 : 0.34;
    rect(p.x, p.z, w + 0.12, h + 0.12, SI);
    rect(p.x, p.z, w, h, METAL);
  }

  // 谐振腔
  for (const r of resonators) {
    poly(r.pts, LINE_W + 2 * LINE_GAP, SI);
    rect(r.claw[0], r.claw[1], 0.16, 0.16, SI);
  }
  for (const r of resonators) {
    poly(r.pts, LINE_W, METAL);
    rect(r.claw[0], r.claw[1], 0.1, 0.1, METAL);
  }

  // 耦合器
  for (const cp of couplers) {
    if (cp.dir === 'x') rect((cp.x0 + cp.x1) / 2, cp.z, cp.x1 - cp.x0 + 2 * GAP, 0.06 + 2 * GAP, SI);
    else rect(cp.x, (cp.z0 + cp.z1) / 2, 0.06 + 2 * GAP, cp.z1 - cp.z0 + 2 * GAP, SI);
  }
  for (const cp of couplers) {
    if (cp.dir === 'x') rect((cp.x0 + cp.x1) / 2, cp.z, cp.x1 - cp.x0, 0.06, METAL);
    else rect(cp.x, (cp.z0 + cp.z1) / 2, 0.06, cp.z1 - cp.z0, METAL);
  }

  // 量子比特十字 + 约瑟夫森结短桩
  for (const q of qubits) {
    cross(q, GAP, SI);
    const s = squidOf(q);
    poly([[q.x, q.z], [s.x + 0.04, s.z + 0.04]], 0.06 + 2 * GAP, SI);
    rect(s.x, s.z, 0.2, 0.2, SI);
  }
  for (const q of qubits) {
    cross(q, 0, METAL);
    const s = squidOf(q);
    poly([[q.x, q.z], [s.x + 0.05, s.z + 0.05]], 0.06, METAL);
    // SQUID 环（两个约瑟夫森结）
    g.strokeStyle = METAL; g.lineWidth = 0.022 * k;
    g.strokeRect(P(s.x - 0.05), P(s.z - 0.05), 0.1 * k, 0.1 * k);
    g.fillStyle = '#ffcf6b';
    g.fillRect(P(s.x - 0.065), P(s.z) - 0.012 * k, 0.03 * k, 0.024 * k);
    g.fillRect(P(s.x + 0.035), P(s.z) - 0.012 * k, 0.03 * k, 0.024 * k);
    // 连到地
    poly([[s.x - 0.05, s.z - 0.05], [s.x - 0.11, s.z - 0.11]], 0.04, METAL);
  }

  // 切割道与对准标记
  g.strokeStyle = '#2a2f3d';
  g.lineWidth = 0.18 * k;
  g.strokeRect(0, 0, size, size);
  g.strokeStyle = '#2a2f3d'; g.lineWidth = 0.03 * k;
  for (const [mx, mz] of [[-5.75, -5.75], [5.75, -5.75], [-5.75, 5.75], [5.75, 5.75]]) {
    g.beginPath();
    g.moveTo(P(mx - 0.12), P(mz)); g.lineTo(P(mx + 0.12), P(mz));
    g.moveTo(P(mx), P(mz - 0.12)); g.lineTo(P(mx), P(mz + 0.12));
    g.stroke();
  }
  g.fillStyle = '#3a4152';
  g.font = `600 ${0.2 * k}px Consolas, monospace`;
  g.fillText('QPU-25  Nb/Al-AlOx  T=10mK', P(-5.2), P(-5.2));
  g.font = `${0.14 * k}px Consolas, monospace`;
  g.fillText('5x5 Xmon · tunable couplers', P(1.6), P(-5.22));

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const metal = new THREE.CanvasTexture(c);
  metal.colorSpace = THREE.NoColorSpace;
  metal.anisotropy = 8;
  return { map, metal, canvas: c };
}

let cached;
export function chipTextures() {
  if (!cached) cached = makeChipTextures();
  return cached;
}
