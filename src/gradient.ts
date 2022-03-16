export function makeGradient(stops: Stop[]): ImageData {
  const canvas = document.createElement("canvas");
  const height = 256;

  canvas.width = 1;
  canvas.height = height;

  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);

  for (const {
    offset,
    color: [r, g, b],
  } of stops) {
    gradient.addColorStop(offset, `rgb(${r}, ${g}, ${b})`);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1, height);

  return ctx.getImageData(0, 0, 1, height);
}

export function makeGradientSampler(
  stops: Stop[]
): (value: number) => number[] {
  return (value) => {
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];

      if (value <= stop.offset) {
        if (i === 0) {
          return stops[0].color;
        }

        const prev = stops[i - 1];
        const f = (value - prev.offset) / (stop.offset - prev.offset);

        const c1 = prev.color;
        const c2 = stop.color;

        const ret = [0, 0, 0];

        for (let c = 0; c < 3; c++) {
          ret[c] = c1[c] * (1 - f) + c2[c] * f;
        }

        return ret;
      }
    }

    return stops[stops.length - 1].color;
  };
}

interface Stop {
  offset: number;
  color: number[];
}
