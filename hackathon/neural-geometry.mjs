// Analytic torus: generated locally, with no model download or WebGL startup.
// Keep these helpers available for regenerating the first-paint SVG.
export function buildField(compact = false) {
  const paths = [];
  const strands = compact ? 28 : 40;
  const segments = compact ? 80 : 112;
  for (let i = 0; i < strands; i++) {
    const phase = i / strands * Math.PI * 2;
    const points = [];
    for (let j = 0; j <= segments; j++) {
      const t = j / segments * Math.PI * 2;
      const twist = phase + t * 2;
      const minor = 39 + Math.sin(t * 3 + phase) * 5;
      const radius = 141 + Math.cos(twist) * minor;
      points.push([Math.cos(t) * radius, Math.sin(t) * radius, Math.sin(twist) * minor]);
    }
    paths.push(points);
  }
  return paths;
}
export function projection(rx = .92, ry = -.16, rz = -.37) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  return point => {
    const [x, y, z] = point;
    const y1 = y * cx - z * sx, z1 = y * sx + z * cx;
    const x2 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy;
    const scale = 780 / (780 - z2);
    return [300 + (x2 * cz - y1 * sz) * scale * 1.32, 294 + (x2 * sz + y1 * cz) * scale * 1.32, z2];
  };
}

export function buildInstrument(compact = false) {
  const paths = buildField(compact);
  const strands = paths.length, segments = paths[0].length - 1, stride = segments + 1;
  const positions = new Float32Array(strands * stride * 3);
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < strands; i++) {
    const phase = i / strands * Math.PI * 2;
    for (let j = 0; j <= segments; j++) {
      const t = j / segments * Math.PI * 2, twist = phase + t * 2;
      const offset = (i * stride + j) * 3;
      positions.set(paths[i][j], offset);
      normals[offset] = Math.cos(t) * Math.cos(twist);
      normals[offset + 1] = Math.sin(t) * Math.cos(twist);
      normals[offset + 2] = Math.sin(twist);
    }
  }
  // Coarser satin patches use the same vertices as the wire field: 1,120 desktop
  // patches / 560 mobile patches, with back faces culled during rendering.
  const faces = new Uint16Array(strands / 2 * segments / 2 * 4);
  let cursor = 0;
  for (let i = 0; i < strands; i += 2) {
    const next = (i + 2) % strands;
    for (let j = 0; j < segments; j += 2) {
      faces[cursor++] = i * stride + j;
      faces[cursor++] = i * stride + j + 2;
      faces[cursor++] = next * stride + j + 2;
      faces[cursor++] = next * stride + j;
    }
  }
  return { positions, normals, faces, strands, segments, stride,
    // x, y, camera depth, facing, light. Reused for every frame and signal.
    projected: new Float32Array(strands * stride * 5) };
}

export function projectInstrument(field, rx, ry, rz, lightShift = 0) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const { positions, normals, projected } = field;
  const lx = -.36 + lightShift, ly = -.48, lz = .8;
  const length = Math.hypot(lx, ly, lz);
  const lightX = lx / length, lightY = ly / length, lightZ = lz / length;
  for (let i = 0, p = 0; i < positions.length; i += 3, p += 5) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const y1 = y * cx - z * sx, z1 = y * sx + z * cx;
    const x2 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy;
    const scale = 780 / (780 - z2) * 1.32;
    projected[p] = 300 + (x2 * cz - y1 * sz) * scale;
    projected[p + 1] = 294 + (x2 * sz + y1 * cz) * scale;
    projected[p + 2] = z2;
    const nx = normals[i], ny = normals[i + 1], nz = normals[i + 2];
    const ny1 = ny * cx - nz * sx, nz1 = ny * sx + nz * cx;
    const nx2 = nx * cy + nz1 * sy, nz2 = -nx * sy + nz1 * cy;
    const nx3 = nx2 * cz - ny1 * sz, ny3 = nx2 * sz + ny1 * cz;
    projected[p + 3] = nz2;
    const diffuse = Math.max(0, nx3 * lightX + ny3 * lightY + nz2 * lightZ);
    const sheen = Math.pow(Math.max(0, -nx3 * .18 - ny3 * .25 + nz2 * .95), 12);
    projected[p + 4] = Math.min(1, .14 + diffuse * .64 + sheen * .32);
  }
  return projected;
}
