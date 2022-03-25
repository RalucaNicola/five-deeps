export function extrude(
  position: Float64Array,
  height: (x: number, y: number, z: number) => number
): { position: Float64Array; faces: Uint32Array } {
  const numVertices = position.length / 3;
  const newPosition = new Float64Array(numVertices * 6);

  let ptr = 0;

  for (let i = 0; i < numVertices; i++) {
    const x = position[i * 3 + 0];
    const y = position[i * 3 + 1];
    const z = position[i * 3 + 2];

    newPosition[ptr++] = x;
    newPosition[ptr++] = y;
    newPosition[ptr++] = z;
    newPosition[ptr++] = x;
    newPosition[ptr++] = y;
    newPosition[ptr++] = z + height(x, y, z);
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
    faces
  };
}

export function extrudeToZ(position: Float64Array, extrudedZ: number): { position: Float64Array; faces: Uint32Array } {
  return extrude(position, (_x, _y, z) => extrudedZ - z);
}

export function createExtrudedBox(
  width: number,
  height: number,
  evaluate: (out: number[], x: number, y: number) => void,
  extrudeZ: number | ((x: number, y: number, z: number) => number)
): { position: Float64Array; faces: Uint32Array; uv: Float32Array } {
  let writePtr = 0;

  const position = new Float64Array(((width + 1) * 2 + (height + 1) * 2 + 4) * 3);
  const out = [0, 0, 0];

  let zmin = typeof extrudeZ === "number" ? extrudeZ : Number.POSITIVE_INFINITY;
  let zmax = typeof extrudeZ === "number" ? extrudeZ : Number.NEGATIVE_INFINITY;

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

      x += dx;
      y += dy;

      zmin = Math.min(zmin, out[2]);
      zmax = Math.max(zmax, out[2]);
    }

    let lastPtr = writePtr - 3;
    position[writePtr++] = position[lastPtr++];
    position[writePtr++] = position[lastPtr++];
    position[writePtr++] = position[lastPtr++];
  };

  fillPosition(0, width, 0, 0);
  fillPosition(width, width, 0, height);
  fillPosition(width, 0, height, height);
  fillPosition(0, 0, height, 0);

  const extruded = extrude(
    position,
    typeof extrudeZ === "number"
      ? (_x, _y, z) => extrudeZ - z
      : (x, y, z) => {
          const ret = extrudeZ(x, y, z);
          zmin = Math.min(zmin, ret + z);
          zmax = Math.max(zmax, ret + z);
          return ret;
        }
  );
  const numVertices = extruded.position.length / 3;
  const uv = new Float32Array(numVertices * 2);

  let uvPtr = 0;
  let posPtr = 0;

  for (let i = 0; i < numVertices; i++) {
    const z1 = extruded.position[posPtr + 2];
    const z2 = extruded.position[posPtr + 5];

    uv[uvPtr++] = 0;
    uv[uvPtr++] = (z1 - zmin) / (zmax - zmin);
    uv[uvPtr++] = 0;
    uv[uvPtr++] = (z2 - zmin) / (zmax - zmin);

    posPtr += 6;
  }

  return { position: extruded.position, faces: extruded.faces, uv };
}
