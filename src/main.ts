import MeshComponent from "@arcgis/core/geometry/support/MeshComponent";
import FillSymbol3DLayer from "@arcgis/core/symbols/FillSymbol3DLayer";
import MeshSymbol3D from "@arcgis/core/symbols/MeshSymbol3D";
import MeshMaterialMetallicRoughness from "@arcgis/core/geometry/support/MeshMaterialMetallicRoughness";
import MeshTexture from "@arcgis/core/geometry/support/MeshTexture";
import Point from "@arcgis/core/geometry/Point";
import { createFromElevation } from "@arcgis/core/geometry/support/meshUtils";
import Mesh from "@arcgis/core/geometry/Mesh";
import WaterSymbol3DLayer from "@arcgis/core/symbols/WaterSymbol3DLayer";
import PolygonSymbol3D from "@arcgis/core/symbols/PolygonSymbol3D";
import Graphic from "@arcgis/core/Graphic";
import Polygon from "@arcgis/core/geometry/Polygon";
import Extent from "@arcgis/core/geometry/Extent";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import Map from "@arcgis/core/Map";
import SceneView from "@arcgis/core/views/SceneView";
import SimplexNoise from "simplex-noise";
import { CachedElevationLayer } from "./CachedElevationLayer";
import { makeGradient, makeGradientSampler } from "./gradient";
import { createExtrudedBox, extrudeToZ } from "./meshUtils";
import SolidEdges3D from "@arcgis/core/symbols/edges/SolidEdges3D";

const noise = new SimplexNoise(() => 12);
const area = new Extent({
  xmin: 15846866.941,
  xmax: 15906406.3364,
  ymin: 1248118.5472,
  ymax: 1304555.719,
  spatialReference: SpatialReference.WebMercator
});

area.expand(5);

const clippingExtent = new Extent({
  xmin: 0,
  xmax: 100,
  ymin: 0,
  ymax: 100,
  spatialReference: SpatialReference.WebMercator
});

const view = new SceneView({
  container: "viewDiv",

  map: new Map({
    basemap: "topo",
    ground: {
      opacity: 0,
      surfaceColor: [100, 100, 50]
    }
  }),

  camera: {
    position: {
      x: -0.00181343,
      y: -0.00165589,
      z: 91.81711
    },
    heading: 47.88,
    tilt: 68.2
  },

  environment: {
    lighting: {
      date: "Tue Mar 15 2022 08:05:00 GMT-0700 (Pacific Daylight Time)"
    }
  },

  clippingArea: clippingExtent,

  spatialReference: SpatialReference.WebMercator,
  qualityProfile: "high",
  viewingMode: "local"
});

view.popup.defaultPopupTemplateEnabled = true;

const rings: number[][][] = [];
const steps = 20;
const noiseHeight = 10;
const noiseScale = 0.87;
const noiseHeight2 = 0.6;
const noiseScale2 = 6;
const zExaggeration = 12;
const scale = Math.max(area.width / clippingExtent.width, area.height / clippingExtent.height);

async function run() {
  const samplerResolution = 400;

  const layer = new CachedElevationLayer({
    url: "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/TopoBathy3D/ImageServer"
  });

  const sampler = await layer.createElevationSampler(area, { demResolution: samplerResolution });

  const width = Math.ceil(sampler.extent.width / samplerResolution);
  const height = Math.ceil(sampler.extent.height / samplerResolution);

  const scaleZ = (value: number) =>
    ((value - zmin) * zExaggeration + zmin - (zmax - zmin) * zExaggeration * 1.3) / scale;

  const meshResolution = 1600;
  const mesh = await createFromElevation(sampler, area, { demResolution: meshResolution });

  const zmin = mesh.extent.zmin;
  const zmax = mesh.extent.zmax;
  const zExtra = 1;
  const zBottom = scaleZ(zmin) - zExtra;
  const context: Context = { width, height, sampler, zmin, zmax, zBottom, scaleZ };

  createTerrainSurface(mesh, context);
  createWaterSurface(context);
  createSurfaceBox(context);
}

async function createTerrainSurface(mesh: Mesh, context: Context): Promise<void> {
  const pt = new Point({ x: 0, y: 0, spatialReference: SpatialReference.WebMercator });
  const { scaleZ } = context;
  const position = mesh.vertexAttributes.position;

  for (let i = 0; i < position.length; i += 3) {
    const x = position[i];
    const y = position[i + 1];
    const z = position[i + 2];

    position[i] = ((x - area.xmin) / area.width) * clippingExtent.width + clippingExtent.xmin;
    position[i + 1] = ((y - area.ymin) / area.height) * clippingExtent.height + clippingExtent.ymin;
    position[i + 2] = scaleZ(z);
  }

  mesh.vertexAttributesChanged();
  mesh.components[0].material = new MeshMaterialMetallicRoughness({
    colorTexture: new MeshTexture({ data: createTerrainColorTexture(context) }),
    metallic: 0,
    roughness: 0.8
  });

  view.graphics.add(
    new Graphic({
      geometry: mesh,
      symbol: new MeshSymbol3D({
        symbolLayers: [
          new FillSymbol3DLayer({
            material: { color: "white " }
          })
        ]
      })
    })
  );
}

function createTerrainColorTexture({ width, height, sampler, zmin, zmax }: Context): ImageData {
  const pt = new Point({ x: 0, y: 0, spatialReference: SpatialReference.WebMercator });

  const gradientSampler = makeGradientSampler([
    { offset: 0, color: [0, 14, 113] },
    { offset: 0.35, color: [0, 14, 180] },
    { offset: 0.65, color: [248, 131, 158] },
    { offset: 0.85, color: [255, 213, 163] }
  ]);

  const imageData = new ImageData(width, height);
  let ptr = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pt.x = area.xmin + (x / width) * area.width;
      pt.y = area.ymin + (y / height) * area.height;

      const z = (sampler.queryElevation(pt) as Point).z;
      const f = (z - zmin) / (zmax - zmin);

      const color = gradientSampler(f);

      imageData.data[ptr++] = color[0];
      imageData.data[ptr++] = color[1];
      imageData.data[ptr++] = color[2];
      imageData.data[ptr++] = 255;
    }
  }

  return imageData;
}

function createWaterSurface({ zBottom }: Context): void {
  const calculateZ = (x: number, y: number) => {
    const xn = (x - clippingExtent.xmin) / clippingExtent.width;
    const yn = (y - clippingExtent.ymin) / clippingExtent.height;
    const zn = noise.noise2D(xn * noiseScale, yn * noiseScale);
    const zn2 = noise.noise2D(xn * noiseScale2, yn * noiseScale2);

    return ((zn + 1) / 2) * noiseHeight + ((zn2 + 1) / 2) * noiseHeight2;
  };

  const addZ = (x: number, y: number) => {
    return [x, y, calculateZ(x, y)];
  };

  const stepy = clippingExtent.height / steps;
  const stepx = clippingExtent.width / steps;

  for (let y = clippingExtent.ymin; y < clippingExtent.ymax; y += stepy) {
    for (let x = clippingExtent.xmin; x < clippingExtent.xmax; x += stepx) {
      rings.push([addZ(x, y), addZ(x, y + stepy), addZ(x + stepx, y + stepy), addZ(x + stepx, y), addZ(x, y)]);
    }
  }

  const polygon = new Polygon({
    rings,
    spatialReference: SpatialReference.WebMercator
  });

  view.graphics.add(
    new Graphic({
      geometry: polygon,
      symbol: new PolygonSymbol3D({
        symbolLayers: [
          new WaterSymbol3DLayer({
            waterbodySize: "large",
            waveStrength: "moderate"
          })
        ]
      })
    })
  );

  const { position, faces } = createExtrudedBox(
    steps,
    steps,
    (out, x, y) => {
      out[0] = clippingExtent.xmin + (x / steps) * clippingExtent.width;
      out[1] = clippingExtent.ymin + (y / steps) * clippingExtent.height;
      out[2] = calculateZ(out[0], out[1]);
    },
    zBottom
  );

  view.graphics.add(
    new Graphic({
      geometry: new Mesh({
        vertexAttributes: { position },
        components: [
          new MeshComponent({
            faces,
            material: new MeshMaterialMetallicRoughness({
              roughness: 0.2,
              metallic: 0,
              color: [215, 255, 255, 0.3]
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
    })
  );
}

function createSurfaceBox({ width, height, sampler, zBottom, scaleZ }: Context): void {
  const pt = new Point({ x: 0, y: 0, spatialReference: SpatialReference.WebMercator });

  const { position, faces, uv } = createExtrudedBox(
    width,
    height,
    (out, x, y) => {
      pt.x = area.xmin + (x / width) * area.width;
      pt.y = area.ymin + (y / height) * area.height;

      out[0] = clippingExtent.xmin + (x / width) * clippingExtent.width;
      out[1] = clippingExtent.ymin + (y / height) * clippingExtent.height;
      out[2] = scaleZ((sampler.queryElevation(pt) as Point).z);
    },
    zBottom
  );

  const gradient = makeGradient([
    { offset: 0, color: [255, 158, 116] },
    { offset: 0.4, color: [235, 210, 182] },
    { offset: 1, color: [235, 235, 235] }
  ]);

  const groundBoxMesh = new Mesh({
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

  view.graphics.add(
    new Graphic({
      geometry: groundBoxMesh,
      symbol: new MeshSymbol3D({
        symbolLayers: [
          new FillSymbol3DLayer({
            material: { color: "white" },
            edges: new SolidEdges3D({ color: [65, 37, 0, 0.5], size: "2px" })
          })
        ]
      })
    })
  );
}

run().catch((err) => console.error(err));

(window as any).view = view;

view.when(() => {
  (view as any).forceAnimationTime(0);
});

interface Context {
  sampler: __esri.ElevationSampler;
  zmin: number;
  zmax: number;
  scaleZ: (value: number) => number;
  zBottom: number;
  width: number;
  height: number;
}
