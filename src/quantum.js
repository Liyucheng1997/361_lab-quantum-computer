// 一个小型的态矢量量子模拟器：n 个量子比特 = 2^n 个复数振幅。
// 约定：基态下标 i 的第 q 位即量子比特 q 的取值；显示时 q0 写在最左边。

const SQ = Math.SQRT1_2;

export const GATES = {
  H: [SQ, 0, SQ, 0, SQ, 0, -SQ, 0],
  X: [0, 0, 1, 0, 1, 0, 0, 0],
  Y: [0, 0, 0, -1, 0, 1, 0, 0],
  Z: [1, 0, 0, 0, 0, 0, -1, 0],
  S: [1, 0, 0, 0, 0, 0, 0, 1],
  T: [1, 0, 0, 0, 0, 0, SQ, SQ],
};

export function rx(t) { const c = Math.cos(t / 2), s = Math.sin(t / 2); return [c, 0, 0, -s, 0, -s, c, 0]; }
export function ry(t) { const c = Math.cos(t / 2), s = Math.sin(t / 2); return [c, 0, -s, 0, s, 0, c, 0]; }
export function rz(t) { const c = Math.cos(t / 2), s = Math.sin(t / 2); return [c, -s, 0, 0, 0, 0, c, s]; }

export class QState {
  constructor(n) {
    this.n = n;
    this.N = 1 << n;
    this.re = new Float64Array(this.N);
    this.im = new Float64Array(this.N);
    this.re[0] = 1;
  }

  reset() { this.re.fill(0); this.im.fill(0); this.re[0] = 1; return this; }

  copyFrom(o) { this.re.set(o.re); this.im.set(o.im); return this; }

  clone() { return new QState(this.n).copyFrom(this); }

  // m = [ar, ai, br, bi, cr, ci, dr, di] 表示 2x2 矩阵 [[a, b], [c, d]]
  apply1(q, m) {
    const { re, im, N } = this;
    const bit = 1 << q;
    for (let i = 0; i < N; i++) {
      if (i & bit) continue;
      const j = i | bit;
      const xr = re[i], xi = im[i], yr = re[j], yi = im[j];
      re[i] = m[0] * xr - m[1] * xi + m[2] * yr - m[3] * yi;
      im[i] = m[0] * xi + m[1] * xr + m[2] * yi + m[3] * yr;
      re[j] = m[4] * xr - m[5] * xi + m[6] * yr - m[7] * yi;
      im[j] = m[4] * xi + m[5] * xr + m[6] * yi + m[7] * yr;
    }
    return this;
  }

  gate(name, q) { return this.apply1(q, GATES[name]); }

  hAll() { for (let q = 0; q < this.n; q++) this.apply1(q, GATES.H); return this; }

  cnot(c, t) {
    const { re, im, N } = this;
    const cb = 1 << c, tb = 1 << t;
    for (let i = 0; i < N; i++) {
      if ((i & cb) && !(i & tb)) {
        const j = i | tb;
        let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
        tmp = im[i]; im[i] = im[j]; im[j] = tmp;
      }
    }
    return this;
  }

  cz(a, b) {
    const mask = (1 << a) | (1 << b);
    for (let i = 0; i < this.N; i++) {
      if ((i & mask) === mask) { this.re[i] = -this.re[i]; this.im[i] = -this.im[i]; }
    }
    return this;
  }

  // 相位翻转某个基态（Grover 的 oracle）
  flip(index) { this.re[index] = -this.re[index]; this.im[index] = -this.im[index]; return this; }

  // 关于平均值的反射（Grover 扩散算子 2|s><s| - I），对实振幅与复振幅都成立
  diffuse() {
    const { re, im, N } = this;
    let mr = 0, mi = 0;
    for (let i = 0; i < N; i++) { mr += re[i]; mi += im[i]; }
    mr /= N; mi /= N;
    for (let i = 0; i < N; i++) { re[i] = 2 * mr - re[i]; im[i] = 2 * mi - im[i]; }
    return this;
  }

  prob(i) { return this.re[i] * this.re[i] + this.im[i] * this.im[i]; }

  probs() {
    const p = new Float64Array(this.N);
    for (let i = 0; i < this.N; i++) p[i] = this.prob(i);
    return p;
  }

  prob1(q) {
    const bit = 1 << q;
    let p = 0;
    for (let i = 0; i < this.N; i++) if (i & bit) p += this.prob(i);
    return p;
  }

  // 按概率抽样一个基态，但不坍缩
  sample(rnd = Math.random()) {
    let acc = 0;
    for (let i = 0; i < this.N; i++) {
      acc += this.prob(i);
      if (rnd < acc) return i;
    }
    return this.N - 1;
  }

  // 测量全部量子比特：坍缩到一个基态
  measureAll() {
    const k = this.sample();
    this.re.fill(0); this.im.fill(0); this.re[k] = 1;
    return k;
  }

  // 只测量一个量子比特
  measure(q) {
    const p1 = this.prob1(q);
    const r = Math.random() < p1 ? 1 : 0;
    const bit = 1 << q;
    const norm = Math.sqrt(r ? p1 : 1 - p1) || 1;
    for (let i = 0; i < this.N; i++) {
      const b = (i & bit) ? 1 : 0;
      if (b !== r) { this.re[i] = 0; this.im[i] = 0; } else { this.re[i] /= norm; this.im[i] /= norm; }
    }
    return r;
  }

  // 第 q 个比特的约化密度矩阵 → 布洛赫矢量；纠缠时长度 < 1
  bloch(q) {
    const bit = 1 << q;
    let r00 = 0, r11 = 0, cr = 0, ci = 0;
    for (let i = 0; i < this.N; i++) {
      if (i & bit) continue;
      const j = i | bit;
      const ar = this.re[i], ai = this.im[i], br = this.re[j], bi = this.im[j];
      r00 += ar * ar + ai * ai;
      r11 += br * br + bi * bi;
      // a * conj(b)
      cr += ar * br + ai * bi;
      ci += ai * br - ar * bi;
    }
    return { x: 2 * cr, y: -2 * ci, z: r00 - r11 };
  }
}

export function ket(i, n) {
  let s = '';
  for (let q = 0; q < n; q++) s += (i >> q) & 1;
  return s;
}

export function fmtComplex(r, i, digits = 3) {
  const e = 10 ** -digits;
  const R = Math.abs(r) < e ? 0 : r;
  const I = Math.abs(i) < e ? 0 : i;
  if (I === 0) return R.toFixed(digits);
  if (R === 0) return `${I.toFixed(digits)}i`;
  return `${R.toFixed(digits)}${I < 0 ? '−' : '+'}${Math.abs(I).toFixed(digits)}i`;
}
