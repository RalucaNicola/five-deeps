import Color from "@arcgis/core/Color";
import Accessor from "@arcgis/core/core/Accessor";
import { property, subclass } from "@arcgis/core/core/accessorSupport/decorators";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import Mesh from "@arcgis/core/geometry/Mesh";
import MeshComponent from "@arcgis/core/geometry/support/MeshComponent";
import MeshMaterialMetallicRoughness from "@arcgis/core/geometry/support/MeshMaterialMetallicRoughness";
import MeshTexture from "@arcgis/core/geometry/support/MeshTexture";
import Graphic from "@arcgis/core/Graphic";
import ElevationLayer from "@arcgis/core/layers/ElevationLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import FillSymbol3DLayer from "@arcgis/core/symbols/FillSymbol3DLayer";
import MeshSymbol3D from "@arcgis/core/symbols/MeshSymbol3D";
import SceneView from "@arcgis/core/views/SceneView";
import { restart } from "./asyncUtils";
import { meshCreateFromElevation } from "./cached";

import { Configuration, ShadingMode } from "./Configuration";
import { ExaggeratedElevationSampler } from "./ExaggeratedElevationSampler";
import { drawGlassGradient, makeGradient } from "./gradient";
import { createExtrudedBox } from "./meshUtils";
import { computeHillshade, computeNormals, SanmplingFunction } from "./raster";
import SolidEdges3D from "@arcgis/core/symbols/edges/SolidEdges3D";
import SimplexNoise from "simplex-noise";
import Polygon from "@arcgis/core/geometry/Polygon";
import PolygonSymbol3D from "@arcgis/core/symbols/PolygonSymbol3D";
import WaterSymbol3DLayer from "@arcgis/core/symbols/WaterSymbol3DLayer";
import caustics from "./images/caustics.png";
import Extent from "@arcgis/core/geometry/Extent";
import { textChangeRangeIsUnchanged } from "typescript";
import { when } from "@arcgis/core/core/reactiveUtils";

@subclass("DioramaBuilder")
export class DioramaBuilder extends Accessor implements ConstructProperties {
  @property()
  view!: SceneView;

  @property()
  config!: Configuration;

  @property()
  private layer = new GraphicsLayer();

  @property()
  private elevationSurfaceMesh: Mesh | null = null;

  @property()
  private elevationSurfaceGraphic: Graphic | null = null;

  @property()
  private surfaceBoxGraphic: Graphic | null = null;

  @property()
  private glassBoxGraphic: Graphic | null = null;

  @property()
  private topSurfaceGraphic: Graphic | null = null;

  @property()
  private sampler: ExaggeratedElevationSampler | null = null;

  @property()
  zmin: number = Number.POSITIVE_INFINITY;

  @property()
  zmax: number = Number.POSITIVE_INFINITY;

  @property()
  private numUpdating = 0;

  @property()
  get updating(): boolean {
    return this.numUpdating !== 0;
  }

  @property()
  get terrainColorTextureCanvas(): HTMLCanvasElement {
    return document.createElement("canvas");
  }

  @property()
  get hillshadeCanvas(): HTMLCanvasElement {
    return document.createElement("canvas");
  }

  @property()
  get glassCanvas(): HTMLCanvasElement {
    return document.createElement("canvas");
  }

  @property()
  get topSurfaceZ(): number {
    return this.config.displayArea.height * 0.65;
  }

  @property()
  get topSurfaceSampler(): TopSurfaceSampler | null {
    return this.waterSurfaceSampler;
  }

  @property()
  get waterSurfaceSampler(): TopSurfaceSampler | null {
    const displayArea = this.config.displayArea;
    const { xmin, ymin, width, height } = displayArea;
    const { waterSurfaceNoiseHarmonics, waterSurfaceNoiseSeed } = this.config;

    const noise = new SimplexNoise(waterSurfaceNoiseSeed);
    const zero = this.topSurfaceZ;

    return (x, y) => {
      const xn = (x - xmin) / width;
      const yn = (y - ymin) / height;

      let z = zero;

      for (const { waveLength, amplitude } of waterSurfaceNoiseHarmonics) {
        const zn = noise.noise2D(xn * waveLength, yn * waveLength);
        z += ((zn + 1) / 2) * amplitude;
      }

      return z;
    };
  }

  @property()
  get glassGradientImageData(): ImageData {
    const glassTextureResolution = this.config.glassTextureResolution;

    const canvas = this.glassCanvas;
    canvas.width = glassTextureResolution;
    canvas.height = glassTextureResolution;

    return drawGlassGradient(canvas.getContext("2d")!, glassTextureResolution, glassTextureResolution);
  }

  private causticsImage: HTMLImageElement;

  public loading: HTMLDivElement | null = null;

  constructor(props: ConstructProperties) {
    super(props);
    this.causticsImage = new Image();
    this.causticsImage.src = caustics;
    this.causticsImage.decode();
  }

  destroyDiorama(): void {
    this.sampler = null;
    if (this.elevationSurfaceGraphic) {
      this.layer.remove(this.elevationSurfaceGraphic);
      this.elevationSurfaceGraphic.destroy();
      this.elevationSurfaceGraphic = null;
    }
    if (this.surfaceBoxGraphic) {
      this.layer.remove(this.surfaceBoxGraphic);
      this.surfaceBoxGraphic.destroy();
      this.surfaceBoxGraphic = null;
    }
    if (this.glassBoxGraphic) {
      this.layer.remove(this.glassBoxGraphic);
      this.glassBoxGraphic = null;
    }
    if (this.topSurfaceGraphic) {
      this.layer.remove(this.topSurfaceGraphic);
      this.topSurfaceGraphic = null;
    }
  }

  generateDiorama(sourceArea: Extent): void {
    if (this.loading) {
      this.loading.style.display = "flex";
    }
    const wrapUpdating = <T>(promise: Promise<T>): Promise<T> => {
      this.numUpdating++;
      promise.finally(() => this.numUpdating--);
      return promise;
    };

    const restartingRecreateSampler = restart(
      async (signal: AbortSignal, params: RecreateSamplerParams | undefined) => {
        return params ? wrapUpdating(this.recreateSampler(signal, params)) : null;
      }
    );

    const restartingRecreateElevationMesh = restart(
      async (signal: AbortSignal, params: RecreateElevationMeshParams | undefined) => {
        return params ? wrapUpdating(this.recreateElevationMesh(signal, params)) : null;
      }
    );
    restartingRecreateSampler({
      sourceArea,
      samplingResolutionPixels: this.config.samplingResolutionPixels
    }).then(() => {
      restartingRecreateElevationMesh({
        sampler: this.sampler,
        sourceArea,
        terrainSurfaceVertexResolution: this.terrainSurfaceVertexResolution(sourceArea),
        displayArea: this.config.displayArea
      }).then(() => {
        this.updateMeshVisualization({
          visualizationParams: this.terrainVisualizationParams(sourceArea),
          graphic: this.elevationSurfaceGraphic
        });
        this.recreateSurfaceBoxMesh({
          zmin: this.zmin,
          zmax: this.zmax,
          surfacePaddingBottom: this.config.surfacePaddingBottom,
          terrainSurfaceVertexResolution: this.terrainSurfaceVertexResolution(sourceArea),
          sourceArea,
          displayArea: this.config.displayArea,
          sampler: this.sampler
        });
        this.recreateGlassBox({
          displayArea: this.config.displayArea,
          sourceArea,
          glassTextureResolution: this.config.glassTextureResolution,
          sampler: this.sampler,
          terrainSurfaceVertexResolution: this.terrainSurfaceVertexResolution(sourceArea),
          glassGradientImageData: this.glassGradientImageData,
          topSurfaceSampler: this.topSurfaceSampler
        });
        this.recreateWaterSurface({
          displayArea: this.config.displayArea,
          topSurfaceSampler: this.topSurfaceSampler,
          waterSurfaceResolution: this.config.waterSurfaceResolution,
          glassGradientImageData: this.glassGradientImageData
        });
        if (this.loading) {
          this.loading.style.display = "none";
        }
      });
    });
  }

  protected initialize(): void {
    this.view.map.add(this.layer);
    // hack to suspend tile updates
    when(
      () => !this.view.updating,
      () => {
        (this.view as any).basemapTerrain.suspended = true;
      },
      { once: true }
    );
  }

  private async recreateSampler(
    signal: AbortSignal,
    { sourceArea: area, samplingResolutionPixels }: RecreateSamplerParams
  ): Promise<void> {
    const demResolution = Math.max(area.width, area.height) / samplingResolutionPixels;

    const layer = new ElevationLayer({
      url: "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/TopoBathy3D/ImageServer"
    });
    this.sampler = new ExaggeratedElevationSampler({
      sampler: await layer.createElevationSampler(area, { demResolution, signal, noDataValue: 1e-30 }),
      config: this.config
    });
  }

  private async recreateElevationMesh(signal: AbortSignal, params: RecreateElevationMeshParams): Promise<void> {
    this.elevationSurfaceMesh = null;
    const {
      sampler,
      sourceArea,
      terrainSurfaceVertexResolution: { demResolution }
    } = params;

    if (!sampler) {
      return;
    }

    const mesh = await meshCreateFromElevation(sampler, sourceArea, { demResolution });

    if (signal.aborted) {
      throw new Error("AbortError");
    }

    this.renormalizeTerrainSurface(mesh, params);

    mesh.components[0].material = new MeshMaterialMetallicRoughness({
      metallic: 0,
      roughness: 1
    });

    this.elevationSurfaceMesh = mesh;

    this.elevationSurfaceGraphic = new Graphic({
      geometry: mesh,
      symbol: new MeshSymbol3D({
        symbolLayers: [
          new FillSymbol3DLayer({
            material: { color: "white" }
          })
        ]
      }),
      visible: false
    });

    this.layer.add(this.elevationSurfaceGraphic);
  }

  private renormalizeTerrainSurface(mesh: Mesh, { sourceArea, displayArea }: RecreateElevationMeshParams): void {
    const position = mesh.vertexAttributes.position;
    const tangent = new Float32Array((position.length / 3) * 4);
    mesh.vertexAttributes.tangent = tangent;

    let tangentPtr = 0;
    let zmin = Number.POSITIVE_INFINITY;
    let zmax = Number.NEGATIVE_INFINITY;

    const areaScaleX = displayArea.width / sourceArea.width;
    const areaScaleY = displayArea.height / sourceArea.height;

    for (let i = 0; i < position.length; i += 3) {
      const x = position[i];
      const y = position[i + 1];

      position[i] = (x - sourceArea.xmin) * areaScaleX + displayArea.xmin;
      position[i + 1] = (y - sourceArea.ymin) * areaScaleY + displayArea.ymin;

      tangent[tangentPtr++] = 1;
      tangent[tangentPtr++] = 0;
      tangent[tangentPtr++] = 0;
      tangent[tangentPtr++] = 1;

      const z = position[i + 2];

      zmin = Math.min(zmin, z);
      zmax = Math.max(zmax, z);
    }

    this.zmin = zmin;
    this.zmax = zmax;

    mesh.vertexAttributesChanged();
  }

  private createTerrainColorTexture(sourceArea: Extent): MeshTexture | null {
    const sampler = this.sampler;
    if (!sampler) {
      return null;
    }

    const { colorTextureResolution: size, colorRamp, terrainColorSaturation } = this.config;

    const imageData = new ImageData(size, size);
    let ptr = 0;

    const { zmin, zmax } = this;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const px = sourceArea.xmin + (x / size) * sourceArea.width;
        const py = sourceArea.ymin + (y / size) * sourceArea.height;

        const z = sampler.elevationAt(px, py);
        const f = (z - zmin) / (zmax - zmin);

        const color = colorRamp(f);

        imageData.data[ptr++] = color[0];
        imageData.data[ptr++] = color[1];
        imageData.data[ptr++] = color[2];
        imageData.data[ptr++] = 255;
      }
    }

    const canvas = this.terrainColorTextureCanvas;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d")!;

    ctx.save();
    ctx.putImageData(imageData, 0, 0);
    ctx.filter = `saturate(${terrainColorSaturation})`;
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();

    const { shadingMode } = this.config;

    ctx.save();

    const samplingFunction = this.cachedElevationSampleFunction(sourceArea);
    if ((shadingMode === "hillshade" || shadingMode === "multi-hillshade") && samplingFunction) {
      const { hillshadeStretchStddev } = this.config;

      const hillshade = computeHillshade(samplingFunction, {
        extent: sourceArea,
        width: size,
        height: size,
        colorOutput: true,
        multi: shadingMode === "multi-hillshade",
        stretchStddev: hillshadeStretchStddev
      });

      const hillshadeImage = new ImageData(hillshade, size, size);

      const hillshadeCanvas = this.hillshadeCanvas;
      hillshadeCanvas.width = size;
      hillshadeCanvas.height = size;

      const hillshadeCtx = hillshadeCanvas.getContext("2d")!;
      hillshadeCtx.putImageData(hillshadeImage, 0, 0);

      ctx.globalCompositeOperation = "soft-light";
      ctx.drawImage(hillshadeCanvas, 0, 0);
    }

    ctx.restore();

    for (let i = 0; i < 3; i++) {
      ctx.drawImage(this.causticsImage, 0, 0, size, size);
    }

    return new MeshTexture({ data: ctx.getImageData(0, 0, size, size) });
  }

  private terrainVisualizationParams(sourceArea: Extent): TerrainVisualizationParams {
    return {
      shadingMode: this.config.shadingMode,
      mesh: this.elevationSurfaceMesh,
      colorTexture: this.createTerrainColorTexture(sourceArea)
    };
  }

  private cachedElevationSampleFunction(sourceArea: Extent): SanmplingFunction | null {
    if (!this.sampler) {
      return null;
    }

    const size = this.config.colorTextureResolution;
    const samples = new Float64Array(size * size);

    const { xmin, ymin, width, height } = sourceArea;

    let py = ymin;
    let ptr = 0;

    const dx = width / size;
    const dy = height / size;

    for (let y = 0; y < size; y++) {
      let px = xmin;

      for (let x = 0; x < size; x++) {
        samples[ptr++] = this.sampler.sampler.elevationAt(px, py);
        px += dx;
      }

      py += dy;
    }

    return (px, py, pdx, pdy): number => {
      const x = Math.min(Math.max(px + pdx, 0), size - 1);
      const y = Math.min(Math.max(py + pdy, 0), size - 1);
      return samples[y * size + x];
    };
  }

  private updateMeshVisualization({ visualizationParams, graphic }: UpdateMeshVisualizationParams): void {
    if (!visualizationParams?.mesh || !graphic) {
      return;
    }

    const cloned = visualizationParams.mesh.clone();
    this.setTerrainVisualization({ ...visualizationParams, mesh: cloned });

    graphic.geometry = cloned;
    graphic.visible = true;
  }

  private setTerrainVisualization(params: TerrainVisualizationParams): void {
    const { mesh, colorTexture: texture } = params;
    if (!mesh || !texture) {
      return;
    }

    const material = mesh.components[0].material;

    if (!(material instanceof MeshMaterialMetallicRoughness)) {
      return;
    }

    switch (params.shadingMode) {
      case "none":
        material.colorTexture = texture;
        material.emissiveTexture = null!;
        material.emissiveColor = null!;
        material.color = null!;
        material.normalTexture = null!;
        break;
      default:
        material.colorTexture = null!;
        material.emissiveTexture = texture;
        material.emissiveColor = new Color([255, 255, 255]);
        material.color = new Color([0, 0, 0]);
        material.normalTexture = null!;
        break;
    }
  }

  private terrainSurfaceVertexResolution(sourceArea: Extent): TerrainSurfaceVertexResolution {
    const { elevationMeshResolutionPixels } = this.config;
    const demResolution = Math.max(sourceArea.width, sourceArea.height) / elevationMeshResolutionPixels;
    const width = Math.ceil(sourceArea.width / demResolution);
    const height = Math.ceil(sourceArea.height / demResolution);

    return { width, height, demResolution };
  }

  private recreateSurfaceBoxMesh({
    zmin,
    zmax,
    surfacePaddingBottom,
    terrainSurfaceVertexResolution: { width, height },
    sourceArea,
    displayArea,
    sampler
  }: RecreateSurfaceBoxMeshParams): void {
    if (!sampler || !Number.isFinite(zmin)) {
      return;
    }

    const { position, faces, uv } = createExtrudedBox(
      width,
      height,
      (out, x, y) => {
        const sx = sourceArea.xmin + (x / width) * sourceArea.width;
        const sy = sourceArea.ymin + (y / height) * sourceArea.height;

        out[0] = displayArea.xmin + (x / width) * displayArea.width;
        out[1] = displayArea.ymin + (y / height) * displayArea.height;
        out[2] = sampler.elevationAt(sx, sy);
      },
      zmin - surfacePaddingBottom * (zmax - zmin)
    );

    const gradient = makeGradient([
      { offset: 0, color: [255, 158, 116] },
      { offset: 0.4, color: [235, 210, 182] },
      { offset: 1, color: [235, 235, 235] }
    ]);

    const mesh = new Mesh({
      spatialReference: SpatialReference.WebMercator,
      vertexAttributes: { position, uv },
      components: [
        new MeshComponent({
          faces,
          material: new MeshMaterialMetallicRoughness({
            colorTexture: new MeshTexture({ data: gradient }),
            roughness: 0.25,
            metallic: 0
          })
        })
      ]
    });

    this.surfaceBoxGraphic = new Graphic({
      geometry: mesh,
      symbol: new MeshSymbol3D({
        symbolLayers: [
          new FillSymbol3DLayer({
            material: { color: "white" },
            edges: new SolidEdges3D({
              size: "5px",
              color: [235, 210, 182]
            })
          })
        ]
      })
    });

    this.layer.add(this.surfaceBoxGraphic);
  }

  private recreateWaterSurface({
    displayArea,
    topSurfaceSampler,
    waterSurfaceResolution
  }: RecreateTopSurfaceParams): void {
    if (!topSurfaceSampler) {
      return;
    }

    const { xmin, ymin, xmax, ymax } = displayArea;
    const stepx = (xmax - xmin) / waterSurfaceResolution;
    const stepy = (ymax - ymin) / waterSurfaceResolution;

    const addZ = (x: number, y: number) => [x, y, topSurfaceSampler(x, y)];

    const rings: number[][][] = [];

    for (let py = 0; py < waterSurfaceResolution; py++) {
      const y = ymin + stepy * py;

      for (let px = 0; px < waterSurfaceResolution; px++) {
        const x = xmin + stepx * px;
        rings.push([addZ(x, y), addZ(x, y + stepy), addZ(x + stepx, y + stepy), addZ(x + stepx, y), addZ(x, y)]);
      }
    }

    const polygon = new Polygon({
      rings,
      spatialReference: SpatialReference.WebMercator
    });

    this.topSurfaceGraphic = new Graphic({
      geometry: polygon,
      symbol: new PolygonSymbol3D({
        symbolLayers: [
          new WaterSymbol3DLayer({
            waterbodySize: "large",
            waveStrength: "moderate",
            color: [30, 160, 160, 0.8]
          })
        ]
      })
    });

    this.layer.add(this.topSurfaceGraphic);
  }

  private recreateGlassBox({
    sourceArea,
    displayArea,
    sampler,
    topSurfaceSampler,
    glassGradientImageData,
    terrainSurfaceVertexResolution
  }: RecreateGlassBoxParams): void {
    if (!sampler || !topSurfaceSampler) {
      return;
    }

    const { xmin: xminSource, width: widthSource, ymin: yminSource, height: heightSource } = sourceArea;
    const { xmin, ymin, width, height } = displayArea;

    const { position, uv, faces, numVertices } = createExtrudedBox(
      terrainSurfaceVertexResolution.width,
      terrainSurfaceVertexResolution.height,
      (out, x, y) => {
        out[0] = xmin + (x / terrainSurfaceVertexResolution.width) * width;
        out[1] = ymin + (y / terrainSurfaceVertexResolution.height) * height;
        out[2] = topSurfaceSampler(out[0], out[1]);
      },
      (x, y, z) => {
        const px = ((x - xmin) / width) * widthSource + xminSource;
        const py = ((y - ymin) / height) * heightSource + yminSource;
        return sampler.elevationAt(px, py) - z;
      }
    );

    // Flip x coordinate of the y-direction walls to mirror the glass gradient a bit nicer
    const uvo1 = numVertices.x * 2;
    const uvo2 = (numVertices.x * 2 + numVertices.y) * 2;

    for (let i = 0; i < numVertices.y * 2; i += 2) {
      const i1 = uvo1 + i;
      const i2 = uvo2 + i;

      uv[i1] = 1 - uv[i1];
      uv[i2] = 1 - uv[i2];
    }

    this.glassBoxGraphic = new Graphic({
      geometry: new Mesh({
        vertexAttributes: { position, uv },
        components: [
          new MeshComponent({
            faces,
            material: new MeshMaterialMetallicRoughness({
              colorTexture: new MeshTexture({ data: glassGradientImageData, transparent: true }),
              emissiveColor: [100, 100, 100],
              alphaMode: "blend",
              roughness: 1,
              metallic: 0
            })
          })
        ]
      }),
      symbol: new MeshSymbol3D({
        symbolLayers: [
          new FillSymbol3DLayer({
            material: { color: "white" }
          })
        ]
      })
    });

    this.layer.add(this.glassBoxGraphic);
  }
}

export interface ConstructProperties {
  view: SceneView;
  config: Configuration;
}

type RecreateSamplerParams = { sourceArea: Extent; samplingResolutionPixels: number };

interface RecreateElevationMeshParams {
  sourceArea: Extent;
  displayArea: Extent;
  sampler: ExaggeratedElevationSampler | null;
  terrainSurfaceVertexResolution: TerrainSurfaceVertexResolution;
}

interface UpdateMeshVisualizationParams {
  visualizationParams: TerrainVisualizationParams | null;
  graphic: Graphic | null;
}

interface TerrainVisualizationParams {
  shadingMode: ShadingMode;
  mesh: Mesh | null;
  colorTexture: MeshTexture | null;
}

interface RecreateSurfaceBoxMeshParams extends Pick<Configuration, "surfacePaddingBottom" | "displayArea"> {
  sourceArea: Extent;
  zmin: number;
  zmax: number;
  sampler: ExaggeratedElevationSampler | null;
  terrainSurfaceVertexResolution: TerrainSurfaceVertexResolution;
}

interface RecreateGlassBoxParams extends Pick<Configuration, "displayArea" | "glassTextureResolution"> {
  sourceArea: Extent;
  topSurfaceSampler: TopSurfaceSampler | null;
  terrainSurfaceVertexResolution: TerrainSurfaceVertexResolution;
  sampler: ExaggeratedElevationSampler | null;
  glassGradientImageData: ImageData;
}

interface RecreateTopSurfaceParams extends Pick<Configuration, "displayArea" | "waterSurfaceResolution"> {
  topSurfaceSampler: TopSurfaceSampler | null;
  glassGradientImageData: ImageData;
}

interface TerrainSurfaceVertexResolution {
  width: number;
  height: number;
  demResolution: number;
}

type TopSurfaceSampler = (x: number, y: number) => number;
