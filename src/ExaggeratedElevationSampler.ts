import Accessor from "@arcgis/core/core/Accessor";
import { property, subclass } from "@arcgis/core/core/accessorSupport/decorators";
import Extent from "@arcgis/core/geometry/Extent";
import Multipoint from "@arcgis/core/geometry/Multipoint";
import Point from "@arcgis/core/geometry/Point";
import Polygon from "@arcgis/core/geometry/Polygon";
import Polyline from "@arcgis/core/geometry/Polyline";
import { Configuration } from "./Configuration";

@subclass("ExaggeratedElevationSampler")
export class ExaggeratedElevationSampler extends Accessor implements __esri.ElevationSampler {
  @property()
  private config!: Configuration;

  @property()
  readonly sampler!: __esri.ElevationSampler;

  @property()
  get demResolution(): { min: number; max: number } {
    return this.sampler.demResolution;
  }

  @property()
  get extent(): Extent {
    return this.sampler.extent;
  }

  @property()
  get noDataValue(): number {
    return this.sampler.noDataValue;
  }

  constructor(properties: ConstructProperties) {
    super(properties);
  }

  elevationAt(x: number, y: number): number;
  elevationAt(pt: Point): number;

  elevationAt(xOrPt: number | Point, yOrNot?: number): number {
    const samplers: any[] = (this.sampler as any).samplers;
    const x = typeof xOrPt === "number" ? xOrPt : xOrPt.x;
    const y = typeof xOrPt !== "number" ? xOrPt.y : yOrNot ?? 0;

    for (const sampler of samplers) {
      const extent = sampler.tile.tile.extent;

      if (containsXY(extent, x, y)) {
        return sampler.tile.sample(x, y) * this.config.areaScaleAdjustedExaggerationFactor;
      }
    }

    return this.sampler.noDataValue;
  }

  on(name: "changed", handler: __esri.ElevationSamplerChangedEventHandler): IHandle {
    return this.sampler.on(name, handler);
  }

  queryElevation(geometry: Polyline | Point | Multipoint): Polyline | Point | Multipoint {
    const ret = this.sampler.queryElevation(geometry);

    switch (ret.type) {
      case "multipoint":
        this.scaleCoords(ret.points);
        break;
      case "polyline":
        for (const path of ret.paths) {
          this.scaleCoords(path);
        }
        break;
      case "point":
        ret.z *= this.config.areaScaleAdjustedExaggerationFactor;
        break;
    }

    return ret;
  }

  private scaleCoords(coords: number[][]): void {
    const scaleFactor = this.config.areaScaleAdjustedExaggerationFactor;

    for (const coord of coords) {
      coord[2] *= scaleFactor;
    }
  }
}

function containsXY(rect: Readonly<number[]>, x: number, y: number): boolean {
  return x >= rect[0] && y >= rect[1] && x <= rect[2] && y <= rect[3];
}

interface ConstructProperties {
  config: Configuration;
  sampler: __esri.ElevationSampler;
}
