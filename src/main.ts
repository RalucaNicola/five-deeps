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
import ImageryLayer from "@arcgis/core/layers/ImageryLayer";
import IdentityManager from "@arcgis/core/identity/IdentityManager";
import OAuthInfo from "@arcgis/core/identity/OAuthInfo";

IdentityManager.registerOAuthInfos([
  new OAuthInfo({
    appId: "RKNJfdy3Vn6nlmKm",
    popup: true,
    popupCallbackUrl: `${document.location.origin}${document.location.pathname}oauth-callback-api.html`
  })
]);

(window as any).setOAuthResponseHash = (responseHash: string) => {
  IdentityManager.setOAuthResponseHash(responseHash);
};

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

  const meshResolution = 400;
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
  const texture = await createTerrainColorTexture(context);
  mesh.components[0].material = new MeshMaterialMetallicRoughness({
    color: [0, 0, 0],
    emissiveTexture: new MeshTexture({ data: texture }),
    emissiveColor: [255, 255, 255],
    metallic: 0,
    roughness: 1
  });

  view.graphics.add(
    new Graphic({
      geometry: mesh,
      symbol: new MeshSymbol3D({
        symbolLayers: [
          new FillSymbol3DLayer({
            material: { color: "white " },
            edges: new SolidEdges3D({ color: [160, 30, 30, 0.8], size: "1px" })
          })
        ]
      })
    })
  );
}

async function createTerrainColorTexture({ width, height, sampler, zmin, zmax }: Context): Promise<ImageData> {
  const pt = new Point({ x: 0, y: 0, spatialReference: SpatialReference.WebMercator });

  const gradientSampler = makeGradientSampler([
    { offset: 0, color: "#000004" },
    { offset: 0.1, color: "#140e36" },
    { offset: 0.2, color: "#3b0f70" },
    { offset: 0.3, color: "#641a80" },
    { offset: 0.4, color: "#8c2981" },
    { offset: 0.5, color: "#b5367a" },
    { offset: 0.6, color: "#de4968" },
    { offset: 0.7, color: "#f66e5c" },
    { offset: 0.8, color: "#fe9f6d" },
    { offset: 0.9, color: "#fecf92" },
    { offset: 1, color: "#fecf92" }
  ]);

  const r = height / width;
  const res = 1024;

  const textureWidth = res;
  const textureHeight = Math.ceil(res * r);

  const imageData = new ImageData(textureWidth, textureHeight);
  let ptr = 0;

  for (let y = 0; y < textureHeight; y++) {
    for (let x = 0; x < textureWidth; x++) {
      pt.x = area.xmin + (x / textureWidth) * area.width;
      pt.y = area.ymin + (y / textureHeight) * area.height;

      const z = (sampler.queryElevation(pt) as Point).z;
      const f = (z - zmin) / (zmax - zmin);

      const color = gradientSampler(f);

      imageData.data[ptr++] = color[0];
      imageData.data[ptr++] = color[1];
      imageData.data[ptr++] = color[2];
      imageData.data[ptr++] = 255;
    }
  }

  const hillshade = new ImageryLayer({ portalItem: { id: "1a914d579fba422585270ac1b927357f" } });
  await hillshade.load();
  const image = await hillshade.fetchImage(area, textureWidth, textureHeight, { requestAsImageElement: true } as any);

  const canvas = document.createElement("canvas");
  canvas.width = textureWidth;
  canvas.height = textureHeight;

  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);
  ctx.filter = "saturate(1.5)";
  ctx.drawImage(canvas, 0, 0);

  ctx.globalCompositeOperation = "soft-light";

  ctx.save();
  ctx.translate(0, textureHeight);
  ctx.scale(1, -1);
  ctx.drawImage(image.imageElement, 0, 0);
  ctx.restore();

  return ctx.getImageData(0, 0, textureWidth, textureHeight);
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
            waveStrength: "moderate",
            color: [44, 127, 174]
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
