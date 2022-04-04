import Accessor from "@arcgis/core/core/Accessor";
import { property, subclass } from "@arcgis/core/core/accessorSupport/decorators";
import Handles from "@arcgis/core/core/Handles";
import { watch } from "@arcgis/core/core/reactiveUtils";
import Extent from "@arcgis/core/geometry/Extent";
import Multipoint from "@arcgis/core/geometry/Multipoint";
import Point from "@arcgis/core/geometry/Point";
import Polyline from "@arcgis/core/geometry/Polyline";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
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
  get spatialReference(): SpatialReference {
    return (this.sampler as any).spatialReference;
  }

  @property()
  get noDataValue(): number {
    return this.sampler.noDataValue;
  }

  @property()
  sourceZmin: number = 0;

  @property()
  sourceZmax: number = 0;

  private offset: number | undefined;
  private scale: number | undefined;

  private handles = new Handles();

  constructor(properties: ConstructProperties) {
    super(properties);
  }

  initialize(): void {
    let zmin = Number.POSITIVE_INFINITY;
    let zmax = Number.NEGATIVE_INFINITY;

    for (const sampler of (this.sampler as any).samplers) {
      for (const value of sampler.tile.samplerData.pixelData) {
        zmin = Math.min(zmin, value);
        zmax = Math.max(zmax, value);
      }
    }

    this.sourceZmin = zmin;
    this.sourceZmax = zmax;

    const dataRange = zmax - zmin;

    this.handles.add(
      watch(
        () => this.config.displayArea,
        (value) => {
          if (!value) {
            return;
          }

          const desiredRange = value.zmax - value.zmin;
          this.scale = desiredRange / dataRange;
          this.offset = value.zmin - zmin;
        },
        { initial: true }
      )
    );
  }

  destroy(): void {
    this.handles.destroy();
  }

  elevationAt(x: number, y: number): number {
    const ret = this.sampler.elevationAt(x, y);
    return ret === this.sampler.noDataValue ? ret : this.scaleValue(ret);
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
        ret.z = this.scaleValue(ret.z);
        break;
    }

    return ret;
  }

  private scaleValue(value: number): number {
    return (value + this.offset!) * this.scale!;
  }

  private scaleCoords(coords: number[][]): void {
    for (const coord of coords) {
      coord[2] = this.scaleValue(coord[2]);
    }
  }
}

interface ConstructProperties {
  config: Configuration;
  sampler: __esri.ElevationSampler;
}
