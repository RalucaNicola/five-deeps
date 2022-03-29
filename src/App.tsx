import { subclass } from "@arcgis/core/core/accessorSupport/decorators";
import Widget from "@arcgis/core/widgets/Widget";
import { tsx } from "@arcgis/core/widgets/support/widget";
import SceneView from "@arcgis/core/views/SceneView";
import Map from "@arcgis/core/Map";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import { Configuration } from "./Configuration";
import { DioramaBuilder } from "./DioramaBuilder";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";

import "@esri/calcite-components/dist/components/calcite-label";
import "@esri/calcite-components/dist/components/calcite-select";
import "@esri/calcite-components/dist/components/calcite-option";
import "@esri/calcite-components/dist/components/calcite-input";

import { setAssetPath } from "@esri/calcite-components/dist/components";
import { when } from "@arcgis/core/core/reactiveUtils";
import { addFrameTask } from "@arcgis/core/core/scheduling";
setAssetPath("https://js.arcgis.com/calcite-components/1.0.0-beta.80/assets");

@subclass("App")
export class App extends Widget {
  private config = new Configuration();

  private view = new SceneView({
    map: new Map({
      ground: {
        opacity: 0,
        surfaceColor: [100, 100, 50]
      },
      layers: [
        new GraphicsLayer({
          fullExtent: this.config.displayArea
        })
      ]
    }),

    camera: {
      position: {
        x: -0.00144551,
        y: -0.00115264,
        z: 57.27806
      },
      heading: 50.55,
      tilt: 74.87
    },

    clippingArea: this.config.displayArea,
    alphaCompositingEnabled: true,

    environment: {
      atmosphereEnabled: false,
      starsEnabled: false,
      background: { type: "color", color: [255, 255, 255, 0] },
      lighting: {
        date: "Tue Mar 15 2022 08:05:00 GMT-0700 (Pacific Daylight Time)"
      }
    },

    spatialReference: SpatialReference.WebMercator,
    qualityProfile: "high",
    viewingMode: "local"
  });

  private diaramaBuilder = new DioramaBuilder({ view: this.view, config: this.config });

  protected initialize(): void {
    when(
      () => !this.diaramaBuilder.updating,
      () => this.startAnimation(),
      { once: true }
    );
  }

  private animationFrameTask: __esri.FrameTaskHandle | null = null;

  private startAnimation(): void {
    let t = 0;
    const rotationDurationSeconds = 70;

    const center = this.config.displayArea.center.clone();
    const { zmin, zmax } = this.diaramaBuilder;
    center.z = zmin + (zmax - zmin) / 2;

    const update = () => {
      const heading = 50 - ((360 * (t / 1000 / rotationDurationSeconds)) % 360);
      this.view.goTo({ target: center, heading, tilt: 73, scale: 800 }, { animate: false });
    };

    this.animationFrameTask = addFrameTask({
      update: (ev) => {
        t += ev?.deltaTime ?? 0;
        update();
      }
    });

    update();

    when(
      () => this.view.interacting,
      () => this.animationFrameTask?.remove(),
      { once: true }
    );
  }

  render() {
    return (
      <div id="main">
        <div id="viewDiv" afterCreate={(node: HTMLDivElement) => this.onAfterCreate(node)}></div>
        <div id="ui">
          <calcite-label>
            Shading type
            <calcite-select
              onCalciteSelectChange={(ev: CustomEvent<void>) => (this.config.shadingMode = (ev.target as any).value)}
            >
              <calcite-option value="none" selected={this.config.shadingMode === "none"}>
                None
              </calcite-option>
              <calcite-option value="normals" selected={this.config.shadingMode === "normals"}>
                Normals
              </calcite-option>
              <calcite-option value="hillshade" selected={this.config.shadingMode === "hillshade"}>
                Hillshade
              </calcite-option>
              <calcite-option value="multi-hillshade" selected={this.config.shadingMode === "multi-hillshade"}>
                Multi Hillshade
              </calcite-option>
            </calcite-select>
          </calcite-label>
          <calcite-label>
            Terrain color saturation
            <calcite-input
              type="number"
              value={this.config.terrainColorSaturation}
              onCalciteInputChange={(ev: CustomEvent<any>) => {
                this.config.terrainColorSaturation = parseFloat((ev.target as any).value);
              }}
            ></calcite-input>
          </calcite-label>
          <calcite-label>
            Sample resolution
            <calcite-input
              type="number"
              value={this.config.samplingResolutionPixels}
              onCalciteInputChange={(ev: CustomEvent<any>) => {
                const res = parseInt((ev.target as any).value, 10);
                this.config.samplingResolutionPixels = res;
                this.config.colorTextureResolution = res;
              }}
            ></calcite-input>
          </calcite-label>
          <calcite-label>
            Terrain resolution
            <calcite-input
              type="number"
              value={this.config.elevationMeshResolutionPixels}
              onCalciteInputChange={(ev: CustomEvent<any>) =>
                (this.config.elevationMeshResolutionPixels = parseInt((ev.target as any).value, 10))
              }
            ></calcite-input>
          </calcite-label>
        </div>
      </div>
    );
  }

  private onAfterCreate(element: HTMLDivElement): void {
    this.view.container = element;
    (window as any).view = this.view;
  }
}
