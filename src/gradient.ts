export function makeGradient(stops: Stop[]): ImageData {
  const canvas = document.createElement("canvas");
  const height = 256;

  canvas.width = 1;
  canvas.height = height;

  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);

  for (const {
    offset,
    color: [r, g, b]
  } of stops) {
    gradient.addColorStop(offset, `rgb(${r}, ${g}, ${b})`);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1, height);

  return ctx.getImageData(0, 0, 1, height);
}

export function drawGlassGradient(ctx: CanvasRenderingContext2D, width: number, height: number): ImageData {
  const dx = width * 0.15;
  const dy = height * 0.15;
  const gradient = ctx.createRadialGradient(
    width / 2 + dx,
    height / 2 - dy,
    0,
    width / 2 + dx,
    height / 2 - dy,
    (Math.sqrt(width * width + height * height) / 2) * 1.6
  );

  gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
  gradient.addColorStop(0.5, "rgba(180, 255, 255, 0)");
  gradient.addColorStop(1, "rgba(0, 163, 163)");

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  return ctx.getImageData(0, 0, width, height);
}

export function makeGradientSampler(stops: Stop[]): (value: number) => number[] {
  const colors = stops.map(({ color }) => (typeof color === "string" ? hexToRGB(color) : color));

  return (value) => {
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      const color = colors[i];

      if (value <= stop.offset) {
        if (i === 0) {
          return colors[0];
        }

        const prev = stops[i - 1];
        const f = (value - prev.offset) / (stop.offset - prev.offset);

        const c1 = colors[i - 1];
        const c2 = color;

        const ret = [0, 0, 0];

        for (let c = 0; c < 3; c++) {
          ret[c] = c1[c] * (1 - f) + c2[c] * f;
        }

        return ret;
      }
    }

    return colors[colors.length - 1];
  };
}

function hexToRGB(color: string): number[] {
  return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
}

interface Stop {
  offset: number;
  color: number[] | string;
}
