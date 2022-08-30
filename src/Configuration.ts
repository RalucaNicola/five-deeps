import Accessor from "@arcgis/core/core/Accessor";
import { property, subclass } from "@arcgis/core/core/accessorSupport/decorators";
import Extent from "@arcgis/core/geometry/Extent";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import { makeGradientSampler } from "./gradient";

@subclass("Configuration")
export class Configuration extends Accessor {
  @property()
  displayArea = new Extent({
    xmin: 0,
    xmax: 100,
    ymin: 0,
    ymax: 100,
    zmin: 0,
    zmax: 50,
    spatialReference: SpatialReference.WebMercator
  });

  @property()
  samplingResolutionPixels = 512;

  @property()
  colorTextureResolution = 512;

  @property()
  elevationMeshResolutionPixels = 256;

  @property()
  waterSurfaceResolution = 64;

  @property()
  hillshadeStretchStddev = 2;

  @property()
  terrainColorSaturation = 1.5;

  @property()
  glassTextureResolution = 256;

  @property()
  colorRamp = makeGradientSampler([
    { offset: 0, color: "#022659" },
    { offset: 1, color: "#a7cef2" }
  ]);

  @property()
  surfacePaddingBottom = 0.01;

  @property()
  shadingMode: ShadingMode = "multi-hillshade";

  @property()
  waterSurfaceNoiseSeed = 123;

  @property()
  waterSurfaceNoiseHarmonics = [
    { waveLength: 0.87, amplitude: 10 },
    { waveLength: 6, amplitude: 0.6 }
  ];
}

export type ShadingMode = "none" | "hillshade" | "multi-hillshade";
