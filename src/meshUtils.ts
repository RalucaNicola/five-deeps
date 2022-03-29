export function extrude(
  position: Float64Array,
  u: Float32Array | null,
  height: (x: number, y: number, z: number) => number
): { position: Float64Array; uv: Float32Array; faces: Uint32Array } {
  const numVertices = position.length / 3;
  const newPosition = new Float64Array(numVertices * 6);
  const uv = new Float32Array(numVertices * 4);

  let ptr = 0;
  let uvPtr = 0;

  let zmin = Number.POSITIVE_INFINITY;
  let zmax = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < numVertices; i++) {
    const x = position[i * 3 + 0];
    const y = position[i * 3 + 1];
    const z = position[i * 3 + 2];

    newPosition[ptr++] = x;
    newPosition[ptr++] = y;
    newPosition[ptr++] = z;
    newPosition[ptr++] = x;
    newPosition[ptr++] = y;

    const z2 = z + height(x, y, z);
    newPosition[ptr++] = z2;

    zmin = Math.min(zmin, z, z2);
    zmax = Math.max(zmax, z, z2);

    uv[uvPtr++] = u ? u[i] : 0;
    uv[uvPtr++] = 0;
    uv[uvPtr++] = u ? u[i] : 0;
    uv[uvPtr++] = 0;
  }

  ptr = 0;
  uvPtr = 0;

  const zh = zmax - zmin;

  for (let i = 0; i < numVertices; i++) {
    const z1 = newPosition[ptr + 2];

    uv[++uvPtr] = (z1 - zmin) / zh;
    ++uvPtr;

    const z2 = newPosition[ptr + 5];
    uv[++uvPtr] = (z2 - zmin) / zh;
    ++uvPtr;

    ptr += 6;
  }

  const numQuads = numVertices - 1;
  const faces = new Uint32Array(numQuads * 6);
  let writePtr = 0;

  for (let i = 0; i < numQuads; i++) {
    const ptr = i * 2;

    faces[writePtr++] = ptr + 2;
    faces[writePtr++] = ptr;
    faces[writePtr++] = ptr + 1;

    faces[writePtr++] = ptr + 2;
    faces[writePtr++] = ptr + 1;
    faces[writePtr++] = ptr + 3;
  }

  return {
    position: newPosition,
    uv,
    faces
  };
}

export function extrudeToZ(position: Float64Array, extrudedZ: number): { position: Float64Array; faces: Uint32Array } {
  return extrude(position, null, (_x, _y, z) => extrudedZ - z);
}

export function createExtrudedBox(
  width: number,
  height: number,
  evaluate: (out: number[], x: number, y: number) => void,
  extrudeZ: number | ((x: number, y: number, z: number) => number)
): { position: Float64Array; faces: Uint32Array; uv: Float32Array; numVertices: { x: number; y: number } } {
  let writePtr = 0;

  const numLine = (width + 2) * 2 + (height + 2) * 2;
  const position = new Float64Array(numLine * 3);
  const u = new Float32Array(numLine);
  const out = [0, 0, 0];

  let uPtr = 0;

  const fillPosition = (xmin: number, xmax: number, ymin: number, ymax: number) => {
    let x = xmin;
    let y = ymin;

    const dx = Math.sign(xmax - xmin);
    const dy = Math.sign(ymax - ymin);

    while (Math.sign(x - xmax) !== dx || Math.sign(y - ymax) !== dy) {
      evaluate(out, x, y);

      position[writePtr++] = out[0];
      position[writePtr++] = out[1];
      position[writePtr++] = out[2];

      u[uPtr++] = dx ? (x - xmin) / (xmax - xmin) : (y - ymin) / (ymax - ymin);

      x += dx;
      y += dy;
    }

    let lastPtr = writePtr - 3;
    position[writePtr++] = position[lastPtr++];
    position[writePtr++] = position[lastPtr++];
    position[writePtr++] = position[lastPtr++];

    u[uPtr++] = 1;
  };

  fillPosition(0, width, 0, 0);
  fillPosition(width, width, 0, height);
  fillPosition(width, 0, height, height);
  fillPosition(0, 0, height, 0);

  const extruded = extrude(
    position,
    u,
    typeof extrudeZ === "number" ? (_x, _y, z) => extrudeZ - z : (x, y, z) => extrudeZ(x, y, z)
  );

  return {
    position: extruded.position,
    faces: extruded.faces,
    uv: extruded.uv,
    numVertices: { x: (width + 2) * 2, y: (height + 2) * 2 }
  };
}
