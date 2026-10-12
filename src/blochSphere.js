import * as THREE from 'three';
import { label3D, blochToVec3 } from './util.js';

// 可复用的布洛赫球：玻璃球体 + 经纬线 + 坐标轴 + 态矢量箭头 + 轨迹
export class BlochSphere {
  constructor({ radius = 2.4, color = 0x5ce1e6, labels = true, small = false } = {}) {
    this.R = radius;
    this.group = new THREE.Group();
    this.vec = new THREE.Vector3(0, 1, 0); // three.js 坐标（单位长度 = 纯态）
    const R = radius;

    // 球体：内外两层，营造玻璃感
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(R, 96, 64),
      new THREE.MeshPhysicalMaterial({
        color: 0x86b8ff, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.1,
        clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.FrontSide, depthWrite: false, envMapIntensity: 1.4,
      })
    );
    glass.renderOrder = 10;
    const inner = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.995, 64, 48),
      new THREE.MeshBasicMaterial({ color: 0x163055, transparent: true, opacity: 0.18, side: THREE.BackSide, depthWrite: false })
    );
    this.group.add(inner, glass);

    // 经纬线
    const lineMat = new THREE.LineBasicMaterial({ color: 0x6f9bd6, transparent: true, opacity: 0.22 });
    const pts = [];
    for (let k = 1; k < 6; k++) {
      const th = (k / 6) * Math.PI;
      const y = R * Math.cos(th), r = R * Math.sin(th);
      for (let i = 0; i < 96; i++) {
        const a0 = (i / 96) * Math.PI * 2, a1 = ((i + 1) / 96) * Math.PI * 2;
        pts.push(r * Math.cos(a0), y, r * Math.sin(a0), r * Math.cos(a1), y, r * Math.sin(a1));
      }
    }
    for (let k = 0; k < 6; k++) {
      const ph = (k / 6) * Math.PI;
      for (let i = 0; i < 96; i++) {
        const t0 = (i / 96) * Math.PI * 2, t1 = ((i + 1) / 96) * Math.PI * 2;
        pts.push(R * Math.sin(t0) * Math.cos(ph), R * Math.cos(t0), R * Math.sin(t0) * Math.sin(ph),
          R * Math.sin(t1) * Math.cos(ph), R * Math.cos(t1), R * Math.sin(t1) * Math.sin(ph));
      }
    }
    const grid = new THREE.BufferGeometry();
    grid.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.group.add(new THREE.LineSegments(grid, lineMat));

    // 赤道环
    const eq = new THREE.Mesh(new THREE.TorusGeometry(R, 0.012, 8, 160), new THREE.MeshBasicMaterial({ color: 0x8fc3ff, transparent: true, opacity: 0.55 }));
    eq.rotation.x = Math.PI / 2;
    this.group.add(eq);

    // 坐标轴
    const axisMat = new THREE.MeshBasicMaterial({ color: 0x9fb7d9, transparent: true, opacity: 0.6 });
    const ax = (dir) => {
      const len = R * 2.3;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, len, 8), axisMat);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this.group.add(m);
    };
    ax(new THREE.Vector3(0, 1, 0)); ax(new THREE.Vector3(1, 0, 0)); ax(new THREE.Vector3(0, 0, 1));
    // 两极小球
    const poleMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.4), toneMapped: false });
    for (const s of [1, -1]) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), poleMat);
      p.position.y = s * R;
      this.group.add(p);
    }

    if (labels) {
      const L = R * 1.22;
      const add = (txt, b, cls = 'ket') => {
        const lb = label3D(txt, cls);
        lb.position.copy(blochToVec3(b).multiplyScalar(L));
        this.group.add(lb);
      };
      add('|0⟩', { x: 0, y: 0, z: 1 });
      add('|1⟩', { x: 0, y: 0, z: -1 });
      if (!small) {
        add('|+⟩', { x: 1, y: 0, z: 0 }, 'ket small');
        add('|−⟩', { x: -1, y: 0, z: 0 }, 'ket small');
        add('|+i⟩', { x: 0, y: 1, z: 0 }, 'ket small');
        add('|−i⟩', { x: 0, y: -1, z: 0 }, 'ket small');
      }
    }

    // 态矢量箭头
    const c = new THREE.Color(color);
    this.arrow = new THREE.Group();
    const shaftMat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.3 });
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 16).translate(0, 0.5, 0), shaftMat);
    this.head = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 24).translate(0, 0.15, 0), shaftMat);
    this.tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 16), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(3), toneMapped: false }));
    this.arrow.add(this.shaft, this.head);
    this.group.add(this.arrow, this.tip);
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.5), toneMapped: false }));
    this.group.add(center);

    // 当前纬度圈 & 到 z 轴的投影线
    this.latRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.008, 6, 128), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.6), transparent: true, opacity: 0.7, toneMapped: false }));
    this.latRing.rotation.x = Math.PI / 2;
    this.group.add(this.latRing);
    const projGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.proj = new THREE.Line(projGeo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.6 }));
    this.group.add(this.proj);

    // 轨迹
    this.trailMax = 400;
    this.trailPos = new Float32Array(this.trailMax * 3);
    this.trailCount = 0;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    tg.setDrawRange(0, 0);
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: new THREE.Color(0xf3c46b).multiplyScalar(1.6), transparent: true, opacity: 0.85, toneMapped: false }));
    this.group.add(this.trail);

    this.setVec(this.vec);
  }

  // v：three.js 坐标下的布洛赫矢量（长度 ≤ 1）
  setVec(v, recordTrail = false) {
    this.vec.copy(v);
    const len = v.length();
    const R = this.R;
    if (len < 1e-4) {
      this.arrow.visible = false;
      this.tip.position.set(0, 0, 0);
      this.tipBase = 0.6;
      this.tip.scale.setScalar(0.6);
    } else {
      this.arrow.visible = true;
      const dir = v.clone().normalize();
      this.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const L = len * R;
      const headLen = Math.min(0.3, L * 0.5);
      this.shaft.scale.set(1, Math.max(L - headLen, 0.001), 1);
      this.head.position.y = L - headLen;
      this.head.scale.set(headLen / 0.3, headLen / 0.3, headLen / 0.3);
      this.tip.position.copy(v).multiplyScalar(R);
      this.tipBase = 0.6 + 0.4 * len;
      this.tip.scale.setScalar(this.tipBase);
    }
    const y = v.y * R;
    const rr = Math.sqrt(Math.max(R * R - y * y, 0));
    this.latRing.position.y = y;
    this.latRing.scale.setScalar(Math.max(rr, 0.001));
    this.latRing.visible = len > 0.05;
    const p = this.proj.geometry.attributes.position;
    p.setXYZ(0, v.x * R, v.y * R, v.z * R);
    p.setXYZ(1, 0, v.y * R, 0);
    p.needsUpdate = true;
    this.proj.computeLineDistances();
    if (recordTrail) this.pushTrail(v.clone().multiplyScalar(R * 1.002));
  }

  pulse(t) {
    this.tip.scale.setScalar(this.tipBase * (1 + 0.1 * Math.sin(t * 5)));
  }

  pushTrail(p) {
    if (this.trailCount >= this.trailMax) {
      this.trailPos.copyWithin(0, 3);
      this.trailCount--;
    }
    this.trailPos.set([p.x, p.y, p.z], this.trailCount * 3);
    this.trailCount++;
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, this.trailCount);
  }

  clearTrail() {
    this.trailCount = 0;
    this.trail.geometry.setDrawRange(0, 0);
  }

  setBloch(b, recordTrail = false) {
    this.setVec(blochToVec3(b), recordTrail);
  }
}
