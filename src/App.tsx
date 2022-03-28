import { subclass } from "@arcgis/core/core/accessorSupport/decorators";
import Widget from "@arcgis/core/widgets/Widget";
import { tsx } from "@arcgis/core/widgets/support/widget";
import SceneView from "@arcgis/core/views/SceneView";
import Map from "@arcgis/core/Map";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import { Configuration } from "./Configuration";
import { DioramaBuilder } from "./DioramaBuilder";

@subclass("App")
export class App extends Widget {
  private config = new Configuration();

  private view = new SceneView({
    map: new Map({
      basemap: "topo-vector",
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

    clippingArea: this.config.displayArea,

    environment: {
      lighting: {
        date: "Tue Mar 15 2022 08:05:00 GMT-0700 (Pacific Daylight Time)"
      }
    },

    spatialReference: SpatialReference.WebMercator,
    qualityProfile: "high",
    viewingMode: "local"
  });

  private diaramaBuilder = new DioramaBuilder({ view: this.view, config: this.config });

  render() {
    return <div id="viewDiv" afterCreate={(node: HTMLDivElement) => this.onAfterCreate(node)}></div>;
  }

  private onAfterCreate(element: HTMLDivElement): void {
    this.view.container = element;
    (window as any).view = this.view;
  }
}
