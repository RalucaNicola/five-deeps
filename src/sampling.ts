export function sampleElevation(sampler: __esri.ElevationSampler, x: number, y: number): number {
  const samplers: any[] = (sampler as any).samplers;

  for (const sampler of samplers) {
    const extent = sampler.tile.tile.extent;

    if (containsXY(extent, x, y)) {
      return sampler.tile.sample(x, y);
    }
  }

  return sampler.noDataValue;
}

function containsXY(rect: Readonly<number[]>, x: number, y: number): boolean {
  return x >= rect[0] && y >= rect[1] && x <= rect[2] && y <= rect[3];
}
